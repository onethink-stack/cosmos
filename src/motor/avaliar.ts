// Avalia fórmulas num modelo finito e explica, em português, por que uma
// fórmula é verdadeira ou falsa (com o contraexemplo ou a testemunha).
// Trabalha sobre a fórmula como o usuário escreveu (com ⊆, ⋂, ⋃, ∀x∈S).

import type { Formula, Termo } from '../logica/ast'
import { imprimir, imprimirTermo, paraSubscrito } from '../logica/impressao'
import type { Modelo } from './motor'

/** Um passo da explicação: a fórmula (já com os objetos no lugar das variáveis), seu valor e o motivo. */
export interface PassoExplicacao {
  formula: string
  valor: boolean
  motivo: string
  filhos: PassoExplicacao[]
}

export const nomeElemento = (d: number) => `d${paraSubscrito(String(d + 1)) ?? d + 1}`

type Env = Map<string, number>

const PROFUNDIDADE_MAXIMA = 10

export class Avaliador {
  private constantes: Map<string, number>
  private funcoes = new Map<string, number>()
  private predicados = new Set<string>()
  private pertence = new Set<string>()
  readonly D: number[]

  constructor(readonly m: Modelo) {
    this.D = [...Array(m.n).keys()]
    this.constantes = new Map(m.constantes.map((c) => [c.nome, c.valor]))
    for (const f of m.funcoes) for (const x of f.tabela) this.funcoes.set(`${f.nome}(${x.args.join(',')})`, x.valor)
    for (const p of m.predicados) for (const a of p.verdadeiros) this.predicados.add(`${p.nome}(${a.join(',')})`)
    for (const [a, b] of m.pertence) this.pertence.add(`${a},${b}`)
  }

  // ---------- valores ----------
  /** Objeto denotado por um termo simples (⋂ e ⋃ só fazem sentido como conjuntos, ver `membro`). */
  valor(t: Termo, env: Env): number {
    switch (t.k) {
      case 'nome':
        return env.has(t.nome) ? env.get(t.nome)! : (this.constantes.get(t.nome) ?? 0)
      case 'vazio':
        return this.constantes.get('∅') ?? 0
      case 'app':
        return this.funcoes.get(`${t.fn}(${t.args.map((a) => this.valor(a, env)).join(',')})`) ?? 0
      default:
        throw new Error('⋂/⋃ não denotam um objeto; use em ∈ ou ⊆')
    }
  }

  /** a ∈ t, com t possivelmente ⋂, ⋃ ou ∅. */
  membro(a: number, t: Termo, env: Env): boolean {
    switch (t.k) {
      case 'inter':
        return this.membro(a, t.l, env) && this.membro(a, t.r, env)
      case 'uniao':
        return this.membro(a, t.l, env) || this.membro(a, t.r, env)
      case 'vazio':
        return false
      default:
        return this.pertence.has(`${a},${this.valor(t, env)}`)
    }
  }

  private contido(l: Termo, r: Termo, env: Env): number | null {
    // devolve um contraexemplo z (z ∈ l e z ∉ r), ou null se l ⊆ r
    for (const z of this.D) if (this.membro(z, l, env) && !this.membro(z, r, env)) return z
    return null
  }

  avaliar(f: Formula, env: Env = new Map()): boolean {
    switch (f.k) {
      case 'const':
        return f.valor
      case 'pred':
        return this.predicados.has(`${f.nome}(${f.args.map((a) => this.valor(a, env)).join(',')})`)
      case 'rel':
        switch (f.op) {
          case '=':
            return this.valor(f.l, env) === this.valor(f.r, env)
          case '≠':
            return this.valor(f.l, env) !== this.valor(f.r, env)
          case '∈':
            return this.membro(this.valor(f.l, env), f.r, env)
          case '∉':
            return !this.membro(this.valor(f.l, env), f.r, env)
          case '⊆':
            return this.contido(f.l, f.r, env) === null
        }
      // eslint-disable-next-line no-fallthrough
      case 'not':
        return !this.avaliar(f.f, env)
      case 'and':
        return this.avaliar(f.l, env) && this.avaliar(f.r, env)
      case 'or':
        return this.avaliar(f.l, env) || this.avaliar(f.r, env)
      case 'imp':
        return !this.avaliar(f.l, env) || this.avaliar(f.r, env)
      case 'iff':
        return this.avaliar(f.l, env) === this.avaliar(f.r, env)
      case 'forall':
        return this.D.every((d) => !this.noDominio(f, d, env) || this.avaliar(f.corpo, com(env, f.v, d)))
      case 'exists':
        return this.D.some((d) => this.noDominio(f, d, env) && this.avaliar(f.corpo, com(env, f.v, d)))
    }
  }

  private noDominio(f: Formula & { k: 'forall' | 'exists' }, d: number, env: Env): boolean {
    return !f.dom || this.membro(d, f.dom, env)
  }

