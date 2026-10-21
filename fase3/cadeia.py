"""Cadeia por arquivo. Usa somente o verificador publico congelado em 17a0168."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'especificacao/provas-t1'))
import registros


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode('utf-8')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, 'chave repetida')
        result[key] = value
    return result


def decode(data):
    value = json.loads(data.decode('utf-8'), object_pairs_hook=pairs)
    require(canonical(value) == data, 'bytes fora do formato canonico')
    return value


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def sign(key, body):
    raw = canonical(body)
    return {'body': body, 'hash': digest(raw), 'signature': key.sign(b'cadeia-arquivo-v1\0' + raw).hex()}


def check_signed(public, item):
    require(set(item) == {'body', 'hash', 'signature'}, 'envelope invalido')
    raw = canonical(item['body'])
    require(item['hash'] == digest(raw), 'hash alterado')
    public.verify(bytes.fromhex(item['signature']), b'cadeia-arquivo-v1\0' + raw)
    return item['body']


def verify_record(record, assets, author):
    require(record.get('autor') == author, 'autor diferente da chave')
    require(isinstance(assets, dict), 'arquivos invalidos')
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        for name, encoded in assets.items():
            require(isinstance(name, str) and '\\' not in name and ':' not in name
                    and all(p not in ('', '.', '..') for p in name.split('/')), 'caminho invalido')
            path = root.joinpath(*name.split('/'))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(base64.b64decode(encoded, validate=True))
        reason, detail, pending = registros.conferir_registro(record, lambda *_: None, str(root))
        require(reason is None, f'{reason}: {detail}')
        return pending


def verify(data, trusted_public, previous=None):
    chain = decode(data)
    require(set(chain) == {'public', 'manifest', 'entries'}, 'cadeia invalida')
    require(chain['public'] == trusted_public, 'chave nao confiada')
    public = Ed25519PublicKey.from_public_bytes(bytes.fromhex(trusted_public))
    author = digest(bytes.fromhex(trusted_public))
    manifest = check_signed(public, chain['manifest'])
    require(set(manifest) == {'format', 'author', 'count', 'head'}, 'manifesto invalido')
    require(manifest['format'] == 'cadeia-arquivo-v1' and manifest['author'] == author, 'identidade invalida')
    require(type(manifest['count']) is int and manifest['count'] == len(chain['entries']), 'quantidade alterada')
    last = '0' * 64
    pending = []
    for number, entry in enumerate(chain['entries']):
        body = check_signed(public, entry)
        require(set(body) == {'index', 'previous', 'record', 'assets'}, 'entrada invalida')
        require(type(body['index']) is int and body['index'] == number and body['previous'] == last, 'encadeamento alterado')
        pending.extend(verify_record(body['record'], body['assets'], author))
        last = entry['hash']
    require(manifest['head'] == last, 'cabeca alterada')
    if previous is not None:
        old = decode(previous)
        require(len(chain['entries']) >= len(old['entries']), 'retrocesso')
        require(chain['entries'][:len(old['entries'])] == old['entries'], 'bifurcacao')
    return {'integridade': 'OK', 'registros': len(chain['entries']), 'pendencias': pending}


def seal(key, entries):
    public = key.public_key().public_bytes_raw().hex()
    return canonical({'public': public, 'entries': entries, 'manifest': sign(key, {
        'format': 'cadeia-arquivo-v1', 'author': digest(bytes.fromhex(public)),
        'count': len(entries), 'head': entries[-1]['hash'] if entries else '0' * 64})})


def initialize(home):
    home = Path(home)
    home.mkdir(parents=True, exist_ok=True)
    require(not (home / 'key').exists() and not (home / 'chain.json').exists(), 'aparelho ja iniciado')
    key = Ed25519PrivateKey.generate()
    # A chave fica somente no aparelho; nunca entra no arquivo exportado.
    with (home / 'key').open('xb') as stream:
        stream.write(key.private_bytes_raw())
    os.chmod(home / 'key', 0o600)
    write(home / 'chain.json', seal(key, []))
    write(home / 'public.txt', key.public_key().public_bytes_raw().hex().encode('ascii'))


def append(home, record, assets):
    home = Path(home)
    key = Ed25519PrivateKey.from_private_bytes((home / 'key').read_bytes())
    data = (home / 'chain.json').read_bytes()
    public = key.public_key().public_bytes_raw().hex()
    verify(data, public)
    entries = decode(data)['entries']
    verify_record(record, assets, digest(bytes.fromhex(public)))
    entries.append(sign(key, {'index': len(entries), 'previous': entries[-1]['hash'] if entries else '0' * 64,
                              'record': record, 'assets': assets}))
    result = seal(key, entries)
    verify(result, public)
    write(home / 'chain.json', result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['init', 'append', 'export', 'import'])
    parser.add_argument('home', type=Path)
    parser.add_argument('file', type=Path, nargs='?')
    parser.add_argument('--public', type=Path, help='chave publica conferida fora do arquivo recebido')
    args = parser.parse_args()
    if args.command == 'init':
        initialize(args.home)
    elif args.command == 'append':
        bundle = json.loads(args.file.read_text('utf-8'), object_pairs_hook=pairs)
        append(args.home, bundle['record'], bundle['assets'])
    elif args.command == 'export':
        data = (args.home / 'chain.json').read_bytes()
        verify(data, (args.home / 'public.txt').read_text('ascii'))
        require(args.file.resolve() not in {(args.home / n).resolve() for n in ('key', 'public.txt', 'chain.json')}, 'destino reservado')
        write(args.file, data)
    else:
        require(args.public is not None, 'import exige --public')
        public = args.public.read_text('ascii').strip()
        author = digest(bytes.fromhex(public))
        receipt = args.home / 'received' / (author + '.json')
        data = args.file.read_bytes()
        result = verify(data, public, receipt.read_bytes() if receipt.exists() else None)
        write(receipt, data)
        print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    if not sys.flags.utf8_mode:
        sys.exit(subprocess.run([sys.executable, '-X', 'utf8', *sys.argv]).returncode)
    try:
        main()
    except Exception as error:
        print('RECUSADO: ' + (str(error) or type(error).__name__), file=sys.stderr)
        sys.exit(1)
