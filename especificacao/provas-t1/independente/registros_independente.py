#!/usr/bin/env python3
"""Leitor de registro-v1 independente, formulado pela especificação pública.
Não usa código do verificador Caderno (nem vinculo.py). Componentes m2/t1 e
modelos vieram das implementações anteriores do auditor e não são alterados.
Sem Carcara, provas válidas são PENDENTES, não aceitas.
"""
import sys,hashlib,json,re,os
from pathlib import Path
from collections import Counter
BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE/'independente'))
from validador_independente_m2 import run as ler_m2
from parser_independente_m2 import Parser, expand, walk
from tradutor_t1_independente import Translator
from verificar_finito_reforcado import verificar_caso as verificar_finito
from avaliador_kripke_numerico_v1 import verificar_caso_v1

EX_DIR=BASE/'especificacao'/'registros-v1'
HEX=re.compile(r'^[0-9a-f]{64}$')

class Recusa(Exception):
 def __init__(self,code,reason=''):
  self.code=code;self.reason=str(reason)
  super().__init__(code+': '+self.reason)

def require(condition,code,reason=''):
 if not condition: raise Recusa(code,reason)

def keys(x,expected,code='R1'):
 require(type(x)==dict,code,'objeto JSON esperado')
 require(set(x)==set(expected),code,'campos diferentes: '+repr(sorted(set(x)^set(expected))))

def txt(v):return type(v)==str and len(v)>0

def digest(b):return hashlib.sha256(b).hexdigest()

def canonical(text,fichas):
 res=ler_m2(text,fichas)
 require(res['aceita'],'R4','fórmula rejeitada por m2: '+text+' '+repr(res['diagnosticos']))
 p=Parser(text,fichas);root,err=p.parse()
 use={n.meta['value'] for n in walk(root) if n.op=='atom' and n.typ in ('name','indexbase','indexarg','proposition')}
 use.update(n.op for n in walk(root) if n.typ in ('call','formula') and n.op not in {'∀','∃','B','¬','□','◇','∧','∨','⟹','⟺','=','≠','∈','∉','⊆','<','≤','>','≥'})
 use.update(n.meta['var'] for n in walk(root) if n.op in ('∀','∃'))
 x=expand(root,use);counter=0
 def serialize(node,scope):
  nonlocal counter
  if node.op=='atom':return scope.get(node.meta['value'],node.meta['value'])
  if node.op=='B':return '(B '+json.dumps(node.meta['holder'],ensure_ascii=False)+' '+serialize(node.args[0],scope)+')'
  if node.op in ('∀','∃'):
   # Domínio, caso apareça, é lido ANTES de colocar a variável no escopo.
   domain=serialize(node.args[0],scope) if node.meta.get('domain') else None
   counter+=1;new='#'+str(counter)
   scoped=dict(scope);scoped[node.meta['var']]=new
   return '('+node.op+' '+new+(' ∈ '+domain if domain is not None else '')+' '+serialize(node.args[-1],scoped)+')'
  return '('+' '.join([node.op]+[serialize(a,scope) for a in node.args])+')'
 return serialize(x,{})

def fiche_line(f):
 n='numerico' if f.get('numerico') is True else '-'
 a=','.join(f['argumentos']) if f.get('argumentos') else '-'
 return 'ficha '+f['simbolo']+' '+f['tipo']+' '+str(f['aridade'])+' '+n+' '+a

def lines_fichas(fichas):return sorted([fiche_line(x) for x in fichas])

def teoria_hash(fichas,premissas):
 line=['teoria-v1']+lines_fichas(fichas)+sorted({'premissa '+canonical(p,fichas) for p in premissas})
 return digest(('\n'.join(line)+'\n').encode('utf-8'))

