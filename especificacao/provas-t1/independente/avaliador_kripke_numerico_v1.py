#!/usr/bin/env python3
"""Extensão NÃO INTRUSIVA do avaliador Kripke congelado da t1.
Interpreta a AST expandida, usando Q(alpha) exato e certificação de raiz por Sturm.
Não usa Z3, não descobre modelos; falha fechado em casos não cobertos.
Requer sympy apenas para operações algébricas (não satisfatibilidade SMT).
"""
from fractions import Fraction
from itertools import product
from collections import defaultdict
import json
import re
import sympy as S
from avaliador_kripke_puro import expand_formula

X = S.Symbol('X')

def rat(s):
    exigir(type(s)==str and bool(re.fullmatch(r'-?(?:[0-9]+|[0-9]+/0*[1-9][0-9]*|[0-9]+\.[0-9]+)',s)),
           'racional fora da gramática v1')
    q=Fraction(s)
    return S.Rational(q.numerator,q.denominator)

class CorpoReal:
    """Representação exata Q[alpha]/(p), com raiz alpha isolada em (a,b)."""
    def __init__(self, dados=None):
        self.p = None
        self.intervalo = None
        if dados is not None:
            cs=dados['polinomio']
            exigir(isinstance(cs,list) and len(cs)>=2 and all(type(i)==int and abs(i)<=2**53-1 for i in cs),'polinômio inválido')
            p=S.Poly(sum(S.Integer(c)*X**i for i,c in enumerate(cs)),X,domain=S.QQ)
            exigir(cs[-1]>0 and p.LC()>0 and S.gcd_list(cs)==1 and p.is_irreducible,'polinômio não primitivo ou não irredutível')
            a,b=map(rat,dados['intervaloAberto']);exigir(a<b and p.eval(a)!=0 and p.eval(b)!=0,'intervalo isolante inválido')
            exigir(p.count_roots(a,b)==1,'Sturm: intervalo não contém exatamente uma raiz real')
            if 'indiceDaRaiz' in dados:
                exigir(type(dados['indiceDaRaiz'])==int and dados['indiceDaRaiz']>=1,'indiceDaRaiz inválido')
                raiz_index=1+int(p.count_roots(-S.oo,a))
                exigir(dados['indiceDaRaiz']==raiz_index,'indiceDaRaiz não identifica a raiz isolada')
            self.p=p;self.intervalo=(a,b)
    def el(self,e):
        if isinstance(e,S.Poly):return e.rem(self.p) if self.p is not None else e
        if isinstance(e,(int,Fraction,S.Rational)):
            return self._poly(S.Rational(e))
        if isinstance(e,dict) and set(e)=={'coeficientes'}:
            cs=e['coeficientes']
            exigir(isinstance(cs,list) and bool(cs),'coeficientes do elemento algébrico vazios')
            if self.p is None:exigir(len(cs)==1,'elemento algébrico sem corpo')
            return self._poly(sum(rat(c)*X**i for i,c in enumerate(cs)))
        if isinstance(e,str):
            if e=='alpha':
                exigir(self.p is not None,'alpha sem certificado algébrico')
                return self._poly(X)
            return self._poly(rat(e))
        raise ValueError('elemento algébrico inválido: '+str(e))
    def _poly(self,x):return S.Poly(x,X,domain=S.QQ).rem(self.p) if self.p is not None else S.Poly(x,X,domain=S.QQ)
    def add(self,a,b):return self._poly(a.as_expr()+b.as_expr())
    def neg(self,a):return self._poly(-a.as_expr())
    def mul(self,a,b):return self._poly(a.as_expr()*b.as_expr())
    def div(self,a,b):
        exigir(not b.is_zero,'divisão por zero deve ser modelada por D0')
        if self.p is not None:
            inv=S.invert(b,self.p)
            return self.mul(a,inv)
        exigir(b.degree()==0,'divisor inválido')
        return self._poly(a.as_expr()/b.LC())
    def equal(self,a,b):return self._poly(a.as_expr()-b.as_expr()).is_zero
    def sinal(self,a):
        a=self.el(a)
        if a.is_zero:return 0
        if self.p is None:return int(S.sign(a.eval(0)))
        # Como p é irredutível e a!=0, não há raiz comum com a.
        lo,hi=self.intervalo;f_lo=self.p.eval(lo)
        for it in range(2048):
            if a.eval(lo)!=0 and a.eval(hi)!=0 and a.count_roots(lo,hi)==0:
                return int(S.sign(a.eval((lo+hi)/2)))
            mid=(lo+hi)/2; fm=self.p.eval(mid)
            if fm==0: return int(S.sign(a.eval(mid)))
            if f_lo*fm<0:hi=mid
            else:lo=mid;f_lo=fm
        raise ValueError('limite do isolador de sinais atingido')
    def cmp(self,a,b):return self.sinal(self.add(a,self.neg(b)))
    def integer(self,a):
        if a.degree()>0:return False  # irredutível => alpha não racional
        return a.LC().q==1
    def inteiro(self,a):return int(a.LC()) if self.integer(a) else None

