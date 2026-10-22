import { describe, expect, it } from 'vitest'
import cadeia from '../src/dados/cadeia-F0-F4.json'
import { VOCAB_COSMOS } from '../src/dados/vocabularioCosmos'
import { conferirFaseCosmos, progressoCosmos, validarFaseCosmos, verificarHashTeoria } from '../src/motor/cadeiaCosmos'
import outras from '../src/dados/cadeia-outras-F5-F8.json'

describe('vocabulário e validação simbólica Cosmos', () => {
  it('mantém exatamente as cinco fases e seus treze campos', () => {
    expect(cadeia.fases.map((fase) => fase.id)).toEqual(VOCAB_COSMOS.fases)
    for (const fase of cadeia.fases) expect(Object.keys(fase)).toEqual(VOCAB_COSMOS.campos13)
  })
  for (const id of ['F2', 'F3', 'F4']) {
    it(`${id}: aceita as testemunhas e o campo simbólico canônicos`, () => {
      expect(validarFaseCosmos(cadeia.fases.find((fase) => fase.id === id)!)).toEqual({ valida: true, aplica: true, erros: [] })
    })
    for (const testemunha of ['Z35', 'Z39', 'Z350/Z390', null, 35]) {
      it(`${id}: recusa testemunha incompleta ${testemunha}`, () => {
        expect(validarFaseCosmos({ id, testemunha, campo: VOCAB_COSMOS.campo }).valida).toBe(false)
      })
    }
    for (const campo of ['1.4142135623730951', 1.4142135623730951, 'Q(sqrt2)', null]) {
      it(`${id}: recusa campo não canônico ${campo}`, () => {
        expect(validarFaseCosmos({ id, testemunha: ['Z35', 'Z39'], campo }).valida).toBe(false)
      })
    }
  }
  it('não impõe a regra F2/F3 às outras fases', () => {
    for (const id of ['F0', 'F1']) expect(validarFaseCosmos({ id, campo: null, testemunha: [] }).aplica).toBe(false)
  })
})

describe('conferência dos metadados e progresso', () => {
  it('confere todas as fases canônicas sem exigir pessoa em F0', () => {
    for (const fase of cadeia.fases) expect(conferirFaseCosmos(fase).valida).toBe(true)
    expect(conferirFaseCosmos(cadeia.fases[0]).pessoaExigida).toBe(false)
  })
  it('recusa selo alterado, campos extras, campos ausentes e pessoa errada', () => {
    const fase = cadeia.fases[1]
    expect(conferirFaseCosmos({ ...fase, selo: 'outro' }).valida).toBe(false)
    expect(conferirFaseCosmos({ ...fase, extra: 'campo' }).valida).toBe(false)
    const { gramatica: _gramatica, ...incompleta } = fase
    expect(conferirFaseCosmos(incompleta).valida).toBe(false)
    expect(conferirFaseCosmos({ ...fase, pessoa: null }).valida).toBe(false)
  })
  it('exige testemunhas e campo exato também em F4', () => {
    expect(conferirFaseCosmos({ ...cadeia.fases[4], testemunha: 'Z35' }).valida).toBe(false)
    expect(conferirFaseCosmos({ ...cadeia.fases[4], campo: 1.4142135623730951 }).valida).toBe(false)
  })
  it('recusa situações, afirmações e identificadores desconhecidos', () => {
    for (const alteracao of [{ situacao: 'qualquer' }, { afirmacao: 'qualquer' }, { id: 'F9' }]) {
      expect(conferirFaseCosmos({ ...cadeia.fases[1], ...alteracao }).valida).toBe(false)
    }
  })
  it('calcula duas fases fechadas como 40%, três abertas como 60%', () => {
    expect(progressoCosmos(cadeia.fases)).toEqual({ total: 5, fechadas: 2, abertas: 3, percentualFechado: 40, percentualAberto: 60 })
    expect(progressoCosmos([]).percentualFechado).toBe(0)
  })
})

describe('hashes e fases adicionais', () => {
  it('confere todos os hashes SHA-256 dos 12 campos e os metadados', async () => {
    for (const fase of [...cadeia.fases, ...outras.fases]) {
      expect(Object.keys(fase)).toEqual(VOCAB_COSMOS.campos13)
      expect(conferirFaseCosmos(fase).erros).toEqual([])
      expect(await verificarHashTeoria(fase)).toBe(true)
    }
    expect(outras.fases.map((fase) => fase.id)).toEqual(['F5', 'F6', 'F7', 'F8'])
  })
  it('detecta adulteração de conteúdo mesmo quando o hash parece hexadecimal válido', async () => {
    expect(await verificarHashTeoria({ ...cadeia.fases[2], estado: 'adulterado' })).toBe(false)
    expect(await verificarHashTeoria({ ...cadeia.fases[2], hash_teoria: '0'.repeat(64) })).toBe(false)
  })
  it('recusa repr incoerente, aproximação e testemunhas duplicadas', () => {
    const fase = cadeia.fases[2]
    for (const alteracao of [{ campo: { a: 0, b: 1, repr: '1.414' } }, { campo: { a: 0.1, b: 1 } }, { testemunha: ['Z35', 'Z35'] }]) {
      expect(validarFaseCosmos({ ...fase, ...alteracao }).valida).toBe(false)
    }
  })
})
