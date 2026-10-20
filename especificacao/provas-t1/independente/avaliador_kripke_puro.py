#!/usr/bin/env python3
"""Avaliador Kripke finito em Python puro (SEM chamadas ao Z3).
Explora modelos O={0}, W={0} ou {0,1}, com todas valorações relevantes
para predicados e pertinência, e todos os quadros KD45 dessas cardinalidades.
Oferece testemunhos semânticos auditáveis para seis SAT do conjunto não numérico.
"""
import itertools,json,time
from pathlib import Path
from parser_independente_m2 import Parser,expand,walk

def expand_formula(s,fichas):
 p=Parser(s,fichas);n,diag=p.parse()
 if n is None:raise ValueError((s,diag))
 U={x.meta['value'] for x in walk(n) if x.op=='atom' and x.typ in ('name','indexbase','indexarg','proposition')}
 U.update(x.op for x in walk(n) if x.typ in ('call','formula') and x.op not in {'∧','∨','⟹','⟺','¬','□','◇','=','≠','∈','∉','⊆','<','≤','>','≥'})
 U.update(x.meta['var'] for x in walk(n) if x.op in ('∀','∃'))
 return expand(n,U)

def term(n,w,env,M):
 if n.op=='atom':
  name=n.meta['value']
  if name in env:return env[name]
  if name=='∅':return M['empty']
  return M['const'].get(name,0)
 if n.op=='_':f=n.args[0].meta['value'];args=(term(n.args[1],w,env,M),)
 else:f=n.op;args=tuple(term(a,w,env,M) for a in n.args)
 return M['fun'].get((f,w,args),0)

def truth(n,w,env,M):
 op=n.op
 if op=='atom':
  if n.typ=='truth':return n.meta['value']=='⊤'
  if n.typ=='proposition':return M['pred'].get((n.meta['value'],w,()),False)
 if op in ('∀','∃'):
  var=n.meta['var']
  args=[]
  for o in M['O']:
   env2=dict(env);env2[var]=o;args.append(truth(n.args[-1],w,env2,M))
  return all(args) if op=='∀' else any(args)
 if op=='□':return all(truth(n.args[0],v,env,M) for v in M['W'])
 if op=='◇':return any(truth(n.args[0],v,env,M) for v in M['W'])
 if op=='B':return all(truth(n.args[0],v,env,M) for v in M['W'] if (w,v) in M['access'][n.meta['holder']])
 if op=='¬':return not truth(n.args[0],w,env,M)
 if op=='∧':return truth(n.args[0],w,env,M) and truth(n.args[1],w,env,M)
 if op=='∨':return truth(n.args[0],w,env,M) or truth(n.args[1],w,env,M)
 if op=='⟹':return not truth(n.args[0],w,env,M) or truth(n.args[1],w,env,M)
 if op=='⟺':return truth(n.args[0],w,env,M)==truth(n.args[1],w,env,M)
 if op=='=':return term(n.args[0],w,env,M)==term(n.args[1],w,env,M)
 if op=='∈':return M['member'].get((w,term(n.args[0],w,env,M),term(n.args[1],w,env,M)),False)
 return M['pred'].get((op,w,tuple(term(a,w,env,M) for a in n.args)),False)

def kd45_frames(W):
 pairs=list(itertools.product(W,W));out=[]
 for bits in itertools.product((False,True),repeat=len(pairs)):
  R={x for x,bit in zip(pairs,bits) if bit}
  if any(not any((x,y) in R for y in W) for x in W):continue
  if any((x,z) not in R for x,y in R for yy,z in R if y==yy):continue
  if any((y,z) not in R for x,y in R for xx,z in R if x==xx):continue
  out.append(R)
 return out

def search_one_obj(formulas):
 N=1
 # 2 mundos used when possible, also test 1 world.
 for worlds in ((0,), (0,1)):
  preds=set();holders=set();usesmem=False;empty=False
  for root in formulas:
   for n in walk(root):
    if n.op=='B':holders.add(n.meta['holder'])
    if n.op=='∈':usesmem=True
    if n.op=='atom' and n.meta['value']=='∅':empty=True
    if n.op=='atom' and n.typ=='proposition':preds.add((n.meta['value'],0))
    if n.typ=='formula' and n.op not in ('∀','∃','B','¬','□','◇','∧','∨','⟹','⟺','=','∈'):
     preds.add((n.op,len(n.args)))
  predkeys=[(name,w,(0,)*ar) for name,ar in sorted(preds) for w in worlds]
  memberkeys=[(w,0,0) for w in worlds] if usesmem and not empty else []
  frame_options=kd45_frames(worlds)
  for assignment in itertools.product(frame_options,repeat=len(holders)):
   access=dict(zip(sorted(holders),assignment))
   for valuebits in itertools.product((False,True),repeat=len(predkeys)+len(memberkeys)):
    P=dict(zip(predkeys,valuebits[:len(predkeys)]));member=dict(zip(memberkeys,valuebits[len(predkeys):]))
    M={'O':(0,),'W':worlds,'empty':0,'const':{},'fun':{},'pred':P,'member':member,'access':access}
    if all(truth(node,0,{},M) for node in formulas):
     return {'objetos':1,'mundos':len(worlds),'predicados': [{'nome':n,'mundo':w,'argumentos':list(args),'verdade':v} for (n,w,args),v in P.items()], 'pertinencia':[{'mundo':w,'valor':v} for (w,_,_),v in member.items()], 'relacoes':{k:[list(p) for p in sorted(v)] for k,v in access.items()}}
 return None

def explicit_Z02(formulas):
 # Dois objetos; constantes a e b identificadas a 0, funções mudam de mundo
 M={'O':(0,1),'W':(0,1),'empty':0,'const':{'a':0,'b':0},'fun':{('mae',0,(0,)):0,('mae',1,(0,)):1},'pred':{},'member':{},'access':{}}
 return {'objetos':2,'mundos':2,'constantes':M['const'],'funcao_mae_em_a_por_mundo':[0,1]} if all(truth(n,0,{},M) for n in formulas) else None

if __name__=='__main__':
 B=Path(__file__).parent
 examples=[e for e in json.loads((B/'traducao-z3-t1-exemplos.json').read_text())['exemplos'] if e['motorFinito'] is not None]
 ans=[]
 for e in examples:
  nodes=[expand_formula(f,e['fichas']) for f in e['formulas']]
  m=explicit_Z02(nodes) if e['id']=='Z02' else search_one_obj(nodes)
  ans.append({'id':e['id'],'resultado':'modelo' if m is not None else 'sem-modelo-ate-1-objeto-2-mundos','testemunho':m})
  print(e['id'],ans[-1]['resultado'])
 (B/'avaliacao_python_puro_27.json').write_text(json.dumps({'descricao':'Busca Python pura; ausência limitada a O=1,W<=2, não prova insatisfatibilidade geral','resultados':ans},ensure_ascii=False,indent=2)+'\n')