class ErroCertificado(ValueError):pass

def exigir(cond,msg):
    if not cond:raise ErroCertificado(msg)

class Modelo:
    def __init__(self,fonte,algebricos=None):
        exigir(type(fonte.get('objetos'))==list and all(type(x)==str for x in fonte['objetos']), 'objetos não é lista de nomes')
        exigir(type(fonte.get('mundos'))==list and all(type(x)==str for x in fonte['mundos']), 'mundos não é lista de nomes')
        self.raw=fonte;self.O=tuple(fonte['objetos']);self.W=tuple(fonte['mundos']);self.w0=fonte['mundoReal']
        exigir(bool(self.O) and len(set(self.O))==len(self.O),'domínio de objetos vazio/repetido')
        exigir(bool(self.W) and len(set(self.W))==len(self.W) and self.w0 in self.W,'mundos inválidos')
        alg=(algebricos or {}).get('alpha')
        self.K=CorpoReal(alg)
        self.num={k:self.K.el(v) for k,v in fonte.get('constantesReais',{}).items()}
        self.obj=fonte.get('constantesObjeto',{})
        exigir(all(v in self.O for v in self.obj.values()),'constante objeto fora do domínio')
        self.fo=fonte.get('funcoesObjeto',{});self.fn=fonte.get('funcoesReais',{});self.pred=fonte.get('predicados',{})
        self.div0=fonte.get('divZero')
        self.acesso={h:{tuple(a) for a in rows} for h,rows in fonte.get('acessos',{}).items()}
        for h,R in self.acesso.items():
            exigir(all(a in self.W and b in self.W for a,b in R),'acessibilidade fora de W')
            exigir(all(any((a,b) in R for b in self.W) for a in self.W),'KD45 serial')
            exigir(all((a,c) in R for a,b in R for b2,c in R if b==b2),'KD45 transitivo')
            exigir(all((b,c) in R for a,b in R for a2,c in R if a==a2),'KD45 euclidiano')
        self.member=fonte.get('pertence',[])
        exigir(all(len(z)==3 and z[0] in self.W and z[1] in self.O and z[2] in self.O for z in self.member),'pertinência malformada')
        self.witness={}
        self.fichas=None
    def assoc(self,colecao,chave,world,args,esperado):
        exigir(chave in colecao,'função/predicado sem definição total: '+chave)
        if world=='__RIGIDO__':
            exigir('porMundo' not in colecao[chave] and colecao[chave].get('tipo') not in ('valor-por-mundo','booleano-por-mundo'), 'função numérica não pode variar por mundo')
        entry=colecao[chave]
        if 'tipo' in entry and entry['tipo']=='constante':ans=entry['valor']
        elif 'tipo' in entry and entry['tipo'] in ('valor-por-mundo','booleano-por-mundo'):
            exigir(world in entry['valores'],'valor ausente em mundo '+world)
            ans=entry['valores'][world]
        else:
            exigir('padrao' in entry,'função/predicado sem caso padrão: '+chave)
            ans=entry.get('porMundo',{}).get(world,entry['padrao'])
            hit=0
            for item in entry.get('excecoes',[]):
                exige=item.get('argumentos',[])
                if item.get('mundo','__RIGIDO__')==world and len(exige)==len(args) and all(self.igual(x,y) for x,y in zip(exige,args)):
                    hit+=1;ans=item['valor']
            exigir(hit<=1,'exceções sobrepostas para '+chave)
        if esperado=='bool':exigir(type(ans)==bool,'predicado não booleano');return ans
        if esperado=='obj':exigir(ans in self.O,'resultado objeto inválido');return ans
        return self.K.el(ans)
    def igual(self,x,y):
        if isinstance(y,S.Poly):return self.K.equal(self.K.el(x),y)
        return x==y
    def D0(self,n):
        entry=self.div0
        exigir(isinstance(entry,dict),'D0 ausente no certificado')
        exigir('padrao' in entry or entry.get('tipo')=='constante','D0 precisa de caso padrão total')
        ans=entry.get('valor') if entry.get('tipo')=='constante' else entry['padrao']
        vistos=[]
        for item in entry.get('excecoes',[]):
            v=self.K.el(item['numerador'])
            exigir(not any(self.K.equal(v,a) for a in vistos),'D0 com exceções repetidas')
            vistos.append(v)
            if self.K.equal(v,n):ans=item['valor']
        return self.K.el(ans)

