"""Os registros do formato aberto (registro-v1, especificacao/registros-v1.md): cada exemplo de
especificacao/registros-v1/exemplos.json tem de dar o veredito esperado.

As peças que conferem o sentido não são do Caderno: a leitura da m2 e a tradução t1 são as da pasta independente/
(do GPT, só pela especificação), e é delas que saem a árvore expandida, a forma canônica, os hashes e o vínculo de cada
refutação; os modelos, finitos e exatos, passam pela conferência independente (modelos.py); e a prova Alethe, pelo
Carcara, quando ele é dado. O que fica sem conferir (a prova sem o Carcara, ou com o tempo esgotado; o modelo exato sem
o SymPy) é contado à parte, e não vira aceite de um exemplo que tinha de ser recusado por isso.

Os exemplos também passam pelo leitor de registros do GPT (independente/registros_independente.py), inteiro dele, com
o comparador SMT dele; as provas que ele deixa pendentes vão para o Carcara. O que ele faz diferente do esperado é
contado como divergência: a Fase 2 fecha quando não houver nenhuma.
"""
import hashlib
import json
import os
import re
import sys

import modelos
import vinculo
from vinculo import INDEPENDENTE

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'registros-v1')
FORMATO = 'registro-v1'
AFIRMACOES = ('segue', 'contradiz', 'nao-segue', 'consistente')
TIPOS = ('axioma matemático', 'observação', 'hipótese', 'definição', 'norma', 'teorema')
ESTADOS = ('proposta', 'corroborada', 'contestada', 'refutada', 'sem avaliação')
SHA = re.compile(r'[0-9a-f]{64}')
ARITMETICA = {'+', '−', '·', '/', '^', '<', '≤', '>', '≥'}


class Recusa(Exception):
    def __init__(self, motivo, detalhe):
        super().__init__(detalhe)
        self.motivo = motivo


def recusar(motivo, detalhe):
    raise Recusa(motivo, detalhe)


def _independente():
    if INDEPENDENTE not in sys.path:
        sys.path.insert(0, INDEPENDENTE)


def arvore_expandida(texto, fichas):
    """A árvore expandida pela leitura independente da m2, como a tradução dela faz; None se a m2 recusa."""
    _independente()
    from parser_independente_m2 import Parser, expand, walk
    from tradutor_t1_independente import FORMULA_OPS
    from validador_independente_m2 import Validator
    p = Parser(texto, fichas)
    n, _ = p.parse()
    if n is None or any(d['nivel'] == 'erro' for d in Validator(p, n).result()):
        return None
    usados = {x.meta['value'] for x in walk(n) if x.op == 'atom' and x.typ in ('name', 'indexbase', 'indexarg', 'proposition')}
    usados.update(x.op for x in walk(n) if x.typ in ('call', 'formula') and x.op not in FORMULA_OPS)
    usados.update(x.meta['var'] for x in walk(n) if x.op in ('∀', '∃'))
    return expand(n, usados)


def forma_canonica(raiz):
    """A árvore expandida escrita como na seção 6 da m2, com as variáveis ligadas trocadas por #1, #2…, na ordem dos
    quantificadores; o domínio de ∃x∈D é lido fora do quantificador."""
    from parser_independente_m2 import Node
    contador = [0]

    def ir(n, nomes):
        if n.op == 'atom':
            if n.meta['value'] in nomes:
                return Node('atom', [], n.start, n.end, n.typ, {**n.meta, 'value': nomes[n.meta['value']]})
            return n
        if n.op in ('∀', '∃'):
            contador[0] += 1
            novo = f'#{contador[0]}'
            args = list(n.args)
            if n.meta.get('domain'):
                args[0] = ir(args[0], nomes)
            args[-1] = ir(args[-1], {**nomes, n.meta['var']: novo})
            return Node(n.op, args, n.start, n.end, n.typ, {**n.meta, 'var': novo})
        return Node(n.op, [ir(a, nomes) for a in n.args], n.start, n.end, n.typ, dict(n.meta))
    return ir(raiz, {}).sexp()


def tem_numeros(raiz, numericos):
    _independente()
    from parser_independente_m2 import walk
    for x in walk(raiz):
        if x.op in ARITMETICA or (x.op == 'atom' and x.typ == 'number'):
            return True
        if x.op in ('∀', '∃') and x.meta.get('domain') and x.args[0].op == 'atom' and x.args[0].meta['value'] in ('ℝ', 'ℤ'):
            return True
        if (x.op == 'atom' and x.meta['value'] in numericos) or x.op in numericos:
            return True
    return False


