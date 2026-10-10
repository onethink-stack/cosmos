// Aterramento em domínio finito {0..n-1}.
//
// Cada constante e cada aplicação de função f(e₁..eₖ) a elementos concretos é
// uma incógnita com valor no domínio, codificada one-hot (exatamente uma
// variável "vale d" verdadeira). Nada supõe que nomes diferentes denotam
// objetos diferentes. Como todo termo denota exatamente um elemento, a
// igualdade é a identidade no domínio: reflexividade, simetria,
// transitividade e substituição (em predicados, funções e ∈) valem por
// construção, sem axiomas extras.
//
// O resultado é um circuito booleano (só nós E, com negação no literal e
// compartilhamento de subexpressões) convertido em CNF por Tseitin com
// polaridade.

import type { Formula, Termo } from '../logica/ast'

/** Literal: ±variável. VERDADE/FALSO são constantes que nunca chegam à CNF. */
export type Lit = number
export const VERDADE = 0x3fffffff
export const FALSO = -VERDADE

export class GrandeDemais extends Error {
  constructor(public tamanho: number) {
    super('grande demais')
  }
}

/** O que cada variável primitiva significa, para ler o modelo. */
export type InfoVar =
  | { k: 'const'; nome: string; d: number }
  | { k: 'func'; nome: string; args: number[]; d: number }
  | { k: 'pred'; nome: string; args: number[] }
  | { k: 'in'; a: number; b: number }

export interface ProblemaCNF {
  nVars: number
  clausulas: number[][]
  info: Map<number, InfoVar>
  /** chave do termo valorado → variáveis one-hot [d=0..n-1] */
  valorados: Map<string, number[]>
}

type Env = Map<string, number>

const NOME_VAZIO = '∅'

export class Aterrador {
  private nVars = 0
  private primitivas = new Map<string, number>()
  readonly info = new Map<number, InfoVar>()
  private nos = new Map<string, number>()
  /** filhos de cada nó E (indexado pela variável do nó) */
  private defs = new Map<number, Lit[]>()
  readonly valorados = new Map<string, number[]>()
  private ordemConstantes: string[] = []
  private memoIgual = new Map<string, Lit>()
  private tamanho = 0
  private usaVazio = false
  private raizes: Lit[] = []

  constructor(
    readonly n: number,
    private limite: number,
  ) {}

  // ---------- circuito ----------
  private nova(): number {
    return ++this.nVars
  }

  private prim(chave: string, info: InfoVar): number {
    let v = this.primitivas.get(chave)
    if (v === undefined) {
      v = this.nova()
      this.primitivas.set(chave, v)
      this.info.set(v, info)
    }
    return v
  }

  e(lits: Lit[]): Lit {
    const s = new Set<Lit>()
    for (const l of lits) {
      if (l === FALSO) return FALSO
      if (l === VERDADE) continue
      if (s.has(-l)) return FALSO
      s.add(l)
    }
    if (s.size === 0) return VERDADE
    if (s.size === 1) return s.values().next().value!
    const filhos = [...s].sort((a, b) => a - b)
    const chave = filhos.join(',')
    let v = this.nos.get(chave)
    if (v === undefined) {
      this.tamanho += filhos.length + 1
      if (this.tamanho > this.limite) throw new GrandeDemais(this.tamanho)
      v = this.nova()
      this.nos.set(chave, v)
      this.defs.set(v, filhos)
    }
    return v
  }

  ou(lits: Lit[]): Lit {
    return -this.e(lits.map((l) => -l))
  }

  // ---------- termos ----------
  /** Variáveis one-hot de uma incógnita (constante ou f aplicada a elementos). */
  private valores(chave: string, info: (d: number) => InfoVar): number[] {
    let vs = this.valorados.get(chave)
    if (!vs) {
      vs = []
      for (let d = 0; d < this.n; d++) vs.push(this.prim(`${chave}=${d}`, info(d)))
      this.valorados.set(chave, vs)
    }
    return vs
  }

  private constante(nome: string): number[] {
    if (!this.valorados.has(`c:${nome}`)) this.ordemConstantes.push(nome)
    return this.valores(`c:${nome}`, (d) => ({ k: 'const', nome, d }))
  }

