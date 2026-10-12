// Aterramento em domínio finito {0..n-1}, com k mundos {0..k-1} (mundo 0 = real).
//
// Cada constante e cada aplicação de função f(e₁..eₖ) a elementos concretos é
// uma incógnita com valor no domínio, codificada one-hot (exatamente uma
// variável "vale d" verdadeira). Nada supõe que nomes diferentes denotam
// objetos diferentes. Como todo termo denota exatamente um elemento, a
// igualdade é a identidade no domínio: reflexividade, simetria,
// transitividade e substituição (em predicados, funções e ∈) valem por
// construção, sem axiomas extras.
//
// Lógica modal (semântica de Kripke): os objetos são os mesmos em todos os
// mundos e as constantes são rígidas (denotam o mesmo objeto em todo mundo);
// predicados, ∈ e funções podem variar de mundo para mundo.
//   □φ   vale em w se φ vale em todo mundo (S5)
//   ◇φ   vale em w se φ vale em algum mundo
//   B[a]φ vale em w se φ vale em todo mundo que a considera possível a partir
//         de w; a relação de cada agente obedece KD45 (serial, transitiva,
//         euclidiana): crenças consistentes, com introspecção positiva e negativa.
// Sem operadores modais, k = 1 e tudo se reduz ao caso clássico.
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
  | { k: 'func'; nome: string; args: number[]; d: number; w: number }
  | { k: 'pred'; nome: string; args: number[]; w: number }
  | { k: 'in'; a: number; b: number; w: number }
  | { k: 'acesso'; agente: string; de: number; para: number }

export interface ProblemaCNF {
  nVars: number
  clausulas: number[][]
  info: Map<number, InfoVar>
  /** chave do termo valorado → variáveis one-hot [d=0..n-1] */
  valorados: Map<string, number[]>
}

type Env = Map<string, number>

const NOME_VAZIO = '∅'
/** começo do nome das constantes criadas no lugar de um "existe" (não é um nome que se possa escrever) */
export const PREFIXO_SKOLEM = '§'

/** Troca a variável v pelo termo t (as variáveis são únicas no escopo: não há captura). */
function substituirTermo(x: Termo, v: string, t: Termo): Termo {
  switch (x.k) {
    case 'nome':
      return x.nome === v ? t : x
    case 'app':
      return { ...x, args: x.args.map((a) => substituirTermo(a, v, t)) }
    case 'inter':
    case 'uniao':
    case 'arit':
      return { ...x, l: substituirTermo(x.l, v, t), r: substituirTermo(x.r, v, t) }
    case 'neg':
      return { ...x, t: substituirTermo(x.t, v, t) }
    default:
      return x
  }
}

function substituir(f: Formula, v: string, t: Termo): Formula {
  switch (f.k) {
    case 'pred':
      return { ...f, args: f.args.map((a) => substituirTermo(a, v, t)) }
    case 'rel':
      return { ...f, l: substituirTermo(f.l, v, t), r: substituirTermo(f.r, v, t) }
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      return { ...f, f: substituir(f.f, v, t) }
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return { ...f, l: substituir(f.l, v, t), r: substituir(f.r, v, t) }
    case 'forall':
    case 'exists':
      if (f.v === v) return f
      return { ...f, dom: f.dom && substituirTermo(f.dom, v, t), corpo: substituir(f.corpo, v, t) }
    case 'const':
      return f
  }
}

