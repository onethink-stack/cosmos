"""Os modelos dos exemplos sat: cada modelo do registro passa pela conferência independente
(independente/verificar_certificados_sem_z3.py, escrita pelo GPT só pela especificação), que checa a forma, as tabelas
completas, o quadro KD45 de cada titular e a verdade de cada fórmula no mundo real, sem busca nenhuma.

E a conferência é atacada: o modelo tem de ser recusado com a primeira fórmula negada (o modelo de F não satisfaz ¬F),
com uma tabela de função sem uma linha e com o quadro de um titular sem os acessos do mundo real. O modelo de um
exemplo com as fórmulas de outro não serve de ataque: um modelo pode valer para os dois (o de Z04 vale para Z14).
"""
import copy
import sys

from vinculo import INDEPENDENTE


def motivo_da_recusa(formulas, fichas, modelo):
    """'' se a conferência independente aceita o modelo para as fórmulas; senão, o motivo da recusa."""
    if sys.flags.optimize:
        # a conferência independente recusa com assert, e python -O tira os assert: tudo passaria
        raise RuntimeError('a conferência dos modelos não roda com python -O')
    if INDEPENDENTE not in sys.path:
        sys.path.insert(0, INDEPENDENTE)
    from verificar_certificados_sem_z3 import verificar_caso
    try:
        verificar_caso(formulas, fichas, modelo)
        return ''
    except Exception as erro:
        return (f'{type(erro).__name__}: {erro}' if str(erro) else type(erro).__name__)[:200]


def estragos(c):
    """As versões estragadas de um certificado com modelo: [(descrição, fórmulas, modelo)]."""
    m, fs = c['modelo'], c['formulas']
    saida = [('primeira fórmula negada', ['¬(' + fs[0] + ')'] + fs[1:], m)]
    for chave, linhas in sorted(m['funcoes'].items()):
        if linhas:
            outro = copy.deepcopy(m)
            outro['funcoes'][chave] = linhas[1:]
            saida.append((f'tabela de {chave} sem uma linha', fs, outro))
            break
    for titular, pares in sorted(m['acessos'].items()):
        outro = copy.deepcopy(m)
        outro['acessos'][titular] = [p for p in pares if p[0] != 0]
        saida.append((f'quadro de {titular} sem os acessos do mundo real', fs, outro))
        break
    return saida


def conferir(certificados):
    """Confere os modelos do registro e os estragos deles. Devolve um dicionário com as contagens e as falhas."""
    r = {'modelos': 0, 'aceitos': 0, 'estragos': 0, 'estragos_recusados': 0, 'falhas': []}
    for c in certificados:
        if not c.get('modelo'):
            continue
        r['modelos'] += 1
        motivo = motivo_da_recusa(c['formulas'], c['fichas'], c['modelo'])
        if motivo:
            r['falhas'].append(f"{c['id']}: a conferência independente recusou o modelo ({motivo})")
        else:
            r['aceitos'] += 1
        for descricao, fs, m in estragos(c):
            r['estragos'] += 1
            if motivo_da_recusa(fs, c['fichas'], m):
                r['estragos_recusados'] += 1
            else:
                r['falhas'].append(f"{c['id']}: a conferência independente aceitou um modelo estragado ({descricao})")
    return r