def validate_fichas(fs):
 require(type(fs)==list,'R1','fichas não é lista')
 names=set()
 for f in fs:
  require(type(f)==dict,'R1','ficha não é objeto')
  require({'simbolo','tipo','aridade'}<=set(f)<= {'simbolo','tipo','aridade','numerico','argumentos'},'R1','campos de ficha')
  s=f['simbolo'];typ=f['tipo'];arity=f['aridade']
  require(txt(s) and s not in names,'R1','símbolo repetido/inválido');names.add(s)
  require(typ in ('constante','funcao','predicado'),'R1','tipo de ficha')
  require(type(arity)==int and ((typ=='constante' and arity==0) or (typ=='funcao' and arity>=1) or (typ=='predicado' and arity>=0)),'R1','aridade de ficha')
  require('numerico' not in f or (typ!='predicado' and type(f['numerico'])==bool),'R1','numerico não permitido')
  require('argumentos' not in f or (typ!='constante' and type(f['argumentos'])==list and len(f['argumentos'])==arity and all(x in ('num','obj') for x in f['argumentos'])),'R1','argumentos inválidos')

def validate_form(r):
 require(type(r)==dict,'R1','registro não-objeto')
 status=r.get('situacao')
 require(status in ('aberto','fechado'),'R1','situação')
 common={'formato','situacao','afirmacao','teoria','tipo','dominio','estado','semantica','autor','compromisso'}
 expected=common | ({'formula','formaCanonica','certificado'} if status=='aberto' else set())
 keys(r,expected)
 require(r['formato']=='registro-v1','R2','formato')
 require(r['semantica']=={'gramatica':'m2','traducao':'t1'},'R2','versão semântica')
 require(r['afirmacao'] in ('segue','contradiz','nao-segue','consistente'),'R1','afirmação')
 require(r['tipo'] in ('axioma matemático','observação','hipótese','definição','norma','teorema'),'R1','tipo')
 require(r['estado'] in ('proposta','corroborada','contestada','refutada','sem avaliação'),'R1','estado')
 require(txt(r['dominio']),'R1','domínio')
 require(type(r['autor'])==str and bool(HEX.fullmatch(r['autor'])),'R1','autor')
 theory=r['teoria'];commit=r['compromisso']
 keys(theory,{'nome','hash'}|({'fichas','premissas'} if status=='aberto' else set()))
 require(txt(theory['nome']) and type(theory['hash'])==str and HEX.fullmatch(theory['hash']),'R1','teoria')
 keys(commit,{'hash','sal'} if status=='aberto' else {'hash'})
 require(type(commit['hash'])==str and HEX.fullmatch(commit['hash']),'R1','compromisso hash')
 if status=='aberto':
  require(txt(r['formula']) and txt(r['formaCanonica']),'R1','fórmula/formaCanônica')
  require(type(theory['premissas'])==list and all(txt(x) for x in theory['premissas']),'R1','premissas')
  validate_fichas(theory['fichas'])
  require(type(commit['sal'])==str and HEX.fullmatch(commit['sal']),'R1','sal')
  require(type(r['certificado'])==dict,'R1','certificado não objeto')
 require((r['tipo']=='teorema') == (r['afirmacao']=='segue'),'R3','teorema/segue')
 return status

# Parser SMT-LIB compacto, S-expressões, comparador independente.
def smt_parse(s):
 s=re.sub(r';[^\n]*','',s)
 lex=re.findall(r'\|[^|]*\||\"(?:\\.|[^\"])*\"|\(|\)|[^\s()]+',s)
 i=0
 def rec():
  nonlocal i
  require(i<len(lex),'R9','smt truncado')
  a=lex[i];i+=1
  if a!='(':require(a!=')','R9','fechamento isolado');return a
  out=[]
  while i<len(lex) and lex[i]!=')':out.append(rec())
  require(i<len(lex),'R9','paren smt');i+=1;return out
 out=[]
 while i<len(lex):out.append(rec())
 return out

def unbar(x):return x[1:-1] if type(x)==str and x.startswith('|') and x.endswith('|') else x

def smt_number(x):
 from fractions import Fraction
 if type(x)==str:
  try:
   if re.fullmatch(r'-?[0-9]+(\.[0-9]+)?',x):return ('num',Fraction(x))
  except ValueError:pass
 return None

