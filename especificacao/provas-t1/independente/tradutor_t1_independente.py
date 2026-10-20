#!/usr/bin/env python3
"""Tradução experimental *independente* m2 AST expandida -> SMT-LIB 2 (Z3 t1).
Implementada a partir de traducao-z3-t1.md, sem código do Caderno.
Front-end m2 da auditoria independente rodada 16 permanece intacto.
"""
from parser_independente_m2 import Parser, expand, walk, Node
from validador_independente_m2 import Validator
from collections import OrderedDict

FORMULA_OPS={'⊤','⊥','¬','∧','∨','⟹','⟺','□','◇','B','∀','∃','=', '∈','<','≤','>','≥'}
ARITH={'+','−','·','/','^'}

def q(s):
    if '|' in s or '\\' in s: raise ValueError('Símbolo fora da gramática para SMT-LIB')
    return '|'+s+'|'

class TranslationError(Exception):pass

class Translator:
 def __init__(self, fichas):
    self.fichas={x['simbolo']:x for x in fichas}
    self.N={x['simbolo'] for x in fichas if x.get('numerico') and x.get('tipo') in ('constante','funcao')}
    self.decls=OrderedDict();self.frames=OrderedDict();self.counter=0;self.has_empty=False;self.has_member=False

 def declare(self,name,signature,result):
    item=(name,tuple(signature),result)
    if name in self.decls and self.decls[name]!=item:
        raise TranslationError('Símbolo com duas assinaturas '+name)
    self.decls[name]=item
    return q(name)

 def sort_ficha(self,name,fn=False):
    f=self.fichas.get(name)
    if f and f.get('tipo')==('funcao' if fn else 'constante'):
        return 'Real' if name in self.N else 'Obj'
    return 'Obj'

 def arg_sorts(self,name,arity,kind):
    f=self.fichas.get(name,{}); sig=f.get('argumentos')
    if sig is not None and len(sig)>=arity:
        return ['Real' if i=='num' else 'Obj' for i in sig[:arity]]
    if kind=='funcao' and name in self.N:return ['Real']*arity
    return ['Obj']*arity

 def fun(self,name,args,world,kind,env):
    predicate=kind=='predicado';arity=len(args)
    argtypes=self.arg_sorts(name,arity,kind)
    numeric=name in self.N and not predicate
    with_world=predicate or not numeric
    actual=[self.term(x,world,env) for x in args]
    for expr,want in zip(actual,argtypes):
        if expr[1]!=want:raise TranslationError(f'{name}: argumento tem {expr[1]}, esperava {want}')
    sigcode=':'+''.join('R' if x=='Real' else 'O' for x in argtypes) if len(set(argtypes))>1 else ''
    namekey=('p:' if predicate else 'fn:' if numeric else 'f:')+name+'/'+str(arity)+sigcode
    sortargs=(['Mundo'] if with_world else [])+argtypes
    self.declare(namekey,sortargs,'Bool' if predicate else ('Real' if numeric else 'Obj'))
    terms=([world] if with_world else [])+[x[0] for x in actual]
    return f'({q(namekey)} '+ ' '.join(terms)+')', 'Bool' if predicate else ('Real' if numeric else 'Obj')

 def term(self,node,world,env):
    if node.op=='atom':
        s=node.meta['value']
        if node.typ=='number':return s if '.' in s else str(int(s)), 'Real'
        if node.typ=='empty' or s=='∅':
            self.has_empty=True;self.declare('c:∅',[],'Obj');return q('c:∅'),'Obj'
        if s in env:return env[s]
        if node.typ=='truth':raise TranslationError('valor lógico no lugar de termo')
        typ=self.sort_ficha(s)
        self.declare('c:'+s,[],typ)
        return q('c:'+s),typ
    if node.op=='_':
        base=node.args[0].meta['value'];return self.fun(base,[node.args[1]],world,'funcao',env)
    if node.op in ARITH:
        args=[self.term(x,world,env) for x in node.args]
        if any(s!='Real' for _,s in args):
            raise TranslationError(f'Conta {node.op}: termo de objeto não é Real')
        vals=[x for x,_ in args]
        if node.op=='−':return ('(- '+ ' '.join(vals)+')','Real')
        if node.op=='^':
            exp=node.args[1];literal=(exp.op=='atom' and exp.typ=='number' and exp.meta['value'].isdigit())
            if literal and 0<=int(exp.meta['value'])<=12:
                n=int(exp.meta['value']);return ('1' if n==0 else vals[0] if n==1 else '(* '+' '.join([vals[0]]*n)+')'),'Real'
            return '(^ '+vals[0]+' '+vals[1]+')','Real'
        sym={'+':'+','·':'*','/':'/','−':'-'}[node.op]
        return '('+sym+' '+' '.join(vals)+')','Real'
    return self.fun(node.op,node.args,world,'funcao',env)

 def prop(self,node,world,env):
    op=node.op
    if node.op=='atom' and node.typ=='truth':return ('true' if node.meta['value']=='⊤' else 'false')
    if node.op=='atom' and node.typ=='proposition':return self.fun(node.meta['value'],[],world,'predicado',env)[0]
    if op in ('∀','∃'):
        self.counter+=1;v=node.meta['var'];s='Obj'
        isdomain=node.meta.get('domain',False)
        if isdomain and node.args[0].op=='atom' and node.args[0].meta['value'] in ('ℝ','ℤ'):s='Real'
        z=q('x:'+v+':'+str(self.counter));e=dict(env);e[v]=(z,s)
        body=self.prop(node.args[-1],world,e)
        if isdomain and node.args[0].meta['value']=='ℤ':body='(=> (is_int '+z+') '+body+')' if op=='∀' else '(and (is_int '+z+') '+body+')'
        return '('+('forall' if op=='∀' else 'exists')+' (('+z+' '+s+')) '+body+')'
    if op in ('¬','□','◇'):
        if op=='¬':return '(not '+self.prop(node.args[0],world,env)+')'
        self.counter+=1;v=q('world:'+str(self.counter));inner=self.prop(node.args[0],v,env)
        return '('+('forall' if op=='□' else 'exists')+' (('+v+' Mundo)) '+inner+')'
    if op=='B':
        holder=node.meta['holder'];rel='R:'+holder
        self.frames[rel]=True;self.declare(rel,['Mundo','Mundo'],'Bool')
        self.counter+=1;v=q('world:'+str(self.counter));inner=self.prop(node.args[0],v,env)
        return '(forall (('+v+' Mundo)) (=> ('+q(rel)+' '+world+' '+v+') '+inner+'))'
    if op in ('∧','∨','⟹','⟺'):
        a,b=(self.prop(x,world,env) for x in node.args)
        return '('+{'∧':'and','∨':'or','⟹':'=>','⟺':'='}[op]+' '+a+' '+b+')'
    if op in ('=','<','≤','>','≥','∈'):
        a,sa=self.term(node.args[0],world,env);b,sb=self.term(node.args[1],world,env)
        if op=='∈':
            if sa!='Obj' or sb!='Obj':raise TranslationError('pertinência espera Obj')
            self.has_member=True;self.declare('pertence',['Mundo','Obj','Obj'],'Bool')
            return '('+q('pertence')+' '+world+' '+a+' '+b+')'
        if sa!=sb:raise TranslationError(f'igualdade/comparação misturou {sa} e {sb}')
        if op!='=' and sa!='Real':raise TranslationError('comparação não Real')
        return '('+{'=':'=','<':'<','≤':'<=','>':'>','≥':'>='}[op]+' '+a+' '+b+')'
    if node.typ=='formula':return self.fun(op,node.args,world,'predicado',env)[0]
    raise TranslationError('Fórmula inválida '+node.sexp())

 def translate(self,formulas):
    stmts=[]
    for original in formulas:
        p=Parser(original,list(self.fichas.values()));n,err=p.parse()
        if n is None:raise TranslationError(f'Sintaxe m2 inválida em {original}: {err}')
        diag=Validator(p,n).result()
        if any(x['nivel']=='erro' for x in diag):raise TranslationError(f'Fórmula m2 recusada: {diag}')
        used={x.meta['value'] for x in walk(n) if x.op=='atom' and x.typ in ('name','indexbase','indexarg','proposition')}
        used.update(x.op for x in walk(n) if x.typ in ('call','formula') and x.op not in FORMULA_OPS)
        used.update(x.meta['var'] for x in walk(n) if x.op in ('∀','∃'))
        root=expand(n,used);self.env={}
        stmts.append(self.prop(root,q('w0'),{}))
    script=['(set-logic ALL)', '(declare-sort Obj 0)', '(declare-sort Mundo 0)', '(declare-const '+q('w0')+' Mundo)']
    for name,types,out in self.decls.values():
        script.append('(declare-fun '+q(name)+' ('+' '.join(types)+') '+out+')')
    if self.has_empty:
        self.has_member=True
        if 'pertence' not in self.decls:
            script.append('(declare-fun '+q('pertence')+' (Mundo Obj Obj) Bool)')
        script.append('(assert (forall ((w Mundo) (z Obj)) (not ('+q('pertence')+' w z '+q('c:∅')+'))))')
    for rel in self.frames:
        r=q(rel)
        script.append('(assert (forall ((p Mundo)) (exists ((q Mundo)) ('+r+' p q))))')
        script.append('(assert (forall ((p Mundo) (q Mundo) (r Mundo)) (=> (and ('+r+' p q) ('+r+' q r)) ('+r+' p r))))')
        script.append('(assert (forall ((p Mundo) (q Mundo) (r Mundo)) (=> (and ('+r+' p q) ('+r+' p r)) ('+r+' q r))))')
    script.extend('(assert '+a+')' for a in stmts)
    return '\n'.join(script)+'\n'

if __name__=='__main__':
 import json,sys
 e=json.load(open(sys.argv[1] if len(sys.argv)>1 else 'traducao-z3-t1-exemplos.json'))['exemplos'][0]
 print(Translator(e['fichas']).translate(e['formulas']))
