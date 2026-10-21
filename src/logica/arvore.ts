// A árvore de uma fórmula escrita como S-expressão, no formato da seção 6 de especificacao/gramatica-m2.md: o que os
// exemplos normativos chamam de arvore e arvoreExpandida, e a base da forma canônica dos registros (registros-v1).

import type { Formula, Termo } from './ast'

/** Um termo como S-expressão: (f a), (_ x i), (+ a b), (− a), ∅, números e nomes como escritos. */
export const escreverTermo = (x: Termo): string => {
  switch (x.k) {
    case 'nome':
      return x.nome
    case 'num':
      return x.valor
    case 'vazio':
      return '∅'
    case 'reais':
      return 'ℝ'
    case 'inteiros':
      return 'ℤ'
    case 'app':
      return x.subscrito ? `(_ ${x.fn} ${x.args.map(escreverTermo).join(' ')})` : `(${x.fn} ${x.args.map(escreverTermo).join(' ')})`
    case 'inter':
      return `(⋂ ${escreverTermo(x.l)} ${escreverTermo(x.r)})`
    case 'uniao':
      return `(⋃ ${escreverTermo(x.l)} ${escreverTermo(x.r)})`
    case 'arit':
      return `(${x.op} ${escreverTermo(x.l)} ${escreverTermo(x.r)})`
    case 'neg':
      return `(− ${escreverTermo(x.t)})`
  }
}

const OP = { and: '∧', or: '∨', imp: '⟹', iff: '⟺' } as const

/** Uma fórmula como S-expressão: (conectivo filhos…), (B "titular" φ), (∀ x φ), (∃ x ∈ D φ), ⊤ e ⊥. */
export const escreverArvore = (x: Formula): string => {
  switch (x.k) {
    case 'pred':
      return x.args.length ? `(${x.nome} ${x.args.map(escreverTermo).join(' ')})` : x.nome
    case 'rel':
      return `(${x.op} ${escreverTermo(x.l)} ${escreverTermo(x.r)})`
    case 'not':
      return `(¬ ${escreverArvore(x.f)})`
    case 'nec':
      return `(□ ${escreverArvore(x.f)})`
    case 'pos':
      return `(◇ ${escreverArvore(x.f)})`
    case 'crenca':
      return `(B "${x.agente}" ${escreverArvore(x.f)})`
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return `(${OP[x.k]} ${escreverArvore(x.l)} ${escreverArvore(x.r)})`
    case 'forall':
    case 'exists':
      return `(${x.k === 'forall' ? '∀' : '∃'} ${x.v}${x.dom ? ` ∈ ${escreverTermo(x.dom)}` : ''} ${escreverArvore(x.corpo)})`
    case 'const':
      return x.valor ? '⊤' : '⊥'
  }
}
