// Avalia fórmulas num modelo finito e explica, em português, por que uma
// fórmula é verdadeira ou falsa (com o contraexemplo ou a testemunha).
// Trabalha sobre a fórmula como o usuário escreveu (com ⊆, ⋂, ⋃, ∀x∈S) e
// entende □, ◇ e B[…] (mundos possíveis; o mundo 0 é o real).

import type { Formula, Termo } from '../logica/ast'
import { imprimir, imprimirTermo, paraSubscrito } from '../logica/impressao'
import type { Modelo } from './motor'

/** Um passo da explicação: a fórmula (já com os objetos no lugar das variáveis), seu valor e o motivo. */
export interface PassoExplicacao {
  formula: string
  valor: boolean
  motivo: string
  /** mundo em que este passo é avaliado (0 = real) */
  mundo: number
  filhos: PassoExplicacao[]
}

export const nomeElemento = (d: number) => `d${paraSubscrito(String(d + 1)) ?? d + 1}`
/** "8 objetos" ou "8 objetos e 3 mundos" */
export const limiteTexto = (N: number, K = 1) => (K > 1 ? `${N} objetos e ${K} mundos` : `${N} objetos`)
/** "4 objetos" / "1 objeto e 2 mundos" para um modelo encontrado */
export const tamanhoTexto = (n: number, mundos = 1) =>
  `${n} objeto${n > 1 ? 's' : ''}${mundos > 1 ? ` e ${mundos} mundos` : ''}`
export const nomeMundo = (w: number) => `w${paraSubscrito(String(w)) ?? w}`

type Env = Map<string, number>

const PROFUNDIDADE_MAXIMA = 12

export class Avaliador {
  private constantes: Map<string, number>
  private funcoes = new Map<string, number>()
  private predicados = new Set<string>()
  private pertence = new Set<string>()
  private acessos = new Set<string>()
  readonly D: number[]
  readonly W: number[]

  constructor(readonly m: Modelo) {
    this.D = [...Array(m.n).keys()]
    this.W = [...Array(m.mundos ?? 1).keys()]
    this.constantes = new Map(m.constantes.map((c) => [c.nome, c.valor]))
    for (const f of m.funcoes) for (const x of f.tabela) this.funcoes.set(`${f.nome}(${x.args.join(',')})@${x.w ?? 0}`, x.valor)
    for (const p of m.predicados) for (const a of p.verdadeiros) this.predicados.add(`${p.nome}(${a.args.join(',')})@${a.w ?? 0}`)
    for (const [a, b, w] of m.pertence) this.pertence.add(`${a},${b}@${w ?? 0}`)
    for (const r of m.acessos ?? []) for (const [w, v] of r.pares) this.acessos.add(`${r.agente}:${w},${v}`)
  }

  /** Mundos que o agente considera possíveis a partir de w. */
  possiveis(agente: string, w: number): number[] {
    return this.W.filter((v) => this.acessos.has(`${agente}:${w},${v}`))
  }

  // ---------- valores ----------
  /** Objeto denotado por um termo simples, no mundo w (⋂ e ⋃ só fazem sentido como conjuntos, ver `membro`). */
  valor(t: Termo, env: Env, w = 0): number {
    switch (t.k) {
      case 'nome':
        return env.has(t.nome) ? env.get(t.nome)! : (this.constantes.get(t.nome) ?? 0)
      case 'vazio':
        return this.constantes.get('∅') ?? 0
      case 'app':
        return this.funcoes.get(`${t.fn}(${t.args.map((a) => this.valor(a, env, w)).join(',')})@${w}`) ?? 0
      default:
        throw new Error('⋂/⋃ não denotam um objeto; use em ∈ ou ⊆')
    }
  }

  /** a ∈ t no mundo w, com t possivelmente ⋂, ⋃ ou ∅. */
  membro(a: number, t: Termo, env: Env, w = 0): boolean {
    switch (t.k) {
      case 'inter':
        return this.membro(a, t.l, env, w) && this.membro(a, t.r, env, w)
      case 'uniao':
        return this.membro(a, t.l, env, w) || this.membro(a, t.r, env, w)
      case 'vazio':
        return false
      default:
        return this.pertence.has(`${a},${this.valor(t, env, w)}@${w}`)
    }
  }

