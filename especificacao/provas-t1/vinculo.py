"""O vínculo da fórmula com o problema: refaz o problema de cada certificado a partir das fórmulas, com a implementação
independente da t1 (a pasta independente/, escrita pelo GPT só pela especificação), e o compara com o problema do
certificado. Um hash não faz isso: quem emite o certificado calcula os hashes que quiser.

Antes de comparar, cada problema tem de estar no perfil da t1: só os comandos, as sortes e os operadores embutidos que a
tradução emite, só nomes declarados no padrão da seção 3 (c:, n:, f:, fn:, p:, R:, pertence, w0), os comandos na
ordem da t1 (set-logic, sortes, declarações, asserções e, se houver, um check-sat no fim), e cada termo bem tipado
(aridades e sortes de cada aplicação; toda asserção Bool). Assim ninguém declara uma função chamada and ou -, nenhuma
asserção fica depois da consulta, e as normalizações abaixo só valem para os operadores de verdade sobre o conjunto de
asserções que a consulta vê.

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
# a implementação independente em que o verificador confia, byte a byte como o GPT a entregou (rodada 21; os três
# últimos, no pacote da Fase 2; o avaliador numérico e o leitor de registros revistos na rodada 33; e o avaliador
# numérico consertado na rodada 35, depois do lote cego 1 de registros)
INDEPENDENTE_SHA256 = {
    'parser_independente_m2.py': 'f416e2b8137b02d0f64c55efa7ef9955fdda95d028a58231d99576f14f73d2f7',
    'validador_independente_m2.py': '8482f9d89ce4971e031b3f2eeb9f50a26faa721c18e3d9015a53eea6c3ac54de',
    'tradutor_t1_independente.py': '59c711b1f36d43d4c524c4536c1c2b0242da5d1c174ddc881b3aee0f0c45ef58',
    'avaliador_kripke_puro.py': '86400fe1c7b7349579c3c7193d40c27763a1888d29f2b9fa71c567bdd4fca272',
    'verificar_certificados_sem_z3.py': '36329ac9c336f4e011d33912be7cad07adf049d0392fb1a35dfc2c90d5493b15',
    'verificar_finito_reforcado.py': '21c56ea78a4e6e9c4e26c477bd81f68518349ee38ca3ca1feb89a171f113627e',
    'avaliador_kripke_numerico_v1.py': 'acdcf7177c8718e85e085c443f4fada925f75dba3e9596fcf678341b794d8c8e',
    'registros_independente.py': 'a4b52a0f098f391ea3932f7bd7119627a8619a430c151ab3c181810ce86c7001',
}


def reforcado(fonte):
    """O verificador finito reforçado que a transformação do GPT (fortalecer_modelo.py, no pacote da Fase 2) tira da
    fonte do congelado: cada assert vira um if que levanta ValueError, e os limites da busca do lote cego saem."""
    import ast

    class SemAssert(ast.NodeTransformer):
        def visit_Assert(self, n):
            self.generic_visit(n)
            msg = n.msg if n.msg is not None else ast.Constant(value='pré-condição do modelo finito falhou')
            levanta = ast.Raise(exc=ast.Call(func=ast.Name(id='ValueError', ctx=ast.Load()), args=[msg], keywords=[]),
                                cause=None)
            return ast.copy_location(ast.If(test=ast.UnaryOp(op=ast.Not(), operand=n.test), body=[levanta], orelse=[]),
                                     n)
    arvore = SemAssert().visit(ast.parse(fonte))
    ast.fix_missing_locations(arvore)
    texto = ast.unparse(arvore).replace('(1 <= n <= 5)', '(n >= 1)').replace('(1 <= k <= 3)', '(k >= 1)')
    return '# Gerado do verificador finito independente congelado; assert convertidas para ValueError; sem teto de ' \
           'busca.\n' + texto + '\n'


def conferir_independente():
    """As falhas da pasta independente/: um arquivo diferente do entregue, um léxico diferente do publicado, ou um
    verificador finito reforçado que não é a transformação mecânica do congelado."""
    falhas = []
    for nome, esperado in INDEPENDENTE_SHA256.items():
        with open(os.path.join(INDEPENDENTE, nome), 'rb') as f:
            if hashlib.sha256(f.read()).hexdigest() != esperado:
                falhas.append(f'independente/{nome} não é o arquivo que o GPT entregou')
    with open(os.path.join(INDEPENDENTE, 'lexico-m2.json'), encoding='utf-8') as a, \
            open(os.path.join(PASTA, '..', 'lexico-m2.json'), encoding='utf-8') as b:
        if json.load(a) != json.load(b):
            falhas.append('independente/lexico-m2.json não tem o mesmo conteúdo do léxico publicado')
    with open(os.path.join(INDEPENDENTE, 'verificar_certificados_sem_z3.py'), encoding='utf-8') as a, \
            open(os.path.join(INDEPENDENTE, 'verificar_finito_reforcado.py'), encoding='utf-8') as b:
        if reforcado(a.read().replace('\r\n', '\n')) != b.read().replace('\r\n', '\n'):
            falhas.append('independente/verificar_finito_reforcado.py não é a transformação mecânica do congelado '
                          '(nesta versão do Python)')
    return falhas


def refazer(fichas, formulas):
    """O problema SMT-LIB das fórmulas, pela tradução independente (que lê e valida cada fórmula pela m2 antes)."""
    if INDEPENDENTE not in sys.path:
        sys.path.insert(0, INDEPENDENTE)
    from tradutor_t1_independente import Translator
    return Translator(fichas).translate(formulas)


# ---- o perfil da t1: o que a tradução emite, e nada mais. Um problema fora dele é recusado antes da comparação, para
# que as normalizações (achatar and/or, ler (- n) e (/ n m) como números) só valham para os operadores embutidos: uma
# função declarada com o nome and, ou -, não é associativa nem é a negação (achado do GPT na rodada 28)

COMANDOS = {'set-logic', 'declare-sort', 'declare-fun', 'declare-const', 'assert', 'check-sat'}
SORTES_DECLARADAS = {'Obj', 'Mundo'}
SORTES = SORTES_DECLARADAS | {'Bool', 'Real'}
EMBUTIDOS = {'true', 'false', 'not', 'and', 'or', '=>', '=', '+', '-', '*', '/', '^', '<', '<=', '>', '>=', 'is_int'}
LIGADORES = {'forall', 'exists', 'let'}
# os nomes que a t1 declara (seção 3 de traducao-z3-t1.md): w0, pertence, c:, n:, f:, fn:, p: e R:
NOME_DECLARADO = re.compile(r'w0|pertence|(?:c|n):[^\s|]+|(?:f|fn|p):[^\s|/]+/\d+(?::[RO]+)?|R:[^\s|]+')


# a ordem dos comandos na t1: um (set-logic ALL), as sortes, as funções e constantes, as asserções e, se houver, um
# (check-sat) no fim. Uma asserção depois de um check-sat mudaria a consulta sem mudar o conjunto das asserções, e a
# comparação, que olha o conjunto, não veria (achado do GPT na rodada 29). Sem check-sat, a consulta é o conjunto todo
FASE = {'set-logic': 0, 'declare-sort': 1, 'declare-fun': 2, 'declare-const': 2, 'assert': 3, 'check-sat': 4}


def conferir_perfil(comandos):
    """Recusa (ValueError) um problema fora do perfil da t1, inclusive um termo mal tipado."""
    assinaturas = {}  # nome declarado -> (sortes dos argumentos, sorte do resultado)
    sortes_declaradas = set()
    fase = -1
    for i, cmd in enumerate(comandos):
        if not cmd or not isinstance(cmd[0], tuple) or cmd[0][1] not in COMANDOS:
            raise ValueError(f'comando fora do perfil da t1: {cmd[:1]}')
        nome = cmd[0][1]
        if FASE[nome] < fase or (FASE[nome] == fase and nome in ('set-logic', 'check-sat')):
            raise ValueError(f'{nome} fora da ordem da t1 (set-logic, sortes, declarações, asserções, check-sat)')
        fase = FASE[nome]
        if i == 0 and nome != 'set-logic':
            raise ValueError('a t1 começa com (set-logic ALL)')
        if nome == 'set-logic' and cmd[1:] != [('sim', 'ALL')]:
            raise ValueError('a t1 usa (set-logic ALL)')
        if nome == 'check-sat' and len(cmd) != 1:
            raise ValueError('check-sat mal formado')
        if nome == 'declare-sort':
            if len(cmd) != 3 or cmd[1][1] not in SORTES_DECLARADAS or numero(cmd[2]) != 0 or cmd[1][1] in sortes_declaradas:
                raise ValueError(f'sorte fora do perfil da t1: {cmd[1:]}')
            sortes_declaradas.add(cmd[1][1])
        if nome in ('declare-fun', 'declare-const'):
            simbolo = cmd[1][1]
            if nome == 'declare-fun' and (len(cmd) != 4 or not isinstance(cmd[2], list)):
                raise ValueError('declare-fun mal formado')
            if nome == 'declare-const' and len(cmd) != 3:
                raise ValueError('declare-const mal formado')
            argumentos = tuple(s[1] for s in cmd[2]) if nome == 'declare-fun' else ()
            resultado = cmd[3][1] if nome == 'declare-fun' else cmd[2][1]
            if not NOME_DECLARADO.fullmatch(simbolo):
                raise ValueError(f'nome declarado fora do perfil da t1: {simbolo}')
            if simbolo in assinaturas:
                raise ValueError(f'{simbolo} declarado duas vezes')
            if any(s not in SORTES or (s in SORTES_DECLARADAS and s not in sortes_declaradas)
                   for s in argumentos + (resultado,)):
                raise ValueError(f'{simbolo} com sorte fora do perfil da t1, ou não declarada antes')
            assinaturas[simbolo] = (argumentos, resultado)

    def sorte_ligada(s):
        if not (isinstance(s, tuple) and s[0] == 'sim' and s[1] in SORTES
                and (s[1] not in SORTES_DECLARADAS or s[1] in sortes_declaradas)):
            raise ValueError(f'variável ligada com sorte fora do perfil da t1, ou não declarada: {s}')
        return s[1]

    def sorte(e, ligadas):
        """A sorte de um termo; recusa um termo mal tipado (a checagem de tipos que o GPT pediu na rodada 30)."""
        if isinstance(e, tuple):
            if e[0] == 'num':
                return 'Real'  # na t1, todo número é Real
            n = e[1]
            if n in ligadas:
                return ligadas[n]
            if n in ('true', 'false'):
                return 'Bool'
            if n in assinaturas and not assinaturas[n][0]:
                return assinaturas[n][1]
            raise ValueError(f'símbolo fora do perfil da t1, ou usado sem os argumentos: {n}')
        if not e or not isinstance(e[0], tuple) or e[0][0] != 'sim':
            raise ValueError('aplicação sem nome')
        cabeca = e[0][1]
        if cabeca in LIGADORES:
            if len(e) != 3 or not isinstance(e[1], list) or not e[1]:
                raise ValueError(f'{cabeca} mal formado')
            novas = dict(ligadas)
            for par in e[1]:
                if not (isinstance(par, list) and len(par) == 2 and isinstance(par[0], tuple) and par[0][0] == 'sim'):
                    raise ValueError(f'{cabeca} mal formado')
                n = par[0][1]
                if n in EMBUTIDOS or n in LIGADORES or n in assinaturas:
                    raise ValueError(f'{cabeca} liga um nome que esconde outro símbolo: {n}')
                # o termo de um let vê só os nomes de fora
                novas[n] = sorte(par[1], ligadas) if cabeca == 'let' else sorte_ligada(par[1])
            corpo = sorte(e[2], novas)
            if cabeca != 'let' and corpo != 'Bool':
                raise ValueError(f'o corpo de um {cabeca} tem de ser Bool')
            return corpo
        if cabeca in ligadas:
            raise ValueError(f'uma variável ligada não é aplicada: {cabeca}')
        args = [sorte(x, ligadas) for x in e[1:]]
        if cabeca in assinaturas:
            esperados, resultado = assinaturas[cabeca]
            if not esperados or tuple(args) != esperados:
                raise ValueError(f'{cabeca} aplicado a {args}, esperava {list(esperados)}')
            return resultado

        def todos(sorte_dos_argumentos, minimo):
            if len(args) < minimo or any(a != sorte_dos_argumentos for a in args):
                raise ValueError(f'{cabeca} com argumentos {args}')
        if cabeca == 'not':
            todos('Bool', 1)
            if len(args) != 1:
                raise ValueError('not tem um argumento')
            return 'Bool'
        if cabeca in ('and', 'or', '=>'):
            todos('Bool', 2)
            return 'Bool'
        if cabeca == '=':
            if len(args) < 2 or len(set(args)) != 1:
                raise ValueError(f'= com argumentos {args}')
            return 'Bool'
        if cabeca in ('+', '*'):
            todos('Real', 2)
            return 'Real'
        if cabeca in ('-', '/'):
            # - com um argumento (o sinal) ou dois, / com dois: as formas que a tradução emite
            todos('Real', 1 if cabeca == '-' else 2)
            if len(args) > 2:
                raise ValueError(f'{cabeca} com mais de dois argumentos')
            return 'Real'
        if cabeca == '^':
            todos('Real', 2)
            if len(args) != 2:
                raise ValueError('^ tem dois argumentos')
            return 'Real'
        if cabeca in ('<', '<=', '>', '>='):
            todos('Real', 2)
            return 'Bool'
        if cabeca == 'is_int':
            todos('Real', 1)
            if len(args) != 1:
                raise ValueError('is_int tem um argumento')
            return 'Bool'
        raise ValueError(f'símbolo fora do perfil da t1: {cabeca}')

    for cmd in comandos:
        if cmd[0][1] == 'assert':
            if len(cmd) != 2:
                raise ValueError('assert mal formado')
            if sorte(cmd[1], {}) != 'Bool':
                raise ValueError('uma asserção tem de ser Bool')


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
            if len(pilha) == 1:
                raise ValueError('parênteses sem par')
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
    """(declarações usadas, asserções) de um problema, comparáveis sem ligar para a ordem. Recusa (ValueError) um
    problema fora do perfil da t1."""
    decl = {}
    corpos = []
    comandos = ler(texto)
    conferir_perfil(comandos)
    for cmd in comandos:
        nome = cmd[0][1]
        if nome in ('set-logic', 'check-sat', 'declare-sort'):
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
    """'' se os dois problemas são o mesmo a menos da forma; senão, a primeira diferença. Um problema que não se lê
    (mal formado, de qualquer jeito) é diferente: a comparação falha fechada, sem derrubar a conferência."""
    try:
        da, aa = forma(a)
        db, ab = forma(b)
    except ValueError as erro:
        return f'não deu para comparar: {erro}'
    except Exception as erro:
        return f'não deu para comparar: problema mal formado ({type(erro).__name__}: {erro})'[:300]
    if da != db:
        return f'declarações diferentes: só no primeiro {sorted(da - db)[:3]}; só no segundo {sorted(db - da)[:3]}'
    if aa != ab:
        return (f'asserções diferentes (contando as repetidas): só no primeiro {list((aa - ab).elements())[:1]}; '
                f'só no segundo {list((ab - aa).elements())[:1]}')
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