def term(n,w,env,M):
    op=n.op
    if op=='atom':
        val=n.meta['value']
        if val in env:return env[val]
        if n.typ=='number':return M.K.el(val)
        if val=='∅':
            exigir('∅' in M.obj,'∅ sem interpretação como objeto')
            return M.obj['∅']
        ficha=M.fichas.get(val) if M.fichas else None
        numeric=bool(ficha and ficha.get('tipo')=='constante' and ficha.get('numerico'))
        if numeric:
            exigir(val in M.num and val not in M.obj, 'constante Real sem interpretação rígida Real: '+val)
            return M.num[val]
        exigir(val not in M.num,'nome de objeto interpretado como número sem ficha: '+val)
        if val in M.obj:return M.obj[val]
        raise ErroCertificado('termo sem interpretação: '+val)
    if op=='−':
        if len(n.args)==1:return M.K.neg(term(n.args[0],w,env,M))
        if len(n.args)==2:return M.K.add(term(n.args[0],w,env,M),M.K.neg(term(n.args[1],w,env,M)))
        raise ErroCertificado('aridade inválida em subtração')
    if op in ('+','·','/','^'):
        a=term(n.args[0],w,env,M);b=term(n.args[1],w,env,M)
        if op=='+':return M.K.add(a,b)
        if op=='·':return M.K.mul(a,b)
        if op=='/':return M.D0(a) if b.is_zero else M.K.div(a,b)
        exigir(M.K.integer(b),'expoente não-inteiro fora do perfil numérico')
        exponent=M.K.inteiro(b);exigir(0<=exponent<=12 and n.args[1].op=='atom' and n.args[1].typ=='number' and str(n.args[1].meta['value']).isdigit(), 'potência só com expoente literal 0..12')
        result=M.K.el(1)
        
        for _ in range(abs(exponent)):result=M.K.mul(result,a)
        return result
    if op=='_':
        name=n.args[0].meta['value'];x=term(n.args[1],w,env,M)
        return M.assoc(M.fo,name+'/1',w,[x],'obj')
    args=[term(a,w,env,M) for a in n.args]
    k=op+'/'+str(len(args))
    if k in M.fo:return M.assoc(M.fo,k,w,args,'obj')
    if k in M.fn:return M.assoc(M.fn,k,'__RIGIDO__',args,'real')
    raise ErroCertificado('função não definida: '+k)

