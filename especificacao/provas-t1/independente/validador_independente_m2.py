#!/usr/bin/env python3
"""Validador experimental independente para m2. Análise de usos, fichas, sorts, avisos.
Entrada: lexer/AST do parser independente. Os fixtures só entram no executável de teste.
"""
from parser_independente_m2 import *

def osa(a,b):
 n,m=len(a),len(b);dp=[[0]*(m+1) for _ in range(n+1)]
 for i in range(n+1):dp[i][0]=i
 for j in range(m+1):dp[0][j]=j
 for i in range(1,n+1):
  for j in range(1,m+1):
   dp[i][j]=min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]!=b[j-1]))
   if i>1 and j>1 and a[i-1]==b[j-2] and a[i-2]==b[j-1]:dp[i][j]=min(dp[i][j],dp[i-2][j-2]+1)
 return dp[n][m]

class Validator:
 def __init__(self,parser,root,exigir=False):
  self.p=parser;self.root=root;self.fichas=parser.fichas;self.ordered_fichas=list(self.fichas)
  self.exigir=exigir;self.d=[];self.usage={};self.name_hits=[]
  self.boundnames={n.meta['var'] for n in walk(root) if n.op in ('∀','∃')}
 def diag(self,code,pos,**kw):
  val={'codigo':code,'nivel':('aviso' if code in ('E5','E6','E12','E13','E14','E16','E17') else 'erro'),'inicio':pos}
  val.update(kw);self.d.append(val)
 def namehit(self,name,pos,kind,arity,env,diagpos=None):
  self.name_hits.append((pos,name,env.copy()))
  diagpos=pos if diagpos is None else diagpos
  if name in env:
   if kind!='constante':self.diag('E10',diagpos)
   return
  f=self.fichas.get(name)
  if f:
   if f['tipo']!=kind or (kind!='constante' and f.get('aridade',0)!=arity):self.diag('E10',diagpos)
   return
  if name in self.usage:
   if self.usage[name]!=(kind,arity):self.diag('E10',diagpos)
  else:self.usage[name]=(kind,arity)
 def visits(self,n,env):
  if n.op in ('∀','∃'):
   v=n.meta['var'];vp=n.meta['varpos'];f=self.fichas.get(v)
   if any(c in SUP for c in v):self.diag('E17',vp)
   if f:self.diag('E4' if f['tipo']=='constante' else 'E10',vp)
   if v in env:self.diag('E5',vp)
   if n.meta['domain']:
    dom=n.args[0]
    self.allowsets(dom)
    self.visits(dom,env)
    for node in walk(dom):
     if node.op=='atom' and node.meta['value']==v and node.typ not in ('domain','number','truth'):
      self.diag('E18',node.meta['namepos'])
   tokens=self.p.t;bi=n.meta['bodypos'];be=n.meta['bodyend']
   if bi<be:
    first=tokens[bi]
    if first.val=='(':
     depth=0;close=None
     for k in range(bi,be):
      if tokens[k].val=='(':depth+=1
      if tokens[k].val==')':
       depth-=1
       if depth==0:close=k;break
     if close is not None and close+1<be:self.diag('E14',n.start)
    elif n.args[-1].op in ('∧','∨','⟹','⟺'):self.diag('E16',n.start)
   en=dict(env);en[v]='num' if n.meta.get('domain') and n.args[0].op=='atom' and n.args[0].meta['value'] in ('ℝ','ℤ') else 'obj'
   self.visits(n.args[-1],en)
  elif n.op=='B':
   # Ler só os tokens do titular deste nó B; metadados independem de
   # parênteses que possam envolver o B, e não duplicam nomes de B aninhados.
   left=n.meta.get('holder_start',-1);right=n.meta.get('holder_end',-1)
   for tok in self.p.t:
    if left<=tok.p<right and tok.kind=='name' and any(c in SUP for c in tok.val):
     self.diag('E17',tok.p)
   for a in n.args:self.visits(a,env)
  elif n.op=='atom':
   if n.typ in ('number','empty','domain','truth'):return
   name=n.meta['value']
   if n.typ in ('name','indexarg','indexbase','proposition'):
    kind='predicado' if n.typ=='proposition' else 'constante'
    if n.typ=='indexbase':kind='funcao'
    if n.typ=='indexbase':arity=1
    else:arity=0
    # O índice é uma aplicação de função; seu nome base aparece como função.
    if n.typ!='indexarg':self.namehit(name,n.meta['namepos'],kind,arity,env,diagpos=n.start)
    else:self.namehit(name,n.meta['namepos'],'constante',0,env,diagpos=n.start)
    if name in self.boundnames and name not in env and kind=='constante':self.diag('E6',n.start)
    if any(c in SUP for c in name):self.diag('E17',n.meta['namepos'])
  elif n.op=='_':
   for a in n.args:self.visits(a,env)
  elif n.typ in ('call','formula') and (n.op not in ('∧','∨','⟹','⟺','¬','□','◇','=', '≠','∈','∉','⊆','<','≤','>','≥')):
   self.namehit(n.op,n.meta.get('namepos',n.start),'predicado' if n.typ=='formula' else 'funcao',len(n.args),env)
   if any(c in SUP for c in n.op):self.diag('E17',n.meta.get('namepos',n.start))
   for a in n.args:self.visits(a,env)
  else:
   if n.op=='≠' and n.args[0].sexp()==n.args[1].sexp():self.diag('E9',n.start)
   if n.op in ('⋂','⋃') and not n.meta.get('setallowed',False):self.diag('E11',n.start)
   for j,a in enumerate(n.args):
    if n.op in ('∈','∉') and j==1 or n.op=='⊆':self.allowsets(a)
    self.visits(a,env)
 def allowsets(self,n):
  if n.op in ('⋂','⋃'):
   n.meta['setallowed']=True
   for a in n.args:self.allowsets(a)
 def sortof(self,n,env):
  if n.op=='atom':
   if n.typ=='number':return 'num'
   if n.typ in ('empty',):return 'obj'
   if n.typ=='domain':return 'obj'
   if n.typ in ('name','indexarg','indexbase'):
    name=n.meta['value'];return env.get(name) if name in env else ('num' if self.fichas[name].get('numerico') else 'obj') if name in self.fichas and self.fichas[name]['tipo']=='constante' else None
   return None
  if n.op in ('+','−','·','/','^'):return 'num'
  if n.op in ('⋂','⋃'):return 'obj'
  if n.op=='_':
   name=n.args[0].meta['value'];f=self.fichas.get(name)
   return ('num' if f.get('numerico') else 'obj') if f and f['tipo']=='funcao' and name not in env else None
  if n.typ=='call':
   if n.op in env:return None
   f=self.fichas.get(n.op);return ('num' if f.get('numerico') else 'obj') if f and f['tipo']=='funcao' else None
  return None
 def checkterm(self,n,expected,env):
  got=self.sortof(n,env)
  if expected and got and expected!=got:self.diag('E15',n.start)
  if n.op=='atom':return
  if n.op in ('+','−','·','/','^'):expect=['num']*len(n.args)
  elif n.op in ('⋂','⋃'):expect=['obj']*len(n.args)
  elif n.op=='_':
   # Índice é aplicação da função base a um argumento (§4.2/§4.3).
   # O nome da função não é um termo a ser conferido quanto à sorte.
   name=n.args[0].meta['value']
   f=self.fichas.get(name)
   f=f if f and f['tipo']=='funcao' and name not in env else {}
   sig=f.get('argumentos',[])
   wanted=('num' if sig[0]=='num' else 'obj') if sig else ('num' if f.get('numerico') or got is None and expected=='num' else 'obj')
   self.checkterm(n.args[1],wanted,env)
   return
  else:
   f=self.fichas.get(n.op,{});f=f if f.get('tipo')=='funcao' and n.op not in env else {}
   specified=f.get('argumentos')
   if specified:expect=['num' if x=='num' else 'obj' for x in specified]
   else:expect=['num' if (f.get('numerico') or got is None and expected=='num') else 'obj']*len(n.args)
  for i,a in enumerate(n.args):self.checkterm(a,expect[i] if i<len(expect) else 'obj',env)
 def types(self,n,env):
  if n.op in ('∀','∃'):
   if n.meta['domain']:
    dom=n.args[0]
    if not (dom.op=='atom' and dom.meta['value'] in ('ℝ','ℤ')):self.checkterm(dom,'obj',env)
   env=dict(env);env[n.meta['var']]='num' if n.meta['domain'] and n.args[0].op=='atom' and n.args[0].meta['value'] in ('ℝ','ℤ') else 'obj'
   self.types(n.args[-1],env);return
  if n.op in ('=','≠'):
   a,b=n.args;s1=self.sortof(a,env);s2=self.sortof(b,env)
   if s1 and s2 and s1!=s2:self.diag('E15',n.start);wanted=None
   else:wanted=s1 or s2
   self.checkterm(a,wanted,env);self.checkterm(b,wanted,env);return
  if n.op in ('<','≤','>','≥'):
   for a in n.args:self.checkterm(a,'num',env)
   return
  if n.op in ('∈','∉','⊆'):
   for a in n.args:self.checkterm(a,'obj',env)
   return
  if n.typ=='formula' and n.op not in ('B','∀','∃','¬','□','◇','∧','∨','⟹','⟺'):
   f=self.fichas.get(n.op,{})
   f=f if f.get('tipo')=='predicado' else {}
   for i,a in enumerate(n.args):
    sig=f.get('argumentos',[]);self.checkterm(a,'num' if i<len(sig) and sig[i]=='num' else 'obj',env)
   return
  for a in n.args:self.types(a,env)
 def extra_fichas(self):
  if not self.exigir:return
  first={}
  for pos,name,env in self.name_hits:
   if name not in self.fichas and name not in self.boundnames and name not in first:first[name]=pos
  for name,pos in first.items():
   best=(3,None)
   if len(name)>=3:
    for known in self.ordered_fichas:
     if len(known)<3 or abs(len(name)-len(known))>2:continue
     d=osa(name,known)
     if d<=2 and d<best[0]:best=(d,known)
   if best[1] is None:self.diag('E12',pos)
   else:self.diag('E13',pos,sugestao=best[1])
 def result(self):
  self.visits(self.root,{})
  self.types(self.root,{})
  self.extra_fichas()
  self.d.sort(key=lambda d:(d['inicio'],int(d['codigo'][1:])))
  return self.d