def smt_canon_node(node,env=None,let_env=None,symbol_map=None):
 env={} if env is None else env
 let_env={} if let_env is None else let_env
 symbol_map={} if symbol_map is None else symbol_map
 if type(node)==str:
  x=unbar(node)
  if x in env:return ('b',env[x])
  if x in let_env:return let_env[x]
  num=smt_number(x)
  return num if num is not None else ('atom',symbol_map.get(x,x))
 if not node:return ('nil',)
 op=unbar(node[0]);args=node[1:]
 if op in ('forall','exists'):
  require(len(args)==2,'R9','quantificador SMT malformado na normalização')
  bindings=args[0]
  bound_env=dict(env)
  # De Bruijn-ish renaming local with shadowing
  bds=[]
  for k,decl in enumerate(bindings):
   v=unbar(decl[0]);s=unbar(decl[1]);bound_env[v]='x'+str(len(env)+k)
   bds.append(s)
  return (op,tuple(bds),smt_canon_node(args[1],bound_env,let_env,symbol_map))
 if op=='let':
  require(len(args)==2,'R9','let SMT malformado na normalização')
  e=dict(let_env)
  # SMT let parallel bindings evaluate against incoming environment.
  vals={unbar(k):smt_canon_node(v,env,let_env,symbol_map) for k,v in args[0]}
  e.update(vals)
  return smt_canon_node(args[1],env,e,symbol_map)
 if op in ('+','*','-','/'):
  try:
   if op=='-' and len(args)==1:
    v=smt_canon_node(args[0],env,let_env,symbol_map)
    if v[0]=='num':return ('num',-v[1])
   if op=='/' and len(args)==2:
    x,y=[smt_canon_node(a,env,let_env,symbol_map) for a in args]
    if x[0]=='num' and y[0]=='num' and y[1]!=0:return ('num',x[1]/y[1])
  except (TypeError,ValueError):pass
 ns=[smt_canon_node(a,env,let_env,symbol_map) for a in args]
 if op in ('and','or'):
  flat=[]
  for n in ns:
   if type(n)==tuple and n and n[0]==op:flat.extend(n[1]);
   else:flat.append(n)
  return (op,tuple(flat))
 return (symbol_map.get(op,op),tuple(ns))

def _nome_base_t1(nome):
 """Nome-base da seção 5.1; assinatura é dada pelas sortes da declaração.

 A classe de prefixo /k /:sig é informativa. A identificação semântica
 depende do nome-base MAIS do domínio e da imagem da declaração.
 """
 if nome in ('w0','pertence'):
  return nome
 if nome.startswith(('c:','n:')):
  return nome.split(':',1)[1]
 if nome.startswith('R:'):
  return nome[2:]
 m=re.fullmatch(r'(?:f|fn|p):(.+)/[0-9]+(?::[RO]+)?',nome)
 require(m is not None,'R9','nome declarado fora da forma t1: '+nome)
 return m.group(1)

def _id_semantico_t1(nome,assinatura):
 base=_nome_base_t1(nome)
 return ('simbolo',base,assinatura[0],assinatura[1])

