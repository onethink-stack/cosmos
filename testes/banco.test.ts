import { afterEach, describe, expect, it } from 'vitest'
import { resumo } from '../src/logica/resumo'
import { bancoNaMemoria, chaveProva, definirBanco } from '../src/motor/bancoProvas'
import { buscarModelo, OPCOES_PADRAO, prepararFormulas } from '../src/motor/motor'

const op = { ...OPCOES_PADRAO, N: 6 }
afterEach(() => definirBanco(null))

describe('banco de provas', () => {
  it('a mesma pergunta vem inteira do banco, com qualquer ordem e nome de variável', () => {
    const b = bancoNaMemoria()
    definirBanco(b)
    const fs = prepararFormulas(['∀x (P(x) ⟹ Q(x))', 'P(a)', '¬Q(a)'], [])
    expect(buscarModelo(fs, op).status).toBe('sem-modelo')
    expect(b.estatisticas).toMatchObject({ faltas: 1, acertos: 0 })
    const outra = prepararFormulas(['¬Q(a)', 'P(a)', '∀y (P(y) ⟹ Q(y))'], [])
    expect(chaveProva(outra)).toBe(chaveProva(fs))
    expect(buscarModelo(outra, op).status).toBe('sem-modelo')
    expect(b.estatisticas.acertos).toBe(1)
  })

  it('a chave é curta (um resumo), por maior que seja o conjunto, e muda quando as fórmulas mudam', () => {
    const muitas = prepararFormulas(
      Array.from({ length: 300 }, (_, i) => `∀x ∀y (R${i}(x, y) ⟹ R${i + 1}(y, x))`),
      [],
    )
    expect(chaveProva(muitas).length).toBeLessThan(40)
    expect(chaveProva(muitas.slice(1))).not.toBe(chaveProva(muitas))
    expect(resumo('a')).toBe(resumo('a'))
    expect(new Set(Array.from({ length: 5000 }, (_, i) => resumo(`P(c${i})`))).size).toBe(5000)
  })

  it('aprofundar só testa os tamanhos novos; um modelo achado vale para sempre', () => {
    const b = bancoNaMemoria()
    definirBanco(b)
    // "no máximo 4 objetos" não tem contraexemplo até 4; com 5, tem
    const ate4 = prepararFormulas(['¬∀x ∀y ∀z ∀w ∀v (x = y ∨ x = z ∨ x = w ∨ x = v ∨ y = z ∨ y = w ∨ y = v ∨ z = w ∨ z = v ∨ w = v)'], [])
    expect(buscarModelo(ate4, { ...op, N: 4 }).status).toBe('sem-modelo')
    const testados: string[] = []
    const r = buscarModelo(ate4, { ...op, N: 6 }, (m) => testados.push(m))
    expect(r).toMatchObject({ status: 'modelo', n: 5 })
    expect(testados).toEqual(['testando 5 objetos'])
    expect(b.estatisticas.parciais).toBe(1)
    // agora o modelo vem do banco; pedindo só até 4, continua "sem modelo"
    expect(buscarModelo(ate4, { ...op, N: 8 })).toMatchObject({ status: 'modelo', n: 5 })
    expect(buscarModelo(ate4, { ...op, N: 4 }).status).toBe('sem-modelo')
    expect(b.estatisticas.acertos).toBe(2)
  })
})
