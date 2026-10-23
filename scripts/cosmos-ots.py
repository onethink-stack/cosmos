"""OpenTimestamps sidecar: biblioteca oficial, vínculo SHA-256 e Bitcoin Core.
Não modifica o pacote v1. Calendário recebido não significa Bitcoin confirmado.
"""
import sys, json, hashlib, base64, os, io, urllib.request, urllib.parse
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'node_modules' / '.cosmos-ots-python'))
from opentimestamps.core.timestamp import DetachedTimestampFile
from opentimestamps.core.serialize import BytesDeserializationContext, BytesSerializationContext
from opentimestamps.core.op import OpSHA256, OpAppend
from opentimestamps.calendar import RemoteCalendar
from opentimestamps.core.notary import PendingAttestation, BitcoinBlockHeaderAttestation

TARGET = ROOT / 'public' / 'cosmos-502426c-resumo.txt'
PROOF = Path(str(TARGET) + '.ots')

def inspect(proof, target, verify=False):
    if len(proof) > 1024 * 1024 or len(target) > 1024 * 1024:
        raise ValueError('Limite de tamanho OTS excedido')
    detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(proof))
    if detached.file_hash_op.__class__.__name__ != 'OpSHA256' or detached.timestamp.msg != hashlib.sha256(target).digest():
        raise ValueError('vínculo SHA-256 divergente')
    attestations = list(detached.timestamp.all_attestations())
    pending = [str(att.uri) for msg, att in attestations if isinstance(att, PendingAttestation)]
    result = dict(estado='enviado_calendario' if pending else 'pendente', vinculoValido=True,
                  sha256_alvo=hashlib.sha256(target).hexdigest(), calendarios=pending,
                  confirmacaoVerificada=False)
    if verify:
        for msg, att in attestations:
            if not isinstance(att, BitcoinBlockHeaderAttestation):
                continue
            try:
                from bitcoin.core import CBlockHeader
                rpc_url = os.environ.get('COSMOS_BITCOIN_RPC_URL')
                if not rpc_url or urllib.parse.urlparse(rpc_url).hostname not in ('127.0.0.1', 'localhost', '::1'):
                    raise ValueError('Bitcoin Core local não configurado')
                def rpc(method, params=[]):
                    body = json.dumps(dict(jsonrpc='1.0', id='cosmos-readonly', method=method, params=params)).encode()
                    request = urllib.request.Request(rpc_url, data=body, headers={'Content-Type': 'application/json'})
                    user, password = os.environ.get('COSMOS_BITCOIN_RPC_USER', ''), os.environ.get('COSMOS_BITCOIN_RPC_PASSWORD', '')
                    if user or password:
                        request.add_header('Authorization', 'Basic ' + base64.b64encode((user + ':' + password).encode()).decode())
                    with urllib.request.urlopen(request, timeout=5) as response:
                        reply = json.load(response)
                    if reply.get('error'):
                        raise ValueError('Bitcoin Core recusou consulta')
                    return reply['result']
                height = rpc('getblockcount')
                block_hash = rpc('getblockhash', [att.height])
                header = CBlockHeader.deserialize(bytes.fromhex(rpc('getblockheader', [block_hash, False])))
                att.verify_against_blockheader(msg, header)
                confirmations = height - att.height + 1
                if confirmations < 6:
                    result['erro'] = 'Aguardando seis confirmações Bitcoin'
                    continue
                result.update(estado='confirmado_bitcoin', confirmacaoVerificada=True,
                              fonte='bitcoin-core', altura=att.height, bloco=block_hash,
                              confirmacoes=confirmations)
                break
            except Exception:
                result['erro'] = 'Bitcoin Core indisponível ou atestação não verificável'
    return result

CALENDARS = ('https://alice.btc.calendar.opentimestamps.org', 'https://bob.btc.calendar.opentimestamps.org')
def save(detached):
    ctx = BytesSerializationContext()
    detached.serialize(ctx)
    PROOF.write_bytes(ctx.getbytes())

def stamp(value):
    detached = DetachedTimestampFile.from_fd(OpSHA256(), io.BytesIO(value))
    nonce = detached.timestamp.ops.add(OpAppend(os.urandom(16))).ops.add(OpSHA256())
    received = 0
    for url in CALENDARS:
        try:
            nonce.merge(RemoteCalendar(url).submit(nonce.msg, timeout=12))
            received += 1
        except Exception as exc:
            print('Calendário indisponível: ' + url + ' (' + type(exc).__name__ + ')', file=sys.stderr)
    if not received:
        raise ValueError('Nenhum calendário respondeu; nenhuma prova emitida')
    save(detached)

def upgrade():
    detached = DetachedTimestampFile.deserialize(BytesDeserializationContext(PROOF.read_bytes()))
    for msg, att in list(detached.timestamp.all_attestations()):
        if isinstance(att, PendingAttestation) and str(att.uri) in CALENDARS:
            # Mescla a resposta no nó correspondente ao compromisso, não na raiz.
            def visit(node):
                if node.msg == msg:
                    node.merge(RemoteCalendar(str(att.uri)).get_timestamp(msg, timeout=12))
                    return
                for child in list(node.ops.values()):
                    visit(child)
            try:
                visit(detached.timestamp)
            except Exception as exc:
                print('Upgrade pendente: ' + type(exc).__name__, file=sys.stderr)
    save(detached)

if __name__ == '__main__':
    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else 'inspect'
        if mode == 'stamp':
            data = json.loads((ROOT / 'src/dados/elos-assinados.json').read_text())
            value = (data['resumo_final'] + '\n').encode('ascii')
            if TARGET.exists() and TARGET.read_bytes() != value:
                raise ValueError('Alvo OTS existente divergente; preservado')
            TARGET.write_bytes(value)
            if not PROOF.exists():
                stamp(value)
            result = inspect(PROOF.read_bytes(), value)
        elif mode in ('upgrade', 'verify'):
            if mode == 'upgrade':
                upgrade()
            result = inspect(PROOF.read_bytes(), TARGET.read_bytes(), verify=True)
        elif mode == 'inspect':
            raw = sys.stdin.buffer.read(3 * 1024 * 1024 + 1)
            if len(raw) > 3 * 1024 * 1024:
                raise ValueError('Limite de entrada excedido')
            request = json.loads(raw)
            result = inspect(base64.b64decode(request['prova'], validate=True), base64.b64decode(request['alvo'], validate=True))
        else:
            raise ValueError('Operação desconhecida')
        print(json.dumps(result, ensure_ascii=True))
        if mode != 'inspect':
            (ROOT / 'public/cosmos-ots-status.json').write_text(json.dumps(result, indent=2) + '\n')
    except Exception as exc:
        print(json.dumps({'erro': str(exc)}, ensure_ascii=True))
        sys.exit(1)
