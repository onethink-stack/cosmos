#!/usr/bin/env python3
"""Implementação experimental independente do leitor m2: gramática, árvores, expansões e diagnósticos.
Não importa árvores nem resultados dos exemplos durante a leitura: apenas usa o léxico oficial.
"""
from dataclasses import dataclass,field
from pathlib import Path
import json,re,sys
from bisect import bisect_right
sys.setrecursionlimit(max(sys.getrecursionlimit(),20000))

BASE=Path(__file__).parent
LEX=json.loads((BASE/'lexico-m2.json').read_text())
ALIASES={v:s['canonico'] for s in LEX['simbolos'] for v in s['grafias']}
ALIASES.update({'ℝ':'ℝ','ℤ':'ℤ'})
SYMS=sorted(ALIASES,key=len,reverse=True)
SUB=LEX['subscritos']; SUP=set(LEX['nome']['sobrescritosComAvisoE17'])
# Lista normativa de 25 espaços e 770 faixas L/N do Unicode 16.0:
# a implementação NÃO consulta isspace() ou a versão Unicode do Python.
SPACES={chr(int(p[2:],16)) for p in LEX['espacos']}
LN_RANGES=[(int(a,16),int(b,16)) for a,b in LEX['letrasENumeros']['faixas']]
LN_STARTS=[start for start,_ in LN_RANGES]
def unicode_name_character(c):
    code=ord(c); i=bisect_right(LN_STARTS,code)-1
    return i>=0 and code<=LN_RANGES[i][1] and c not in SUB

REL=set('=≠∈∉⊆<≤>≥')
OPS={'∧','∨','⟹','⟺'}
ARITH={'−','+','·','/','^','⋂','⋃'}
@dataclass
class Tok:
    val:str; raw:str; p:int; end:int; kind:str
@dataclass
class Node:
    op:str; args:list=field(default_factory=list); start:int=0; end:int=0; typ:str=''; meta:dict=field(default_factory=dict)
    def sexp(self):
        if self.op=='atom':return self.meta['value']
        if self.op=='B':return f'(B {json.dumps(self.meta["holder"],ensure_ascii=False)} {self.args[0].sexp()})'
        if self.op in ('∀','∃'):
            domain=self.args[0] if self.meta.get('domain') else None
            body=self.args[-1]
            return f'({self.op} {self.meta["var"]}'+(f' ∈ {domain.sexp()}' if domain is not None else '')+f' {body.sexp()})'
        return '('+' '.join([self.op]+[a.sexp() for a in self.args])+')'

class ParseErr(Exception):
 def __init__(self,code,pos=0): self.code=code; self.pos=pos

def atom(s,p,e,kind='name'):
 return Node('atom',[],p,e,kind,{'value':s,'namepos':p})

def lexer(s):
 t=[]; bad=[]; i=0
 def namech(c):return unicode_name_character(c)
 while i<len(s):
  if s[i] in SPACES:i+=1;continue
  st=i;c=s[i]; kind='sym'
  if c in SUB:
   while i<len(s) and s[i] in SUB:i+=1
   raw=s[st:i];v=''.join(SUB[x] for x in raw);kind='index'
  elif c=='_':
   i+=1
   while i<len(s) and (namech(s[i]) or s[i]=="'"):i+=1
   raw=s[st:i];v=raw[1:];kind='index'
   if not v:bad.append({'codigo':'E8','nivel':'erro','inicio':st})
  elif '0'<=c<='9':
   m=re.match(r'[0-9]+(?:\.[0-9]+)?',s[i:]);raw=m.group();i+=len(raw);v=raw;kind='number'
  elif c in 'ℝℤ':i+=1;raw=c;v=c;kind='domain'
  elif namech(c):
   i+=1
   while i<len(s) and (namech(s[i]) or s[i]=="'"):i+=1
   raw=s[st:i];v=raw;kind='name'
  else:
   hit=next((a for a in SYMS if s.startswith(a,i)),None)
   if hit:raw=hit;i+=len(hit);v=ALIASES[hit];kind='sym'
   else:
    if c=='\\':
     i+=1
     while i<len(s) and ('A'<=s[i]<='Z' or 'a'<=s[i]<='z'):i+=1
    else:i+=1
    raw=s[st:i];v=raw;kind='bad';bad.append({'codigo':'E8','nivel':'erro','inicio':st})
  t.append(Tok(v,raw,st,i,kind))
 return t,bad