def smt_fingerprint(s):
 """Perfil t1 limitado + tipagem de asserções, antes da comparação.
 Normalização independente. Fail-closed para operadores ainda não especificados.
 """
 commands=smt_parse(s);decls={};assertions=[];sorts={'Bool','Real'}
 phase=0;seen_logic=False;seen_check=False
 builtins={'true','false','not','and','or','=>','=','+','-','*','/','^','<','<=','>','>=','is_int','forall','exists','let'}
 def sorts_ok(t):return type(t)==str and unbar(t) in sorts
 for j,row in enumerate(commands):
  require(type(row)==list and row,'R9','comando SMT inválido')
  op=row[0]
  if op=='set-logic':
   require(j==0 and len(row)==2 and row[1]=='ALL' and not seen_logic,'R9','set-logic fora do início')
   seen_logic=True;continue
  require(seen_logic,'R9','set-logic ALL obrigatório')
  require(not seen_check,'R9','comando depois de check-sat')
  if op=='declare-sort':
   require(phase<=0 and len(row)==3 and row[1] in ('Obj','Mundo') and row[2]=='0' and row[1] not in sorts,'R9','declaração de sorte inválida')
   sorts.add(row[1]);continue
  if op in ('declare-fun','declare-const'):
   require(phase<=1,'R9','declaração depois de asserção');phase=1
   require((op=='declare-fun' and len(row)==4 and type(row[2])==list) or (op=='declare-const' and len(row)==3),'R9','declare malformado')
   name=unbar(row[1]);domain=row[2] if op=='declare-fun' else []
   ret=row[3] if op=='declare-fun' else row[2]
   require(type(name)==str and name not in builtins and name not in decls,'R9','símbolo reusado ou embutido')
   require(all(sorts_ok(k) for k in domain) and sorts_ok(ret),'R9','sorte não declarada')
   require(name=='w0' or name=='pertence' or name.startswith(('c:','n:','f:','fn:','p:','R:')),'R9','símbolo não emitido pela tradução t1')
   decls[name]=(tuple(map(unbar,domain)),unbar(ret));continue
  if op=='assert':
   require(phase<=2 and len(row)==2,'R9','asserção malformada');phase=2
   assertions.append(row[1]);continue
  if op=='check-sat':
   require(len(row)==1 and j==len(commands)-1,'R9','check-sat intermediário')
   seen_check=True;continue
  raise Recusa('R9','comando SMT não permitido: '+str(op))
 require(seen_logic,'R9','set-logic obrigatório')
 def infer(t,env):
  if type(t)==str:
   x=unbar(t)
   if x in env:return env[x]
   if x in ('true','false'):return 'Bool'
   if smt_number(x) is not None:return 'Real'
   require(x in decls and len(decls[x][0])==0,'R9','símbolo ou variável livre: '+x)
   return decls[x][1]
  require(type(t)==list and len(t)>0 and type(t[0])==str,'R9','termo SMT malformado')
  op=unbar(t[0]);a=t[1:]
  if op in ('forall','exists'):
   require(len(a)==2 and type(a[0])==list and bool(a[0]),'R9','quantificador malformado')
   env2=dict(env);bd=set()
   for b in a[0]:
    require(type(b)==list and len(b)==2 and type(b[0])==str and sorts_ok(b[1]),'R9','variável ligada malformada')
    name=unbar(b[0]);require(name not in bd and name not in builtins and name not in decls,'R9','variável ligada conflita com declaração')
    bd.add(name);env2[name]=unbar(b[1])
   require(infer(a[1],env2)=='Bool','R9','corpo do quantificador não booleano')
   return 'Bool'
  if op=='let':
   require(len(a)==2 and type(a[0])==list,'R9','let malformado')
   env2=dict(env);bd=set()
   for b in a[0]:
    require(type(b)==list and len(b)==2 and type(b[0])==str,'R9','ligação let inválida')
    v=unbar(b[0]);require(v not in bd and v not in builtins and v not in decls,'R9','ligação let captura símbolo')
    bd.add(v);env2[v]=infer(b[1],env)
   return infer(a[1],env2)
  st=[infer(v,env) for v in a]
  if op in ('not','and','or','=>'):
   require(len(a)==1 if op=='not' else len(a)>=2,'R9','aridade lógica')
   require(all(x=='Bool' for x in st),'R9','argumento lógico não bool')
   return 'Bool'
  if op=='=':
   require(len(a)>=2 and len(set(st))==1,'R9','igualdade mal tipada')
   return 'Bool'
  if op in ('+','-','*','/','^'):
   require((len(a)>=2 if op in ('+','*') else len(a)==2 if op in ('/','^') else len(a) in (1,2)) and all(x=='Real' for x in st),'R9','conta mal tipada')
   return 'Real'
  if op in ('<','<=','>','>='):
   require(len(a)>=2 and all(x=='Real' for x in st),'R9','comparação mal tipada')
   return 'Bool'
  if op=='is_int':
   require(len(st)==1 and st[0]=='Real','R9','is_int mal tipado')
   return 'Bool'
  require(op in decls,'R9','chamada de símbolo não declarado: '+op)
  args,out=decls[op]
  require(tuple(st)==args,'R9','assinatura da aplicação não corresponde: '+op)
  return out
 for a in assertions:require(infer(a,{})=='Bool','R9','assert não booleano')
 # Resolução de nomes declarados segundo seção 5.1: apenas o nome-base
 # e a assinatura têm significado. Rejeitar AMBIGUIDADE dentro do MESMO SMT,
 # inclusive em declarações não usadas nas asserções.
 aliases={};inverso={}
 for nome,assinatura in decls.items():
  identidade=_id_semantico_t1(nome,assinatura)
  require(identidade not in inverso,'R9',
          'duas declarações com o mesmo nome-base e assinatura: '+nome+' e '+str(inverso.get(identidade)))
  inverso[identidade]=nome
  aliases[nome]='@'+json.dumps(identidade,ensure_ascii=False,separators=(',',':'))
 normal=[smt_canon_node(a,symbol_map=aliases) for a in assertions]
 used=set()
 def refs(n):
  if type(n)==tuple:
   if n and n[0]=='atom' and n[1] in aliases.values():used.add(n[1])
   elif n and n[0] in aliases.values():used.add(n[0])
   for v in n:refs(v)
  elif type(n)==list:
   for v in n:refs(v)
 for a in normal:refs(a)
 return Counter(map(repr,normal)),tuple(sorted(used))


