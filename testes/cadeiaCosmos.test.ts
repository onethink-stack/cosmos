import { describe, expect, it } from 'vitest'
import cadeia from '../src/dados/cadeia-F0-F4.json'
import { VOCAB_COSMOS } from '../src/dados/vocabularioCosmos'
import { validarFaseCosmos } from '../src/motor/cadeiaCosmos'

describe('vocabulário e validação simbólica Cosmos', () => {
  it('mantém exatamente as cinco fases e seus treze campos', () => {
    expect(cadeia.fases.map((fase) => fase.id)).toEqual(VOCAB_COSMOS.fases)
    for (const fase of cadeia.fases) expect(Object.keys(fase)).toEqual(VOCAB_COSMOS.campos13)
  })
  for (const id of ['F2', 'F3']) {
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
        expect(validarFaseCosmos({ id, testemunha: 'Z35/Z39', campo }).valida).toBe(false)
      })
    }
  }
  it('não impõe a regra F2/F3 às outras fases', () => {
    for (const id of ['F0', 'F1', 'F4']) expect(validarFaseCosmos({ id, campo: null, testemunha: null }).aplica).toBe(false)
  })
})
