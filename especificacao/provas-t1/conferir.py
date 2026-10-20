#!/usr/bin/env python3
"""Confere as provas Alethe desta pasta com o Carcara e testa provas estragadas de propósito.

Uso: python3 conferir.py [--carcara CAMINHO] [--sem-carcara] [--relatorio ARQUIVO]

1. Confere o SHA-256 de cada problema, de cada prova e do arquivo de regras com certificados.json.
2. Roda, para cada prova,
       carcara check --allow-int-real-subtyping --expand-let-bindings --rare-file regras.rare PROVA PROBLEMA
   e exige a saída "valid" (nem "holey" nem "invalid").
3. Faz, em cada prova, três estragos, um de cada vez, que o Carcara tem de recusar: um literal da
   conclusão de um passo trocado pela negação dele, uma premissa de um passo trocada por outra e a
   regra de um passo trocada por outra. O sorteio tem semente fixa: os estragos são sempre os mesmos.

Sai com código 1 se alguma prova não der "valid" ou se algum estrago for aceito.
Com --sem-carcara, só confere os hashes e monta os estragos (serve para testar este roteiro).
Só usa a biblioteca padrão do Python.
"""
import argparse
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import tempfile

PASTA = os.path.dirname(os.path.abspath(__file__))
OPCOES = ['--allow-int-real-subtyping', '--expand-let-bindings']


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


def estragos(id_, linhas):
    """Três provas estragadas, cada uma com uma única mudança: [(tipo, linhas)]."""
    passos = [k for k, l in enumerate(linhas) if l.startswith('(step ')]
    nomes = [m.group(1) for l in linhas for m in [re.match(r'\((?:assume|step) (\S+) ', l)] if m]
    saida = []

    # um literal da conclusão trocado pela negação dele
    rng = random.Random(f'{id_}-literal')
    candidatos = [k for k in passos if '(cl (' in linhas[k] or re.search(r'\(cl [^)]', linhas[k])]
    if candidatos:
        k = rng.choice(candidatos)
        l = linhas[k]
        i = l.index('(cl ') + 4
        f = fim_do_termo(l, i)
        novo = l[:i] + '(not ' + l[i:f] + ')' + l[f:]
        saida.append(('literal negado no passo ' + l.split()[1], linhas[:k] + [novo] + linhas[k + 1:]))

    # uma premissa trocada por outro passo ou suposição
    rng = random.Random(f'{id_}-premissa')
    candidatos = [k for k in passos if ':premises (' in linhas[k]]
    if candidatos:
        k = rng.choice(candidatos)
        l = linhas[k]
        i = l.index(':premises (') + len(':premises (')
        f = l.index(')', i)
        premissas = l[i:f].split()
        alvo = rng.randrange(len(premissas))
        outras = [n for n in nomes if n not in premissas and n != l.split()[1]]
        if outras:
            premissas[alvo] = rng.choice(outras)
            tipo = 'premissa trocada no passo '
        elif len(premissas) > 1:
            # prova curta demais para trocar: a premissa sai
            del premissas[alvo]
            tipo = 'premissa tirada do passo '
        else:
            premissas = None
        if premissas is not None:
            novo = l[:i] + ' '.join(premissas) + l[f:]
            saida.append((tipo + l.split()[1], linhas[:k] + [novo] + linhas[k + 1:]))

    # a regra de um passo trocada pela regra false, que só prova (cl (not false)). Ficam de fora os passos
    # que a regra nova também provaria (a própria (cl (not false))) e os que já usam false: trocar a regra
    # de um passo que conclui (= t t) por refl, por exemplo, dava outra prova certa, e não um estrago
    rng = random.Random(f'{id_}-regra')
    candidatos = [k for k in passos if '(cl (not false))' not in linhas[k] and ':rule false' not in linhas[k]]
    if candidatos:
        k = rng.choice(candidatos)
        l = linhas[k]
        m = re.search(r':rule (\S+)', l)
        regra = m.group(1).rstrip(')')
        novo = l[:m.start(1)] + 'false' + l[m.start(1) + len(regra):]
        saida.append((f'regra {regra} trocada por false no passo ' + l.split()[1], linhas[:k] + [novo] + linhas[k + 1:]))
    return saida