def check_translation(formulas,fichas,text):
 # tradução independente, NÃO usa vinculo.py do Caderno
 script=Translator(fichas).translate(formulas)
 assert1,decl1=smt_fingerprint(script)
 assert2,decl2=smt_fingerprint(text)
 return assert1==assert2 and decl1==decl2,{'asserts_normativos':sum(assert1.values()),'asserts_certificado':sum(assert2.values()),'simbolos_normativos':len(decl1),'simbolos_certificado':len(decl2)}

def validate_ref_file(x):
 keys(x,{'arquivo','sha256'})
 f=x['arquivo'];h=x['sha256']
 require(txt(f) and not f.startswith('/') and '\\' not in f and '..' not in f.split('/') and all(part not in ('','.','..') for part in f.split('/')),'R8','caminho inseguro')
 require(type(h)==str and bool(HEX.fullmatch(h)),'R8','sha256 arquivo')
 resolved=(EX_DIR/f).resolve();require(resolved.is_relative_to(EX_DIR.resolve()),'R8','travessia de caminho')
 require(resolved.is_file(),'R8','arquivo não existe')
 b=resolved.read_bytes()
 require(digest(b)==h,'R8','hash incorreto '+f)
 return b

def check_proof_pair(entry,formulas,fichas):
 keys(entry,{'problema','prova'})
 smt=validate_ref_file(entry['problema']);proof=validate_ref_file(entry['prova'])
 try:equal,data=check_translation(formulas,fichas,smt.decode('utf-8'))
 except Exception as e:raise Recusa('R9',repr(e))
 require(equal,'R9','divergência independente da tradução t1 '+repr(data))
 return {'smt':entry['problema']['arquivo'],'aleth':entry['prova']['arquivo'],'verificacao':'Carcara indisponível'}

def validate_cert_combination(r):
 cert=r['certificado'];p=len(r['teoria']['premissas']);a=r['afirmacao'];ks=set(cert)
 if a in ('segue','contradiz'):
  if ks=={'refutacao'} and p:raise Recusa('R12','teoria com premissas sem testemunho de consistência')
  allow=([{'refutacao','modeloDasPremissas'},{'vazio'}] if p else [{'refutacao'},{'refutacao','modeloDasPremissas'},{'vazio'}])
 else:allow=[{'modelo'}]
 require(any(ks==x for x in allow),'R1','combinação de certificado inválida '+repr(ks))

def check_model(forms,fichas,model):
 try:
  if model.get('formato')=='modelo-exato-t1-v1':
   verificar_caso_v1(forms,fichas,model)
   return 'exato: modelos avaliados integralmente'
  keys(model,{'objetos','mundos','constantes','funcoes','predicados','pertence','acessos'},'R11')
  verificar_finito(forms,fichas,model)
  return 'finito: modelos avaliados integralmente'
 except Exception as e:raise Recusa('R11',repr(e))