def truth(n,w,env,M):
    op=n.op
    if op=='atom':
        if n.typ=='truth':return n.meta['value']=='⊤'
        if n.typ=='proposition':return M.assoc(M.pred,n.meta['value']+'/0',w,[],'bool')
        raise ErroCertificado('átomo não-formula: '+n.sexp())
    if op in ('∀','∃'):
        var=n.meta['var'];dom=n.args[0] if n.meta.get('domain') else None
        body=n.args[-1];type_dom=dom.meta['value'] if dom is not None and dom.op=='atom' and dom.typ=='domain' else 'Obj'
        if type_dom=='Obj':
            vals=M.O
            results=[truth(body,w,{**env,var:x},M) for x in vals]
            return all(results) if op=='∀' else any(results)
        exigir(type_dom in ('ℝ','ℤ'),'domínio de quantificador inválido')
        if op=='∀':raise ErroCertificado('universal infinito requer prova simbólica separada; recusado')
        exigir(var in M.witness,'testemunha existencial infinita ausente: '+var)
        value=M.K.el(M.witness[var]);exigir(type_dom=='ℝ' or M.K.integer(value),'testemunha ∃ℤ não inteira')
        return truth(body,w,{**env,var:value},M)
    if op=='¬':return not truth(n.args[0],w,env,M)
    if op in ('∧','∨','⟹','⟺'):
        a=truth(n.args[0],w,env,M)
        if op=='∧':return a and truth(n.args[1],w,env,M)
        if op=='∨':return a or truth(n.args[1],w,env,M)
        b=truth(n.args[1],w,env,M)
        if op=='⟹':return not a or b
        return a==b
    if op=='□':return all(truth(n.args[0],v,env,M) for v in M.W)
    if op=='◇':return any(truth(n.args[0],v,env,M) for v in M.W)
    if op=='B':
        h=n.meta['holder'];exigir(h in M.acesso,'quadro de crença ausente: '+h)
        return all(truth(n.args[0],v,env,M) for v in M.W if (w,v) in M.acesso[h])
    if op in ('=','<','≤','>','≥'):
        a=term(n.args[0],w,env,M);b=term(n.args[1],w,env,M)
        if op=='=':
            exigir(isinstance(a,S.Poly)==isinstance(b,S.Poly),'igualdade entre objeto e número')
            return M.K.equal(a,b) if isinstance(a,S.Poly) else a==b
        exigir(isinstance(a,S.Poly) and isinstance(b,S.Poly),'ordem numérica sobre objetos')
        k=M.K.cmp(a,b)
        return bool({'<':k<0,'≤':k<=0,'>':k>0,'≥':k>=0}[op])
    if op=='∈':
        x=term(n.args[0],w,env,M);y=term(n.args[1],w,env,M)
        if y==M.obj.get('∅') and '∅' in M.obj:return False
        return [w,x,y] in M.member
    args=[term(a,w,env,M) for a in n.args]
    return M.assoc(M.pred,op+'/'+str(len(args)),w,args,'bool')

def verificar_caso_exato(formulas,fichas,modelo,algebricos):
    M=Modelo(modelo,algebricos)
    fich={f['simbolo']:f for f in fichas}
    for nome in set(M.num)&set(M.obj):raise ErroCertificado('constante interpretada em dois tipos: '+nome)
    for nome in M.num:
        exigir(nome in fich and fich[nome].get('tipo')=='constante' and fich[nome].get('numerico'), 'constante numérica sem ficha: '+nome)
    # Recusa alterações fora da assinatura declarada; funções/predicados usados devem ser interpretados.
    M.fichas=fich
    roots=[expand_formula(s,fichas) for s in formulas]
    # Pré-conferência de TOTALIDADE, inclusive símbolos dentro de ramos não avaliados
    # por curto-circuito. O catálogo deriva da AST, não da lista de IDs Zxx.
    opformula={'∀','∃','□','◇','B','¬','∧','∨','⟹','⟺','=','∈','<','≤','>','≥'}
    optermo={'−','+','·','/','^','⋂','⋃'}
    presentes={'obj':set(),'num':set(),'pred':set(),'holders':set()}
    def visitar(n):
        if n.op=='B':presentes['holders'].add(n.meta['holder'])
        if n.op=='_':presentes['obj'].add(n.args[0].meta['value']+'/1')
        elif n.op=='atom' and n.typ=='proposition':presentes['pred'].add(n.meta['value']+'/0')
        elif n.typ=='formula' and n.op not in opformula and n.op!='atom':
            presentes['pred'].add(n.op+'/'+str(len(n.args)))
        elif n.typ=='call':
            slot='num' if fich.get(n.op,{}).get('numerico') else 'obj'
            presentes[slot].add(n.op+'/'+str(len(n.args)))
        elif n.op not in opformula and n.op not in optermo and n.op not in ('atom','_') and n.typ=='term':
            slot='num' if fich.get(n.op,{}).get('numerico') else 'obj'
            presentes[slot].add(n.op+'/'+str(len(n.args)))
        for v in n.args:visitar(v)
    for r in roots:visitar(r)
    exigir(presentes['obj']<=set(M.fo),'função de objeto sem interpretação total')
    exigir(presentes['num']<=set(M.fn),'função numérica sem interpretação total')
    exigir(presentes['pred']<=set(M.pred),'predicado sem interpretação total')
    exigir(presentes['holders']<=set(M.acesso),'titular sem relação KD45')
    for classe,keys in (('obj',presentes['obj']),('num',presentes['num']),('pred',presentes['pred'])):
        D={'obj':M.fo,'num':M.fn,'pred':M.pred}[classe]
        for k in keys:
            entry=D[k]
            if entry.get('tipo') in ('valor-por-mundo','booleano-por-mundo'):
                exigir(set(entry['valores'])==set(M.W),'interpretação parcial: '+k)
            else:exigir('padrao' in entry or entry.get('tipo')=='constante','falta valor padrão: '+k)
            if classe=='num':
                exigir('porMundo' not in entry and entry.get('tipo') not in ('valor-por-mundo','booleano-por-mundo'),'fn numérica não rígida')
    resultados=[truth(r,M.w0,{},M) for r in roots]
    exigir(all(resultados),'fórmula falsa, por posição: '+str(resultados))
    return resultados