  private contido(l: Termo, r: Termo, env: Env, w: number): number | null {
    // devolve um contraexemplo z (z ∈ l e z ∉ r), ou null se l ⊆ r
    for (const z of this.D) if (this.membro(z, l, env, w) && !this.membro(z, r, env, w)) return z
    return null
  }

  avaliar(f: Formula, env: Env = new Map(), w = 0): boolean {
    switch (f.k) {
      case 'const':
        return f.valor
      case 'pred':
        return this.predicados.has(`${f.nome}(${f.args.map((a) => this.valor(a, env, w)).join(',')})@${w}`)
      case 'rel':
        switch (f.op) {
          case '=':
            return this.valor(f.l, env, w) === this.valor(f.r, env, w)
          case '≠':
            return this.valor(f.l, env, w) !== this.valor(f.r, env, w)
          case '∈':
            return this.membro(this.valor(f.l, env, w), f.r, env, w)
          case '∉':
            return !this.membro(this.valor(f.l, env, w), f.r, env, w)
          case '⊆':
            return this.contido(f.l, f.r, env, w) === null
        }
        return false
      case 'not':
        return !this.avaliar(f.f, env, w)
      case 'and':
        return this.avaliar(f.l, env, w) && this.avaliar(f.r, env, w)
      case 'or':
        return this.avaliar(f.l, env, w) || this.avaliar(f.r, env, w)
      case 'imp':
        return !this.avaliar(f.l, env, w) || this.avaliar(f.r, env, w)
      case 'iff':
        return this.avaliar(f.l, env, w) === this.avaliar(f.r, env, w)
      case 'nec':
        return this.W.every((v) => this.avaliar(f.f, env, v))
      case 'pos':
        return this.W.some((v) => this.avaliar(f.f, env, v))
      case 'crenca':
        return this.possiveis(f.agente, w).every((v) => this.avaliar(f.f, env, v))
      case 'forall':
        return this.D.every((d) => !this.noDominio(f, d, env, w) || this.avaliar(f.corpo, com(env, f.v, d), w))
      case 'exists':
        return this.D.some((d) => this.noDominio(f, d, env, w) && this.avaliar(f.corpo, com(env, f.v, d), w))
    }
  }

  private noDominio(f: Formula & { k: 'forall' | 'exists' }, d: number, env: Env, w: number): boolean {
    return !f.dom || this.membro(d, f.dom, env, w)
  }

