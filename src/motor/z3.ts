// Tradução das fórmulas (já expandidas) para o Z3 e checagem de
// satisfatibilidade em lógica de primeira ordem, SEM limite de tamanho:
//   unsat → contradição provada (vale para qualquer tamanho, inclusive infinito)
//   sat   → existe modelo (que pode ser maior que N, ou infinito)
//   unknown → o Z3 não decidiu dentro do tempo
//
// Mesma semântica do motor finito: um tipo de objetos e um de mundos; o
// mundo real é w0; constantes rígidas; ∈, predicados e funções por mundo;
// □/◇ sobre todos os mundos (S5); B[a] pela relação de a, com axiomas KD45.
//
// Este módulo não carrega o Z3: recebe a API já inicializada (navegador ou
// Node), para poder ser testado fora do navegador.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ORDEM, type Formula, type Termo } from '../logica/ast'

export type ResultadoZ3 = 'sat' | 'unsat' | 'unknown'

export const TEMPO_Z3_MS = 20_000

type Expr = any

let contador = 0

/**
 * Um contexto novo por checagem: reaproveitar o mesmo contexto depois de
 * checagens interrompidas pelo tempo limite fazia o Z3 (WebAssembly) quebrar
 * em problemas com números e quantificadores.
 */
function obterContexto(api: any) {
  return new api.Context('caderno')
}

/**
 * As fórmulas têm modelo? (todas afirmadas no mundo real). `numericos`: nomes
 * de constantes e funções que são números reais (funções numéricas recebem
 * números e não variam com o mundo, como a matemática).
 */