/** A fórmula usa □, ◇ ou B[…]? */
export function ehModal(f: Formula): boolean {
  switch (f.k) {
    case 'nec':
    case 'pos':
    case 'crenca':
      return true
    case 'not':
      return ehModal(f.f)
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return ehModal(f.l) || ehModal(f.r)
    case 'forall':
    case 'exists':
      return ehModal(f.corpo)
    default:
      return false
  }
}

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
  private agentes = new Set<string>()
  private raizes: Lit[] = []
  private skolems = 0

  constructor(
    readonly n: number,
    private limite: number,
    /** número de mundos */
    readonly k = 1,
  ) {}

  /** tamanho do circuito montado até aqui (o que conta para o limite) */
  get tamanhoAtual(): number {
    return this.tamanho
  }

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

  private acesso(agente: string, de: number, para: number): number {
    this.agentes.add(agente)
    return this.prim(`R:${agente}:${de},${para}`, { k: 'acesso', agente, de, para })
  }

  private pertence(a: number, b: number, w: number): number {
    return this.prim(`in:${a},${b}@${w}`, { k: 'in', a, b, w })
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

  /** Literal de "o termo t denota o elemento d, no mundo w". */
  igual(t: Termo, env: Env, d: number, w: number): Lit {
    if (t.k === 'nome' && env.has(t.nome)) return env.get(t.nome) === d ? VERDADE : FALSO
    const chave = `${this.chaveTermo(t, env)}=${d}@${w}`
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
        const opcoesArgs = t.args.map((a) => this.opcoes(a, env, w))
        const casos: Lit[] = []
        for (const comb of produto(opcoesArgs)) {
          const args = comb.map(([e]) => e)
          const vf = this.valores(`f:${t.fn}(${args.join(',')})@${w}`, (dd) => ({ k: 'func', nome: t.fn, args, d: dd, w }))[d]
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

  /** Valores possíveis do termo no mundo w, cada um com a condição para valer. */
  opcoes(t: Termo, env: Env, w: number): [number, Lit][] {
    if (t.k === 'nome' && env.has(t.nome)) return [[env.get(t.nome)!, VERDADE]]
    const r: [number, Lit][] = []
    for (let d = 0; d < this.n; d++) {
      const c = this.igual(t, env, d, w)
      if (c !== FALSO) r.push([d, c])
    }
    return r
  }

  // ---------- fórmulas ----------
  formula(f: Formula, env: Env, w: number): Lit {
    switch (f.k) {
      case 'const':
        return f.valor ? VERDADE : FALSO
      case 'pred': {
        const casos: Lit[] = []
        for (const comb of produto(f.args.map((a) => this.opcoes(a, env, w)))) {
          const args = comb.map(([e]) => e)
          const p = this.prim(`p:${f.nome}(${args.join(',')})@${w}`, { k: 'pred', nome: f.nome, args, w })
          casos.push(this.e([...comb.map(([, c]) => c), p]))
        }
        return this.ou(casos)
      }
      case 'rel': {
        const ol = this.opcoes(f.l, env, w)
        const or = this.opcoes(f.r, env, w)
        const casos: Lit[] = []
        if (f.op === '=' || f.op === '≠') {
          for (const [d, c1] of ol) for (const [e, c2] of or) if (d === e) casos.push(this.e([c1, c2]))
          const r = this.ou(casos)
          return f.op === '=' ? r : -r
        }
        if (f.op === '∈' || f.op === '∉') {
          for (const [d, c1] of ol) for (const [e, c2] of or) casos.push(this.e([c1, c2, this.pertence(d, e, w)]))
          const r = this.ou(casos)
          return f.op === '∈' ? r : -r
        }
        throw new Error('⊆ deveria ter sido expandido antes do motor')
      }
      case 'not':
        return -this.formula(f.f, env, w)
      case 'and':
        return this.e([this.formula(f.l, env, w), this.formula(f.r, env, w)])
      case 'or':
        return this.ou([this.formula(f.l, env, w), this.formula(f.r, env, w)])
      case 'imp':
        return this.ou([-this.formula(f.l, env, w), this.formula(f.r, env, w)])
      case 'iff': {
        const a = this.formula(f.l, env, w)
        const b = this.formula(f.r, env, w)
        return this.e([this.ou([-a, b]), this.ou([a, -b])])
      }
      case 'nec':
      case 'pos': {
        const partes: Lit[] = []
        for (let v = 0; v < this.k; v++) partes.push(this.formula(f.f, env, v))
        return f.k === 'nec' ? this.e(partes) : this.ou(partes)
      }
      case 'crenca': {
        const partes: Lit[] = []
        for (let v = 0; v < this.k; v++) partes.push(this.ou([-this.acesso(f.agente, w, v), this.formula(f.f, env, v)]))
        return this.e(partes)
      }
      case 'forall':
      case 'exists': {
        if (f.dom) throw new Error('∀x∈S deveria ter sido expandido antes do motor')
        const partes: Lit[] = []
        for (let d = 0; d < this.n; d++) {
          const env2 = new Map(env)
          env2.set(f.v, d)
          const p = this.formula(f.corpo, env2, w)
          // curto-circuito
          if (f.k === 'forall' && p === FALSO) return FALSO
          if (f.k === 'exists' && p === VERDADE) return VERDADE
          partes.push(p)
        }
        return f.k === 'forall' ? this.e(partes) : this.ou(partes)
      }
    }
  }

  /** Afirma a fórmula no mundo real (0). */
  afirmar(f: Formula) {
    for (const g of this.skolemizar(f)) this.raizes.push(this.formula(g, new Map(), 0))
  }

  /**
   * Um "existe x" afirmado no topo (fora de ∀, ∨, □…) vira uma constante nova
   * no lugar de x: tem modelo exatamente quando a original tem, e a constante
   * entra na quebra de simetria — o motor testa x só em poucos objetos, em vez
   * de em todos. As conjunções do topo viram afirmações separadas.
   */
  private skolemizar(f: Formula): Formula[] {
    switch (f.k) {
      case 'and':
        return [...this.skolemizar(f.l), ...this.skolemizar(f.r)]
      case 'exists':
        if (f.dom) return [f]
        return this.skolemizar(substituir(f.corpo, f.v, { k: 'nome', nome: `${PREFIXO_SKOLEM}${++this.skolems}`, pos: 0, end: 0 }))
      case 'not': {
        const g = f.f
        switch (g.k) {
          case 'not':
            return this.skolemizar(g.f)
          case 'forall':
            return g.dom ? [f] : this.skolemizar({ ...g, k: 'exists', corpo: { k: 'not', f: g.corpo, pos: 0, end: 0 } })
          case 'or':
            return [...this.skolemizar({ k: 'not', f: g.l, pos: 0, end: 0 }), ...this.skolemizar({ k: 'not', f: g.r, pos: 0, end: 0 })]
          case 'imp':
            return [...this.skolemizar(g.l), ...this.skolemizar({ k: 'not', f: g.r, pos: 0, end: 0 })]
          default:
            return [f]
        }
      }
      default:
        return [f]
    }
  }

  // ---------- CNF ----------
  cnf(): ProblemaCNF {
    // ∅ não tem elementos, em nenhum mundo: ∀z ¬(z ∈ ∅)
    if (this.usaVazio) {
      const vazio = this.constante(NOME_VAZIO)
      for (let w = 0; w < this.k; w++)
        for (let b = 0; b < this.n; b++)
          for (let a = 0; a < this.n; a++) this.raizes.push(this.ou([-vazio[b], -this.pertence(a, b, w)]))
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
          add(c)
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

    // KD45 para a relação de cada agente: serial, transitiva, euclidiana
    const K = this.k
    for (const a of this.agentes) {
      const R = (x: number, y: number) => this.acesso(a, x, y)
      for (let w = 0; w < K; w++) {
        add([...Array(K).keys()].map((v) => R(w, v)))
        for (let v = 0; v < K; v++)
          for (let u = 0; u < K; u++) {
            add([-R(w, v), -R(v, u), R(w, u)])
            add([-R(w, v), -R(w, u), R(v, u)])
          }
      }
    }

    // Quebra de simetria (não muda a satisfatibilidade): permutando o domínio,
    // a k-ésima constante pode sempre ser posta num elemento ≤ k.
    this.ordemConstantes.forEach((nome, k) => {
      const vs = this.valorados.get(`c:${nome}`)!
      for (let d = k + 1; d < this.n; d++) add([-vs[d]])
    })
    // e sem buracos: numerando os objetos na ordem em que as constantes aparecem,
    // a k-ésima constante num elemento d > 0 exige uma anterior em d − 1
    this.ordemConstantes.forEach((nome, k) => {
      const vs = this.valorados.get(`c:${nome}`)!
      const anteriores = this.ordemConstantes.slice(0, k).map((o) => this.valorados.get(`c:${o}`)!)
      for (let d = 1; d <= Math.min(k, this.n - 1); d++) add([-vs[d], ...anteriores.map((a) => a[d - 1])])
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
