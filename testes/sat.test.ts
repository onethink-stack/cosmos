import { describe, expect, it } from 'vitest'
import { resolver } from '../src/motor/sat'
import { resolverReferencia } from './apoio/satReferencia'

/** gerador pseudoaleatório com semente (os testes repetem igual) */
function aleatorio(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cnfAleatoria(r: () => number, nVars: number, nClausulas: number, tam: number): number[][] {
  return Array.from({ length: nClausulas }, () =>
    Array.from({ length: tam }, () => (1 + Math.floor(r() * nVars)) * (r() < 0.5 ? -1 : 1)),
  )
}

const satisfaz = (cs: number[][], valores: Int8Array) => cs.every((c) => c.some((l) => valores[Math.abs(l)] === (l > 0 ? 1 : -1)))

function forcaBruta(nVars: number, cs: number[][]): boolean {
  const v = new Int8Array(nVars + 1)
  for (let m = 0; m < 1 << nVars; m++) {
    for (let i = 1; i <= nVars; i++) v[i] = m & (1 << (i - 1)) ? 1 : -1
    if (satisfaz(cs, v)) return true
  }
  return false
}

/** n+1 pombos em n casas: sem solução, e difícil (muitos conflitos) */
function pombos(n: number): { nVars: number; cs: number[][] } {
  const x = (p: number, c: number) => p * n + c + 1
  const cs: number[][] = []
  for (let p = 0; p <= n; p++) cs.push([...Array(n).keys()].map((c) => x(p, c)))
  for (let c = 0; c < n; c++) for (let p = 0; p <= n; p++) for (let q = p + 1; q <= n; q++) cs.push([-x(p, c), -x(q, c)])
  return { nVars: (n + 1) * n, cs }
}

describe('resolvedor SAT', () => {
  it('concorda com a força bruta em problemas pequenos', () => {
    const r = aleatorio(1)
    for (let k = 0; k < 600; k++) {
      const nVars = 3 + Math.floor(r() * 10)
      const cs = cnfAleatoria(r, nVars, Math.floor(nVars * (2 + r() * 4)), 1 + Math.floor(r() * 3))
      const res = resolver(nVars, cs)
      expect(res.sat).toBe(forcaBruta(nVars, cs))
      if (res.sat) expect(satisfaz(cs, res.valores)).toBe(true)
    }
  })

  it('concorda com o resolvedor anterior em 3-SAT difícil (perto do limiar)', () => {
    const r = aleatorio(7)
    let sat = 0
    let unsat = 0
    for (let k = 0; k < 120; k++) {
      const nVars = 60 + Math.floor(r() * 60)
      const cs = cnfAleatoria(r, nVars, Math.round(nVars * 4.26), 3)
      const novo = resolver(nVars, cs)
      expect(novo.sat).toBe(resolverReferencia(nVars, cs).sat)
      if (novo.sat) {
        expect(satisfaz(cs, novo.valores)).toBe(true)
        sat++
      } else unsat++
    }
    expect(sat).toBeGreaterThan(10)
    expect(unsat).toBeGreaterThan(10)
    // ~4 s sozinho num PC; com a suíte inteira rodando junto passava dos 5 s padrão
  }, 30_000)

  it('limpa as cláusulas aprendidas em buscas longas e continua certo', () => {
    const { nVars, cs } = pombos(7)
    const est = { conflitos: 0, decisoes: 0, aprendidas: 0, limpezas: 0 }
    expect(resolver(nVars, cs, { estatisticas: est }).sat).toBe(false)
    expect(est.conflitos).toBeGreaterThan(2000)
    expect(est.limpezas).toBeGreaterThan(0)
  })

  it('para no prazo', () => {
    const { nVars, cs } = pombos(10)
    const ini = Date.now()
    expect(resolver(nVars, cs, { prazo: Date.now() + 300 }).sat).toBe(null)
    expect(Date.now() - ini).toBeLessThan(3000)
  })
})