  // ---------- explicação ----------
  /** Explica o valor da fórmula no mundo w: por que é falsa (com contraexemplo) ou verdadeira (com testemunha). */
  explicar(f: Formula, env: Env = new Map(), w = 0, prof = 0): PassoExplicacao {
    const valor = this.avaliar(f, env, w)
    const passo = (motivo: string, filhos: PassoExplicacao[] = []): PassoExplicacao => ({
      formula: imprimir(instanciar(f, env)),
      valor,
      motivo,
      mundo: w,
      filhos: prof >= PROFUNDIDADE_MAXIMA ? [] : filhos,
    })
    const sub = (g: Formula, e: Env = env, mundo = w) => this.explicar(g, e, mundo, prof + 1)
    const v = (g: Formula, e: Env = env) => this.avaliar(g, e, w)

    switch (f.k) {
      case 'const':
        return passo(f.valor ? 'sempre verdadeiro' : 'sempre falso')
      case 'pred':
      case 'rel':
        return passo(this.motivoAtomo(f, env, w, valor))
      case 'not':
        return passo(valor ? 'porque o que vem depois do ¬ é falso' : 'porque o que vem depois do ¬ é verdadeiro', [sub(f.f)])
      case 'and': {
        if (valor) return passo('as duas partes valem', [sub(f.l), sub(f.r)])
        const falsa = v(f.l) ? f.r : f.l
        return passo('uma das partes é falsa', [sub(falsa)])
      }
      case 'or': {
        if (!valor) return passo('nenhum dos dois lados vale', [sub(f.l), sub(f.r)])
        return passo('um dos lados vale', [sub(v(f.l) ? f.l : f.r)])
      }
      case 'imp': {
        if (!valor) return passo('a condição vale, mas a conclusão não', [sub(f.l), sub(f.r)])
        return v(f.l) ? passo('a conclusão vale', [sub(f.r)]) : passo('a condição não vale', [sub(f.l)])
      }
      case 'iff':
        return passo(valor ? 'os dois lados têm o mesmo valor' : 'um lado vale e o outro não', [sub(f.l), sub(f.r)])
      case 'nec': {
        if (valor) return passo(this.W.length > 1 ? `vale em todos os mundos (${this.W.map(nomeMundo).join(', ')})` : 'vale no único mundo')
        const u = this.W.find((x) => !this.avaliar(f.f, env, x))!
        return passo(`falha no mundo ${nomeMundo(u)}`, [sub(f.f, env, u)])
      }
      case 'pos': {
        if (!valor) return passo(`não vale em nenhum mundo (${this.W.map(nomeMundo).join(', ')})`)
        const u = this.W.find((x) => this.avaliar(f.f, env, x))!
        return passo(`vale no mundo ${nomeMundo(u)}`, [sub(f.f, env, u)])
      }
      case 'crenca': {
        const ps = this.possiveis(f.agente, w)
        if (valor) return passo(`vale em todos os mundos que ${f.agente} considera possíveis (${ps.map(nomeMundo).join(', ')})`)
        const u = ps.find((x) => !this.avaliar(f.f, env, x))!
        return passo(`${f.agente} considera possível o mundo ${nomeMundo(u)}, e lá não vale`, [sub(f.f, env, u)])
      }
      case 'forall': {
        const dom = f.dom ? ` em ${imprimirTermo(instanciarTermo(f.dom, env))}` : ''
        if (valor) {
          const quantos = this.D.filter((d) => this.noDominio(f, d, env, w)).length
          return passo(quantos ? `vale para todo ${f.v}${dom}` : `não há nenhum ${f.v}${dom}, então vale por vacuidade`)
        }
        const d = this.D.find((x) => this.noDominio(f, x, env, w) && !this.avaliar(f.corpo, com(env, f.v, x), w))!
        return passo(`falha para ${f.v} = ${nomeElemento(d)}`, [sub(f.corpo, com(env, f.v, d))])
      }
      case 'exists': {
        const dom = f.dom ? ` em ${imprimirTermo(instanciarTermo(f.dom, env))}` : ''
        if (valor) {
          const d = this.D.find((x) => this.noDominio(f, x, env, w) && this.avaliar(f.corpo, com(env, f.v, x), w))!
          return passo(`vale com ${f.v} = ${nomeElemento(d)}`, [sub(f.corpo, com(env, f.v, d))])
        }
        const candidatos = this.D.filter((d) => this.noDominio(f, d, env, w))
        if (!candidatos.length) return passo(`não há nenhum ${f.v}${dom}`)
        return passo(`nenhum ${f.v}${dom} serve (testados: ${candidatos.map(nomeElemento).join(', ')})`)
      }
    }
  }

  /** "A = d₁, f(d₂) = d₄" para os termos que não são diretamente um objeto. */
  private valores(ts: Termo[], env: Env, w: number): string {
    const vistos = new Set<string>()
    const partes: string[] = []
    const visitar = (t: Termo) => {
      if (t.k === 'inter' || t.k === 'uniao') {
        visitar(t.l)
        visitar(t.r)
        return
      }
      if (t.k === 'nome' && env.has(t.nome)) return
      if (t.k === 'vazio') return
      const txt = imprimirTermo(instanciarTermo(t, env))
      if (vistos.has(txt)) return
      vistos.add(txt)
      partes.push(`${txt} = ${nomeElemento(this.valor(t, env, w))}`)
    }
    ts.forEach(visitar)
    return partes.join(', ')
  }

