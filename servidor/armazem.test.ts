import { afterEach, describe, expect, it } from 'vitest'
import { bancoSqlite, abrir, respostasZ3 } from './armazem'
import { definirBanco, chaveProva } from '../src/motor/bancoProvas'
import { buscarModelo, OPCOES_PADRAO, prepararFormulas } from '../src/motor/motor'

afterEach(() => definirBanco(null))

describe('armazém do motor de fundo (SQLite)', () => {
  it('o banco de provas guarda e devolve o que o motor conferiu, entre conexões', () => {
    const arquivo = ':memory:'
    const db = abrir(arquivo)
    const banco = bancoSqlite(db)
    definirBanco(banco)
    const fs = prepararFormulas(['∀x (P(x) ⟹ Q(x))', 'P(a)', '¬Q(a)'], [])
    expect(buscarModelo(fs, { ...OPCOES_PADRAO, N: 5 }).status).toBe('sem-modelo')
    expect(banco.obter(chaveProva(fs))).toMatchObject({ status: 'sem-modelo', N: 5 })
    // de novo: vem do banco
    expect(buscarModelo(fs, { ...OPCOES_PADRAO, N: 5 }).status).toBe('sem-modelo')
    expect(banco.estatisticas.acertos).toBe(1)
    // um modelo também fica
    const outro = prepararFormulas(['P(a)'], [])
    expect(buscarModelo(outro, OPCOES_PADRAO).status).toBe('modelo')
    expect(bancoSqlite(db).obter(chaveProva(outro))).toMatchObject({ status: 'modelo', n: 1 })
  })

  it('as respostas do Z3 ficam guardadas (só sim/não), com as notas que a prova usou', () => {
    const db = abrir(':memory:')
    try {
      const z = respostasZ3(db)
      expect(z.obter('k')).toBeUndefined()
      z.guardar('k', 'unsat', 12, [0, 2])
      expect(z.obter('k')).toEqual({ resultado: 'unsat', nucleo: [0, 2] })
      z.guardar('s', 'sat', 3)
      expect(z.obter('s')).toEqual({ resultado: 'sat', nucleo: null })
    } finally {
      db.close()
    }
  })
})