  private chaveTermo(t: Termo, env: Env): string {
    switch (t.k) {
      case 'nome':
        return env.has(t.nome) ? `#${env.get(t.nome)}` : t.nome
      case 'vazio':
        return NOME_VAZIO
      case 'app':
        return `${t.fn}(${t.args.map((a) => this.chaveTermo(a, env)).join(',')})`
      default:
        throw new Error('⋂/⋃ deveriam ter sido expandidos antes do motor')
    }
  }

  /** Literal de "o termo t denota o elemento d". */
  igual(t: Termo, env: Env, d: number): Lit {
    if (t.k === 'nome' && env.has(t.nome)) return env.get(t.nome) === d ? VERDADE : FALSO
    const chave = `${this.chaveTermo(t, env)}=${d}`
    const m = this.memoIgual.get(chave)
    if (m !== undefined) return m
    let r: Lit
    switch (t.k) {
      case 'nome':
        r = this.constante(t.nome)[d]
        break
      case 'vazio':
        this.usaVazio = true
        r = this.constante(NOME_VAZIO)[d]
        break
      case 'app': {
        const opcoesArgs = t.args.map((a) => this.opcoes(a, env))
        const casos: Lit[] = []
        for (const comb of produto(opcoesArgs)) {
          const args = comb.map(([e]) => e)
          const vf = this.valores(`f:${t.fn}(${args.join(',')})`, (dd) => ({ k: 'func', nome: t.fn, args, d: dd }))[d]
          casos.push(this.e([...comb.map(([, c]) => c), vf]))
        }
        r = this.ou(casos)
        break
      }
      default:
        throw new Error('⋂/⋃ deveriam ter sido expandidos antes do motor')
    }
    this.memoIgual.set(chave, r)
    return r
  }

  /** Valores possíveis do termo, cada um com a condição para valer. */
  opcoes(t: Termo, env: Env): [number, Lit][] {
    if (t.k === 'nome' && env.has(t.nome)) return [[env.get(t.nome)!, VERDADE]]
    const r: [number, Lit][] = []
    for (let d = 0; d < this.n; d++) {
      const c = this.igual(t, env, d)
      if (c !== FALSO) r.push([d, c])
    }
    return r
  }

  // ---------- fórmulas ----------
  formula(f: Formula, env: Env): Lit {
    switch (f.k) {
      case 'const':
        return f.valor ? VERDADE : FALSO
      case 'pred': {
        const casos: Lit[] = []
        for (const comb of produto(f.args.map((a) => this.opcoes(a, env)))) {
          const args = comb.map(([e]) => e)
          const p = this.prim(`p:${f.nome}(${args.join(',')})`, { k: 'pred', nome: f.nome, args })
          casos.push(this.e([...comb.map(([, c]) => c), p]))
        }
        return this.ou(casos)
      }
      case 'rel': {
        const ol = this.opcoes(f.l, env)
        const or = this.opcoes(f.r, env)
        const casos: Lit[] = []
        if (f.op === '=' || f.op === '≠') {
          for (const [d, c1] of ol) for (const [e, c2] of or) if (d === e) casos.push(this.e([c1, c2]))
          const r = this.ou(casos)
          return f.op === '=' ? r : -r
        }
        if (f.op === '∈' || f.op === '∉') {
          for (const [d, c1] of ol)
            for (const [e, c2] of or) casos.push(this.e([c1, c2, this.prim(`in:${d},${e}`, { k: 'in', a: d, b: e })]))
          const r = this.ou(casos)
          return f.op === '∈' ? r : -r
        }
        throw new Error('⊆ deveria ter sido expandido antes do motor')
      }
      case 'not':
        return -this.formula(f.f, env)
      case 'and':
        return this.e([this.formula(f.l, env), this.formula(f.r, env)])
      case 'or':
        return this.ou([this.formula(f.l, env), this.formula(f.r, env)])
      case 'imp':
        return this.ou([-this.formula(f.l, env), this.formula(f.r, env)])
      case 'iff': {
        const a = this.formula(f.l, env)
        const b = this.formula(f.r, env)
        return this.e([this.ou([-a, b]), this.ou([a, -b])])
      }
      case 'forall':
      case 'exists': {
        if (f.dom) throw new Error('∀x∈S deveria ter sido expandido antes do motor')
        const partes: Lit[] = []
        for (let d = 0; d < this.n; d++) {
          const env2 = new Map(env)
          env2.set(f.v, d)
          const p = this.formula(f.corpo, env2)
          // curto-circuito
          if (f.k === 'forall' && p === FALSO) return FALSO
          if (f.k === 'exists' && p === VERDADE) return VERDADE
          partes.push(p)
        }
        return f.k === 'forall' ? this.e(partes) : this.ou(partes)
      }
    }
  }