  private motivoAtomo(f: Formula & { k: 'pred' | 'rel' }, env: Env, w: number, valor: boolean): string {
    const el = (t: Termo) => nomeElemento(this.valor(t, env, w))
    const com = (vals: string, fato: string) => (vals ? `${vals}; ${fato}` : fato)
    const mostra = (t: Termo) => imprimirTermo(instanciarTermo(t, env))

    if (f.k === 'pred') {
      const args = f.args.map(el)
      const fato = f.args.length
        ? `${f.nome} ${valor ? 'vale' : 'não vale'} para ${args.length === 1 ? args[0] : `(${args.join(', ')})`}`
        : `${f.nome} é ${valor ? 'verdadeiro' : 'falso'}`
      return com(this.valores(f.args, env, w), fato)
    }
    const vals = this.valores([f.l, f.r], env, w)
    switch (f.op) {
      case '=':
      case '≠': {
        const iguais = this.valor(f.l, env, w) === this.valor(f.r, env, w)
        return com(vals, iguais ? `os dois são ${el(f.l)}` : `${el(f.l)} e ${el(f.r)} são objetos diferentes`)
      }
      case '∈':
      case '∉': {
        const a = this.valor(f.l, env, w)
        return com(vals, this.fatoMembro(a, f.r, env, w, this.membro(a, f.r, env, w)))
      }
      case '⊆': {
        const z = this.contido(f.l, f.r, env, w)
        if (z === null) return com(vals, `todo elemento de ${mostra(f.l)} está em ${mostra(f.r)}`)
        return com(vals, `${nomeElemento(z)} ∈ ${mostra(f.l)}, mas ${nomeElemento(z)} ∉ ${mostra(f.r)}`)
      }
      default:
        return 'fórmula com números: conferida só pelo Z3'
    }
  }

  /** Descreve a ∈ t / a ∉ t, abrindo ⋂ e ⋃ quando aparecem. */
  private fatoMembro(a: number, t: Termo, env: Env, w: number, dentro: boolean): string {
    const x = nomeElemento(a)
    if (t.k === 'vazio') return `nada pertence a ∅`
    if (t.k === 'inter' || t.k === 'uniao') {
      const l = this.membro(a, t.l, env, w)
      const r = this.membro(a, t.r, env, w)
      const tl = imprimirTermo(instanciarTermo(t.l, env))
      const tr = imprimirTermo(instanciarTermo(t.r, env))
      return `${x} ${l ? '∈' : '∉'} ${tl} e ${x} ${r ? '∈' : '∉'} ${tr}`
    }
    return `${x} ${dentro ? '∈' : '∉'} ${nomeElemento(this.valor(t, env, w))}`
  }
}

function com(env: Env, v: string, d: number): Env {
  const e = new Map(env)
  e.set(v, d)
  return e
}

// ---------- substituir variáveis por objetos, para exibir ----------
function instanciarTermo(t: Termo, env: Env): Termo {
  switch (t.k) {
    case 'nome':
      return env.has(t.nome) ? { ...t, nome: nomeElemento(env.get(t.nome)!) } : t
    case 'app':
      return { ...t, args: t.args.map((a) => instanciarTermo(a, env)), subscrito: t.subscrito && t.args.every((a) => a.k === 'nome' && !env.has(a.nome)) }
    case 'inter':
    case 'uniao':
    case 'arit':
      return { ...t, l: instanciarTermo(t.l, env), r: instanciarTermo(t.r, env) }
    case 'neg':
      return { ...t, t: instanciarTermo(t.t, env) }
    case 'vazio':
    case 'num':
    case 'reais':
    case 'inteiros':
      return t
  }
}

export function instanciar(f: Formula, env: Env): Formula {
  if (!env.size) return f
  switch (f.k) {
    case 'const':
      return f
    case 'pred':
      return { ...f, args: f.args.map((a) => instanciarTermo(a, env)) }
    case 'rel':
      return { ...f, l: instanciarTermo(f.l, env), r: instanciarTermo(f.r, env) }
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      return { ...f, f: instanciar(f.f, env) }
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return { ...f, l: instanciar(f.l, env), r: instanciar(f.r, env) }
    case 'forall':
    case 'exists': {
      // a variável do quantificador esconde a de fora com o mesmo nome
      const dentro = new Map(env)
      dentro.delete(f.v)
      return { ...f, dom: f.dom && instanciarTermo(f.dom, env), corpo: instanciar(f.corpo, dentro) }
    }
  }
}
