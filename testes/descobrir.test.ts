import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { validar } from '../src/logica/validador'
import { descobrir, descobrirComPrazo, gerarCandidatas } from '../src/motor/descobrir'
import { buscarModelo, OPCOES_PADRAO, perguntar, prepararFormulas, type Grupo } from '../src/motor/motor'

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

function consequencias(gs: Grupo[], d: EntradaDicionario[] = []) {
  const r = descobrir(gs, d, OPCOES_PADRAO)
  if (r.tipo !== 'consequencias') throw new Error(r.tipo)
  return r
}

describe('gerar candidatas', () => {
  it('usa as constantes, predicados e funções das notas', () => {
    const { candidatas } = gerarCandidatas(prepararFormulas(['P(a) ∧ f(a) = b'], []))
    const fs = candidatas.map((c) => c.formula)
    expect(fs).toContain('a = b')
    expect(fs).toContain('a ≠ b')
    expect(fs).toContain('∃x (x ∈ a)')
    expect(fs).toContain('b ∈ a')
    expect(fs).toContain('a ⊆ b')
    expect(fs).toContain('P(b)')
    expect(fs).toContain('¬P(a)')
    expect(fs).toContain('f(b) = a')
    expect(fs).not.toContain('a ⊆ a')
  })

  it('escolhe uma variável que não colide com as constantes', () => {
    const { candidatas } = gerarCandidatas(prepararFormulas(['x ∈ y', 'z = z'], []))
    expect(candidatas.find((c) => c.forma === 'nao-vazio')!.formula).toBe('∃w (w ∈ x)')
    // todas as candidatas são fórmulas válidas
    for (const c of candidatas) expect(validar(c.formula).ok, c.formula).toBe(true)
  })
})

describe('descobrir consequências', () => {
  it('acha a consequência e as notas de origem; tira o que já está escrito e o que é óbvio por igualdade', () => {
    const r = consequencias(
      grupos([
        ['regra', '∀x (P(x) ⟹ Q(x))'],
        ['fato', 'P(a)'],
        ['igual', 'a = b'],
      ]),
    )
    const fs = r.itens.map((i) => i.formula)
    expect(fs).toContain('Q(a)')
    expect(r.itens.find((i) => i.formula === 'Q(a)')!.notas.sort()).toEqual(['fato', 'regra'])
    expect(fs).not.toContain('P(a)') // já escrita
    expect(fs).not.toContain('a = b') // já escrita
    expect(fs).not.toContain('P(b)') // óbvia: a = b e P(a)
    expect(fs).not.toContain('Q(b)') // óbvia: a = b e Q(a)
    expect(r.jaNasNotas).toBeGreaterThanOrEqual(2)
  })

  it('com Ax1–Ax7: tudo o que lista segue de fato, e nada do que já está escrito aparece', () => {
    const r = consequencias(grupos(AX), DIC)
    const fs = r.itens.map((i) => i.formula)
    expect(fs.length).toBeGreaterThan(0)
    expect(fs).not.toContain('A ∉ A')
    // "A não é vazio" aparece, ou aparece algum "c ∈ A" (que já o implica)
    expect(fs.some((f) => f === '∃x (x ∈ A)' || / ∈ A$/.test(f))).toBe(true)
    // I também não é vazio (Ax3)
    expect(fs.some((f) => f === '∃x (x ∈ I)' || / ∈ I$/.test(f))).toBe(true)
    for (const it of r.itens) {
      expect(perguntar(grupos(AX), it.formula, DIC, OPCOES_PADRAO).tipo, it.formula).toBe('segue')
      // as notas de origem bastam sozinhas
      const so = grupos(AX).filter((g) => it.notas.includes(g.id))
      expect(perguntar(so, it.formula, DIC, OPCOES_PADRAO).tipo, `${it.formula} só com ${it.notas}`).toBe('segue')
    }
    // ~2,5 s num PC; em máquinas lentas (CI) passava dos 5 s padrão
  }, 30_000)

  it('notas contraditórias: avisa em vez de listar', () => {
    expect(descobrir(grupos([['a', 'A ∈ A'], ['b', 'A ∉ A']]), [], OPCOES_PADRAO).tipo).toBe('premissas-contraditorias')
  })

  it('sem notas', () => {
    expect(descobrir([], [], OPCOES_PADRAO).tipo).toBe('vazio')
  })
})

describe('descobrir com prazo (a etapa 7 da reação em cadeia)', () => {
  const folgado = { checagemMs: 30_000, totalMs: 120_000, limite: OPCOES_PADRAO.limite }

  it('acha as mesmas consequências, com as mesmas notas de origem, que a busca sem prazo', async () => {
    const sem = consequencias(grupos(AX), DIC)
    const com = await descobrirComPrazo(grupos(AX), DIC, OPCOES_PADRAO, folgado)
    if (com.tipo !== 'consequencias') throw new Error(com.tipo)
    expect(com.itens).toEqual(sem.itens)
    expect(com.semTempo).toBe(0)
  }, 60_000)

  it('sem tempo: termina na hora, sem dar como consequência nada que não foi provado', async () => {
    const ini = Date.now()
    const r = await descobrirComPrazo(grupos(AX), DIC, OPCOES_PADRAO, { ...folgado, totalMs: 0 })
    expect(Date.now() - ini).toBeLessThan(5_000)
    if (r.tipo !== 'consequencias') throw new Error(r.tipo)
    expect(r.semTempo).toBeGreaterThan(0)
    for (const it of r.itens) expect(perguntar(grupos(AX), it.formula, DIC, OPCOES_PADRAO).tipo, it.formula).toBe('segue')
  }, 60_000)

  it('uma checagem que passa do prazo fica sem decisão, nunca "sem modelo"', () => {
    const fs = prepararFormulas(['∀x (P(x) ⟹ Q(x))', 'P(a)', '¬Q(a)'], [])
    expect(buscarModelo(fs, OPCOES_PADRAO).status).toBe('sem-modelo')
    expect(buscarModelo(fs, { ...OPCOES_PADRAO, prazo: Date.now() - 1 }).status).toBe('grande-demais')
  })
})
