import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { imprimir } from '../src/logica/impressao'
import { temAritmetica } from '../src/logica/termos'
import { validar } from '../src/logica/validador'
import { analisar, OPCOES_PADRAO, perguntar } from '../src/motor/motor'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0, numerico = false): EntradaDicionario => ({
  id: simbolo,
  simbolo,
  tipo,
  aridade,
  termo: simbolo,
  definicao: '',
  ...(numerico ? { numerico: true } : {}),
})
const D = [ficha('m', 'constante', 0, true), ficha('v', 'constante', 0, true), ficha('h', 'funcao', 1, true), ficha('a', 'constante'), ficha('P', 'predicado', 1)]
const codigos = (t: string, d = D) => validar(t, d).diags.map((x) => x.codigo)

describe('números na linguagem', () => {
  it('lê contas, comparações e ∀x∈ℝ', () => {
    for (const t of ['m > 0', 'm · v + 2 ≤ 10', '−v^2 < 0 ∨ v = 0', '∀x∈ℝ (h(x) > 0)', '∀x∈ℝ ∀y∈ℝ (x < y ⟹ h(y) < h(x))', 'm >= 0.5', 'v / m - 1 != 3'])
      expect(validar(t, D).ok, t).toBe(true)
  })

  it('imprime com os parênteses necessários', () => {
    const p = (t: string) => imprimir(validar(t, D).ast!)
    expect(p('(m + v) · 2 = m − (v − 1)')).toBe('(m + v) · 2 = m − (v − 1)')
    expect(p('m · v + 2 = −(m + v)')).toBe('m · v + 2 = −(m + v)')
    expect(p('m^2^3 = (m^2)^3')).toBe('m^2^3 = (m^2)^3')
    expect(p('m <= v')).toBe('m ≤ v')
  })

  it('número e objeto não se misturam (E15)', () => {
    expect(codigos('a + 1 = 2')).toContain('E15')
    expect(codigos('P(m)')).toContain('E15')
    expect(codigos('m = a')).toContain('E15')
    expect(codigos('∀x∈ℝ (x ∈ a)')).toContain('E15')
    expect(codigos('∀x (x > 0)')).toContain('E15')
    expect(codigos('m ∈ a')).toContain('E15')
  })

  it('nome sem ficha numa conta vira ficha numérica', () => {
    const d = validar('k · 2 > c', [], { exigirFichas: true }).diags.filter((x) => x.codigo === 'E12')
    expect(d.map((x) => [x.ficha!.simbolo, x.ficha!.numerico])).toEqual([
      ['k', true],
      ['c', true],
    ])
  })

  it('o motor finito deixa as fórmulas com números para o Z3', () => {
    expect(temAritmetica(validar('m > 0', D).ast!)).toBe(true)
    expect(temAritmetica(validar('m = v', D).ast!, (n) => n === 'm')).toBe(true)
    expect(temAritmetica(validar('P(a)', D).ast!)).toBe(false)
    expect(analisar(['m > 0', 'P(a)'], D).map((x) => x.texto)).toEqual(['P(a)'])
    expect(analisar(['m > 0', 'P(a)'], D, true)).toHaveLength(2)
    const r = perguntar([{ id: 'L', rotulo: 'L', formulas: ['m > 0', 'P(a)'] }], 'm ≥ 0', D, OPCOES_PADRAO)
    expect(r.tipo).toBe('aritmetica')
    // a lei com números não atrapalha a parte lógica
    expect(perguntar([{ id: 'L', rotulo: 'L', formulas: ['m > 0', 'P(a)'] }], '∃x P(x)', D, OPCOES_PADRAO).tipo).toBe('segue')
  })
})
