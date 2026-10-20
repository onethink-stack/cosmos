#!/usr/bin/env python3
"""Conferidor SEM Z3 para modelos finitos t1: forma, tabelas totais, KD45 e verdade no mundo real.
Uso: python verificar_certificados_sem_z3.py entradas.json respostas_z3_cego_2_independente.json
"""
import sys,json,itertools,collections
from avaliador_kripke_puro import expand_formula,truth

OPS={'∀','∃','□','◇','B','¬','∧','∨','⟹','⟺','=','∈','<','≤','>','≥'}

def signature(formulas,fichas):
    constants=set();functions=set();predicates=set();holders=set();has_member=[False]
    roots=[expand_formula(s,fichas) for s in formulas]
    def term(node,bound):
        if node.op=='atom':
            if node.typ=='number':raise ValueError('Somente problemas sem números')
            if node.meta['value'] not in bound:constants.add(node.meta['value'])
            return
        if node.op=='_':
            functions.add(node.args[0].meta['value']+'/1')
            term(node.args[1],bound);return
        functions.add(node.op+'/'+str(len(node.args)))
        for x in node.args:term(x,bound)
    def prop(node,bound):
        op=node.op
        if op=='atom':
            if node.typ=='proposition':predicates.add(node.meta['value']+'/0');return
            if node.typ=='truth':return
            raise ValueError('Fórmula não interpretável '+node.sexp())
        if op in ('∀','∃'):
            if node.meta.get('domain'):raise ValueError('Domínio não expandido ou numérico')
            prop(node.args[-1],bound|{node.meta['var']});return
        if op=='B':holders.add(node.meta['holder']);prop(node.args[0],bound);return
        if op in ('□','◇','¬'):prop(node.args[0],bound);return
        if op in ('∧','∨','⟹','⟺'):
            for x in node.args:prop(x,bound)
            return
        if op in ('=','∈'):
            if op=='∈':has_member[0]=True
            for x in node.args:term(x,bound)
            return
        predicates.add(op+'/'+str(len(node.args)))
        for x in node.args:term(x,bound)
    for root in roots:prop(root,set())
    return roots,constants,functions,predicates,holders,has_member[0]

def verificar_caso(formulas,fichas,modelo):
    n=modelo['objetos'];k=modelo['mundos']
    assert isinstance(n,int) and not isinstance(n,bool) and 1<=n<=5
    assert isinstance(k,int) and not isinstance(k,bool) and 1<=k<=3
    O=range(n);W=range(k)
    roots,cs,fs,ps,hs,hasmember=signature(formulas,fichas)
    assert set(modelo['constantes'])==cs,('constantes',set(modelo['constantes']),cs)
    assert set(modelo['funcoes'])==fs,('funcoes',set(modelo['funcoes']),fs)
    assert set(modelo['predicados'])==ps,('predicados',set(modelo['predicados']),ps)
    assert set(modelo['acessos'])==hs,('acessos',set(modelo['acessos']),hs)
    assert all(type(x)==int and x in O for x in modelo['constantes'].values())
    fun={};pred={};members={};frames={}
    for key,rows in modelo['funcoes'].items():
        name,ar=key.rsplit('/',1);ar=int(ar)
        seen=set()
        for w,args,val in rows:
            assert type(w)==int and w in W and len(args)==ar
            assert all(type(x)==int and x in O for x in args)
            assert type(val)==int and val in O
            pair=(w,tuple(args));assert pair not in seen;seen.add(pair)
            fun[(name,w,tuple(args))]=val
        assert seen=={(w,t) for w in W for t in itertools.product(O,repeat=ar)},('função não total',key)
    for key,rows in modelo['predicados'].items():
        name,ar=key.rsplit('/',1);ar=int(ar)
        seen=set()
        for w,args in rows:
            assert type(w)==int and w in W and len(args)==ar
            assert all(type(x)==int and x in O for x in args)
            pair=(w,tuple(args));assert pair not in seen;seen.add(pair)
            pred[(name,w,tuple(args))]=True
    for w,x,y in modelo['pertence']:
        assert hasmember or '∅' in cs
        assert all(type(i)==int for i in (w,x,y)) and w in W and x in O and y in O
        pair=(w,x,y);assert pair not in members;members[pair]=True
    if '∅' in cs:
        assert all(y!=modelo['constantes']['∅'] for _,x,y in members)
    for holder,rows in modelo['acessos'].items():
        R=set()
        for x,y in rows:
            assert type(x)==int and type(y)==int and x in W and y in W
            assert (x,y) not in R;R.add((x,y))
        assert all(any((x,y) in R for y in W) for x in W),('serial',holder)
        assert all((x,z) in R for x,y in R for yy,z in R if y==yy),('transitividade',holder)
        assert all((y,z) in R for x,y in R for xx,z in R if x==xx),('euclidiana',holder)
        frames[holder]=R
    kripke={'O':tuple(O),'W':tuple(W),'empty':modelo['constantes'].get('∅'),
            'const':modelo['constantes'],'fun':fun,'pred':pred,'member':members,'access':frames}
    check=[truth(root,0,{},kripke) for root in roots]
    assert all(check),('fórmulas falsas',check)
    return True

def main():
    inp=json.load(open(sys.argv[1],encoding='utf-8'))
    rsp=json.load(open(sys.argv[2],encoding='utf-8'))
    assert rsp['traducao']==inp['traducao'] and rsp['lote']==inp['lote']
    assert len(inp['casos'])==len(rsp['resultados'])==300
    N=0
    for c,res in zip(inp['casos'],rsp['resultados']):
        assert c['id']==res['id']
        finite=res['motorFinito']
        if finite and finite['status']=='modelo':
            assert finite['objetos']==finite['modelo']['objetos'] and finite['mundos']==finite['modelo']['mundos']
            verificar_caso(c['formulas'],inp['fichas'],finite['modelo']);N+=1
    print('Testemunhos verificados sem Z3:',N)
if __name__=='__main__':main()