def linha_da_ficha(f):
    args = ','.join(f.get('argumentos') or []) or '-'
    return f"ficha {f['simbolo']} {f['tipo']} {f['aridade']} {'numerico' if f.get('numerico') else '-'} {args}"


def texto_da_teoria(canonicas, fichas):
    linhas = ['teoria-v1', *sorted(linha_da_ficha(f) for f in fichas), *sorted(f'premissa {c}' for c in set(canonicas))]
    return ''.join(l + '\n' for l in linhas)


def texto_da_formula(canonica, fichas):
    return ''.join(l + '\n' for l in ['formula-v1', *sorted(linha_da_ficha(f) for f in fichas), f'formula {canonica}'])


def sha256(dados):
    return hashlib.sha256(dados.encode('utf-8') if isinstance(dados, str) else dados).hexdigest()


def conferir_ficha(f):
    if not isinstance(f, dict) or set(f) - {'simbolo', 'tipo', 'aridade', 'numerico', 'argumentos'}:
        recusar('R1', f'ficha mal formada: {f}')
    s, t, a = f.get('simbolo'), f.get('tipo'), f.get('aridade')
    if not isinstance(s, str) or not s or re.search(r'\s', s):
        recusar('R1', f'ficha sem símbolo: {f}')
    if t not in ('constante', 'funcao', 'predicado'):
        recusar('R1', f'ficha de tipo desconhecido: {f}')
    # a constante tem aridade 0, a função 1 ou mais, e o predicado 0 ou mais (o de aridade 0 é uma proposição)
    if type(a) is not int or a < 0 or (a != 0 if t == 'constante' else (t == 'funcao' and a == 0)):
        recusar('R1', f'ficha com aridade errada: {f}')
    if 'numerico' in f and (type(f['numerico']) is not bool or t == 'predicado'):
        recusar('R1', f'numerico só em constante ou função: {f}')
    if 'argumentos' in f:
        x = f['argumentos']
        if t == 'constante' or not isinstance(x, list) or len(x) != a or any(y not in ('num', 'obj') for y in x):
            recusar('R1', f'argumentos mal formados: {f}')


def conferir_registro(r, provar):
    """(motivo ou None, detalhe, pendências). `provar(prova, problema)` dá True ou False pelo Carcara, ou None sem ele."""
    pendencias = []
    try:
        _conferir(r, provar, pendencias)
        return None, '', pendencias
    except Recusa as recusa:
        return recusa.motivo, str(recusa), pendencias


def _texto(x):
    return isinstance(x, str) and x != ''


def _sem_repetir(pares):
    """O object_pairs_hook do json que recusa uma chave repetida (os leitores discordam sobre qual valor fica)."""
    chaves = [k for k, _ in pares]
    repetidas = sorted({k for k in chaves if chaves.count(k) > 1})
    if repetidas:
        recusar('R1', f'JSON: chave repetida: {repetidas[0]}')
    return dict(pares)


def ler_registro(texto):
    """Um registro escrito como texto JSON, lido sem aceitar chave repetida."""
    try:
        return json.loads(texto, object_pairs_hook=_sem_repetir)
    except json.JSONDecodeError as erro:
        recusar('R1', f'JSON: {erro}')


