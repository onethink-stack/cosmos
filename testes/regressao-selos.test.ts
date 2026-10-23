import { describe, expect, it } from 'vitest'
import { verificarSelosCosmos } from '../src/motor/cadeiaCosmos'
import { PACOTE_COSMOS } from '../src/dados/pacoteCosmos'

describe('quatro selos sem promover assinatura a prova', () => {
  it('v1 assinada tem integridade e assinatura válidas, conclusão inconclusiva', async () => {
    expect(await verificarSelosCosmos(PACOTE_COSMOS.fases[2], PACOTE_COSMOS)).toEqual({
      integridade: 'valida', assinatura: 'valida', provaFormal: 'nao_aplicavel', timestamp: 'pendente', conclusao: 'inconclusivo',
    })
  })
  it('distingue assinatura ausente de conteúdo adulterado', async () => {
    expect((await verificarSelosCosmos(PACOTE_COSMOS.fases[0], null)).assinatura).toBe('ausente')
    const fase = { ...PACOTE_COSMOS.fases[0], afirmacao: 'outra' }
    expect((await verificarSelosCosmos(fase, PACOTE_COSMOS)).conclusao).toBe('invalida')
  })
  it('carimbo declarado confirmado não é prova', async () => {
    const p = { ...PACOTE_COSMOS, carimbo_ots: 'confirmado' }
    expect((await verificarSelosCosmos(PACOTE_COSMOS.fases[0], p)).timestamp).not.toBe('confirmado')
  })
})