class Parser:
 def __init__(self,s,fichas):self.s=s;self.t,self.bad=lexer(s);self.i=0;self.fichas={f['simbolo']:f for f in fichas};self.rec=0
 def peek(self):return self.t[self.i] if self.i<len(self.t) else Tok('', '',len(self.s),len(self.s),'eof')
 def val(self):return self.peek().val
 def eat(self,v=None):
  t=self.peek()
  if v is not None and t.val!=v:raise ParseErr('E0',t.p)
  self.i+=1;return t
 def guard(self):
  self.rec+=1
  if self.rec>400:raise ParseErr('E0',0)
 def unguard(self):self.rec-=1
 def balanced(self):
  stack=[]
  for t in self.t:
   if t.val=='(':stack.append(t.p)
   if t.val==')':
    if not stack:return t.p
    stack.pop()
  if stack:return stack[-1]
  return None
 def parse(self):
  if self.bad:return None,self.bad
  if not self.t:return None,[]
  b=self.balanced()
  if b is not None:return None,[{'codigo':'E7','nivel':'erro','inicio':b}]
  nesting=0;maxnest=0
  for t in self.t:
   if t.val=='(':nesting+=1;maxnest=max(maxnest,nesting)
   elif t.val==')':nesting-=1
  if maxnest>400:return None,[{'codigo':'E0','nivel':'erro','inicio':0}]
  try:
   n=self.formula()
   if self.val():
    x=self.peek()
    if x.val in REL:raise ParseErr('E0',x.p)
    if x.kind=='name' or x.val in ('¬','□','◇','∀','∃','('):raise ParseErr('E3',x.p)
    raise ParseErr('E0',x.p)
   depths=[(n,1)]
   while depths:
    item,depth=depths.pop()
    if depth>2000:raise ParseErr('E0',0)
    for child in item.args:depths.append((child,depth+1))
   return n,[]
  except ParseErr as e:return None,[{'codigo':e.code,'nivel':'erro','inicio':e.pos}]
  except RecursionError:return None,[{'codigo':'E0','nivel':'erro','inicio':0}]
 def require_formula_after_connective(self,op):
  # m2 §2.4: conectivo sem operando, independentemente do contexto,
  # produz E1 no conectivo (não E0 no token inesperado).
  if self.val() in ('',')',',',']') or self.val() in OPS or self.val() in REL:
   raise ParseErr('E1',op.p)
 def starts_term(self,t=None):
  t=t or self.peek()
  return t.kind in ('name','number') or t.val in ('(','∅','−')
 def require_term_after(self,op):
  # m2 §2.4: um operador aritmético/de conjunto, inclusive sinal, deve
  # ser seguido de algo que começa termo; caso contrário, E1 no operador.
  if not self.starts_term():raise ParseErr('E1',op.p)
 def relation(self,left):
  op=self.eat()
  # m2 §2.4: a relação sem operando direito tem regra própria.
  if self.val() in ('',')',',',']','∧','∨','⟹','⟺','¬','∀','∃') or self.val() in REL:
   raise ParseErr('E1',op.p)
  right=self.term()
  return Node(op.val,[left,right],left.start,right.end,'formula')
 def formula(self):return self.equiv()
 def equiv(self):
  a=self.impl()
  while self.val()=='⟺':
   op=self.eat();self.require_formula_after_connective(op);b=self.impl();a=Node('⟺',[a,b],a.start,b.end,'formula')
  return a
 def impl(self):
  a=self.disj()
  if self.val()=='⟹':
   op=self.eat();self.require_formula_after_connective(op);b=self.impl();a=Node('⟹',[a,b],a.start,b.end,'formula')
  return a
 def disj(self):
  a=self.conj()
  while self.val()=='∨':
   op=self.eat();self.require_formula_after_connective(op);b=self.conj();a=Node('∨',[a,b],a.start,b.end,'formula')
  return a
 def conj(self):
  a=self.unary()
  while self.val()=='∧':
   op=self.eat();self.require_formula_after_connective(op);b=self.unary();a=Node('∧',[a,b],a.start,b.end,'formula')
  return a
 def unary(self):
  self.guard()
  try:return self._unary()
  finally:self.unguard()
 def _unary(self):
  t=self.peek();v=t.val
  if v=='B' and self.i+1<len(self.t) and self.t[self.i+1].raw=='[]' and t.end==self.t[self.i+1].p:
   raise ParseErr('E0',t.p)
  if v in ('¬','□','◇'):
   self.eat();x=self.unary();return Node(v,[x],t.p,x.end,'formula')
  if v=='B' and self.i+1<len(self.t) and self.t[self.i+1].val=='[' and t.end==self.t[self.i+1].p:
   self.eat();opening=self.eat('[');holder=[];holder_start=opening.end
   while self.val() not in (']',''):
    if self.peek().kind!='name':raise ParseErr('E0',t.p)
    holder.append(self.eat().val)
   if not holder or self.val()!=']':raise ParseErr('E0',t.p)
   closing=self.eat(']');b=self.unary()
   return Node('B',[b],t.p,b.end,'formula',{'holder':' '.join(holder),'holder_start':holder_start,'holder_end':closing.p})
  if v in ('∀','∃'):
   self.eat();u=self.peek()
   if u.kind!='name':raise ParseErr('E0',u.p)
   self.eat();
   if self.peek().kind=='index' and self.peek().p==u.end:raise ParseErr('E0',u.p)
   domain=None
   if self.val()=='∈':
    self.eat()
    if self.val() in ('ℝ','ℤ'):
     z=self.eat();domain=atom(z.val,z.p,z.end,'domain')
    elif self.val() in ('','∧','∨','⟹','⟺',')',',',']') or self.val() in REL or self.val()=='¬':raise ParseErr('E1',self.peek().p)
    else:domain=self.term()
   if self.val() in ('',')',',','∧','∨','⟹','⟺'):raise ParseErr('E1',t.p)
   st=self.peek().val;bodybegin=self.i
   body=self.formula()
   return Node(v,([domain] if domain else [])+[body],t.p,body.end,'formula',{'var':u.val,'varpos':u.p,'domain':bool(domain),'bodystart':st,'bodypos':bodybegin,'bodyend':self.i})
  if v in OPS or v in REL or v in ARITH and v!='−':raise ParseErr('E1',t.p)
  if v in ('',')'):raise ParseErr('E1',t.p)
  if v in (',',']','['):raise ParseErr('E0',t.p)
  if v=='(':
   old=self.i
   if self.i+1<len(self.t) and self.t[self.i+1].val==')':raise ParseErr('E0',t.p)
   try:
    left=self.term()
    if self.val() in REL:
     return self.relation(left)
   except ParseErr:pass
   self.i=old;op=self.eat('(');sub=self.formula()
   if self.val()!=')' and (self.starts_term() or self.val() in ('¬','□','◇','∀','∃')):
    raise ParseErr('E3',self.peek().p)
   close=self.eat(')');sub.start=op.p;sub.end=close.end;return sub
  a=self.term()
  if self.val() in REL:
   return self.relation(a)
  if a.typ=='call':a.typ='formula';return a
  if a.op=='atom' and a.typ=='name' and self.fichas.get(a.meta['value'],{}).get('tipo')=='predicado' and self.fichas[a.meta['value']].get('aridade')==0:
   a.typ='proposition';return a
  raise ParseErr('E2',a.start)
 def term(self):
  a=self.prod()
  while self.val() in ('+','−'):
   op=self.eat();self.require_term_after(op);b=self.prod();a=Node(op.val,[a,b],a.start,b.end,'term')
  return a
 def prod(self):
  a=self.sign()
  while self.val() in ('·','/'):
   op=self.eat();self.require_term_after(op);b=self.sign();a=Node(op.val,[a,b],a.start,b.end,'term')
  return a
 def sign(self):
  if self.val()=='−':
   t=self.eat();self.require_term_after(t);a=self.sign();return Node('−',[a],t.p,a.end,'term')
  return self.power()
 def power(self):
  a=self.union()
  if self.val()=='^':
   op=self.eat();self.require_term_after(op);b=self.sign();a=Node('^',[a,b],a.start,b.end,'term')
  return a
 def union(self):
  a=self.inter()
  while self.val()=='⋃':
   op=self.eat();self.require_term_after(op);b=self.inter();a=Node('⋃',[a,b],a.start,b.end,'term')
  return a
 def inter(self):
  a=self.primary()
  while self.val()=='⋂':
   op=self.eat();self.require_term_after(op);b=self.primary();a=Node('⋂',[a,b],a.start,b.end,'term')
  return a
 def primary(self):
  t=self.peek()
  if t.val=='∅':self.eat();return atom('∅',t.p,t.end,'empty')
  if t.kind=='number':self.eat();return atom(t.val,t.p,t.end,'number')
  if t.kind=='name':
   self.eat()
   if self.val()=='(' and t.end==self.peek().p:
    self.eat();
    if self.val()==')':raise ParseErr('E0',self.peek().p)
    args=[self.term()]
    while self.val()==',':self.eat();args.append(self.term())
    close=self.eat(')');return Node(t.val,args,t.p,close.end,'call',{'namepos':t.p})
   if self.peek().kind=='index' and t.end==self.peek().p:
    ind=self.eat();base=atom(t.val,t.p,t.end,'indexbase');arg=atom(ind.val,ind.p,ind.end,'indexarg');return Node('_',[base,arg],t.p,ind.end,'term')
   return atom(t.val,t.p,t.end,'name')
  if t.val=='(':
   self.eat();a=self.term();close=self.eat(')');a.start=t.p;a.end=close.end;return a
  if t.val in ('',')',',','∧','∨','⟹','⟺'):raise ParseErr('E1',t.p)
  raise ParseErr('E0',t.p)