def _conferir(r, provar, pendencias):
    # R1, R2, R3: a forma
    if not isinstance(r, dict):
        recusar('R1', 'o registro não é um objeto')
    if r.get('situacao') not in ('aberto', 'fechado'):
        recusar('R1', 'situacao é aberto ou fechado')
    aberto = r['situacao'] == 'aberto'
    campos = ['formato', 'situacao', 'afirmacao', 'teoria', 'tipo', 'dominio', 'estado', 'semantica', 'autor', 'compromisso']
    esperados = campos + (['formula', 'formaCanonica', 'certificado'] if aberto else [])
    sobra = [k for k in r if k not in esperados]
    if sobra:
        recusar('R1', f'campo que não vai neste registro: {sobra[0]}')
    falta = [k for k in esperados if k not in r]
    if falta:
        recusar('R1', f'falta o campo {falta[0]}')
    if r['afirmacao'] not in AFIRMACOES:
        recusar('R1', f"afirmação desconhecida: {r['afirmacao']!r}")
    if r['tipo'] not in TIPOS:
        recusar('R1', f"tipo desconhecido: {r['tipo']!r}")
    if r['estado'] not in ESTADOS:
        recusar('R1', f"estado desconhecido: {r['estado']!r}")
    if not _texto(r['dominio']) or not r['dominio'].strip():
        recusar('R1', 'dominio é um texto não vazio')
    if not _texto(r['autor']) or not SHA.fullmatch(r['autor']):
        recusar('R1', 'autor: o SHA-256 da chave pública, em 64 dígitos hexadecimais minúsculos')
    teoria = r['teoria']
    if not isinstance(teoria, dict) or set(teoria) - ({'nome', 'fichas', 'premissas', 'hash'} if aberto else {'nome', 'hash'}):
        recusar('R1', 'teoria com campo a mais')
    if not _texto(teoria.get('nome')) or not teoria['nome'].strip():
        recusar('R1', 'teoria sem nome')
    if not _texto(teoria.get('hash')) or not SHA.fullmatch(teoria['hash']):
        recusar('R1', 'teoria.hash: 64 dígitos hexadecimais minúsculos')
    comp = r['compromisso']
    if not isinstance(comp, dict) or set(comp) - ({'hash', 'sal'} if aberto else {'hash'}):
        recusar('R1', 'compromisso com campo a mais')
    if not _texto(comp.get('hash')) or not SHA.fullmatch(comp['hash']):
        recusar('R1', 'compromisso.hash: 64 dígitos hexadecimais minúsculos')
    if aberto and (not _texto(comp.get('sal')) or not SHA.fullmatch(comp['sal'])):
        recusar('R1', 'compromisso.sal: 64 dígitos hexadecimais minúsculos')
    if r['formato'] != FORMATO:
        recusar('R2', f"formato desconhecido: {r['formato']!r}")
    sem = r['semantica']
    if not isinstance(sem, dict):
        recusar('R1', 'semantica é um objeto')
    if set(sem) - {'gramatica', 'traducao'} or sem.get('gramatica') != 'm2' or sem.get('traducao') != 't1':
        recusar('R2', f'semântica que esta versão não conhece: {sem}')
    if (r['tipo'] == 'teorema') != (r['afirmacao'] == 'segue'):
        recusar('R3', f"tipo {r['tipo']} com afirmação {r['afirmacao']}")
    if not aberto:
        return

    afirmacao = r['afirmacao']
    fichas = teoria.get('fichas')
    if not isinstance(fichas, list):
        recusar('R1', 'teoria.fichas é uma lista')
    for f in fichas:
        conferir_ficha(f)
    if len({f['simbolo'] for f in fichas}) != len(fichas):
        recusar('R1', 'duas fichas com o mesmo símbolo')
    textos = teoria.get('premissas')
    if not isinstance(textos, list) or not all(_texto(p) for p in textos):
        recusar('R1', 'teoria.premissas é uma lista de textos')
    if not _texto(r['formula']) or not _texto(r['formaCanonica']):
        recusar('R1', 'formula e formaCanonica são textos')
    cert = r['certificado']
    if not isinstance(cert, dict):
        recusar('R1', 'certificado é um objeto')

    # R4: a leitura, com o dicionário da teoria
    premissas = []
    for p in textos:
        raiz = arvore_expandida(p, fichas)
        if raiz is None:
            recusar('R4', f'a m2 recusa a premissa {p}')
        premissas.append(raiz)
    formula = arvore_expandida(r['formula'], fichas)
    if formula is None:
        recusar('R4', f"a m2 recusa a fórmula {r['formula']}")
    # R5, R6, R7: a forma canônica e os hashes
    canonica = forma_canonica(formula)
    if r['formaCanonica'] != canonica:
        recusar('R5', f'a forma canônica é {canonica}')
    hash_teoria = sha256(texto_da_teoria([forma_canonica(p) for p in premissas], fichas))
    if teoria['hash'] != hash_teoria:
        recusar('R6', f'o hash da teoria é {hash_teoria}')
    if comp['hash'] != sha256(bytes.fromhex(comp['sal']) + texto_da_formula(canonica, fichas).encode('utf-8')):
        recusar('R7', 'o compromisso não é o da fórmula com o sal')

    # o certificado: a combinação, depois arquivos, vínculo, prova e modelos
    if set(cert) - {'refutacao', 'modeloDasPremissas', 'vazio', 'modelo'}:
        recusar('R1', 'certificado com campo desconhecido')
    combinacao = '+'.join(sorted(cert))
    if afirmacao in ('segue', 'contradiz'):
        validas = {'modeloDasPremissas+refutacao', 'vazio'} | (set() if textos else {'refutacao'})
        if combinacao == 'refutacao' and textos:
            recusar('R12', 'segue ou contradiz com premissas, sem modelo das premissas e sem a marca vazio')
        if combinacao not in validas:
            recusar('R1', f'certificado de {afirmacao} com {combinacao or "nada"}')
    elif combinacao != 'modelo':
        recusar('R1', f'certificado de {afirmacao} com {combinacao or "nada"}')
    negada = afirmacao in ('segue', 'nao-segue')
    conjunto = [*textos, f"¬({r['formula']})" if negada else r['formula']]
    raizes_conjunto = [*premissas, arvore_expandida(conjunto[-1], fichas)]
    numericos = {f['simbolo'] for f in fichas if f.get('numerico')}

    def arquivo(a, onde):
        if not isinstance(a, dict) or set(a) != {'arquivo', 'sha256'} or not _texto(a['arquivo']) or not _texto(a['sha256']):
            recusar('R1', f'{onde}: {{arquivo, sha256}}')
        caminho = a['arquivo']
        # relativo à raiz do conjunto, com /, sem segmento vazio, . ou .., e sem sair da raiz, nem por link
        if '\\' in caminho or any(x in ('', '.', '..') for x in caminho.split('/')):
            recusar('R8', f'{onde}: caminho inválido {caminho}')
        cheio = os.path.join(PASTA, *caminho.split('/'))
        raiz = os.path.realpath(PASTA)
        if os.path.commonpath([raiz, os.path.realpath(cheio)]) != raiz:
            recusar('R8', f'{onde}: o caminho {caminho} sai da raiz do conjunto')
        if not os.path.isfile(cheio):
            recusar('R8', f'{onde}: o arquivo {caminho} não existe')
        with open(cheio, 'rb') as f:
            if sha256(f.read()) != a['sha256']:
                recusar('R8', f'{onde}: o SHA-256 de {caminho} não bate')
        return cheio

    def refutacao(x, formulas, onde):
        if not isinstance(x, dict) or set(x) != {'problema', 'prova'}:
            recusar('R1', f'{onde}: {{problema, prova}}')
        problema = arquivo(x['problema'], f'{onde}.problema')
        prova = arquivo(x['prova'], f'{onde}.prova')
        with open(problema, encoding='utf-8') as f:
            diferenca = vinculo.diferenca(vinculo.refazer(fichas, formulas), f.read())
        if diferenca:
            recusar('R9', f'{onde}: o problema não é a tradução t1 do conjunto ({diferenca[:160]})')
        v = provar(prova, problema)
        if v is None:
            pendencias.append(f'{onde}: a prova (sem o Carcara, ou com o tempo esgotado)')
        elif not v:
            recusar('R10', f'{onde}: o Carcara recusa a prova')

    def modelo(m, formulas, raizes, onde):
        exato = isinstance(m, dict) and m.get('formato') == modelos.FORMATO_EXATO
        if not exato and any(tem_numeros(x, numericos) for x in raizes):
            recusar('R11', f'{onde}: modelo finito para um conjunto com números')
        try:
            motivo = modelos.motivo_da_recusa(formulas, fichas, m)
        except modelos.SemSymPy:
            pendencias.append(f'{onde}: o modelo exato (sem o SymPy)')
            return
        if motivo:
            recusar('R11', f'{onde}: {motivo}')

    if 'vazio' in cert:
        refutacao(cert['vazio'], textos, 'vazio')
    if 'refutacao' in cert:
        refutacao(cert['refutacao'], conjunto, 'refutacao')
    if 'modeloDasPremissas' in cert:
        modelo(cert['modeloDasPremissas'], textos, premissas, 'modeloDasPremissas')
    if 'modelo' in cert:
        modelo(cert['modelo'], conjunto, raizes_conjunto, 'modelo')


