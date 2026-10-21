"""Os modelos dos exemplos sat, pela conferência independente (independente/, do GPT, só pela especificação), sem busca.

Os finitos passam por independente/verificar_finito_reforcado.py: o verificar_certificados_sem_z3.py congelado, com
cada assert trocado por um ValueError e sem os limites da busca do lote cego, por uma transformação mecânica que
vinculo.conferir_independente refaz e confere. Ele checa a forma, as tabelas completas, o quadro KD45 de cada titular e
a verdade de cada fórmula no mundo real. Os exatos (formato modelo-exato-t1-v1, especificacao/modelos-exatos-t1.md)
passam por independente/avaliador_kripke_numerico_v1.py, que faz as contas em Q(α) com o SymPy.

E a conferência é atacada. Num modelo finito: a primeira fórmula negada (o modelo de F não satisfaz ¬F), uma tabela de
função sem uma linha e o quadro de um titular sem os acessos do mundo real. Num exato: a primeira fórmula negada, α
num intervalo sem raiz, a testemunha trocada e D0 trocado. O modelo de um exemplo com as fórmulas de outro não serve de
ataque: um modelo pode valer para os dois (o de Z04 vale para Z14).
"""
import copy
import sys

from vinculo import INDEPENDENTE

FORMATO_EXATO = 'modelo-exato-t1-v1'


class SemSymPy(Exception):
    """O avaliador dos modelos exatos precisa do SymPy, e ele não está instalado."""


def motivo_da_recusa(formulas, fichas, modelo):
    """'' se a conferência independente aceita o modelo para as fórmulas; senão, o motivo da recusa."""
    if INDEPENDENTE not in sys.path:
        sys.path.insert(0, INDEPENDENTE)
    if isinstance(modelo, dict) and modelo.get('formato') == FORMATO_EXATO:
        try:
            from avaliador_kripke_numerico_v1 import verificar_caso_v1 as verificar
        except ImportError as erro:
            raise SemSymPy(str(erro)) from erro
    else:
        from verificar_finito_reforcado import verificar_caso as verificar
    try:
        verificar(formulas, fichas, modelo)
        return ''
    except Exception as erro:
        return (f'{type(erro).__name__}: {erro}' if str(erro) else type(erro).__name__)[:200]


def estragos(c):
    """As versões estragadas de um certificado com modelo: [(descrição, fórmulas, modelo)]."""
    m, fs = c['modelo'], c['formulas']
    saida = [('primeira fórmula negada', ['¬(' + fs[0] + ')'] + fs[1:], m)]
    if m.get('formato') == FORMATO_EXATO:
        if 'algebrico' in m:
            outro = copy.deepcopy(m)
            outro['algebrico']['intervaloAberto'] = [str(2 ** 40), str(2 ** 40 + 1)]
            outro['algebrico'].pop('indiceDaRaiz', None)
            saida.append(('α num intervalo sem raiz', fs, outro))
        if m['testemunhas']:
            outro = copy.deepcopy(m)
            outro['testemunhas'][0]['valor'] = '123456789/7'
            saida.append(('testemunha trocada', fs, outro))
        if 'divZero' in m:
            outro = copy.deepcopy(m)
            outro['divZero'] = {'padrao': '123456789/7'}
            saida.append(('D0 trocado', fs, outro))
        return saida
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
    """Confere os modelos do registro e os estragos deles. Devolve um dicionário com as contagens e as falhas; os
    modelos exatos ficam sem conferir (sem_sympy diz por quê) se o SymPy não está instalado."""
    r = {'modelos': 0, 'aceitos': 0, 'estragos': 0, 'estragos_recusados': 0, 'exatos': 0, 'exatos_aceitos': 0,
         'estragos_exatos': 0, 'estragos_exatos_recusados': 0, 'sem_sympy': '', 'falhas': []}
    for c in certificados:
        if not c.get('modelo'):
            continue
        exato = c['modelo'].get('formato') == FORMATO_EXATO
        r['exatos' if exato else 'modelos'] += 1
        try:
            motivo = motivo_da_recusa(c['formulas'], c['fichas'], c['modelo'])
            if motivo:
                r['falhas'].append(f"{c['id']}: a conferência independente recusou o modelo ({motivo})")
            else:
                r['exatos_aceitos' if exato else 'aceitos'] += 1
            for descricao, fs, m in estragos(c):
                r['estragos_exatos' if exato else 'estragos'] += 1
                if motivo_da_recusa(fs, c['fichas'], m):
                    r['estragos_exatos_recusados' if exato else 'estragos_recusados'] += 1
                else:
                    r['falhas'].append(f"{c['id']}: a conferência independente aceitou um modelo estragado ({descricao})")
        except SemSymPy as erro:
            r['sem_sympy'] = str(erro)
    return r
