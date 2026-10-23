import { describe, expect, it } from 'vitest'
import { PACOTE_COSMOS } from '../src/dados/pacoteCosmos'
import internos from '../src/dados/elos-assinados.json'
import { conferirElosCosmos } from '../src/motor/elosCosmos'

describe('regressão do envelope Cosmos v1', () => {
  it.each(['formato', 'pubkey', 'carimbo_ots'])('recusa adulteração externa de %s', async (campo) => {
    const p: Record<string, unknown> = structuredClone(PACOTE_COSMOS)
    p[campo] = campo === 'pubkey' ? '0'.repeat(64) : 'adulterado'
    expect((await conferirElosCosmos(p, PACOTE_COSMOS.fases)).verificado).toBe(false)
  })
  it('não ignora fases do envelope quando o chamador passa fases válidas', async () => {
    const p = structuredClone(PACOTE_COSMOS)
    p.fases[0].afirmacao = 'mentira'
    expect((await conferirElosCosmos(p, PACOTE_COSMOS.fases)).verificado).toBe(false)
  })
  it('recusa campos externos desconhecidos e campos obrigatórios ausentes', async () => {
    expect((await conferirElosCosmos({ ...PACOTE_COSMOS, autorizacao: 'admin' }, PACOTE_COSMOS.fases)).verificado).toBe(false)
    const p: Record<string, unknown> = structuredClone(PACOTE_COSMOS)
    delete p.pubkey
    expect((await conferirElosCosmos(p, PACOTE_COSMOS.fases)).verificado).toBe(false)
  })
  it('distingue cadeia interna válida de envelope completo', async () => {
    const interno = await conferirElosCosmos(internos, PACOTE_COSMOS.fases)
    const externo = await conferirElosCosmos(PACOTE_COSMOS, PACOTE_COSMOS.fases)
    expect(interno).toMatchObject({ verificado: true, integridadeCadeia: true, validacaoEnvelopeCompleto: false })
    expect(externo).toMatchObject({ verificado: true, integridadeCadeia: true, validacaoEnvelopeCompleto: true })
  })
})
