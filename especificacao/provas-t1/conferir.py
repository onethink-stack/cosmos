#!/usr/bin/env python3
"""Confere as provas Alethe desta pasta com o Carcara e tenta enganar o verificador de propósito.

Uso: python3 conferir.py [--carcara CAMINHO] [--sem-carcara] [--relatorio ARQUIVO]

O que é do verificador e o que é do certificado:
  - do verificador: este roteiro e vinculo.py, o Carcara (commit fixo no fluxo), o arquivo de regras RARE, cujo
    SHA-256 está fixo aqui embaixo (REGRAS_CONFIADAS_SHA256), e a implementação independente da t1 (a pasta
    independente/, escrita pelo GPT só pela especificação), com o SHA-256 de cada arquivo fixo em vinculo.py. Um
    certificado não escolhe os axiomas nem a tradução: mudar uma regra ou a tradução exige mudar o verificador, e não
    só o registro de certificados.
  - do certificado: as fórmulas, o problema, a prova e o registro (certificados.json).

1. Confere o SHA-256 de cada problema e de cada prova com o registro, e o do arquivo de regras com o valor fixo.
2. Roda, para cada prova,
       carcara check --allow-int-real-subtyping --expand-let-bindings --rare-file regras.rare PROVA PROBLEMA
   pelos dois modos, cada um sozinho: a resolução conferida pelos pivôs que o cvc5 dá, e com --rup-resolution,
   que confere cada resolução por propagação de unidades, sem depender dos pivôs. Os dois modos são corretos;
   exige "valid" (nem "holey" nem "invalid") em pelo menos um, e o relatório mostra os dois.
3. Estraga cada prova de até sete jeitos, um de cada vez, sempre deixando a prova bem escrita, para que a recusa
   venha da lógica e não da forma: um literal negado; um literal tirado de uma resolução (a conclusão fica mais
   forte do que a resolução dá); uma premissa trocada por um passo anterior visível no mesmo escopo; uma premissa
   trocada por um passo de dentro de uma subprova já fechada; a regra de um passo trocada por false, sem
   premissas nem argumentos; a conclusão de um passo rare_rewrite trocada por outra igualdade verdadeira que não é
   instância da regra; uma suposição trocada pela negação dela, que não está no problema. Cada estrago tem de ser
   recusado pelos dois modos. O sorteio tem semente fixa, e se repete enquanto o estrago deixar o passo certo
   (uma resolução que ainda segue das premissas por propagação de unidades, uma premissa trocada por outra com a
   mesma cláusula): aí aceitar não seria erro.
4. Roda os casos de adversarios/: problemas satisfazíveis com "provas" de que não são, escritas à mão para atacar
   pontos certos (resolvente falso, regra RARE com tipo errado, instância errada de um ∀, suposição fora do
   problema, regra falsa trazida pelo próprio certificado). Todos têm de ser recusados.
5. Confere o vínculo da fórmula com o problema (vinculo.py): refaz o problema de cada certificado a partir das
   fórmulas, com a implementação independente, e o compara com o problema do certificado. Também ataca o vínculo:
   cada certificado com um operador trocado na fórmula, e com as fórmulas de cada um dos outros exemplos, tem de
   ser recusado; e o caso adversarios/vinculo-trocado.json, com a prova verdadeira de Z09 e fórmulas que têm modelo,
   tem de passar no Carcara e ser recusado pelo vínculo. Os pares de adversarios/comparador/ (problemas de sentido
   diferente, com funções declaradas chamadas and e -, ou um check-sat no meio) têm de sair diferentes na comparação,
   e os problemas *-recusar.smt2 (um termo mal tipado) têm de ser recusados pelo perfil da t1.
6. Confere os modelos dos sat (modelos.py) com a conferência independente, sem busca: os finitos e os exatos (com
   números, pelo avaliador numérico do GPT, que usa o SymPy). E ataca: cada modelo tem de ser recusado com a primeira
   fórmula negada; um finito, com uma tabela de função sem uma linha e com o quadro de um titular sem os acessos do
   mundo real; um exato, com α num intervalo sem raiz, com a testemunha trocada e com D0 trocado.
7. Confere os registros de exemplo do formato aberto (registros.py, especificacao/registros-v1.md): cada exemplo de
   registros-v1/exemplos.json tem de dar o veredito esperado, com a leitura e a tradução independentes, as conferências
   independentes de modelo e o Carcara nas provas. Roda também o leitor de registros do GPT e conta onde ele diverge.
8. Confere o lote cego 1 de registros (registros-v1/lote-cego-1/), já revelado: cada um dos registros tem de dar a
   resposta que o Caderno registrou antes das respostas do GPT (caderno.json, o compromisso), e as provas que ela
   deixou pendentes, o que ela previu para o Carcara. O leitor de registros do GPT passa pelo mesmo teste.

Sai com código 1 se alguma prova não der "valid", se algum estrago ou caso adversário for aceito, se o vínculo não
bater, se um modelo for recusado ou um modelo estragado aceito, se um registro de exemplo não der o veredito esperado,
se um registro do lote cego não der a resposta registrada, ou se algum SHA-256 não bater. Com --sem-carcara, confere os hashes, monta os estragos e confere o vínculo, sem rodar o
Carcara. Só usa a biblioteca padrão e o código da pasta independente/.
"""
import argparse
import collections
import glob
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import tempfile

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)
import modelos  # noqa: E402
import registros  # noqa: E402
import vinculo  # noqa: E402

