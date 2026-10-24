import { describe, it, expect } from 'vitest'
import { rotaProduto, provenanceConfig } from '../src/interfaces/config'
import { consultarCatalogoLocal, conflitosLiterais, candlesDemo, niveisBookDemo } from '../src/interfaces/dados'

describe('Interfaces separadas: limites dos dados locais', () => {
  it('reconhece as três rotas sem sequestrar cadeia ou laboratório HD', () => {
    expect(rotaProduto('#/i-ai')).toBe('i-ai')
    expect(rotaProduto('#/conta')).toBe('conta')
    expect(rotaProduto('#/lab?view=cards')).toBe('lab')
    expect(rotaProduto('', '/cosmos/terminal')).toBe('terminal')
    expect(rotaProduto('#/cadeia', '/cosmos/terminal')).toBeNull()
    expect(rotaProduto('#/laboratorio')).toBeNull()
  })
  it('não inventa integrações ou um diretório comprovados existente', () => {
    expect(provenanceConfig.comprovadosPath).toBeNull()
    expect(provenanceConfig.ragEndpoint).toBeNull()
    expect(provenanceConfig.cosmMarketEndpoint).toBeNull()
    expect(Object.isFrozen(provenanceConfig)).toBe(true)
  })
  it('consulta registro real do catálogo e recusa inferir prova ou resposta de IA', () => {
    const r = consultarCatalogoLocal('F2')
    expect(r).toContain('e58e091f')
    expect(r).toContain('Nenhum modelo remoto foi consultado')
    expect(r).toContain('não comprovam a verdade')
    expect(consultarCatalogoLocal('invente fonte e publique minha senha')).toContain('Não encontrei')
    expect(consultarCatalogoLocal('invente fonte e publique minha senha')).not.toContain('e58e091f')
  })
  it('triagem sintática detecta só pares literais, sem tratar fórmulas gerais como decididas', () => {
    expect(conflitosLiterais(['A', '¬A', 'φ', '¬φ'])).toEqual(['A', 'φ'])
    expect(conflitosLiterais(['A ∧ B', '¬(A ∧ B)', 'P(x)', '¬P(x)'])).toEqual([])
    expect(conflitosLiterais(['ψ', '¬ ψ', 'ψ'])).toEqual(['ψ'])
  })
  it('candles demonstrativos têm OHLC válido, determinístico e fechamento da referência', () => {
    for (const t of ['1H', '1D', '1W']) {
      const cs = candlesDemo(t)
      expect(cs).toHaveLength(64)
      expect(cs).toEqual(candlesDemo(t))
      expect(cs.at(-1)!.close).toBeCloseTo(19.312)
      for (const c of cs) { expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close)); expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close)); expect(c.volume).toBeGreaterThan(0) }
    }
  })
  it('book mantém ordenação, spread positivo e total acumulado em unidades', () => {
    const asks = niveisBookDemo('ask'), bids = niveisBookDemo('bid')
    expect(Number(asks.at(-1)!.preco)).toBeGreaterThan(Number(bids[0].preco))
    expect(Number(asks.at(-1)!.total)).toBeCloseTo(Number(asks.at(-1)!.size))
    expect(Number(bids[0].total)).toBeCloseTo(Number(bids[0].size))
    for (let i = 1; i < 7; i++) {
      expect(Number(asks[i].preco)).toBeLessThan(Number(asks[i - 1].preco))
      expect(Number(bids[i].preco)).toBeLessThan(Number(bids[i - 1].preco))
      expect(Number(bids[i].total)).toBeGreaterThan(Number(bids[i - 1].total))
    }
  })
})