# ---------------- Contrato modelo-exato-t1-v1 ----------------
CAMPOS_V1 = {'formato','objetos','mundos','mundoReal','algebrico',
    'constantesObjeto','constantesReais','funcoesObjeto','funcoesReais',
    'predicados','pertence','acessos','divZero','testemunhas'}

def _campos_exatos(v, permitidos, contexto):
    exigir(isinstance(v,dict), contexto+' deve ser objeto JSON')
    exigir(set(v)<=set(permitidos), contexto+' contém campo não previsto: '+str(set(v)-set(permitidos)))

def _nome_obj(M,x):
    exigir(type(x)==str and x in M.O,'objeto fora do domínio')
    return x

def _numero(M,x):
    exigir(type(x)==str or isinstance(x,dict),'número fora do formato v1')
    if type(x)==str and x!='alpha':
        exigir(bool(re.fullmatch(r'-?(?:[0-9]+|[0-9]+/0*[1-9][0-9]*|[0-9]+\.[0-9]+)',x)), 'racional fora da gramática v1')
        # Fração exige denominador positivo; regexp já cobre.
    return M.K.el(x)

def _tipar_associacao(M,entrada,numeric_result,worldly,chave):
    permitidos={'padrao','excecoes'} | ({'porMundo'} if worldly else set())
    _campos_exatos(entrada, permitidos, 'interpretação de função/predicado')
    exigir('padrao' in entrada,'tabela sem padrão total')
    try:
        nome, aridade = chave.rsplit('/',1); aridade=int(aridade)
    except Exception:
        raise ErroCertificado('assinatura inválida: '+str(chave))
    ficha=M.fichas.get(nome,{})
    if ficha.get('argumentos'):
        sortes=ficha['argumentos']
    else:
        sortes=['num' if numeric_result=='num' else 'obj']*aridade
    exigir(len(sortes)==aridade and set(sortes)<={'obj','num'},'sortes dos argumentos inválidas')
    def valor(v):
        if numeric_result=='num':return _numero(M,v)
        if numeric_result=='obj':return _nome_obj(M,v)
        exigir(type(v)==bool,'predicado precisa de valor booleano')
        return v
    valor(entrada['padrao'])
    if worldly:
        for w,v in entrada.get('porMundo',{}).items():
            exigir(w in M.W,'mundo não pertence a W'); valor(v)
    exigir(isinstance(entrada.get('excecoes',[]),list),'exceções não são lista')
    vistos=set()
    for e in entrada.get('excecoes',[]):
        _campos_exatos(e, {'mundo','argumentos','valor'} if worldly else {'argumentos','valor'},'exceção')
        exigir('argumentos' in e and 'valor' in e,'exceção incompleta')
        exigir(type(e['argumentos'])==list,'argumentos inválidos')
        if worldly:exigir(e.get('mundo') in M.W,'mundo de exceção ausente/inválido')
        else:exigir('mundo' not in e,'função rígida não tem mundo')
        exigir(len(e['argumentos'])==aridade,'aridade errada na exceção')
        norm_args=[]
        for arg,sort in zip(e['argumentos'],sortes):
            if sort=='obj':
                norm_args.append(('obj',_nome_obj(M,arg)))
            else:
                norm_args.append(('num',tuple(_numero(M,arg).all_coeffs())))
        key=(e.get('mundo'),tuple(norm_args))
        exigir(key not in vistos,'duas exceções com mesma entrada')
        vistos.add(key);valor(e['valor'])

