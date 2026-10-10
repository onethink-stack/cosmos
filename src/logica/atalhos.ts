import { paraSubscrito } from './impressao'

// Ordem importa: "<->" antes de "->", "\notin" antes de "\in".
const REGRAS: [string, string][] = [
  ['<->', '⟺'], ['->', '⟹'], ['!=', '≠'],
  ['\\notin', '∉'], ['\\empty', '∅'], ['\\sub', '⊆'], ['\\cap', '⋂'], ['\\cup', '⋃'],
  ['\\in', '∈'], ['\\A', '∀'], ['\\E', '∃'], ['\\nec', '□'], ['\\pos', '◇'], ['[]', '□'], ['<>', '◇'],
  ['~', '¬'], ['&', '∧'], ['|', '∨'],
]

/**
 * Converte o atalho que termina exatamente no cursor (uso ao digitar um caractere).
 * Devolve null se nada mudou.
 */
export function converterNoCursor(texto: string, cursor: number): { texto: string; cursor: number } | null {
  const antes = texto.slice(0, cursor)
  const depois = texto.slice(cursor)
  for (const [de, para] of REGRAS) {
    if (de === '[]' && antes.endsWith('B[]')) continue
    if (antes.endsWith(de)) {
      const novo = antes.slice(0, -de.length) + para
      return { texto: novo + depois, cursor: novo.length }
    }
  }
  const m = /_([a-z0-9])$/.exec(antes)
  if (m) {
    const sub = paraSubscrito(m[1])
    if (sub) {
      const novo = antes.slice(0, -2) + sub
      return { texto: novo + depois, cursor: novo.length }
    }
  }
  return null
}

const RE_TUDO = new RegExp(
  // "B[]" é o começo de uma crença B[titular], não □
  REGRAS.map(([de]) => (de === '[]' ? '(?<!B)\\[\\]' : de.replace(/[\\|^$.*+?()[\]{}]/g, '\\$&'))).join('|') + '|_([a-z0-9])(?![A-Za-z0-9])',
  'g',
)

/** Converte todos os atalhos de um texto (uso ao colar ou importar). */
export function converterTudo(texto: string): string {
  return texto.replace(RE_TUDO, (m: string, sub?: string) => {
    if (sub !== undefined) return paraSubscrito(sub) ?? m
    return REGRAS.find(([de]) => de === m)![1]
  })
}
