import { describe, expect, it } from 'vitest'
import { add, sub, mul, qsqrt2, toString } from '../src/motor/qsqrt2'

describe('aritmética exata dos coeficientes Cosmos', () => {
  it('preserva √2² = 2 e (1 + √2)² = 3 + 2√2', () => {
    expect(mul(qsqrt2(0, 1), qsqrt2(0, 1))).toEqual(qsqrt2(2, 0))
    expect(mul(qsqrt2(1, 1), qsqrt2(1, 1))).toEqual(qsqrt2(3, 2))
  })
  it('soma, subtrai e escreve os coeficientes de F2–F4', () => {
    expect(add(qsqrt2(1, 0), qsqrt2(0, 1))).toEqual(qsqrt2(1, 1))
    expect(sub(qsqrt2(2, 1), qsqrt2(1, 0))).toEqual(qsqrt2(1, 1))
    expect(toString(qsqrt2(0, 1))).toBe('0 + 1√2')
    expect(toString(qsqrt2(2, -1))).toBe('2 - 1√2')
  })
  it('recusa floats, NaN e overflow em vez de produzir aproximação', () => {
    expect(() => qsqrt2(0.1, 1)).toThrow()
    expect(() => qsqrt2(NaN, 1)).toThrow()
    expect(() => add(qsqrt2(Number.MAX_SAFE_INTEGER, 0), qsqrt2(1, 0))).toThrow()
    expect(() => mul(qsqrt2(Number.MAX_SAFE_INTEGER, 1), qsqrt2(2, 1))).toThrow()
  })
})