def _preparar_polaridade(roots):
    """Sintaxe antes da avaliação: não depende de curtos-circuitos."""
    requeridos={}; expoentes=[]; divisao=False
    def caminhar(n,numero_formula,polaridade):
        nonlocal divisao
        op=n.op
        if op in ('∀','∃'):
            d=n.args[0] if n.meta.get('domain') else None
            dom=d.meta['value'] if d is not None and d.op=='atom' and d.typ=='domain' else 'Obj'
            if dom in ('ℝ','ℤ'):
                exigir(op=='∃' and polaridade==1,
                       'quantificador infinito não certificável nesta polaridade')
                var=n.meta['var']; key=(numero_formula,var)
                exigir(key not in requeridos,'variável existencial infinita repetida na mesma fórmula')
                requeridos[key]=dom
            caminhar(n.args[-1],numero_formula,polaridade)
            if d is not None and dom=='Obj':caminhar(d,numero_formula,polaridade)
            return
        if op=='¬':caminhar(n.args[0],numero_formula,-polaridade);return
        if op=='⟹':
            caminhar(n.args[0],numero_formula,-polaridade)
            caminhar(n.args[1],numero_formula,polaridade);return
        if op=='⟺':
            caminhar(n.args[0],numero_formula,0)
            caminhar(n.args[1],numero_formula,0);return
        if op=='/':divisao=True
        if op=='^':
            ex=n.args[1]
            exigir(ex.op=='atom' and ex.typ=='number' and ex.meta['value'].isdigit()
                and 0<=int(ex.meta['value'])<=12,
                'potência fora dos expoentes literais 0 a 12')
        for a in n.args:caminhar(a,numero_formula,polaridade)
    for i,r in enumerate(roots):caminhar(r,i,1)
    return requeridos,divisao

def _preparar_testemunhas(M,cert,requere):
    lista=cert.get('testemunhas')
    exigir(type(lista)==list,'testemunhas precisa ser lista')
    tabela={}
    for t in lista:
        _campos_exatos(t,{'formula','variavel','valor'},'testemunha')
        exigir(set(t)=={'formula','variavel','valor'},'testemunha incompleta')
        k=(t['formula'],t['variavel'])
        exigir(type(t['formula'])==int and type(t['variavel'])==str and k in requere,
               'testemunha desnecessária ou com fórmula errada')
        exigir(k not in tabela,'testemunha duplicada')
        n=_numero(M,t['valor'])
        if requere[k]=='ℤ':exigir(M.K.integer(n),'testemunha de inteiro não é inteira')
        tabela[k]=t['valor']
    exigir(set(tabela)==set(requere),'faltam/sobram testemunhas infinitas')
    return tabela

def _preparar_simbolos(M,roots,fichas):
    fich={f['simbolo']:f for f in fichas}
    operacoes={'∀','∃','□','◇','B','¬','∧','∨','⟹','⟺','=','∈','<','≤','>','≥'}
    arit={'−','+','·','/','^','⋂','⋃'}
    usados={'num':set(),'obj':set(),'pred':set(),'titular':set(),'const_num':set(),'const_obj':set(),'vazio':False}
    def walk(n,bound):
        if n.op=='B':usados['titular'].add(n.meta['holder'])
        if n.op in ('∀','∃'):
            walk(n.args[-1],bound|{n.meta['var']})
            if n.meta.get('domain'):walk(n.args[0],bound)
            return
        if n.op=='atom':
            x=n.meta['value']
            if x=='∅':usados['vazio']=True
            elif n.typ=='name' and x not in bound and x not in ('ℝ','ℤ','⊤','⊥'):
                slot='const_num' if fich.get(x,{}).get('numerico') else 'const_obj'
                usados[slot].add(x)
            elif n.typ=='proposition':usados['pred'].add(x+'/0')
            return
        if n.op=='_':
            usados['obj'].add(n.args[0].meta['value']+'/1')
            walk(n.args[1],bound);return
        if n.typ=='formula' and n.op not in operacoes:usados['pred'].add(n.op+'/'+str(len(n.args)))
        if n.typ=='call' or (n.typ=='term' and n.op not in arit|{'_'}):
            classe='num' if fich.get(n.op,{}).get('numerico') else 'obj'
            usados[classe].add(n.op+'/'+str(len(n.args)))
        for a in n.args:walk(a,bound)
    for n in roots:walk(n,set())
    exigir(set(usados['const_obj'])<=set(M.obj),'constante de objeto livre sem interpretação')
    exigir(set(usados['const_num'])<=set(M.num),'constante numérica livre sem interpretação')
    if usados['vazio']:exigir('∅' in M.obj,'∅ deve ser objeto interpretado')
    for typ,source in [('obj',M.fo),('num',M.fn),('pred',M.pred)]:
        exigir(usados[typ]<=set(source),'assinaturas usadas sem tabela: '+str(usados[typ]-set(source)))
    exigir(usados['titular']<=set(M.acesso),'titular sem acessibilidade')
    return usados