def no_leitor_do_gpt(e, provar):
    """(veredito, motivo, detalhe) do leitor de registros do GPT num exemplo; as provas que ele deixa pendentes vão para
    o Carcara. Um registro dado como texto é lido pelo próprio leitor dele (decodificar_registro_texto)."""
    import registros_independente as ri
    from pathlib import Path
    ri.EX_DIR = Path(PASTA)
    try:
        registro = e['registro'] if 'registro' in e else ri.decodificar_registro_texto(e['registroTexto'])
        res = ri.check_one(registro)
    except ri.Recusa as recusa:
        return 'recusado', recusa.code, recusa.reason
    except Exception as erro:
        return 'erro', None, repr(erro)[:200]
    if res['veredito'] != 'pendente-prova':
        return res['veredito'], res.get('motivo'), res.get('escopo', '')
    vs = [provar(os.path.join(PASTA, *p['aleth'].split('/')), os.path.join(PASTA, *p['smt'].split('/')))
          for p in res['pendencias']]
    if any(v is False for v in vs):
        return 'recusado', 'R10', 'o Carcara recusa a prova'
    if any(v is None for v in vs):
        return 'pendente', None, 'a prova (sem o Carcara)'
    return 'aceito', None, 'a prova, pelo Carcara'


def conferir(provar):
    """Confere os exemplos. Devolve um dicionário com as contagens, as linhas da tabela e as falhas, e o que o leitor do
    GPT deu em cada um (em gpt)."""
    with open(os.path.join(PASTA, 'exemplos.json'), encoding='utf-8') as f:
        exemplos = json.load(f)['exemplos']
    r = {'exemplos': len(exemplos), 'validos': 0, 'validos_aceitos': 0, 'invalidos': 0, 'invalidos_recusados': 0,
         'sem_conferir': [], 'falhas': [], 'linhas': [],
         'gpt': {'iguais': 0, 'pendentes': [], 'divergencias': [], 'sem_sympy': ''}}
    try:
        _independente()
        import registros_independente  # noqa: F401
    except ImportError as erro:
        r['gpt']['sem_sympy'] = str(erro)
    for e in exemplos:
        if 'registroTexto' in e:
            try:
                registro = ler_registro(e['registroTexto'])
            except Recusa as recusa:
                registro = recusa
        else:
            registro = e['registro']
        if isinstance(registro, Recusa):
            motivo, detalhe, pendencias = registro.motivo, str(registro), []
        else:
            motivo, detalhe, pendencias = conferir_registro(registro, provar)
        esperado = e['esperado']
        if esperado['veredito'] == 'aceito':
            r['validos'] += 1
            if motivo is None:
                r['validos_aceitos'] += 1
                resultado = 'aceito' + (f" (sem conferir: {'; '.join(pendencias)})" if pendencias else '')
            else:
                resultado = f'RECUSADO, {motivo}: {detalhe}'
                r['falhas'].append(f"{e['id']}: tinha de ser aceito, e foi recusado ({motivo}: {detalhe[:200]})")
        else:
            r['invalidos'] += 1
            if motivo == esperado['motivo']:
                r['invalidos_recusados'] += 1
                resultado = f'recusado, {motivo}'
            elif motivo is None and pendencias:
                # o defeito pode estar no que ficou sem conferir (a prova, sem o Carcara)
                r['sem_conferir'].append(e['id'])
                resultado = f"sem conferir o defeito ({'; '.join(pendencias)})"
            else:
                resultado = f"{motivo or 'ACEITO'}{f': {detalhe}' if detalhe else ''}"
                r['falhas'].append(f"{e['id']}: tinha de ser recusado com {esperado['motivo']}, e deu {resultado[:200]}")
        # o leitor do GPT
        if r['gpt']['sem_sympy']:
            gpt = 'sem rodar (sem o SymPy)'
        else:
            v, m, d = no_leitor_do_gpt(e, provar)
            certo = (v == 'aceito') if esperado['veredito'] == 'aceito' else (v == 'recusado' and m == esperado.get('motivo'))
            gpt = f"{v}{', ' + m if m else ''}"
            if certo:
                r['gpt']['iguais'] += 1
            elif v == 'pendente':
                r['gpt']['pendentes'].append(e['id'])
            else:
                r['gpt']['divergencias'].append(f"{e['id']} ({gpt}{': ' + d[:120] if d else ''})")
                gpt = f'**{gpt}**'
        r['linhas'].append(f"| {e['id']} | {e['descricao']} | {esperado['veredito']}"
                           f"{', ' + esperado['motivo'] if esperado.get('motivo') else ''} | {resultado} | {gpt} |")
    return r
