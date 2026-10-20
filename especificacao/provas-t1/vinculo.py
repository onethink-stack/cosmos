"""O vínculo da fórmula com o problema: refaz o problema de cada certificado a partir das fórmulas, com a implementação
independente da t1 (a pasta independente/, escrita pelo GPT só pela especificação), e o compara com o problema do
certificado. Um hash não faz isso: quem emite o certificado calcula os hashes que quiser.

A comparação é estrutural e ignora só o que não muda o sentido: comentários, (set-logic) e (check-sat), as barras em
volta dos símbolos, os nomes das variáveis ligadas, os let, a forma de escrever um número, and/or aninhados, a ordem das
declarações e das asserções, e as declarações que nenhuma asserção usa. Cada símbolo declarado entra pelo nome-base e
pela assinatura: a seção 3 de traducao-z3-t1.md diz que os nomes no Z3 são informativos e que o que conta é o tipo de
cada símbolo e se ele recebe o mundo. Assim c:n e n:n (Real) são o mesmo símbolo, e P(a) continua diferente de P(b).

Só usa a biblioteca padrão e o código da pasta independente/.
"""
import collections
import fractions
import functools
import hashlib
import json
import os
import re
import sys

PASTA = os.path.dirname(os.path.abspath(__file__))
INDEPENDENTE = os.path.join(PASTA, 'independente')
# a implementação independente em que o verificador confia, byte a byte como o GPT a entregou (rodada 21)
INDEPENDENTE_SHA256 = {
    'parser_independente_m2.py': 'f416e2b8137b02d0f64c55efa7ef9955fdda95d028a58231d99576f14f73d2f7',
    'validador_independente_m2.py': '8482f9d89ce4971e031b3f2eeb9f50a26faa721c18e3d9015a53eea6c3ac54de',
    'tradutor_t1_independente.py': '59c711b1f36d43d4c524c4536c1c2b0242da5d1c174ddc881b3aee0f0c45ef58',
    'avaliador_kripke_puro.py': '86400fe1c7b7349579c3c7193d40c27763a1888d29f2b9fa71c567bdd4fca272',
    'verificar_certificados_sem_z3.py': '36329ac9c336f4e011d33912be7cad07adf049d0392fb1a35dfc2c90d5493b15',
}


def conferir_independente():
    """As falhas da pasta independente/: um arquivo diferente do entregue, ou um léxico diferente do publicado."""
    falhas = []
    for nome, esperado in INDEPENDENTE_SHA256.items():
        with open(os.path.join(INDEPENDENTE, nome), 'rb') as f:
            if hashlib.sha256(f.read()).hexdigest() != esperado:
                falhas.append(f'independente/{nome} não é o arquivo que o GPT entregou')
    with open(os.path.join(INDEPENDENTE, 'lexico-m2.json'), encoding='utf-8') as a, \
            open(os.path.join(PASTA, '..', 'lexico-m2.json'), encoding='utf-8') as b:
        if json.load(a) != json.load(b):
            falhas.append('independente/lexico-m2.json não tem o mesmo conteúdo do léxico publicado')
    return falhas


def refazer(fichas, formulas):
    """O problema SMT-LIB das fórmulas, pela tradução independente (que lê e valida cada fórmula pela m2 antes)."""
    if INDEPENDENTE not in sys.path:
        sys.path.insert(0, INDEPENDENTE)
    from tradutor_t1_independente import Translator
    return Translator(fichas).translate(formulas)


# ---- leitura e forma normal de um problema SMT-LIB

def ler(texto):
    """As expressões de topo do texto, como listas aninhadas; símbolos sem as barras, números como Fraction."""
    i, n = 0, len(texto)
    pilha = [[]]
    while i < n:
        c = texto[i]
        if c == ';':
            while i < n and texto[i] != '\n':
                i += 1
        elif c.isspace():
            i += 1
        elif c == '(':
            pilha.append([])
            i += 1
        elif c == ')':
            feito = pilha.pop()
            pilha[-1].append(feito)
            i += 1
        elif c == '|':
            j = texto.index('|', i + 1)
            pilha[-1].append(('sim', texto[i + 1:j]))
            i = j + 1
        else:
            j = i
            while j < n and not texto[j].isspace() and texto[j] not in '()|;':
                j += 1
            tok = texto[i:j]
            pilha[-1].append(('num', fractions.Fraction(tok)) if re.fullmatch(r'\d+(\.\d+)?', tok) else ('sim', tok))
            i = j
    if len(pilha) != 1:
        raise ValueError('parênteses sem par')
    return pilha[0]


