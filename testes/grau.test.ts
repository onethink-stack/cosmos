import { describe, expect, it } from 'vitest'
import { notaVazia } from '../src/dados/estado'
import { grauHerdado } from '../src/dados/grau'
import type { Grau, Nota } from '../src/dados/tipos'

const lei = (id: string, grau: Grau): Nota => ({ ...notaVazia('lei'), id, grau })
const fato = (id: string): Nota => ({ ...notaVazia('fato'), id })
const notas = [lei('F1', 'F'), lei('D1', 'D'), lei('M1', 'M'), fato('X')]

describe('grau herdado', () => {
  it('é o mais fraco das notas de onde vem (F > D > M)', () => {
    expect(grauHerdado(['F1', 'X'], notas)).toEqual({ grau: 'F', por: { M: [], D: [] } })
    expect(grauHerdado(['F1', 'D1'], notas)).toEqual({ grau: 'D', por: { M: [], D: ['D1'] } })
    expect(grauHerdado(['D1', 'M1'], notas)).toEqual({ grau: 'M', por: { M: ['M1'], D: ['D1'] } })
    expect(grauHerdado([], notas).grau).toBe('F')
  })

  it('passa pela cadeia: um teorema usado como apoio leva junto o grau dele', () => {
    const t1 = grauHerdado(['D1'], notas)
    const t2 = grauHerdado(['T1:0', 'F1'], notas, new Map([['T1:0', t1]]))
    expect(t2).toEqual({ grau: 'D', por: { M: [], D: ['D1'] } })
  })
})