  afirmar(f: Formula) {
    this.raizes.push(this.formula(f, new Map()))
  }

  // ---------- CNF ----------
  cnf(): ProblemaCNF {
    // ∅ não tem elementos: ∀z ¬(z ∈ ∅)
    if (this.usaVazio) {
      const vazio = this.constante(NOME_VAZIO)
      for (let b = 0; b < this.n; b++)
        for (let a = 0; a < this.n; a++) this.raizes.push(this.ou([-vazio[b], -this.prim(`in:${a},${b}`, { k: 'in', a, b })]))
    }

    const clausulas: number[][] = []
    const add = (c: number[]) => {
      clausulas.push(c)
      if (clausulas.length > this.limite) throw new GrandeDemais(clausulas.length)
    }

    // Tseitin com polaridade: só gera as implicações que a ocorrência exige.
    const POS = 1
    const NEG = 2
    const marcado = new Map<number, number>()
    const pilha: Lit[] = []
    const marcar = (l: Lit) => {
      const v = Math.abs(l)
      const filhos = this.defs.get(v)
      if (!filhos) return
      const pol = l > 0 ? POS : NEG
      const m = marcado.get(v) ?? 0
      if (m & pol) return
      marcado.set(v, m | pol)
      if (pol === POS) for (const c of filhos) add([-v, c])
      else add([v, ...filhos.map((c) => -c)])
      for (const c of filhos) pilha.push(pol === POS ? c : -c)
    }
    const fechar = () => {
      while (pilha.length) marcar(pilha.pop()!)
    }

    // Afirmar a raiz: E positivo vira várias raízes; E negado vira uma cláusula.
    const afirmar = (l: Lit) => {
      const fila = [l]
      while (fila.length) {
        const x = fila.pop()!
        if (x === VERDADE) continue
        if (x === FALSO) {
          add([])
          continue
        }
        const filhos = this.defs.get(Math.abs(x))
        if (filhos && x > 0) fila.push(...filhos)
        else if (filhos) {
          const c = filhos.map((y) => -y)
          if (c.includes(VERDADE)) continue
          add(c.filter((y) => y !== FALSO))
          c.forEach((y) => pilha.push(y))
          fechar()
        } else add([x])
      }
    }
    for (const r of this.raizes) afirmar(r)
    fechar()

    // exatamente um valor para cada incógnita
    for (const vs of this.valorados.values()) {
      add([...vs])
      for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) add([-vs[i], -vs[j]])
    }

    // Quebra de simetria (não muda a satisfatibilidade): permutando o domínio,
    // a k-ésima constante pode sempre ser posta num elemento ≤ k.
    this.ordemConstantes.forEach((nome, k) => {
      const vs = this.valorados.get(`c:${nome}`)!
      for (let d = k + 1; d < this.n; d++) add([-vs[d]])
    })

    return { nVars: this.nVars, clausulas, info: this.info, valorados: this.valorados }
  }
}

/** Produto cartesiano das listas de opções. */
function* produto<T>(listas: T[][]): Generator<T[]> {
  if (!listas.length) {
    yield []
    return
  }
  const idx = listas.map(() => 0)
  if (listas.some((l) => !l.length)) return
  for (;;) {
    yield idx.map((i, k) => listas[k][i])
    let k = listas.length - 1
    while (k >= 0) {
      idx[k]++
      if (idx[k] < listas[k].length) break
      idx[k] = 0
      k--
    }
    if (k < 0) return
  }
}