def carcara(caminho, prova, problema, regras):
    """O veredito do Carcara ('valid', 'holey', 'invalid' ou 'erro') e o motivo que ele deu, se deu."""
    try:
        r = subprocess.run([caminho, 'check', *OPCOES, '--rare-file', regras, prova, problema],
                           capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return 'tempo esgotado', ''
    saida = r.stdout.strip().splitlines()
    motivo = ' '.join(r.stderr.strip().split())[:400]
    return (saida[0].strip() if saida else 'erro'), motivo


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
    args = ap.parse_args()

    if not args.sem_carcara:
        try:
            r = subprocess.run([args.carcara, '--version'], capture_output=True, text=True, timeout=60)
            anotacao('notice', 'Carcara', ' '.join((r.stdout or r.stderr).split())[:200] or f'saiu com {r.returncode}')
        except OSError as erro:
            anotacao('error', 'Carcara', f'não deu para rodar {args.carcara}: {erro}')
            raise

    with open(os.path.join(PASTA, 'certificados.json'), encoding='utf-8') as f:
        registro = json.load(f)
    regras = os.path.join(PASTA, registro['regrasRare']['arquivo'])
    falhas = []
    if sha256(regras) != registro['regrasRare']['sha256']:
        falhas.append('regras.rare: SHA-256 diferente do registro')

    linhas_relatorio = ['| Exemplo | Carcara | Estragos recusados |', '| --- | --- | --- |']
    total_estragos = recusados = validas = 0
    for c in registro['certificados']:
        problema = os.path.join(PASTA, c['problema']['arquivo'])
        if sha256(problema) != c['problema']['sha256']:
            falhas.append(f"{c['id']}: SHA-256 do problema diferente do registro")
        if not c.get('prova'):
            continue
        prova = os.path.join(PASTA, c['prova']['arquivo'])
        if sha256(prova) != c['prova']['sha256']:
            falhas.append(f"{c['id']}: SHA-256 da prova diferente do registro")
        with open(prova, encoding='utf-8') as f:
            linhas = f.read().splitlines()
        lista = estragos(c['id'], linhas)
        total_estragos += len(lista)
        if args.sem_carcara:
            iguais = [t for t, l in lista if l == linhas]
            if iguais or len(lista) != 3:
                falhas.append(f"{c['id']}: estragos mal montados ({len(lista)}; iguais à prova: {len(iguais)})")
            linhas_relatorio.append(f"| {c['id']} | (não rodado) | {len(lista)} montados |")
            continue
        veredito, motivo = carcara(args.carcara, prova, problema, regras)
        if veredito == 'valid':
            validas += 1
        else:
            falhas.append(f"{c['id']}: o Carcara disse {veredito!r}" + (f' ({motivo})' if motivo else ''))
            anotacao('error', f"{c['id']} {veredito}", motivo or '(sem motivo na saída de erro)')
        recusados_aqui = []
        with tempfile.TemporaryDirectory() as tmp:
            for tipo, l in lista:
                arquivo = os.path.join(tmp, 'estrago.alethe')
                with open(arquivo, 'w', encoding='utf-8', newline='\n') as f:
                    f.write('\n'.join(l) + '\n')
                v, _ = carcara(args.carcara, arquivo, problema, regras)
                if v == 'valid':
                    falhas.append(f"{c['id']}: o Carcara aceitou um estrago ({tipo})")
                    anotacao('error', f"{c['id']} estrago aceito", tipo)
                else:
                    recusados_aqui.append(tipo)
        recusados += len(recusados_aqui)
        linhas_relatorio.append(f"| {c['id']} | {veredito} | {len(recusados_aqui)} de {len(lista)} |")

    com_prova = sum(1 for c in registro['certificados'] if c.get('prova'))
    resumo = [
        '## Provas Alethe da t1 conferidas pelo Carcara',
        '',
        (f'{validas} de {com_prova} provas deram "valid"; {recusados} de {total_estragos} estragos foram recusados.'
         if not args.sem_carcara else f'Sem o Carcara: hashes conferidos e {total_estragos} estragos montados.'),
        '',
        *linhas_relatorio,
        '',
        *([f'**Falhas:** ' + '; '.join(falhas)] if falhas else ['Nenhuma falha.']),
    ]
    texto = '\n'.join(resumo) + '\n'
    print(texto)
    if not args.sem_carcara:
        anotacao('notice', 'Resultado', resumo[2] + ' ' + ('Nenhuma falha.' if not falhas else f'{len(falhas)} falhas.'))
    for destino in [args.relatorio, os.environ.get('GITHUB_STEP_SUMMARY')]:
        if destino:
            with open(destino, 'a', encoding='utf-8') as f:
                f.write(texto)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
