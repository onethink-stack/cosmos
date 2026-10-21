"""Tres aparelhos isolados, seis importacoes por processos CLI separados."""
import base64
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import cadeia as c


class Exchange(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        examples = json.loads((c.ROOT / 'especificacao/registros-v1/exemplos.json').read_text('utf-8'))
        self.samples = {e['id']: e.get('registro') for e in examples['exemplos']}
        self.homes = {name: self.root / name for name in 'ABC'}
        self.files = {}
        for name, home in self.homes.items():
            self.cli('init', home)
            public = (home / 'public.txt').read_text()
            record = copy.deepcopy(self.samples['R02'])
            record['autor'] = c.digest(bytes.fromhex(public))
            for i in range(2):
                record['dominio'] = f'Texto livre do notebook {name}, registro {i}'
                bundle = self.root / f'{name}-bundle.json'
                bundle.write_bytes(c.canonical({'record': record, 'assets': {}}))
                self.cli('append', home, bundle)
            self.files[name] = self.root / f'{name}.json'
            self.cli('export', home, self.files[name])

    def cli(self, *args, ok=True):
        result = subprocess.run([sys.executable, '-X', 'utf8', str(c.ROOT / 'fase3/cadeia.py'), *map(str, args)], capture_output=True, text=True, encoding='utf-8')
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result

    def receive(self, source, target, path=None, ok=True):
        return self.cli('import', self.homes[target], path or self.files[source], '--public', self.homes[source] / 'public.txt', ok=ok)

    def test_exchange_and_one_byte_each(self):
        for source in 'ABC':
            for target in 'ABC':
                if source != target:
                    result = json.loads(self.receive(source, target).stdout)
                    self.assertEqual(result, {'integridade': 'OK', 'registros': 2, 'pendencias': []})
                    print(f'{source} -> {target}: troca por arquivo OK', flush=True)
        print('troca por arquivo OK em 3/3', flush=True)
        for source in 'ABC':
            original = self.files[source].read_bytes()
            changed = bytearray(original)
            changed[original.index(b'Texto livre')] ^= 1
            self.assertEqual(sum(a != b for a, b in zip(original, changed)), 1)
            attack = self.root / f'{source}-alterado.json'
            attack.write_bytes(changed)
            for target in 'ABC':
                if source != target:
                    result = self.receive(source, target, attack, ok=False)
                    self.assertIn('hash alterado', result.stderr)
                    # Recusa nao substitui a cadeia boa ja recebida.
                    author = c.digest(bytes.fromhex((self.homes[source] / 'public.txt').read_text()))
                    self.assertEqual((self.homes[target] / 'received' / f'{author}.json').read_bytes(), original)
                    print(f'{source} alterado em 1 byte -> {target}: RECUSADO', flush=True)
        print('deteccao de alteracao 3/3', flush=True)

    def test_layers_and_rollback(self):
        data = self.files['A'].read_bytes()
        chain = c.decode(data)
        public = chain['public']
        key = c.Ed25519PrivateKey.from_private_bytes((self.homes['A'] / 'key').read_bytes())
        attacks = []
        tampered = copy.deepcopy(chain)
        tampered['entries'][0]['body']['record']['dominio'] = 'outro'
        tampered['entries'][0]['hash'] = c.digest(c.canonical(tampered['entries'][0]['body']))
        attacks.append(tampered)  # hash recomposto; assinatura invalida
        tampered = copy.deepcopy(chain)
        tampered['entries'][0]['signature'] = '00' * 64
        attacks.append(tampered)
        tampered = copy.deepcopy(chain)
        tampered['entries'].reverse()
        attacks.append(tampered)
        tampered = copy.deepcopy(chain)
        tampered['entries'].pop()
        attacks.append(tampered)
        tampered = copy.deepcopy(chain)
        body = tampered['entries'][1]['body']
        body['previous'] = 'f' * 64
        tampered['entries'][1] = c.sign(key, body)
        attacks.append(c.decode(c.seal(key, tampered['entries'])))
        attacks.append(c.decode(c.seal(c.Ed25519PrivateKey.generate(), [])))
        for attack in attacks:
            with self.subTest(attack=attacks.index(attack)):
                with self.assertRaises(Exception):
                    c.verify(c.canonical(attack), public)
        for attack in (data + b' ', data[:-1], data.replace(b'"public":', b'"public":"x","public":', 1)):
            with self.assertRaises(Exception):
                c.verify(attack, public)
        short = c.seal(key, chain['entries'][:1])
        with self.assertRaisesRegex(ValueError, 'retrocesso'):
            c.verify(short, public, data)
        changed = copy.deepcopy(chain['entries'])
        changed[0]['body']['record']['dominio'] = 'historia reescrita'
        changed[0] = c.sign(key, changed[0]['body'])
        changed[1]['body']['previous'] = changed[0]['hash']
        changed[1] = c.sign(key, changed[1]['body'])
        with self.assertRaisesRegex(ValueError, 'bifurcacao'):
            c.verify(c.seal(key, changed), public, data)
        c.verify(data, public, short)  # extensao legitima

    def test_binding_in_all_receivers_even_when_resigned(self):
        for source in 'ABC':
            key = c.Ed25519PrivateKey.from_private_bytes((self.homes[source] / 'key').read_bytes())
            public = key.public_key().public_bytes_raw().hex()
            record = copy.deepcopy(self.samples['R01'])
            record['autor'] = c.digest(bytes.fromhex(public))
            assets = {}
            for desc in record['certificado']['refutacao'].values():
                raw = (c.ROOT / 'especificacao/registros-v1' / desc['arquivo']).read_bytes()
                assets[desc['arquivo']] = base64.b64encode(raw).decode('ascii')
            # O vinculo original passa; a prova permanece explicitamente pendente.
            self.assertTrue(c.verify_record(record, assets, record['autor']))
            problem = record['certificado']['refutacao']['problema']
            raw = base64.b64decode(assets[problem['arquivo']])
            raw = raw.replace(b'(check-sat)', b'(assert false)\n(check-sat)')
            # Perfil e sintaxe continuam validos: a recusa e da comparacao.
            c.registros.vinculo.forma(raw.decode('utf-8'))
            assets[problem['arquivo']] = base64.b64encode(raw).decode('ascii')
            problem['sha256'] = c.digest(raw)
            entry = c.sign(key, {'index': 0, 'previous': '0' * 64, 'record': record, 'assets': assets})
            attack = self.root / f'{source}-vinculo.json'
            attack.write_bytes(c.seal(key, [entry]))
            for target in 'ABC':
                if source != target:
                    self.assertIn('R9', self.receive(source, target, attack, ok=False).stderr)
                    print(f'{source} vinculo adulterado e reassinado -> {target}: R9', flush=True)

    def test_asset_hash_author_and_path(self):
        public = (self.homes['A'] / 'public.txt').read_text()
        author = c.digest(bytes.fromhex(public))
        record = copy.deepcopy(self.samples['R01'])
        record['autor'] = author
        assets = {d['arquivo']: base64.b64encode((c.ROOT / 'especificacao/registros-v1' / d['arquivo']).read_bytes()).decode('ascii') for d in record['certificado']['refutacao'].values()}
        for name in assets:
            bad = dict(assets)
            bad[name] = base64.b64encode(base64.b64decode(bad[name]) + b' ').decode('ascii')
            with self.assertRaisesRegex(ValueError, 'R8'):
                c.verify_record(record, bad, author)
        with self.assertRaisesRegex(ValueError, 'autor'):
            c.verify_record(record, assets, '0' * 64)
        for name in ('../key', '/tmp/x', 'C:/x', 'a\\x', 'a//x'):
            with self.assertRaisesRegex(ValueError, 'caminho'):
                c.verify_record(record, {name: ''}, author)


if __name__ == '__main__':
    unittest.main(verbosity=2)