def numero(e):
    """O valor de um número escrito como literal, (- literal) ou (/ literal literal); senão None."""
    if isinstance(e, tuple):
        return e[1] if e[0] == 'num' else None
    if len(e) == 2 and e[0] == ('sim', '-'):
        v = numero(e[1])
        return -v if v is not None else None
    if len(e) == 3 and e[0] == ('sim', '/'):
        a, b = numero(e[1]), numero(e[2])
        return a / b if a is not None and b not in (None, 0) else None
    return None


def simbolos(e):
    """Todos os nomes que aparecem num termo (uma aproximação por cima dos nomes livres)."""
    if isinstance(e, tuple):
        return {e[1]} if e[0] == 'sim' else set()
    return set().union(*(simbolos(x) for x in e)) if e else set()


def sem_let(e, subst):
    """Expande os let: cada nome ligado por um let dá lugar ao termo dele. Recusa se a troca capturasse uma variável
    (um quantificador de dentro ligando um nome que o termo trocado usa)."""
    if isinstance(e, tuple):
        return subst.get(e[1], e) if e[0] == 'sim' else e
    if not e:
        return e
    if e[0] == ('sim', 'let') and len(e) == 3:
        novos = dict(subst)
        for par in e[1]:
            novos[par[0][1]] = sem_let(par[1], subst)
        return sem_let(e[2], novos)
    if e[0] in (('sim', 'forall'), ('sim', 'exists')) and len(e) == 3:
        nomes = {par[0][1] for par in e[1]}
        resto = {k: v for k, v in subst.items() if k not in nomes}
        if any(simbolos(v) & nomes for v in resto.values()):
            raise ValueError('um let capturaria uma variável ligada')
        return [e[0], e[1], sem_let(e[2], resto)]
    return [sem_let(x, subst) for x in e]


def base(nome):
    """O nome-base de um símbolo da tradução: c:a, n:a → a; f:g/2, fn:g/2:RO → g; p:P/1:R → P; R:Ana → Ana."""
    m = re.fullmatch(r'(?:c|n|f|fn|p|R):(.+?)(?:/\d+(?::[RO]+)?)?', nome)
    return m.group(1) if m else nome


def normal(e, ligadas, contador, canon):
    """A forma normal de um termo, como tupla aninhada comparável."""
    v = numero(e)
    if v is not None:
        return ('num', v)
    if isinstance(e, tuple):
        nome = e[1]
        return ('ligada', ligadas[nome]) if nome in ligadas else ('sim', canon.get(nome, nome))
    if not e:
        return ()
    cabeca = e[0]
    if cabeca in (('sim', 'forall'), ('sim', 'exists')) and len(e) == 3:
        novas = dict(ligadas)
        variaveis = []
        for par in e[1]:
            contador[0] += 1
            novas[par[0][1]] = contador[0]
            variaveis.append((contador[0], par[1][1]))
        return (cabeca[1], tuple(variaveis), normal(e[2], novas, contador, canon))
    if cabeca in (('sim', 'and'), ('sim', 'or')):
        args = []
        for x in e[1:]:
            nx = normal(x, ligadas, contador, canon)
            if isinstance(nx, tuple) and len(nx) == 2 and nx[0] == cabeca[1] and isinstance(nx[1], tuple):
                args.extend(nx[1])
            else:
                args.append(nx)
        return (cabeca[1], tuple(args))
    return ('app',) + tuple(normal(x, ligadas, contador, canon) for x in e)


