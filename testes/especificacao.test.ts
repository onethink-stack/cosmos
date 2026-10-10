import { describe, expect, it } from 'vitest'
import { estimarEspecificacao, memoriaTexto, quantidadeTexto } from '../src/dados/especificacao'
import { notaVazia } from '../src/dados/estado'
import type { Nota } from '../src/dados/tipos'

const nota = (id: string, compartimento: Nota['compartimento'], formulas: string[]): Nota => ({ ...notaVazia(compartimento), id, formulas })

describe('especificação', () => {
  it('mede o crescimento do caderno e diz até onde cabe', () => {
    const notas = [nota('L1', 'lei', ['∀x ∀y ∀z (R(x, y) ∧ R(y, z) ⟹ R(x, z))', 'R(a, b)']), nota('T1', 'teorema', ['∃x R(x, x) ∨ ¬R(b, a)'])]
    const e = estimarEspecificacao(notas, [], [10, 100, 1000])!
    // três quantificadores aninhados: cresce perto de N³
    expect(e.expoente).toBeGreaterThan(2.5)
    expect(e.expoente).toBeLessThan(4)
    expect(e.linhas.map((l) => l.cabe)).toEqual([true, true, false])
    expect(e.maiorN).toBeGreaterThan(100)
    expect(e.linhas[2].clausulas).toBeGreaterThan(e.linhas[1].clausulas * 300)
  })

  it('escreve memória e quantidades em português', () => {
    expect(memoriaTexto(1.5e9)).toBe('1,5 GB')
    expect(memoriaTexto(350e12)).toBe('350 TB')
    expect(quantidadeTexto(2_400_000)).toBe('2,4 milhões')
    expect(quantidadeTexto(1.3e12)).toBe('1,3 trilhão')
  })
})