OPCOES = ['--allow-int-real-subtyping', '--expand-let-bindings']
# os axiomas em que o verificador confia: as 17 regras RARE auditadas (rodadas 22 a 24)
REGRAS_CONFIADAS = os.path.join(PASTA, 'regras.rare')
REGRAS_CONFIADAS_SHA256 = 'ffbfc076411a039624a55dfbb9f0c588996aeac10bb8e72161cd64039b071fad'


def sha256(caminho):
    with open(caminho, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def fim_do_termo(s, i):
    """A posição logo depois do termo que começa em s[i]: uma lista entre parênteses ou um átomo."""
    if s[i] == '|':
        return s.index('|', i + 1) + 1
    if s[i] == '"':
        return s.index('"', i + 1) + 1
    if s[i] != '(':
        j = i
        while j < len(s) and s[j] not in ' ()':
            j += 1
        return j
    nivel = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == '|':
            j = s.index('|', j + 1)
        elif c == '"':
            j = s.index('"', j + 1)
        elif c == '(':
            nivel += 1
        elif c == ')':
            nivel -= 1
            if nivel == 0:
                return j + 1
        j += 1
    raise ValueError('parênteses sem fim')


def termos(s, i, fim):
    """Os termos em s[i:fim], separados por espaço."""
    saida = []
    while i < fim:
        if s[i] == ' ':
            i += 1
            continue
        f = fim_do_termo(s, i)
        saida.append(s[i:f])
        i = f
    return saida


def clausula(l):
    """(início, fim, literais) da cláusula (cl ...) de um passo."""
    c0 = l.index('(cl')
    c1 = fim_do_termo(l, c0)
    return c0, c1, termos(l, c0 + 3, c1 - 1)


def campo(l, nome):
    """(início, fim) de ' :nome (...)' num passo, ou None."""
    i = l.find(f' :{nome} (')
    if i < 0:
        return None
    return i, fim_do_termo(l, i + len(f' :{nome} '))


def forma(s):
    """O termo como lista aninhada, com os dois lados de cada igualdade em ordem fixa: partes do Carcara (as
    suposições, trans, cong) comparam termos sem ligar para a ordem dos lados de uma igualdade, então para elas
    (= a b) e (= b a) contam como o mesmo termo."""
    if not s.startswith('('):
        return s
    partes = [forma(x) for x in termos(s, 1, len(s) - 1)]
    if len(partes) == 3 and partes[0] == '=':
        partes = ['='] + sorted(partes[1:], key=repr)
    return partes


def escopo(id_):
    """O prefixo da subprova de um passo: 't5.t3.t1' está em 't5.t3.'; 't7' está fora de subprova ('')."""
    return id_.rsplit('.', 1)[0] + '.' if '.' in id_ else ''


def literal(l):
    """O literal sem as negações de fora, com a polaridade: t dá (True, t), (not t) dá (False, t) e
    (not (not t)) dá (True, t). É assim que o Carcara compara os literais de uma resolução."""
    p = True
    while l.startswith('(not ') and l.endswith(')'):
        l, p = l[5:-1], not p
    return p, l


def segue_por_rup(conclusao, premissas):
    """Se a conclusão segue das premissas por propagação de unidades, como no modo --rup-resolution do Carcara
    (função rup de src/checker/rules/resolution.rs, no commit fixo): supondo falso cada literal da conclusão, a
    propagação deixa alguma premissa falsa. Aqui só serve para escolher os estragos; não confere prova nenhuma."""
    valor = {}
    for p, t in map(literal, conclusao):
        if valor.setdefault(t, not p) != (not p):
            return True
    clausulas = [set(map(literal, c)) for c in premissas]
    mudou = True
    while mudou:
        mudou = False
        for c in clausulas:
            if any(valor.get(t) == p for p, t in c):
                continue
            livres = [(p, t) for p, t in c if t not in valor]
            if not livres:
                return True
            if len(livres) == 1:
                valor[livres[0][1]] = livres[0][0]
                mudou = True
    return False


def mesma_clausula(a, b):
    return {(p, repr(forma(t))) for p, t in map(literal, a)} == {(p, repr(forma(t))) for p, t in map(literal, b)}


TENTATIVAS = 200


def estragos(id_, linhas):
    """As provas estragadas, cada uma com uma única mudança: [(tipo, descrição, linhas)]."""
    nome = lambda l: l.split()[1]
    passos = [k for k, l in enumerate(linhas) if l.startswith('(step ')]
    posicao = {}
    for k, l in enumerate(linhas):
        m = re.match(r'\((?:assume|step) (\S+) ', l)
        if m:
            posicao.setdefault(m.group(1), k)
    saida = []

    def troca(tipo, k, novo, descricao):
        saida.append((tipo, f'{descricao} no passo {nome(linhas[k])}', linhas[:k] + [novo] + linhas[k + 1:]))

    def clausula_de(x):
        """A cláusula de um passo, ou a de uma suposição, que vale como cláusula de um literal só."""
        l = linhas[posicao[x]]
        if l.startswith('(assume '):
            return [l[l.index(' ', len('(assume ')) + 1:-1]]
        return clausula(l)[2]

    def premissas(l):
        p = campo(l, 'premises')
        return termos(l, p[0] + len(' :premises ('), p[1] - 1) if p else []

    def ainda_segue(l):
        """Se o passo estragado é uma resolução que ainda segue das premissas dela por propagação de unidades: o
        Carcara a aceitaria com razão no modo RUP (e uma resolução que segue pelos pivôs segue por RUP também)."""
        return (re.search(r':rule resolution\b', l) is not None
                and segue_por_rup(clausula(l)[2], [clausula_de(x) for x in premissas(l)]))

    # O sorteio de cada estrago se repete (até TENTATIVAS vezes) enquanto o estrago deixar o passo certo: aí
    # aceitar não seria erro do verificador

    # 1. um literal da conclusão trocado pela negação dele
    rng = random.Random(f'{id_}-literal')
    cand = [k for k in passos if clausula(linhas[k])[2]]
    for _ in range(TENTATIVAS if cand else 0):
        k = rng.choice(cand)
        l = linhas[k]
        c0, c1, lits = clausula(l)
        i = rng.randrange(len(lits))
        lits[i] = f'(not {lits[i]})'
        novo = l[:c0] + '(cl ' + ' '.join(lits) + ')' + l[c1:]
        if not ainda_segue(novo):
            troca('literal negado', k, novo, 'literal negado')
            break

    # 2. um literal tirado da conclusão de uma resolução: a cláusula fica mais forte do que a resolução dá (fica de
    # fora, por exemplo, tirar uma de duas cópias do mesmo literal, que deixa a mesma cláusula)
    rng = random.Random(f'{id_}-resolvente')
    cand = [k for k in passos if ':rule resolution' in linhas[k] and clausula(linhas[k])[2]]
    for _ in range(TENTATIVAS if cand else 0):
        k = rng.choice(cand)
        l = linhas[k]
        c0, c1, lits = clausula(l)
        del lits[rng.randrange(len(lits))]
        novo = l[:c0] + '(cl' + ''.join(' ' + x for x in lits) + ')' + l[c1:]
        if not ainda_segue(novo):
            troca('literal tirado de uma resolução', k, novo, 'literal tirado')
            break

    # 3. uma premissa trocada por um passo anterior visível no mesmo escopo (ou num escopo que o envolve). Ficam de
    # fora os passos com a mesma cláusula da premissa trocada e as resoluções que ainda seguem
    # 4. uma premissa trocada por um passo de dentro de uma subprova já fechada. Aqui não há filtro: mesmo que a
    # cláusula feche a conta, usar um passo fora do escopo dele é erro
    for tipo, visivel in [('premissa anterior trocada', True), ('premissa de subprova fechada', False)]:
        rng = random.Random(f'{id_}-{tipo}')
        cand = []
        for k in passos:
            atuais = premissas(linhas[k])
            if not atuais:
                continue
            meu = escopo(nome(linhas[k]))
            outros = []
            for x, j in posicao.items():
                if j >= k or x in atuais or x == nome(linhas[k]):
                    continue
                dentro = meu.startswith(escopo(x))
                # uma subprova fechada: x está dentro dela, e o passo que a fecha já veio antes de k
                fechada = (not dentro) and escopo(x) and posicao.get(escopo(x)[:-1], 10**9) < k
                if (visivel and dentro) or (not visivel and fechada):
                    outros.append(x)
            if outros:
                cand.append((k, atuais, sorted(outros)))
        for _ in range(TENTATIVAS if cand else 0):
            k, atuais, outros = rng.choice(cand)
            l = linhas[k]
            p = campo(l, 'premises')
            novas = list(atuais)
            i = rng.randrange(len(novas))
            novas[i] = rng.choice(outros)
            novo = l[:p[0]] + ' :premises (' + ' '.join(novas) + ')' + l[p[1]:]
            # a mesma cláusula, sem ligar para a ordem dos literais nem para a dos lados das igualdades (trans e cong
            # do Carcara não ligam para ela; symm liga, e aí o filtro só deixa de fora um estrago que valeria)
            mesma = mesma_clausula(clausula_de(novas[i]), clausula_de(atuais[i]))
            if visivel and (mesma or ainda_segue(novo)):
                continue
            troca(tipo, k, novo, tipo)
            break

    # 5. a regra de um passo trocada por false, sem premissas nem argumentos: só a conclusão pode ser o motivo da
    # recusa. Ficam de fora os passos que false provaria (a própria (cl (not false)))
    rng = random.Random(f'{id_}-regra')
    cand = [k for k in passos if '(cl (not false))' not in linhas[k] and ':rule false' not in linhas[k]]
    if cand:
        k = rng.choice(cand)
        l = linhas[k]
        regra = re.search(r':rule (\S+)', l).group(1).rstrip(')')
        novo = l
        for c in ('args', 'premises'):
            p = campo(novo, c)
            if p:
                novo = novo[:p[0]] + novo[p[1]:]
        novo = re.sub(r':rule \S+?(?=[ )])', ':rule false', novo, count=1)
        troca('regra trocada por false', k, novo, f'regra {regra} trocada por false')

    # 6. a conclusão de um rare_rewrite (= L R) trocada por (= L L): verdadeira, mas não é instância da regra.
    # Ficam de fora os passos em que L e R só diferem pela ordem dos lados de igualdades (como no eq-symm): ali
    # (= L L) é a própria instância a menos dessa ordem, e aceitar não seria erro (o rare_rewrite do Carcara compara
    # a conclusão exatamente, mas os passos seguintes não ligam para essa ordem)
    rng = random.Random(f'{id_}-rare')
    cand = []
    for k in passos:
        l = linhas[k]
        if ':rule rare_rewrite' not in l:
            continue
        c0, c1, lits = clausula(l)
        if len(lits) == 1 and lits[0].startswith('(= '):
            lados = termos(lits[0], 3, len(lits[0]) - 1)
            if len(lados) == 2 and forma(lados[0]) != forma(lados[1]):
                cand.append((k, lados))
    if cand:
        k, lados = rng.choice(cand)
        l = linhas[k]
        c0, c1, _ = clausula(l)
        troca('rare_rewrite com outra conclusão', k, l[:c0] + f'(cl (= {lados[0]} {lados[0]}))' + l[c1:], 'conclusão do rare_rewrite trocada')

    # 7. uma suposição trocada pela negação dela, que não está no problema
    supos = [k for k, l in enumerate(linhas) if l.startswith('(assume ')]
    if supos:
        k = supos[0]
        l = linhas[k]
        i = l.index(' ', len('(assume ')) + 1
        troca('suposição fora do problema', k, l[:i] + '(not ' + l[i:-1] + '))', 'suposição negada')
    return saida


ANSI = re.compile(r'\x1b\[[0-9;]*m')


def carcara(caminho, prova, problema, regras, extra=()):
    """O veredito do Carcara ('valid', 'holey', 'invalid' ou 'erro') e tudo o que ele escreveu, sem as cores (a linha
    de comando dele pinta os erros mesmo com --no-color)."""
    try:
        r = subprocess.run([caminho, '--no-color', 'check', *OPCOES, *extra, '--rare-file', regras, prova, problema],
                           capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return 'tempo esgotado', ''
    saida = r.stdout.strip().splitlines()
    motivo = ' '.join(ANSI.sub('', r.stderr).split())
    return (saida[0].strip() if saida else 'erro'), motivo


def curto(motivo, n=400):
    """O motivo encurtado para o relatório. O Carcara escreve primeiro o erro, às vezes com termos enormes, e só no fim
    em que passo e com que regra ('note: checking failed on step ... with rule ...'): a nota vem para a frente, e o
    caminho do arquivo sai (fica a linha e a coluna, quando há)."""
    m = re.search(r'note: (checking failed on step \S+ with rule \S+)', motivo)
    texto = motivo[:m.start()] + motivo[m.end():] if m else motivo
    # sem a nota, o caminho do arquivo é o fim do texto (e pode ter espaços)
    texto = re.sub(r' ?--> in file .*?(?::(\d+:\d+))?$', lambda x: f' (em {x.group(1)})' if x.group(1) else '',
                   texto.strip()).strip()
    return ((m.group(1) + ': ' if m else '') + texto)[:n]


def conferir(caminho, prova, problema, regras):
    """Primeiro pelos pivôs que o cvc5 dá em cada resolução; se não der 'valid', de novo por RUP.
    Devolve (veredito final, modo que valeu ou '', motivo da recusa pelos pivôs, motivo da recusa por RUP)."""
    v, motivo = carcara(caminho, prova, problema, regras)
    if v == 'valid':
        return v, 'pivôs', '', ''
    v2, motivo2 = carcara(caminho, prova, problema, regras, ('--rup-resolution',))
    if v2 == 'valid':
        return v2, 'RUP', motivo, ''
    return v, '', motivo, f'{v2} {motivo2}'.strip()


def classe(motivo):
    """De onde veio a recusa, pelo texto inteiro que o Carcara escreveu: da regra de um passo (a nota 'checking failed
    on step ... with rule ...'), da falta da cláusula vazia no fim, ou da leitura (um passo citado fora do escopo
    dele, um tipo errado, ou outro erro com linha e coluna). A linha de comando escreve os erros de leitura sem
    prefixo, só a mensagem e o lugar ('--> in file ARQUIVO:LINHA:COLUNA')."""
    m = re.search(r"checking failed on step '?[^ ']+'? with rule '?([a-z_0-9]+)", motivo)
    if m:
        return 'regra ' + m.group(1)
    if 'does not conclude empty clause' in motivo:
        return 'sem cláusula vazia'
    if re.search(r"step id '[^']*' is not defined", motivo):
        return 'leitura: passo fora do escopo'
    if re.search(r'sort error|cannot be matched|is not a function sort', motivo):
        return 'leitura: tipo'
    if re.search(r'parser error|in file .*:\d+:\d+$', motivo):
        return 'leitura'
    return 'outro' if motivo else 'sem motivo'


def ambiente():
    """O sistema e o Rust da máquina, para a anotação do Carcara: a mesma compilação depende dos dois."""
    partes = []
    try:
        with open('/etc/os-release', encoding='utf-8') as f:
            m = re.search(r'^PRETTY_NAME="?([^"\n]+)', f.read(), re.M)
        if m:
            partes.append(m.group(1))
    except OSError:
        pass
    try:
        r = subprocess.run(['rustc', '--version'], capture_output=True, text=True, timeout=60)
        if r.returncode == 0 and r.stdout.strip():
            partes.append(r.stdout.strip())
    except (OSError, subprocess.TimeoutExpired):
        pass
    return partes


def versao_do_sympy():
    """A versão do SymPy que o avaliador dos modelos exatos usa, se ele está instalado."""
    try:
        import sympy
        return [f'SymPy {sympy.__version__}']
    except ImportError:
        return []


def anotacao(nivel, titulo, texto):
    """Uma anotação do GitHub: aparece na página da execução para qualquer pessoa, sem login."""
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        texto = texto.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print(f'::{nivel} title={titulo}::{texto}', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--carcara', default='carcara')
    ap.add_argument('--sem-carcara', action='store_true')
    ap.add_argument('--relatorio')
    # uma pasta a mais no caminho do Python (por exemplo, a de um SymPy instalado à parte, para rodar fora do CI)
    ap.add_argument('--caminho-extra', action='append', default=[])
    args = ap.parse_args()
    if sys.flags.optimize:
        # parte da conferência independente (independente/) ainda guarda passos com assert, e python -O tira os assert
        sys.exit('conferir.py não roda com python -O (nem PYTHONOPTIMIZE): sem os assert, partes da conferência '
                 'independente deixariam de recusar')
    for pasta in reversed(args.caminho_extra):
        sys.path.insert(0, pasta)
    falhas = []

    if not args.sem_carcara:
        try:
            r = subprocess.run([args.carcara, '--version'], capture_output=True, text=True, timeout=60)
            versao = ' '.join((r.stdout or r.stderr).split())[:200] or f'saiu com {r.returncode}'
            anotacao('notice', 'Carcara', '; '.join([versao, *ambiente(), *versao_do_sympy()]))
        except OSError as erro:
            anotacao('error', 'Carcara', f'não deu para rodar {args.carcara}: {erro}')
            raise

    if sha256(REGRAS_CONFIADAS) != REGRAS_CONFIADAS_SHA256:
        falhas.append('regras.rare não é o arquivo de regras auditado: o SHA-256 não bate com o fixado no verificador')
    with open(os.path.join(PASTA, 'certificados.json'), encoding='utf-8') as f:
        registro = json.load(f)
    if registro['regrasRare']['sha256'] != REGRAS_CONFIADAS_SHA256:
        falhas.append('o registro de certificados aponta para outro arquivo de regras')
    falhas += vinculo.conferir_independente()

    # O GitHub mostra no máximo 10 anotações de cada nível por etapa: os avisos são poucos e juntam várias linhas
    provas_md = ['| Exemplo | Pelos pivôs | Por RUP |', '| --- | --- | --- |']
    por_tipo = collections.OrderedDict()
    validas = com_prova = pelos_pivos = por_rup = 0
    so_um_modo = []
    adv_notas = []
    with tempfile.TemporaryDirectory() as tmp:
        for c in registro['certificados']:
            problema = os.path.join(PASTA, c['problema']['arquivo'])
            if sha256(problema) != c['problema']['sha256']:
                falhas.append(f"{c['id']}: SHA-256 do problema diferente do registro")
            if not c.get('prova'):
                continue
            com_prova += 1
            prova = os.path.join(PASTA, c['prova']['arquivo'])
            if sha256(prova) != c['prova']['sha256']:
                falhas.append(f"{c['id']}: SHA-256 da prova diferente do registro")
            with open(prova, encoding='utf-8') as f:
                linhas = f.read().splitlines()
            lista = estragos(c['id'], linhas)
            for tipo, descricao, l in lista:
                if l == linhas:
                    falhas.append(f"{c['id']}: estrago igual à prova ({descricao})")
                por_tipo.setdefault(tipo, {'montados': 0, 'recusados': 0, 'classes': collections.Counter()})['montados'] += 1
            if args.sem_carcara:
                continue
            # a prova original pelos dois modos, cada um sozinho: só assim a recusa de um estrago por um modo diz algo
            v_pivos, m_pivos = carcara(args.carcara, prova, problema, REGRAS_CONFIADAS)
            v_rup, m_rup = carcara(args.carcara, prova, problema, REGRAS_CONFIADAS, ('--rup-resolution',))
            pelos_pivos += v_pivos == 'valid'
            por_rup += v_rup == 'valid'
            if 'valid' in (v_pivos, v_rup):
                validas += 1
                if v_pivos != 'valid':
                    so_um_modo.append(f"{c['id']} valid só por RUP; pelos pivôs do cvc5: {v_pivos} {curto(m_pivos)}")
                if v_rup != 'valid':
                    so_um_modo.append(f"{c['id']} valid só pelos pivôs; por RUP: {v_rup} {curto(m_rup)}")
            else:
                motivo = f'pelos pivôs: {v_pivos} {curto(m_pivos)} | por RUP: {v_rup} {curto(m_rup)}'
                falhas.append(f"{c['id']}: o Carcara não deu 'valid' ({motivo})")
                anotacao('error', f"{c['id']} {v_pivos}", motivo)
            provas_md.append(f"| {c['id']} | {v_pivos} | {v_rup} |")
            for tipo, descricao, l in lista:
                arquivo = os.path.join(tmp, 'estrago.alethe')
                with open(arquivo, 'w', encoding='utf-8', newline='\n') as f:
                    f.write('\n'.join(l) + '\n')
                v, modo, e_pivos, e_rup = conferir(args.carcara, arquivo, problema, REGRAS_CONFIADAS)
                if v == 'valid':
                    falhas.append(f"{c['id']}: o Carcara aceitou um estrago ({descricao}, {modo})")
                    anotacao('error', f"{c['id']} estrago aceito", f'{descricao} ({modo})')
                else:
                    # a classe vem do modo em que a prova original passa, preferindo RUP: pelos pivôs, Z34 para
                    # sempre no mesmo passo (t423.t8), antes de chegar ao estrago
                    por_tipo[tipo]['recusados'] += 1
                    por_tipo[tipo]['classes'][classe(e_rup if v_rup == 'valid' else e_pivos)] += 1

        adv_md = ['| Caso | Pelos pivôs e por RUP | De onde veio a recusa |', '| --- | --- | --- |']
        casos = sorted(glob.glob(os.path.join(PASTA, 'adversarios', '*.alethe')))
        demonstracao = ''
        for prova in casos:
            caso = os.path.basename(prova)[:-len('.alethe')]
            problema = prova[:-len('.alethe')] + '.smt2'
            if args.sem_carcara:
                adv_md.append(f'| {caso} | (não rodado) | |')
                continue
            v, modo, m_pivos, m_rup = conferir(args.carcara, prova, problema, REGRAS_CONFIADAS)
            if v == 'valid':
                falhas.append(f'{caso}: o Carcara aceitou uma prova falsa ({modo})')
                anotacao('error', f'{caso} aceito', f'prova falsa aceita ({modo})')
            else:
                adv_notas.append(f'{caso}: recusado. Pelos pivôs: {v} {curto(m_pivos)} | por RUP: {curto(m_rup)}')
            adv_md.append(f"| {caso} | {'ACEITA' if v == 'valid' else 'recusada'} | {classe(m_rup) if v != 'valid' else modo} |")
            atacante = os.path.join(PASTA, 'adversarios', 'atacante.rare')
            if caso == 'regra-fora-do-arquivo-confiado' and os.path.exists(atacante):
                # só para mostrar o risco: com o arquivo de regras do atacante, a mesma prova falsa
                va, modoa, _, _ = conferir(args.carcara, prova, problema, atacante)
                demonstracao = (f'Com o arquivo de regras do próprio atacante (atacante.rare), a prova falsa de '
                                f'{caso} deu {va!r}{f" ({modoa})" if modoa else ""}; com o arquivo do verificador, '
                                f'{"recusada" if v != "valid" else "ACEITA"}.')

    # o vínculo da fórmula com o problema, pela implementação independente da t1
    textos = {}

    def problema_de(c):
        if c['id'] not in textos:
            with open(os.path.join(PASTA, c['problema']['arquivo']), encoding='utf-8') as f:
                textos[c['id']] = f.read()
        return textos[c['id']]

    vin = vinculo.conferir(registro['certificados'], problema_de)
    falhas += vin['falhas']
    # o caso □/◇: uma prova verdadeira, para o problema de outras fórmulas
    with open(os.path.join(PASTA, 'adversarios', 'vinculo-trocado.json'), encoding='utf-8') as f:
        troca = json.load(f)
    with open(os.path.join(PASTA, troca['problema']), encoding='utf-8') as f:
        diferenca_troca = vinculo.diferenca(vinculo.refazer(troca['fichas'], troca['formulas']), f.read())
    if not diferenca_troca:
        falhas.append('vinculo-trocado: o vínculo aceitou fórmulas que não são as do problema')
    # os controles do comparador: pares de sentido diferente que versões anteriores davam como iguais (rodadas 28 e
    # 29), e problemas fora do perfil, que nem chegam a ser comparados (rodada 30: um termo mal tipado)
    controles = sorted(glob.glob(os.path.join(PASTA, 'adversarios', 'comparador', '*-a.smt2')))
    controles_recusados = 0
    for a in controles:
        with open(a, encoding='utf-8') as fa, open(a[:-len('-a.smt2')] + '-b.smt2', encoding='utf-8') as fb:
            if vinculo.diferenca(fa.read(), fb.read()):
                controles_recusados += 1
            else:
                falhas.append(f'{os.path.basename(a)[:-len("-a.smt2")]}: o comparador deu como iguais dois problemas de '
                              f'sentido diferente')
    fora_do_perfil = sorted(glob.glob(os.path.join(PASTA, 'adversarios', 'comparador', '*-recusar.smt2')))
    for arquivo in fora_do_perfil:
        with open(arquivo, encoding='utf-8') as f:
            texto_fora = f.read()
        if vinculo.diferenca(texto_fora, texto_fora):
            controles_recusados += 1
        else:
            falhas.append(f'{os.path.basename(arquivo)}: o perfil da t1 aceitou um problema que tinha de recusar')
    controles += fora_do_perfil
    prova_troca = '(não rodado)'
    if not args.sem_carcara:
        v, modo, _, _ = conferir(args.carcara, os.path.join(PASTA, troca['prova']), os.path.join(PASTA, troca['problema']),
                                 REGRAS_CONFIADAS)
        prova_troca = f'{v} ({modo})' if modo else v
        if v != 'valid':
            falhas.append(f'vinculo-trocado: a prova que o ataque usa deveria passar no Carcara, e deu {v!r}')
    # os modelos dos sat, pela conferência independente
    mod = modelos.conferir(registro['certificados'])
    falhas += mod['falhas']
    mod_md = ['| O quê | Resultado |', '| --- | --- |',
              f"| Modelos dos sat sem números | {mod['aceitos']} de {mod['modelos']} aceitos |",
              f"| Modelos estragados (fórmula negada, tabela sem uma linha, quadro sem os acessos do mundo real) | "
              f"{mod['estragos_recusados']} de {mod['estragos']} recusados |",
              (f"| Modelos exatos dos sat com números (modelo-exato-t1-v1) | {mod['exatos_aceitos']} de {mod['exatos']} "
               f"aceitos |" if not mod['sem_sympy'] else
               f"| Modelos exatos dos sat com números (modelo-exato-t1-v1) | {mod['exatos']} sem conferir: o SymPy não "
               f"está instalado |"),
              f"| Modelos exatos estragados (fórmula negada, α num intervalo sem raiz, testemunha trocada, D0 trocado) | "
              f"{mod['estragos_exatos_recusados']} de {mod['estragos_exatos']} recusados |"]
    if mod['sem_sympy'] and not args.sem_carcara:
        falhas.append(f"o SymPy não está instalado: os modelos exatos ficaram sem a conferência independente "
                      f"({mod['sem_sympy']})")
    # os registros do formato aberto (registro-v1): o veredito esperado em cada exemplo de registros-v1/exemplos.json

    def provar(prova, problema):
        """True ou False pelo Carcara; None sem ele, ou com o tempo esgotado (não conferido por recurso não é recusa)"""
        if args.sem_carcara:
            return None
        v = conferir(args.carcara, prova, problema, REGRAS_CONFIADAS)[0]
        return None if v == 'tempo esgotado' else v == 'valid'
    reg = registros.conferir(provar)
    falhas += reg['falhas']
    if not args.sem_carcara and reg['sem_conferir']:
        falhas.append(f"registros: {', '.join(reg['sem_conferir'])} ficaram sem conferir o defeito, mesmo com o Carcara")
    if not args.sem_carcara and reg['gpt']['sem_sympy']:
        falhas.append(f"o SymPy não está instalado: o leitor de registros do GPT não rodou ({reg['gpt']['sem_sympy']})")
    sem_conferir = (f" ({len(reg['sem_conferir'])} sem conferir o defeito: {', '.join(reg['sem_conferir'])})"
                    if reg['sem_conferir'] else '')
    gpt = reg['gpt']
    if gpt['sem_sympy']:
        linha_gpt = 'O leitor de registros do GPT não rodou (sem o SymPy).'
    else:
        linha_gpt = (f"O leitor de registros do GPT deu o esperado em {gpt['iguais']} de {reg['exemplos']}"
                     + (f"; pendentes: {', '.join(gpt['pendentes'])}" if gpt['pendentes'] else '')
                     + (f"; divergências: {'; '.join(gpt['divergencias'])}" if gpt['divergencias'] else '') + '.')
    reg_md = ['| Exemplo | O que é | Esperado | Leitor do verificador | Leitor do GPT |', '| --- | --- | --- | --- | --- |',
              *reg['linhas']]
    # o lote cego 1 de registros, já revelado: a resposta que o Caderno registrou antes, em cada registro
    lote = registros.conferir_lote(provar, registros.LOTE_1, not args.sem_carcara)
    falhas += lote['falhas']
    pelo_carcara = ', '.join(f'{n} {k}' for k, n in sorted(lote['carcara'].items()))
    linha_lote = (f"Lote cego 1 de registros: o verificador deu a resposta registrada antes em {lote['iguais']} de "
                  f"{lote['registros']}" + (f" (as pendentes, pelo Carcara: {pelo_carcara})" if pelo_carcara else '')
                  + '; ' + ('o leitor do GPT não rodou (sem o SymPy).' if lote['gpt']['sem_sympy'] else
                            f"o leitor do GPT, em {lote['gpt']['iguais']} de {lote['registros']}"
                            + (f"; divergências: {'; '.join(lote['gpt']['divergencias'])}"
                               if lote['gpt']['divergencias'] else '') + '.'))
    lote_md = ['| Registro | O caso | Resposta registrada | Leitor do verificador | Leitor do GPT |',
               '| --- | --- | --- | --- | --- |', *lote['linhas']]
    invalidos = f" ({vin['trocados_invalidos']} inválidas na gramática)" if vin['trocados_invalidos'] else ''
    pares_iguais = f" ({vin['pares_iguais']} pares com o mesmo problema ficaram de fora)" if vin['pares_iguais'] else ''
    resultado_troca = f"prova no Carcara: {prova_troca}; vínculo: {'recusado' if diferenca_troca else 'ACEITO'}"
    vin_md = ['| O quê | Resultado |', '| --- | --- |',
              f"| Problemas refeitos a partir das fórmulas | {vin['iguais']} de {vin['total']} iguais ao do certificado, "
              f"a menos da forma |",
              f"| Fórmula com um operador trocado | {vin['trocados_recusados']} de {vin['trocados']} recusadas{invalidos} |",
              f"| Fórmulas de outro exemplo, com o problema e a prova deste | {vin['pares_recusados']} de {vin['pares']} "
              f"pares recusados{pares_iguais} |",
              f'| Caso □/◇ (adversarios/vinculo-trocado.json) | {resultado_troca} |',
              f'| Controles do comparador (adversarios/comparador/: pares de sentido diferente e problemas fora do perfil) '
              f'| {controles_recusados} de {len(controles)} recusados |']

    est_md = ['| Estrago | Montados | Recusados | De onde vieram as recusas |', '| --- | --- | --- | --- |']
    total = recusados = 0
    for tipo, x in por_tipo.items():
        total += x['montados']
        recusados += x['recusados']
        x['texto'] = ', '.join(f'{k} ({n})' for k, n in x['classes'].most_common())
        est_md.append(f"| {tipo} | {x['montados']} | {x['recusados'] if not args.sem_carcara else '—'} | {x['texto']} |")

    alteradas = vin['trocados'] + vin['pares']
    alteradas_recusadas = vin['trocados_recusados'] + vin['pares_recusados']
    linha_vinculo = (f"O vínculo bateu em {vin['iguais']} de {vin['total']} certificados e recusou {alteradas_recusadas} "
                     f"de {alteradas} fórmulas alteradas. {mod['aceitos']} de {mod['modelos']} modelos finitos e "
                     f"{mod['exatos_aceitos']} de {mod['exatos']} exatos aceitos; {mod['estragos_recusados']} de "
                     f"{mod['estragos']} finitos e {mod['estragos_exatos_recusados']} de {mod['estragos_exatos']} exatos "
                     f"estragados recusados. Registros: "
                     f"{reg['validos_aceitos']} de {reg['validos']} válidos aceitos e {reg['invalidos_recusados']} de "
                     f"{reg['invalidos']} inválidos recusados com o motivo esperado{sem_conferir}. {linha_gpt} "
                     f"{linha_lote}")
    if args.sem_carcara:
        linha = (f'Sem o Carcara: hashes conferidos, {total} estragos montados e {len(casos)} casos adversários. '
                 + linha_vinculo)
    else:
        linha = (f'{validas} de {com_prova} provas deram "valid" ({pelos_pivos} pelos pivôs, {por_rup} por RUP); '
                 f'{recusados} de {total} estragos e {sum(1 for x in adv_md[2:] if "recusada" in x)} de '
                 f'{len(casos)} casos adversários foram recusados. ' + linha_vinculo)
    resumo = [
        '## Provas Alethe da t1 conferidas pelo Carcara', '', linha, '',
        '### Provas', '', *provas_md, '',
        '### Estragos', '', *est_md, '',
        '### Casos adversários', '', *adv_md, '',
        *([demonstracao, ''] if demonstracao else []),
        '### Vínculo da fórmula com o problema', '',
        'Pela implementação independente da t1 (independente/, escrita pelo GPT só pela especificação).', '',
        *vin_md, '',
        '### Modelos dos sat', '',
        'Pela conferência independente, sem busca: os finitos por independente/verificar_finito_reforcado.py, e os '
        'exatos por independente/avaliador_kripke_numerico_v1.py.', '',
        *mod_md, '',
        '### Registros do formato aberto', '',
        'Os exemplos de registros-v1/exemplos.json (especificacao/registros-v1.md). No leitor do verificador '
        '(registros.py), a leitura e a tradução são as da implementação independente, os modelos passam pela '
        'conferência independente, e a prova, pelo Carcara. O leitor do GPT (independente/registros_independente.py) é '
        'inteiro dele, com o comparador SMT dele; as provas que ele deixa pendentes vão para o Carcara.', '',
        *reg_md, '', linha_gpt, '',
        '### Lote cego 1 de registros', '',
        'Os registros de registros-v1/lote-cego-1/, já revelados. A resposta registrada é a do compromisso do Caderno '
        '(caderno.json), dado antes das respostas do GPT; nas pendentes, a seta diz o que ele previu para o Carcara.', '',
        *lote_md, '', linha_lote, '',
        f'**Falhas:** ' + '; '.join(falhas) if falhas else 'Nenhuma falha.',
    ]
    texto = '\n'.join(resumo) + '\n'
    print(texto)
    if not args.sem_carcara:
        anotacao('notice', 'Provas', f'{validas} de {com_prova} deram "valid": {pelos_pivos} pelos pivôs, '
                 f'{por_rup} por RUP.' + ''.join('\n' + x for x in so_um_modo))
        anotacao('notice', 'Estragos', f'{recusados} de {total} recusados.' + ''.join(
            f"\n{tipo}: {x['recusados']} de {x['montados']} recusados; {x['texto']}" for tipo, x in por_tipo.items()))
        anotacao('notice', 'Casos adversários', '\n'.join(adv_notas) or 'nenhum recusado')
        if demonstracao:
            anotacao('notice', 'Arquivo do atacante', demonstracao)
        anotacao('notice', 'Vínculo', f"{vin['iguais']} de {vin['total']} problemas refeitos pela implementação "
                 f"independente iguais ao do certificado.\nFórmula com um operador trocado: {vin['trocados_recusados']} "
                 f"de {vin['trocados']} recusadas{invalidos}.\nFórmulas de outro exemplo: {vin['pares_recusados']} de "
                 f"{vin['pares']} pares recusados{pares_iguais}.\nCaso □/◇: {resultado_troca}.\nControles do "
                 f"comparador: {controles_recusados} de {len(controles)} recusados.")
        anotacao('notice', 'Modelos', f"{mod['aceitos']} de {mod['modelos']} modelos finitos aceitos pela conferência "
                 f"independente; {mod['estragos_recusados']} de {mod['estragos']} estragados recusados. "
                 f"{mod['exatos_aceitos']} de {mod['exatos']} modelos exatos aceitos; {mod['estragos_exatos_recusados']} de "
                 f"{mod['estragos_exatos']} estragados recusados.")
        anotacao('notice', 'Registros', f"{reg['validos_aceitos']} de {reg['validos']} registros válidos aceitos; "
                 f"{reg['invalidos_recusados']} de {reg['invalidos']} inválidos recusados com o motivo esperado"
                 f"{sem_conferir}.\n{linha_gpt}")
        anotacao('notice', 'Lote cego 1', linha_lote)
        anotacao('notice', 'Resultado', linha + ' ' + ('Nenhuma falha.' if not falhas else
                                                         f'{len(falhas)} falhas: ' + '; '.join(falhas)[:3000]))
    for destino in [args.relatorio, os.environ.get('GITHUB_STEP_SUMMARY')]:
        if destino:
            with open(destino, 'a', encoding='utf-8') as f:
                f.write(texto)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