def verificar_caso_v1(formulas, fichas, cert):
    """Verifica TODOS os nós das fórmulas expandidas; não consulta Z3.
    Falha fechada se o certificado pede um recurso fora da v1.
    """
    _campos_exatos(cert,CAMPOS_V1,'certificado')
    exigir(cert.get('formato')=='modelo-exato-t1-v1','formato inválido')
    obrig={'objetos','mundos','mundoReal','constantesObjeto','constantesReais',
           'funcoesObjeto','funcoesReais','predicados','pertence','acessos','testemunhas'}
    exigir(obrig<=set(cert),'falta campo obrigatório')
    if 'algebrico' in cert:
        _campos_exatos(cert['algebrico'],{'polinomio','intervaloAberto','indiceDaRaiz'}, 'algebrico')
        exigir('polinomio' in cert['algebrico'] and 'intervaloAberto' in cert['algebrico'], 'definição algébrica incompleta')
    M=Modelo(cert,{'alpha':cert.get('algebrico')})
    M.fichas={f['simbolo']:f for f in fichas}
    exigir(set(M.num).isdisjoint(M.obj),'mesma constante como objeto e número')
    for x in M.num:
        ficha=M.fichas.get(x,{})
        exigir(ficha.get('tipo')=='constante' and ficha.get('numerico'), 'constante Real sem ficha')
    roots=[expand_formula(f,fichas) for f in formulas]
    # A expansão pode reduzir a∈∅ a ⊥: a constante ainda precisa constar no certificado.
    if any('∅' in f for f in formulas):exigir('∅' in M.obj,'∅ deve ser objeto interpretado mesmo se expandido')
    req,usa_div=_preparar_polaridade(roots)
    if usa_div:
        exigir('divZero' in cert,'D0 obrigatória se a fórmula divide')
    if 'divZero' in cert:
        _campos_exatos(cert['divZero'],{'padrao','excecoes'},'D0')
        exigir('padrao' in cert['divZero'],'D0 sem padrão')
        _numero(M,cert['divZero']['padrao'])
        vistos=[]
        for e in cert['divZero'].get('excecoes',[]):
            _campos_exatos(e,{'numerador','valor'},'exceção D0')
            exigir(set(e)=={'numerador','valor'},'exceção D0 incompleta')
            nu=_numero(M,e['numerador']);_numero(M,e['valor'])
            exigir(not any(M.K.equal(nu,prev) for prev in vistos),'D0 repetido')
            vistos.append(nu)
    for cl,source,kind,worldly in [('fo',M.fo,'obj',True),('fn',M.fn,'num',False),('pred',M.pred,'bool',True)]:
        for k,entry in source.items():
            _tipar_associacao(M,entry,kind,worldly,k)
    exigir(all([w,x,y] in M.member for w,x,y in M.member),'membro inválido')
    if '∅' in M.obj:
        exigir(all(y!=M.obj['∅'] for _,x,y in M.member),'∅ tem membros')
    testemunhas=_preparar_testemunhas(M,cert,req)
    _preparar_simbolos(M,roots,fichas)
    resultados=[]
    for i,root in enumerate(roots):
        M.witness={name:val for (idx,name),val in testemunhas.items() if idx==i}
        M.current_formula=i
        res=truth(root,M.w0,{},M)
        exigir(res is True,'fórmula falsa na posição '+str(i))
        resultados.append(res)
    return resultados
