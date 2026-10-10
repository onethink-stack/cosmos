import { describe, expect, it } from 'vitest'
import { notaVazia } from '../src/dados/estado'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'
import { OPCOES_PADRAO, perguntar, type Grupo } from '../src/motor/motor'
import { montarTarefas } from '../src/motor/tarefas'

const dic = (...xs: [string, EntradaDicionario['tipo'], number?][]): EntradaDicionario[] =>
  xs.map(([s, tipo, aridade = 0]) => ({ id: s, termo: s, simbolo: s, tipo, aridade, definicao: '' }))
const DIC = dic(['A', 'constante'], ['I', 'constante'], ['f', 'funcao', 1])
const AX: [string, string][] = [
  ['Ax1', '∀i∈I (f(i) ⊆ A)'],
  ['Ax2', '∀i∈I (f(i) ≠ A)'],
  ['Ax3', '∃i∈I ∃j∈I (i ≠ j ∧ f(i) ≠ f(j))'],
  ['Ax4', 'A ∉ A'],
  ['Ax5', '∀x (x ∈ A ⟺ ∃i∈I (x ∈ f(i)))'],
  ['Ax6', '∃x ∀i∈I (x ∈ f(i))'],
  ['Ax7', '∀i∈I ∀j∈I (f(i) ∉ f(j))'],
]
const grupos = (xs: [string, string][]): Grupo[] => xs.map(([id, f]) => ({ id, rotulo: id, formulas: [f] }))
const PQ = grupos([
  ['regra', '∀x (P(x) ⟹ Q(x))'],
  ['fato', 'P(a)'],
  ['solta', 'R(c)'],
])

describe('perguntar: isto segue das notas?', () => {
  it('segue, com as notas necessárias (sem as que não importam)', () => {
    const r = perguntar(PQ, 'Q(a)', [], OPCOES_PADRAO)
    expect(r).toEqual({ tipo: 'segue', N: 8, K: 1, notas: ['regra', 'fato'] })
  })

  it('não segue: mostra um mundo onde as notas valem e a fórmula falha', () => {
    const r = perguntar(PQ, 'Q(b)', [], OPCOES_PADRAO)
    expect(r.tipo).toBe('nao-segue')
    if (r.tipo !== 'nao-segue') return
    expect(r.mundo.passos.valor).toBe(false)
    expect(r.mundo.passos.formula).toBe('Q(b)')
  })

  it('contradiz: as notas implicam a negação', () => {
    const r = perguntar(PQ, '¬Q(a)', [], OPCOES_PADRAO)
    expect(r.tipo).toBe('contradiz')
    if (r.tipo === 'contradiz') expect(r.notas).toEqual(['regra', 'fato'])
  })

  it('vale sempre: não depende de nenhuma nota', () => {
    expect(perguntar(PQ, 'Q(a) ∨ ¬Q(a)', [], OPCOES_PADRAO)).toEqual({ tipo: 'segue', N: 8, K: 1, notas: [] })
    expect(perguntar(PQ, 'a = a', [], OPCOES_PADRAO)).toEqual({ tipo: 'segue', N: 8, K: 1, notas: [] })
  })

  it('dos axiomas segue ∃x (x ∈ A), usando Ax3, Ax5 e Ax6', () => {
    const r = perguntar(grupos(AX), '∃x (x ∈ A)', DIC, OPCOES_PADRAO)
    expect(r).toEqual({ tipo: 'segue', N: 8, K: 1, notas: ['Ax3', 'Ax5', 'Ax6'] })
  })

  it('o conjunto de notas devolvido é irredutível: sem qualquer uma delas, deixa de seguir', () => {
    const r = perguntar(grupos(AX), '∃x (x ∈ A)', DIC, OPCOES_PADRAO)
    if (r.tipo !== 'segue') throw new Error(r.tipo)
    const usadas = grupos(AX).filter((g) => r.notas.includes(g.id))
    expect(perguntar(usadas, '∃x (x ∈ A)', DIC, OPCOES_PADRAO).tipo).toBe('segue')
    for (const tirar of r.notas) {
      const menos = usadas.filter((g) => g.id !== tirar)
      expect(perguntar(menos, '∃x (x ∈ A)', DIC, OPCOES_PADRAO).tipo, `sem ${tirar}`).toBe('nao-segue')
    }
  })

  it('notas contraditórias: avisa em vez de dizer que tudo segue', () => {
    const r = perguntar(grupos([['a', 'A ∈ A'], ['b', 'A ∉ A']]), 'Q(z)', [], OPCOES_PADRAO)
    expect(r.tipo).toBe('premissas-contraditorias')
  })

  it('fórmula inválida', () => {
    expect(perguntar(PQ, 'P(x) Q(x)', [], OPCOES_PADRAO).tipo).toBe('formula-invalida')
  })

  it('uma visão é perguntada só com as notas dela; as leis gerais não entram', () => {
    const nota = (p: Partial<Nota>): Nota => ({ ...notaVazia(), id: p.titulo!, ...p })
    const notas = [
      nota({ titulo: 'Ax4', formulas: ['A ∉ A'] }),
      nota({ titulo: 'crença', compartimento: 'visao', titular: 'x', formulas: ['A ∈ A'] }),
    ]
    const { tarefas } = montarTarefas(notas, DIC)
    const geral = tarefas.find((t) => t.chave === 'geral')!
    const visao = tarefas.find((t) => t.chave === 'visao:x')!
    expect(perguntar(geral.grupos, 'A ∈ A', DIC, OPCOES_PADRAO).tipo).toBe('contradiz')
    expect(perguntar(visao.grupos, 'A ∈ A', DIC, OPCOES_PADRAO)).toEqual({ tipo: 'segue', N: 8, K: 1, notas: ['crença'] })
  })
})