def walk(n):
 yield n
 for a in n.args:yield from walk(a)

def expand(n,U):
 def cp(t):return Node(t.op,[cp(a) for a in t.args],t.start,t.end,t.typ,t.meta.copy())
 def expand_mem(x,s):
  if s.op=='atom' and s.meta['value']=='∅':return atom('⊥',x.start,s.end,'truth')
  if s.op in ('⋂','⋃'):
   op='∧' if s.op=='⋂' else '∨';return Node(op,[expand_mem(cp(x),s.args[0]),expand_mem(cp(x),s.args[1])],x.start,s.end,'formula')
  return Node('∈',[cp(x),cp(s)],x.start,s.end,'formula')
 def fresh():
  i=0
  while 1:
   s='z'+(str(i) if i else '')
   if s not in U:U.add(s);return s
   i+=1
 def go(n):
  if n.op=='⊆':
   z=fresh();x=atom(z,n.start,n.start,'name')
   return Node('∀',[Node('⟹',[expand_mem(x,go(n.args[0])),expand_mem(x,go(n.args[1]))],n.start,n.end,'formula')],n.start,n.end,'formula',{'var':z,'domain':False})
  if n.op in ('∈','∉'):
   out=expand_mem(go(n.args[0]),go(n.args[1]));return Node('¬',[out],n.start,n.end,'formula') if n.op=='∉' else out
  if n.op=='≠':return Node('¬',[Node('=',[go(x) for x in n.args],n.start,n.end,'formula')],n.start,n.end,'formula')
  if n.op in ('∀','∃') and n.meta.get('domain'):
   dom=n.args[0];body=go(n.args[1]);
   if dom.op=='atom' and dom.meta['value'] in ('ℝ','ℤ'):
    return Node(n.op,[cp(dom),body],n.start,n.end,n.typ,n.meta.copy())
   var=atom(n.meta['var'],n.start,n.start,'name');mem=expand_mem(var,go(dom));op='⟹' if n.op=='∀' else '∧';comb=Node(op,[mem,body],n.start,n.end,'formula');return Node(n.op,[comb],n.start,n.end,'formula',{'var':n.meta['var'],'domain':False})
  return Node(n.op,[go(x) for x in n.args],n.start,n.end,n.typ,n.meta.copy())
 return go(n)

# O restante da validação será uma passagem separada sobre a AST; não consulta os fixtures.
if __name__=='__main__':
 examples=json.loads((BASE/'exemplos-m2.json').read_text())['exemplos']
 print('Verificação sintática/AST independente')
 ok=0;fail=[]
 for e in examples:
  p=Parser(e['texto'],e['fichas']);n,di=p.parse()
  tree=n.sexp() if n else None
  if tree==e['arvore'] and (n or not e['arvore']):ok+=1
  else:fail.append((e['id'],e['texto'],e['arvore'],tree,di))
 print('ÁRVORES',ok,'/',len(examples),'divergências',len(fail))
 for v in fail[:40]:print('DIFF',v)