  // ---------- explicação ----------
  /** Explica o valor da fórmula: por que é falsa (com contraexemplo) ou verdadeira (com testemunha). */
  explicar(f: Formula, env: Env = new Map(), prof = 0): PassoExplicacao {
    const valor = this.avaliar(f, env)
    const passo = (motivo: string, filhos: PassoExplicacao[] = []): PassoExplicacao => ({
      formula: imprimir(instanciar(f, env)),
      valor,
      motivo,
      filhos: prof >= PROFUNDIDADE_MAXIMA ? [] : filhos,
    })
    const sub = (g: Formula, e: Env = env) => this.explicar(g, e, prof + 1)

    switch (f.k) {
      case 'const':
        return passo(f.valor ? 'sempre verdadeiro' : 'sempre falso')
      case 'pred':
      case 'rel':
        return passo(this.motivoAtomo(f, env, valor))
      case 'not':
        return passo(valor ? 'porque o que vem depois do ¬ é falso' : 'porque o que vem depois do ¬ é verdadeiro', [sub(f.f)])
      case 'and': {
        if (valor) return passo('as duas partes valem', [sub(f.l), sub(f.r)])
        const falsa = this.avaliar(f.l, env) ? f.r : f.l
        return passo('uma das partes é falsa', [sub(falsa)])
      }
      case 'or': {
        if (!valor) return passo('nenhum dos dois lados vale', [sub(f.l), sub(f.r)])
        const vale = this.avaliar(f.l, env) ? f.l : f.r
        return passo('um dos lados vale', [sub(vale)])
      }
      case 'imp': {
        if (!valor) return passo('a condição vale, mas a conclusão não', [sub(f.l), sub(f.r)])
        return this.avaliar(f.l, env) ? passo('a conclusão vale', [sub(f.r)]) : passo('a condição não vale', [sub(f.l)])
      }
      case 'iff':
        return passo(valor ? 'os dois lados têm o mesmo valor' : 'um lado vale e o outro não', [sub(f.l), sub(f.r)])
      case 'forall': {
        const dom = f.dom ? ` em ${imprimirTermo(instanciarTermo(f.dom, env))}` : ''
        if (valor) {
          const quantos = this.D.filter((d) => this.noDominio(f, d, env)).length
          return passo(quantos ? `vale para todo ${f.v}${dom}` : `não há nenhum ${f.v}${dom}, então vale por vacuidade`)
        }
        const d = this.D.find((x) => this.noDominio(f, x, env) && !this.avaliar(f.corpo, com(env, f.v, x)))!
        return passo(`falha para ${f.v} = ${nomeElemento(d)}`, [sub(f.corpo, com(env, f.v, d))])
      }
      case 'exists': {
        const dom = f.dom ? ` em ${imprimirTermo(instanciarTermo(f.dom, env))}` : ''
        if (valor) {
          const d = this.D.find((x) => this.noDominio(f, x, env) && this.avaliar(f.corpo, com(env, f.v, x)))!
          return passo(`vale com ${f.v} = ${nomeElemento(d)}`, [sub(f.corpo, com(env, f.v, d))])
        }
        const candidatos = this.D.filter((d) => this.noDominio(f, d, env))
        if (!candidatos.length) return passo(`não há nenhum ${f.v}${dom}`)
        return passo(`nenhum ${f.v}${dom} serve (testados: ${candidatos.map(nomeElemento).join(', ')})`)
      }
    }
  }

  /** "A = d₁, f(d₂) = d₄" para os termos que não são diretamente um objeto. */
  private valores(ts: Termo[], env: Env): string {
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
      partes.push(`${txt} = ${nomeElemento(this.valor(t, env))}`)
    }
    ts.forEach(visitar)
    return partes.join(', ')
  }

  private motivoAtomo(f: Formula & { k: 'pred' | 'rel' }, env: Env, valor: boolean): string {
    const el = (t: Termo) => nomeElemento(this.valor(t, env))
    const com = (vals: string, fato: string) => (vals ? `${vals}; ${fato}` : fato)

    if (f.k === 'pred') {
      const args = f.args.map(el)
      const fato = f.args.length
        ? `${f.nome} ${valor ? 'vale' : 'não vale'} para ${args.length === 1 ? args[0] : `(${args.join(', ')})`}`
        : `${f.nome} é ${valor ? 'verdadeiro' : 'falso'}`
      return com(this.valores(f.args, env), fato)
    }
    const vals = this.valores([f.l, f.r], env)
    switch (f.op) {
      case '=':
      case '≠': {
        const iguais = this.valor(f.l, env) === this.valor(f.r, env)
        return com(vals, iguais ? `os dois são ${el(f.l)}` : `${el(f.l)} e ${el(f.r)} são objetos diferentes`)
      }
      case '∈':
      case '∉': {
        const a = this.valor(f.l, env)
        const dentro = this.membro(a, f.r, env)
        return com(vals, this.fatoMembro(a, f.r, env, dentro))
      }
      case '⊆': {
        const z = this.contido(f.l, f.r, env)
        if (z === null) return com(vals, `todo elemento de ${imprimirTermo(instanciarTermo(f.l, env))} está em ${imprimirTermo(instanciarTermo(f.r, env))}`)
        return com(vals, `${nomeElemento(z)} ∈ ${imprimirTermo(instanciarTermo(f.l, env))}, mas ${nomeElemento(z)} ∉ ${imprimirTermo(instanciarTermo(f.r, env))}`)
      }
    }
  }

  /** Descreve a ∈ t / a ∉ t, abrindo ⋂ e ⋃ quando aparecem. */
  private fatoMembro(a: number, t: Termo, env: Env, dentro: boolean): string {
    const x = nomeElemento(a)
    if (t.k === 'vazio') return `nada pertence a ∅`
    if (t.k === 'inter' || t.k === 'uniao') {
      const l = this.membro(a, t.l, env)
      const r = this.membro(a, t.r, env)
      const tl = imprimirTermo(instanciarTermo(t.l, env))
      const tr = imprimirTermo(instanciarTermo(t.r, env))
      return `${x} ${l ? '∈' : '∉'} ${tl} e ${x} ${r ? '∈' : '∉'} ${tr}`
    }
    return `${x} ${dentro ? '∈' : '∉'} ${nomeElemento(this.valor(t, env))}`
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
      return { ...t, l: instanciarTermo(t.l, env), r: instanciarTermo(t.r, env) }
    case 'vazio':
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