export async function checarZ3(api: any, formulas: Formula[], tempoMs = TEMPO_Z3_MS, numericos: Set<string> = new Set()): Promise<ResultadoZ3> {
  const ctx = obterContexto(api)
  const { Sort, Function: Funcao, Const, ForAll, Exists, And, Or, Not, Implies, Eq, Bool, Solver, Real } = ctx
  const Obj = Sort.declare('Obj')
  const Mundo = Sort.declare('Mundo')
  const B = Bool.sort()
  const w0 = Const('w0', Mundo)
  const pertence = Funcao.declare('pertence', Mundo, Obj, Obj, B)

  const constantes = new Map<string, Expr>()
  const funcoes = new Map<string, any>()
  const predicados = new Map<string, any>()
  const acessos = new Map<string, any>()
  let usaVazio = false

  const constante = (nome: string) => {
    if (!constantes.has(nome)) constantes.set(nome, Const(`c:${nome}`, Obj))
    return constantes.get(nome)
  }
  const funcao = (nome: string, aridade: number) => {
    const k = `${nome}/${aridade}`
    if (!funcoes.has(k)) funcoes.set(k, Funcao.declare(`f:${k}`, Mundo, ...Array(aridade).fill(Obj), Obj))
    return funcoes.get(k)
  }
  const predicado = (nome: string, aridade: number) => {
    const k = `${nome}/${aridade}`
    if (!predicados.has(k)) predicados.set(k, Funcao.declare(`p:${k}`, Mundo, ...Array(aridade).fill(Obj), B))
    return predicados.get(k)
  }
  const acesso = (agente: string) => {
    if (!acessos.has(agente)) acessos.set(agente, Funcao.declare(`R:${agente}`, Mundo, Mundo, B))
    return acessos.get(agente)
  }
  const nova = (base: string, sort: any) => Const(`${base}!${++contador}`, sort)
  const reaisC = new Map<string, Expr>()
  const reaisF = new Map<string, any>()
  const constanteReal = (nome: string) => {
    if (!reaisC.has(nome)) reaisC.set(nome, Real.const(`n:${nome}`))
    return reaisC.get(nome)
  }
  const funcaoReal = (nome: string, aridade: number) => {
    const k = `${nome}/${aridade}`
    if (!reaisF.has(k)) reaisF.set(k, Funcao.declare(`fn:${k}`, ...Array(aridade).fill(Real.sort()), Real.sort()))
    return reaisF.get(k)
  }
  const potencia = (base: Expr, exp: Termo, env: Map<string, Expr>, w: Expr): Expr => {
    // expoente inteiro pequeno: multiplicações (o Z3 decide melhor assim)
    if (exp.k === 'num' && /^\d+$/.test(exp.valor) && Number(exp.valor) <= 12) {
      const n = Number(exp.valor)
      if (n === 0) return Real.val(1)
      let r = base
      for (let i = 1; i < n; i++) r = r.mul(base)
      return r
    }
    return base.pow(termo(exp, env, w))
  }

  const termo = (t: Termo, env: Map<string, Expr>, w: Expr): Expr => {
    switch (t.k) {
      case 'nome':
        return env.get(t.nome) ?? (numericos.has(t.nome) ? constanteReal(t.nome) : constante(t.nome))
      case 'vazio':
        usaVazio = true
        return constante('∅')
      case 'app':
        if (numericos.has(t.fn)) return funcaoReal(t.fn, t.args.length).call(...t.args.map((a) => termo(a, env, w)))
        return funcao(t.fn, t.args.length).call(w, ...t.args.map((a) => termo(a, env, w)))
      case 'num':
        return Real.val(t.valor)
      case 'neg':
        return termo(t.t, env, w).neg()
      case 'arit': {
        const l = termo(t.l, env, w)
        if (t.op === '^') return potencia(l, t.r, env, w)
        const r = termo(t.r, env, w)
        return t.op === '+' ? l.add(r) : t.op === '−' ? l.sub(r) : t.op === '·' ? l.mul(r) : l.div(r)
      }
      default:
        throw new Error('⋂/⋃ deveriam ter sido expandidos antes do Z3')
    }
  }

  const formula = (f: Formula, env: Map<string, Expr>, w: Expr): Expr => {
    switch (f.k) {
      case 'const':
        return Bool.val(f.valor)
      case 'pred':
        return predicado(f.nome, f.args.length).call(w, ...f.args.map((a) => termo(a, env, w)))
      case 'rel': {
        const l = termo(f.l, env, w)
        if (f.op === '=' || f.op === '≠') {
          const e = Eq(l, termo(f.r, env, w))
          return f.op === '=' ? e : Not(e)
        }
        if (f.op === '∈' || f.op === '∉') {
          const e = pertence.call(w, l, termo(f.r, env, w))
          return f.op === '∈' ? e : Not(e)
        }
        if (ORDEM.includes(f.op)) {
          const r = termo(f.r, env, w)
          return f.op === '<' ? l.lt(r) : f.op === '≤' ? l.le(r) : f.op === '>' ? l.gt(r) : l.ge(r)
        }
        throw new Error('⊆ deveria ter sido expandido antes do Z3')
      }
      case 'not':
        return Not(formula(f.f, env, w))
      case 'and':
        return And(formula(f.l, env, w), formula(f.r, env, w))
      case 'or':
        return Or(formula(f.l, env, w), formula(f.r, env, w))
      case 'imp':
        return Implies(formula(f.l, env, w), formula(f.r, env, w))
      case 'iff':
        return Eq(formula(f.l, env, w), formula(f.r, env, w))
      case 'nec':
      case 'pos': {
        const v = nova('w', Mundo)
        const corpo = formula(f.f, env, v)
        return f.k === 'nec' ? ForAll([v], corpo) : Exists([v], corpo)
      }
      case 'crenca': {
        const v = nova('w', Mundo)
        return ForAll([v], Implies(acesso(f.agente).call(w, v), formula(f.f, env, v)))
      }
      case 'forall':
      case 'exists': {
        if (f.dom && f.dom.k !== 'reais') throw new Error('∀x∈S deveria ter sido expandido antes do Z3')
        const x = f.dom ? Real.const(`${f.v}!${++contador}`) : nova(f.v, Obj)
        const env2 = new Map(env)
        env2.set(f.v, x)
        const corpo = formula(f.corpo, env2, w)
        return f.k === 'forall' ? ForAll([x], corpo) : Exists([x], corpo)
      }
    }
  }

  const solver = new Solver()
  solver.set('timeout', tempoMs)
  for (const f of formulas) solver.add(formula(f, new Map(), w0))

  if (usaVazio) {
    const w = nova('w', Mundo)
    const z = nova('z', Obj)
    solver.add(ForAll([w, z], Not(pertence.call(w, z, constante('∅')))))
  }
  // KD45: serial, transitiva, euclidiana
  for (const R of acessos.values()) {
    const a = nova('a', Mundo)
    const b = nova('b', Mundo)
    const c = nova('c', Mundo)
    solver.add(ForAll([a], Exists([b], R.call(a, b))))
    solver.add(ForAll([a, b, c], Implies(And(R.call(a, b), R.call(b, c)), R.call(a, c))))
    solver.add(ForAll([a, b, c], Implies(And(R.call(a, b), R.call(a, c)), R.call(b, c))))
  }
  const r = (await solver.check()) as ResultadoZ3
  return r
}