def check_one(r):
 stage='forma';status=validate_form(r)
 if status=='fechado':return {'veredito':'aceito','motivo':None,'escopo':'somente forma fechada; compromisso não aberto'}
 fichas=r['teoria']['fichas'];prem=r['teoria']['premissas'];form=r['formula'];a=r['afirmacao']
 # Lê todas as fórmulas antes de comparar os hashes.
 canon=[canonical(x,fichas) for x in prem];cform=canonical(form,fichas)
 require(cform==r['formaCanonica'],'R5','forma canônica não bate')
 require(digest(('\n'.join(['teoria-v1']+lines_fichas(fichas)+sorted({'premissa '+x for x in canon}))+'\n').encode('utf-8'))==r['teoria']['hash'],'R6','hash teoria')
 require(digest(bytes.fromhex(r['compromisso']['sal'])+('\n'.join(['formula-v1']+lines_fichas(fichas)+['formula '+cform])+'\n').encode('utf-8'))==r['compromisso']['hash'],'R7','compromisso da fórmula')
 validate_cert_combination(r)
 cert=r['certificado']
 target=prem+[('¬('+form+')') if a in ('segue','nao-segue') else form]
 proof_info=[]
 if 'refutacao' in cert:proof_info.append(check_proof_pair(cert['refutacao'],target,fichas))
 if 'vazio' in cert:proof_info.append(check_proof_pair(cert['vazio'],prem,fichas))
 # Certificação de modelos não depende de veredito da prova.
 models=[]
 if 'modelo' in cert:models.append(check_model(target,fichas,cert['modelo']))
 if 'modeloDasPremissas' in cert:models.append(check_model(prem,fichas,cert['modeloDasPremissas']))
 if proof_info:
  return {'veredito':'pendente-prova','motivo':None,'pendencias':proof_info,'modelos':models}
 return {'veredito':'aceito','motivo':None,'modelos':models}

def objeto_sem_chave_repetida(pares):
 """Recusa TODAS as chaves repetidas, inclusive dentro de objetos aninhados."""
 obj={}
 for k,v in pares:
  if k in obj:raise Recusa('R1','chave JSON repetida: '+k)
  obj[k]=v
 return obj

def decodificar_registro_texto(texto):
 require(type(texto)==str,'R1','registroTexto deve ser string')
 try:
  registro=json.loads(texto,object_pairs_hook=objeto_sem_chave_repetida)
 except Recusa:raise
 except (ValueError,TypeError) as exc:raise Recusa('R1','registroTexto JSON inválido: '+str(exc))
 require(type(registro)==dict,'R1','registroTexto não contém objeto')
 return registro

def avaliar_examples(path=None):
 f=Path(path) if path else EX_DIR/'exemplos.json'
 data=json.loads(f.read_text('utf-8'),object_pairs_hook=objeto_sem_chave_repetida);outputs=[]
 for example in data['exemplos']:
  try:
   require(('registro' in example) != ('registroTexto' in example),
           'R1','exemplo deve conter registro OU registroTexto')
   registro=decodificar_registro_texto(example['registroTexto']) if 'registroTexto' in example else example['registro']
   res=check_one(registro)
  except Recusa as exc:res={'veredito':'recusado','motivo':exc.code,'detalhe':exc.reason}
  except Exception as exc:res={'veredito':'erro-interno','motivo':None,'detalhe':repr(exc)}
  outputs.append({'id':example['id'],'descricao':example['descricao'],'esperado':example['esperado'],**res})
  print(example['id'],res['veredito'],res.get('motivo'),res.get('detalhe','')[:170],flush=True)
 return {'protocolo':'registro-v1','fonte':'especificação, leitor m2 e tradutor t1 independentes; sem vinculo.py; sem Carcara','casos':outputs}

if __name__=='__main__':
 d=avaliar_examples();p=BASE/'resultado_28_registros.json';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Salvo',p)
