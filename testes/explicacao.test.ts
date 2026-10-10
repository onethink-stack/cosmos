import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { Avaliador, type PassoExplicacao } from '../src/motor/avaliar'
import { buscarModelo, OPCOES_PADRAO, prepararFormulas, verificar, type ExplicacaoConflito, type Grupo } from '../src/motor/motor'
import { validar } from '../src/logica/validador'

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
const ast = (t: string, d: EntradaDicionario[] = []) => validar(t, d).ast!

/** Junta todos os textos (fórmulas e motivos) da árvore, para buscar nas asserções. */
const textoDe = (p: PassoExplicacao): string => [p.formula, p.motivo, ...p.filhos.map(textoDe)].join(' | ')

function explicacaoDe(id: string, es: ExplicacaoConflito[]) {
  const e = es.find((x) => x.grupoId === id)!
  expect(e.tipo).toBe('mundo')
  if (e.tipo !== 'mundo') throw new Error()
  return e
}

describe('avaliador concorda com o motor', () => {
  const conjuntos: [string[], EntradaDicionario[]][] = [
    [AX.map(([, f]) => f), DIC],
    [['a = b', 'P(a)', 'P(b)'], []],
    [['a ≠ b', 'b ≠ c', 'a ≠ c', 'f(a) = b', 'f(b) = c', 'f(c) = a'], []],
    [['∀x ∃y (R(x, y) ∧ x ≠ y)', 'R(a, b)'], []],
    [['x ∈ A ⋂ B', 'y ∈ A ⋃ B', 'y ∉ A', '(A ⋂ B) ⊆ C', '∀z∈C (z ∈ A)'], []],
    [['∅ ∈ S', '∀s∈S ¬∃x (x ∈ s)', '∃t∈S (t = ∅)'], []],
    [['∀i (fᵢ ∈ A)', 'f_a ≠ A'], []],
  ]
  for (const [textos, d] of conjuntos) {
    it(textos.join(' ; '), () => {
      const r = buscarModelo(prepararFormulas(textos, d), OPCOES_PADRAO)
      expect(r.status).toBe('modelo')
      if (r.status !== 'modelo') return
      const av = new Avaliador(r.modelo)
      for (const t of textos) {
        expect(av.avaliar(ast(t, d)), t).toBe(true)
        // a explicação concorda com o valor
        expect(av.explicar(ast(t, d)).valor).toBe(true)
      }
    })
  }
})

describe('explicar o conflito', () => {
  it('T2: cada nota do conflito {Ax4, nova} tem um mundo onde só ela falha', () => {
    const r = verificar([...grupos(AX), { id: 'nova', rotulo: 'nova', formulas: ['A ∈ A'] }], DIC, OPCOES_PADRAO)
    expect(r.tipo).toBe('sem-modelo')
    if (r.tipo !== 'sem-modelo') return
    expect(r.explicacoes.map((e) => e.grupoId).sort()).toEqual(['Ax4', 'nova'])

    const ax4 = explicacaoDe('Ax4', r.explicacoes)
    expect(ax4.formula).toBe('A ∉ A')
    expect(ax4.passos.valor).toBe(false)
    expect(ax4.passos.motivo).toMatch(/^A = d.; d. ∈ d.$/)

    const nova = explicacaoDe('nova', r.explicacoes)
    expect(nova.formula).toBe('A ∈ A')
    expect(nova.passos.motivo).toMatch(/^A = d.; d. ∉ d.$/)

    // no mundo de cada explicação, as outras notas do conflito valem e a nota explicada falha
    expect(new Avaliador(nova.modelo).avaliar(ast('A ∉ A', DIC))).toBe(true)
    expect(new Avaliador(nova.modelo).avaliar(ast('A ∈ A', DIC))).toBe(false)
    expect(new Avaliador(ax4.modelo).avaliar(ast('A ∈ A', DIC))).toBe(true)
    expect(new Avaliador(ax4.modelo).avaliar(ast('A ∉ A', DIC))).toBe(false)
  })

  it('∀ com contraexemplo e implicação', () => {
    const r = verificar(
      grupos([
        ['N1', '∀x (P(x) ⟹ Q(x))'],
        ['N2', 'P(a)'],
        ['N3', '¬Q(a)'],
      ]),
      [],
      OPCOES_PADRAO,
    )
    if (r.tipo !== 'sem-modelo') throw new Error(r.tipo)
    const e = explicacaoDe('N1', r.explicacoes)
    expect(e.passos.motivo).toMatch(/^falha para x = d.$/)
    const corpo = e.passos.filhos[0]
    expect(corpo.formula).toMatch(/^P\(d.\) ⟹ Q\(d.\)$/)
    expect(corpo.motivo).toBe('a condição vale, mas a conclusão não')
    expect(corpo.filhos.map((f) => f.valor)).toEqual([true, false])
  })

  it('⊆ mostra o elemento que sobra', () => {
    const r = verificar(
      grupos([
        ['S', 'A ⊆ B'],
        ['E', 'c ∈ A'],
        ['F', 'c ∉ B'],
      ]),
      [],
      OPCOES_PADRAO,
    )
    if (r.tipo !== 'sem-modelo') throw new Error(r.tipo)
    expect(explicacaoDe('S', r.explicacoes).passos.motivo).toMatch(/d. ∈ A, mas d. ∉ B/)
  })

  it('∃ sem testemunha', () => {
    const r = verificar(
      grupos([
        ['V', '∃x (x ∈ C)'],
        ['W', '∀y (y ∉ C)'],
      ]),
      [],
      OPCOES_PADRAO,
    )
    if (r.tipo !== 'sem-modelo') throw new Error(r.tipo)
    expect(explicacaoDe('V', r.explicacoes).passos.motivo).toMatch(/^nenhum x serve/)
    expect(textoDe(explicacaoDe('W', r.explicacoes).passos)).toMatch(/falha para y = d./)
  })

  it('nota que se contradiz sozinha: aponta as fórmulas em conflito dentro dela', () => {
    const r = verificar([{ id: 'X', rotulo: 'X', formulas: ['a ∈ b', 'Z(a)', 'a ∉ b'] }], [], OPCOES_PADRAO)
    if (r.tipo !== 'sem-modelo') throw new Error(r.tipo)
    const e = r.explicacoes[0]
    expect(e.tipo).toBe('sozinha')
    if (e.tipo !== 'sozinha') return
    expect(e.formulas.sort()).toEqual(['a ∈ b', 'a ∉ b'])
    expect(e.explicacoes).toHaveLength(2)
  })

  it('variável do quantificador vira o objeto na fórmula exibida, sem mexer em variáveis internas', () => {
    const r = verificar(
      grupos([
        ['G', '∀x (x ∈ A ⟹ ∃x (x ∈ x))'],
        ['H', 'a ∈ A'],
        ['K', '∀y (y ∉ y)'],
      ]),
      [],
      OPCOES_PADRAO,
    )
    if (r.tipo !== 'sem-modelo') throw new Error(r.tipo)
    const corpo = explicacaoDe('G', r.explicacoes).passos.filhos[0]
    expect(corpo.formula).toMatch(/^d. ∈ A ⟹ \(∃x \(x ∈ x\)\)$/)
  })
})