@functools.lru_cache(maxsize=None)
def forma(texto):
    """(declarações usadas, asserções) de um problema, comparáveis sem ligar para a ordem."""
    decl = {}
    corpos = []
    for cmd in ler(texto):
        nome = cmd[0][1]
        if nome in ('set-logic', 'check-sat', 'set-option', 'get-model', 'exit', 'declare-sort'):
            continue
        if nome == 'declare-const':
            decl[cmd[1][1]] = ((), cmd[2][1])
        elif nome == 'declare-fun':
            decl[cmd[1][1]] = (tuple(s[1] for s in cmd[2]), cmd[3][1])
        elif nome == 'assert':
            corpos.append(sem_let(cmd[1], {}))
        else:
            raise ValueError(f'comando inesperado num problema: {nome}')
    canon = {n: f'{base(n)}|{",".join(a)}|{r}' for n, (a, r) in decl.items()}
    if len(set(canon.values())) != len(canon):
        raise ValueError('dois símbolos declarados com o mesmo nome-base e a mesma assinatura')
    usados = set().union(*(simbolos(c) for c in corpos)) if corpos else set()
    declaracoes = frozenset(canon[n] for n in decl if n in usados)
    # cada asserção numera as próprias variáveis ligadas a partir de zero
    assercoes = collections.Counter(repr(normal(c, {}, [0], canon)) for c in corpos)
    return declaracoes, assercoes


def diferenca(a, b):
    """'' se os dois problemas são o mesmo a menos da forma; senão, a primeira diferença."""
    try:
        da, aa = forma(a)
        db, ab = forma(b)
    except ValueError as erro:
        return f'não deu para comparar: {erro}'
    if da != db:
        return f'declarações diferentes: só no primeiro {sorted(da - db)[:3]}; só no segundo {sorted(db - da)[:3]}'
    if aa != ab:
        return f'asserções diferentes: só no primeiro {list((aa - ab).elements())[:1]}'
    return ''


# ---- os ataques ao vínculo

TROCAS = [('□', '◇'), ('◇', '□'), ('∀', '∃'), ('∃', '∀'), ('∧', '∨'), ('∨', '∧')]


def operador_trocado(formulas):
    """As fórmulas com um operador trocado pelo dual (a primeira ocorrência), ou a primeira negada se não houver."""
    for i, f in enumerate(formulas):
        for a, b in TROCAS:
            if a in f:
                return formulas[:i] + [f.replace(a, b, 1)] + formulas[i + 1:], f'{a} trocado por {b}'
    return ['¬(' + formulas[0] + ')'] + formulas[1:], 'primeira fórmula negada'


def conferir(certificados, problema_de):
    """Refaz o problema de cada certificado e ataca o vínculo. problema_de(c) dá o texto do problema do certificado c.
    Devolve um dicionário com as contagens e a lista de falhas."""
    r = {'iguais': 0, 'total': 0, 'trocados': 0, 'trocados_recusados': 0, 'trocados_invalidos': 0, 'pares': 0,
         'pares_recusados': 0, 'pares_iguais': 0, 'falhas': []}
    refeito = {}
    for c in certificados:
        r['total'] += 1
        try:
            refeito[c['id']] = refazer(c['fichas'], c['formulas'])
        except Exception as erro:
            r['falhas'].append(f"{c['id']}: a tradução independente recusou as fórmulas ({erro})")
            continue
        d = diferenca(refeito[c['id']], problema_de(c))
        if d:
            r['falhas'].append(f"{c['id']}: o problema do certificado não é a tradução das fórmulas ({d[:300]})")
        else:
            r['iguais'] += 1
    # 1. a fórmula com um operador trocado: o problema e a prova continuam os do certificado
    for c in certificados:
        novas, como = operador_trocado(c['formulas'])
        r['trocados'] += 1
        try:
            outro = refazer(c['fichas'], novas)
        except Exception:
            r['trocados_invalidos'] += 1  # a fórmula estragada nem passa pela gramática
            continue
        if diferenca(outro, problema_de(c)):
            r['trocados_recusados'] += 1
        else:
            r['falhas'].append(f"{c['id']}: com {como}, o vínculo ainda bateu")
    # 2. a fórmula de outro exemplo com o problema (e a prova) deste
    for c in certificados:
        for o in certificados:
            if o is c or o['id'] not in refeito or c['id'] not in refeito:
                continue
            if not diferenca(refeito[c['id']], refeito[o['id']]):
                r['pares_iguais'] += 1  # os dois exemplos dizem a mesma coisa: trocar não estraga nada
                continue
            r['pares'] += 1
            if diferenca(refeito[o['id']], problema_de(c)):
                r['pares_recusados'] += 1
            else:
                r['falhas'].append(f"{c['id']}: com as fórmulas de {o['id']}, o vínculo ainda bateu")
    return r
