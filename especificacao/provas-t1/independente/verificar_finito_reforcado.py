# Gerado do verificador finito independente congelado; assert convertidas para ValueError; sem teto de busca.
"""Conferidor SEM Z3 para modelos finitos t1: forma, tabelas totais, KD45 e verdade no mundo real.
Uso: python verificar_certificados_sem_z3.py entradas.json respostas_z3_cego_2_independente.json
"""
import sys, json, itertools, collections
from avaliador_kripke_puro import expand_formula, truth
OPS = {'∀', '∃', '□', '◇', 'B', '¬', '∧', '∨', '⟹', '⟺', '=', '∈', '<', '≤', '>', '≥'}

def signature(formulas, fichas):
    constants = set()
    functions = set()
    predicates = set()
    holders = set()
    has_member = [False]
    roots = [expand_formula(s, fichas) for s in formulas]

    def term(node, bound):
        if node.op == 'atom':
            if node.typ == 'number':
                raise ValueError('Somente problemas sem números')
            if node.meta['value'] not in bound:
                constants.add(node.meta['value'])
            return
        if node.op == '_':
            functions.add(node.args[0].meta['value'] + '/1')
            term(node.args[1], bound)
            return
        functions.add(node.op + '/' + str(len(node.args)))
        for x in node.args:
            term(x, bound)

    def prop(node, bound):
        op = node.op
        if op == 'atom':
            if node.typ == 'proposition':
                predicates.add(node.meta['value'] + '/0')
                return
            if node.typ == 'truth':
                return
            raise ValueError('Fórmula não interpretável ' + node.sexp())
        if op in ('∀', '∃'):
            if node.meta.get('domain'):
                raise ValueError('Domínio não expandido ou numérico')
            prop(node.args[-1], bound | {node.meta['var']})
            return
        if op == 'B':
            holders.add(node.meta['holder'])
            prop(node.args[0], bound)
            return
        if op in ('□', '◇', '¬'):
            prop(node.args[0], bound)
            return
        if op in ('∧', '∨', '⟹', '⟺'):
            for x in node.args:
                prop(x, bound)
            return
        if op in ('=', '∈'):
            if op == '∈':
                has_member[0] = True
            for x in node.args:
                term(x, bound)
            return
        predicates.add(op + '/' + str(len(node.args)))
        for x in node.args:
            term(x, bound)
    for root in roots:
        prop(root, set())
    return (roots, constants, functions, predicates, holders, has_member[0])

