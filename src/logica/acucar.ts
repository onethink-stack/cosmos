import type { Formula, Span, Termo } from './ast'
import { nomesUsados } from './termos'

/**
 * Expande o açúcar sintático. O resultado só contém: pred, rel (= e ∈), not, and,
 * or, imp, iff, forall/exists sem domínio e const. Termos: nome, app e vazio
 * (∅ fora de "z ∈ ∅" continua como termo; o motor o trata como constante
 * com o axioma ∀z ¬(z ∈ ∅)).
 *
 *   t ⊆ u      ≡ ∀z (z ∈ t ⟹ z ∈ u)
 *   z ∈ t ⋂ u  ≡ z ∈ t ∧ z ∈ u
 *   z ∈ t ⋃ u  ≡ z ∈ t ∨ z ∈ u
 *   z ∈ ∅      ≡ falso
 *   ∀x∈S φ     ≡ ∀x (x ∈ S ⟹ φ)
 *   ∃x∈S φ     ≡ ∃x (x ∈ S ∧ φ)
 *   t ≠ u      ≡ ¬(t = u)          t ∉ u ≡ ¬(t ∈ u)
 *
 * Pressupõe uma fórmula já validada (sem ⋂/⋃ em posições não suportadas).
 */
export function expandir(f: Formula): Formula {
  const usados = nomesUsados(f)
  const fresco = (): string => {
    let n = 'z'
    for (let i = 1; usados.has(n); i++) n = `z${i}`
    usados.add(n)
    return n
  }

  const sp = (s: Span): Span => ({ pos: s.pos, end: s.end })

  const mem = (x: Termo, t: Termo, s: Span): Formula => {
    switch (t.k) {
      case 'inter':
        return { k: 'and', l: mem(x, t.l, s), r: mem(x, t.r, s), ...sp(s) }
      case 'uniao':
        return { k: 'or', l: mem(x, t.l, s), r: mem(x, t.r, s), ...sp(s) }
      case 'vazio':
        return { k: 'const', valor: false, ...sp(s) }
      default:
        return { k: 'rel', op: '∈', l: x, r: t, ...sp(s) }
    }
  }

  const ex = (f: Formula): Formula => {
    switch (f.k) {
      case 'rel':
        switch (f.op) {
          case '=':
            return f
          case '≠':
            return { k: 'not', f: { ...f, op: '=' }, ...sp(f) }
          case '∈':
            return mem(f.l, f.r, f)
          case '∉':
            return { k: 'not', f: mem(f.l, f.r, f), ...sp(f) }
          case '⊆': {
            const z = fresco()
            const zt: Termo = { k: 'nome', nome: z, ...sp(f) }
            return { k: 'forall', v: z, vPos: f.pos, corpo: { k: 'imp', l: mem(zt, f.l, f), r: mem(zt, f.r, f), ...sp(f) }, ...sp(f) }
          }
        }
      // eslint-disable-next-line no-fallthrough
      case 'pred':
      case 'const':
        return f
      case 'not':
      case 'nec':
      case 'pos':
      case 'crenca':
        return { ...f, f: ex(f.f) }
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        return { ...f, l: ex(f.l), r: ex(f.r) }
      case 'forall':
      case 'exists': {
        const corpo = ex(f.corpo)
        if (!f.dom) return { ...f, corpo }
        const v: Termo = { k: 'nome', nome: f.v, pos: f.vPos, end: f.vPos + f.v.length }
        const guarda = mem(v, f.dom, f.dom)
        return {
          k: f.k,
          v: f.v,
          vPos: f.vPos,
          corpo: { k: f.k === 'forall' ? 'imp' : 'and', l: guarda, r: corpo, ...sp(f) },
          ...sp(f),
        }
      }
    }
  }

  return ex(f)
}