def run(text,fichas=None,exigirFichas=False):
 parser=Parser(text,fichas or []);root,syntax=parser.parse()
 if root is None:return {'aceita':False,'arvore':None,'arvoreExpandida':None,'diagnosticos':syntax}
 diags=Validator(parser,root,exigirFichas).result();accepted=not any(d['nivel']=='erro' for d in diags)
 U={x.meta['value'] for x in walk(root) if x.op=='atom' and x.typ in ('name','indexbase','indexarg','proposition')}
 U.update(x.op for x in walk(root) if x.typ in ('call','formula') and x.op not in {'∀','∃','B','¬','□','◇','∧','∨','⟹','⟺','=', '≠','∈','∉','⊆','<','≤','>','≥'})
 U.update(x.meta['var'] for x in walk(root) if x.op in ('∀','∃'))
 return {'aceita':accepted,'arvore':root.sexp(),'arvoreExpandida':expand(root,U).sexp() if accepted else None,'diagnosticos':diags}

if __name__=='__main__':
 examples=json.loads((BASE/'exemplos-m2.json').read_text())['exemplos']
 results=[];diff=[]
 for e in examples:
  x=run(e['texto'],e['fichas'],e['exigirFichas']);results.append({'id':e['id'],'esperado':e,'obtido':x});bad={}
  for k in ('aceita','arvore','arvoreExpandida','diagnosticos'):
   if k=='diagnosticos':
    a=e[k];b=x[k]
    # posição informativa apenas E0-E3: compare code/level; posições estritas no restante
    clean=lambda ds:[{k2:v2 for k2,v2 in d.items() if k2!='inicio' or d['codigo'] not in ('E0','E1','E2','E3')} for d in ds]
    a=clean(a);b=clean(b)
   else:a=e[k];b=x[k]
   if a!=b:bad[k]={'esperado':a,'obtido':b}
  if bad:diff.append({'id':e['id'],'texto':e['texto'],'divergencias':bad})
 print('Total',len(examples),'conformes',len(examples)-len(diff),'divergencias',len(diff))
 print('Por campo:',{k:sum(k in d['divergencias'] for d in diff) for k in ('aceita','arvore','arvoreExpandida','diagnosticos')})
 for d in diff:print(json.dumps(d,ensure_ascii=False))
 (BASE/'relatorio_diferencial_m2.json').write_text(json.dumps({'versao':'m2','commit':'c7e260736225bc69152a6655da17fd987050c529','quantidade':len(examples),'conformes':len(examples)-len(diff),'divergencias':diff,'casos':[{'id':x['id'],'conforme':x['id'] not in {d['id'] for d in diff},'esperado':x['esperado'],'obtido':x['obtido']} for x in results]},ensure_ascii=False,indent=2)+'\n')