def verificar_caso(formulas, fichas, modelo):
    n = modelo['objetos']
    k = modelo['mundos']
    if not (isinstance(n, int) and (not isinstance(n, bool)) and (n >= 1)):
        raise ValueError('pré-condição do modelo finito falhou')
    if not (isinstance(k, int) and (not isinstance(k, bool)) and (k >= 1)):
        raise ValueError('pré-condição do modelo finito falhou')
    O = range(n)
    W = range(k)
    roots, cs, fs, ps, hs, hasmember = signature(formulas, fichas)
    if not set(modelo['constantes']) == cs:
        raise ValueError(('constantes', set(modelo['constantes']), cs))
    if not set(modelo['funcoes']) == fs:
        raise ValueError(('funcoes', set(modelo['funcoes']), fs))
    if not set(modelo['predicados']) == ps:
        raise ValueError(('predicados', set(modelo['predicados']), ps))
    if not set(modelo['acessos']) == hs:
        raise ValueError(('acessos', set(modelo['acessos']), hs))
    if not all((type(x) == int and x in O for x in modelo['constantes'].values())):
        raise ValueError('pré-condição do modelo finito falhou')
    fun = {}
    pred = {}
    members = {}
    frames = {}
    for key, rows in modelo['funcoes'].items():
        name, ar = key.rsplit('/', 1)
        ar = int(ar)
        seen = set()
        for w, args, val in rows:
            if not (type(w) == int and w in W and (len(args) == ar)):
                raise ValueError('pré-condição do modelo finito falhou')
            if not all((type(x) == int and x in O for x in args)):
                raise ValueError('pré-condição do modelo finito falhou')
            if not (type(val) == int and val in O):
                raise ValueError('pré-condição do modelo finito falhou')
            pair = (w, tuple(args))
            if not pair not in seen:
                raise ValueError('pré-condição do modelo finito falhou')
            seen.add(pair)
            fun[name, w, tuple(args)] = val
        if not seen == {(w, t) for w in W for t in itertools.product(O, repeat=ar)}:
            raise ValueError(('função não total', key))
    for key, rows in modelo['predicados'].items():
        name, ar = key.rsplit('/', 1)
        ar = int(ar)
        seen = set()
        for w, args in rows:
            if not (type(w) == int and w in W and (len(args) == ar)):
                raise ValueError('pré-condição do modelo finito falhou')
            if not all((type(x) == int and x in O for x in args)):
                raise ValueError('pré-condição do modelo finito falhou')
            pair = (w, tuple(args))
            if not pair not in seen:
                raise ValueError('pré-condição do modelo finito falhou')
            seen.add(pair)
            pred[name, w, tuple(args)] = True
    for w, x, y in modelo['pertence']:
        if not (hasmember or '∅' in cs):
            raise ValueError('pré-condição do modelo finito falhou')
        if not (all((type(i) == int for i in (w, x, y))) and w in W and (x in O) and (y in O)):
            raise ValueError('pré-condição do modelo finito falhou')
        pair = (w, x, y)
        if not pair not in members:
            raise ValueError('pré-condição do modelo finito falhou')
        members[pair] = True
    if '∅' in cs:
        if not all((y != modelo['constantes']['∅'] for _, x, y in members)):
            raise ValueError('pré-condição do modelo finito falhou')
    for holder, rows in modelo['acessos'].items():
        R = set()
        for x, y in rows:
            if not (type(x) == int and type(y) == int and (x in W) and (y in W)):
                raise ValueError('pré-condição do modelo finito falhou')
            if not (x, y) not in R:
                raise ValueError('pré-condição do modelo finito falhou')
            R.add((x, y))
        if not all((any(((x, y) in R for y in W)) for x in W)):
            raise ValueError(('serial', holder))
        if not all(((x, z) in R for x, y in R for yy, z in R if y == yy)):
            raise ValueError(('transitividade', holder))
        if not all(((y, z) in R for x, y in R for xx, z in R if x == xx)):
            raise ValueError(('euclidiana', holder))
        frames[holder] = R
    kripke = {'O': tuple(O), 'W': tuple(W), 'empty': modelo['constantes'].get('∅'), 'const': modelo['constantes'], 'fun': fun, 'pred': pred, 'member': members, 'access': frames}
    check = [truth(root, 0, {}, kripke) for root in roots]
    if not all(check):
        raise ValueError(('fórmulas falsas', check))
    return True

def main():
    inp = json.load(open(sys.argv[1], encoding='utf-8'))
    rsp = json.load(open(sys.argv[2], encoding='utf-8'))
    if not (rsp['traducao'] == inp['traducao'] and rsp['lote'] == inp['lote']):
        raise ValueError('pré-condição do modelo finito falhou')
    if not len(inp['casos']) == len(rsp['resultados']) == 300:
        raise ValueError('pré-condição do modelo finito falhou')
    N = 0
    for c, res in zip(inp['casos'], rsp['resultados']):
        if not c['id'] == res['id']:
            raise ValueError('pré-condição do modelo finito falhou')
        finite = res['motorFinito']
        if finite and finite['status'] == 'modelo':
            if not (finite['objetos'] == finite['modelo']['objetos'] and finite['mundos'] == finite['modelo']['mundos']):
                raise ValueError('pré-condição do modelo finito falhou')
            verificar_caso(c['formulas'], inp['fichas'], finite['modelo'])
            N += 1
    print('Testemunhos verificados sem Z3:', N)
if __name__ == '__main__':
    main()
