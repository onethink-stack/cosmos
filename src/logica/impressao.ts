import type { Formula, OpArit, Termo } from './ast'

const NIVEL_ARIT: Record<OpArit, number> = { '+': 1, '−': 1, '·': 2, '/': 2, '^': 4 }
/** nível de precedência de um termo (conta mais fraca = menor; átomos = 9) */
const nivelTermo = (t: Termo) => (t.k === 'arit' ? NIVEL_ARIT[t.op] : t.k === 'neg' ? 3 : 9)

const SUB_INV: Record<string, string> = {
  a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ',
  t: 'ₜ', i: 'ᵢ', j: 'ⱼ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ', '0': '₀', '1': '₁', '2': '₂', '3': '₃',
  '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
}

export function paraSubscrito(s: string): string | null {
  let r = ''
  for (const c of s) {
    if (!(c in SUB_INV)) return null
    r += SUB_INV[c]
  }
  return r
}

export function imprimirTermo(t: Termo): string {
  switch (t.k) {
    case 'nome':
      return t.nome
    case 'vazio':
      return '∅'
    case 'num':
      return t.valor
    case 'reais':
      return 'ℝ'
    case 'neg': {
      const p = nivelTermo(t.t) < 4 ? `(${imprimirTermo(t.t)})` : imprimirTermo(t.t)
      return `−${p}`
    }
    case 'arit': {
      const n = NIVEL_ARIT[t.op]
      // + e · associam à esquerda; ^ à direita; − e / precisam de parênteses à direita no mesmo nível
      const lado = (x: Termo, dir: boolean) => {
        const m = nivelTermo(x)
        const paren = t.op === '^' ? (dir ? m < n : m <= n) : m < n || (dir && m === n && (t.op === '−' || t.op === '/' || x.k === 'arit'))
        return paren ? `(${imprimirTermo(x)})` : imprimirTermo(x)
      }
      return t.op === '^' ? `${lado(t.l, false)}^${lado(t.r, true)}` : `${lado(t.l, false)} ${t.op} ${lado(t.r, true)}`
    }
    case 'app': {
      const a = t.args[0]
      if (t.subscrito && t.args.length === 1 && a.k === 'nome') {
        const sub = paraSubscrito(a.nome)
        return sub ? t.fn + sub : `${t.fn}_${a.nome}`
      }
      return `${t.fn}(${t.args.map(imprimirTermo).join(', ')})`
    }
    case 'inter':
    case 'uniao': {
      const op = t.k === 'inter' ? '⋂' : '⋃'
      // ⋂ liga mais forte que ⋃; ambos associam à esquerda
      const precisa = (x: Termo, dir: boolean) =>
        (x.k === 'uniao' && t.k === 'inter') || (dir && (x.k === 'inter' || x.k === 'uniao'))
      const p = (x: Termo, dir: boolean) => (precisa(x, dir) ? `(${imprimirTermo(x)})` : imprimirTermo(x))
      return `${p(t.l, false)} ${op} ${p(t.r, true)}`
    }
  }
}

const NIVEL: Record<string, number> = { iff: 1, imp: 2, or: 3, and: 4 }
const OP: Record<string, string> = { iff: '⟺', imp: '⟹', or: '∨', and: '∧' }

/** Imprime com o mínimo de parênteses; quantificadores dentro de operadores ganham parênteses. */
export function imprimir(f: Formula): string {
  switch (f.k) {
    case 'pred':
      return f.args.length ? `${f.nome}(${f.args.map(imprimirTermo).join(', ')})` : f.nome
    case 'rel':
      return `${imprimirTermo(f.l)} ${f.op} ${imprimirTermo(f.r)}`
    case 'const':
      return f.valor ? '⊤' : '⊥'
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca': {
      const g = f.f
      const simples = g.k === 'pred' || g.k === 'not' || g.k === 'const' || g.k === 'nec' || g.k === 'pos' || g.k === 'crenca'
      const op = f.k === 'crenca' ? `B[${f.agente}] ` : f.k === 'not' ? '¬' : f.k === 'nec' ? '□' : '◇'
      return simples ? `${op}${imprimir(g)}` : `${op}(${imprimir(g)})`
    }
    case 'forall':
    case 'exists': {
      const q = f.k === 'forall' ? '∀' : '∃'
      const dom = f.dom ? `∈${imprimirTermo(f.dom)}` : ''
      const c = f.corpo
      const corpo = c.k in NIVEL || c.k === 'rel' ? `(${imprimir(c)})` : imprimir(c)
      return `${q}${f.v}${dom} ${corpo}`
    }
    default: {
      const n = NIVEL[f.k]
      const lado = (g: Formula, dir: boolean) => {
        const m = NIVEL[g.k]
        const quant = g.k === 'forall' || g.k === 'exists'
        // ⟹ associa à direita; os demais à esquerda
        const assocOk = f.k === 'imp' ? dir : !dir
        const paren = quant || (m !== undefined && (m < n || (m === n && !assocOk)))
        return paren ? `(${imprimir(g)})` : imprimir(g)
      }
      return `${lado(f.l, false)} ${OP[f.k]} ${lado(f.r, true)}`
    }
  }
}
