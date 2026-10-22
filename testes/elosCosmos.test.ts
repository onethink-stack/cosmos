import { describe, expect, it } from 'vitest'
import cadeia from '../src/dados/cadeia-F0-F4.json'
import outras from '../src/dados/cadeia-outras-F5-F8.json'
import pacote from '../src/dados/elos-assinados.json'
import { conferirElosCosmos } from '../src/motor/elosCosmos'
import { conferirCadeia } from '../src/motor/cadeiaPessoal'
import { assinar, gerarKeypair, PUBKEY_SELO_502426C, verificar } from '../src/motor/selo'
import { calcularHashTeoria } from '../src/motor/cadeiaCosmos'
import { PACOTE_COSMOS } from '../src/dados/pacoteCosmos'

const fases = [...cadeia.fases, ...outras.fases]

describe('assinaturas dos elos Cosmos', () => {
  it('confere os nove elos por C1–C8 e vincula seus hashes à chave fixada', async () => {
    expect((await conferirCadeia(pacote.cadeia)).veredito).toBe('aceita')
    const resultado = await conferirElosCosmos(pacote, fases)
    expect(resultado.verificado).toBe(true)
    expect(resultado.cabeca).toMatch(/^[a-f0-9]{64}$/)
    for (const elo of pacote.elos_assinados) expect(verificar(elo.hash_teoria, elo.assinatura, PUBKEY_SELO_502426C)).toBe(true)
  })
  it('gera um par novo e verifica assinatura sem usar a chave privada do selo no teste', () => {
    const par = gerarKeypair()
    const hash = fases[0].hash_teoria
    const assinatura = assinar(hash, par.secretKey)
    const pubkey = [...par.publicKey].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(verificar(hash, assinatura, pubkey)).toBe(true)
    expect(verificar('0'.repeat(64), assinatura, pubkey)).toBe(false)
    expect(verificar(hash, assinatura, PUBKEY_SELO_502426C)).toBe(false)
    expect(verificar(hash, 'inválida', pubkey)).toBe(false)
    expect(() => assinar('hash inválido', par.secretKey)).toThrow()
    par.secretKey.fill(0)
  })
  it('recusa ausência, truncamento, reordenação e duplicação dos elos', async () => {
    expect((await conferirElosCosmos(null, fases)).verificado).toBe(false)
    for (const mutacao of ['truncar', 'reordenar', 'duplicar']) {
      const adulterado = structuredClone(pacote)
      if (mutacao === 'truncar') adulterado.cadeia.elos.pop()
      if (mutacao === 'reordenar') adulterado.cadeia.elos.reverse()
      if (mutacao === 'duplicar') adulterado.elos_assinados[1] = adulterado.elos_assinados[0]
      expect((await conferirElosCosmos(adulterado, fases)).verificado).toBe(false)
    }
  })
  it('detecta C4, C5 e C8 reais, sem aprovar dados adulterados', async () => {
    for (const [campo, valor, motivo] of [['indice', 7, 'C4'], ['anterior', '1'.repeat(64), 'C5'], ['assinatura', '0'.repeat(128), 'C8']] as const) {
      const adulterado = structuredClone(pacote)
      Object.assign(adulterado.cadeia.elos[0], { [campo]: valor })
      expect((await conferirCadeia(adulterado.cadeia)).motivo).toBe(motivo)
      expect((await conferirElosCosmos(adulterado, fases)).verificado).toBe(false)
    }
  })
  it('exercita recusas C1, C2, C3, C6 e C7 do validador original', async () => {
    const casos: Array<[string, (c: typeof pacote.cadeia) => void]> = [
      ['C1', (c) => { c.elos = [] }],
      ['C2', (c) => { c.formato = 'outro' }],
      ['C3', (c) => { c.chave = '0'.repeat(64) }],
      ['C6', (c) => { c.elos[0].registroTexto = '{inválido' }],
      ['C7', (c) => { const r = JSON.parse(c.elos[0].registroTexto); r.autor = '0'.repeat(64); c.elos[0].registroTexto = JSON.stringify(r) }],
    ]
    for (const [motivo, alterar] of casos) {
      const c = structuredClone(pacote.cadeia)
      alterar(c)
      expect((await conferirCadeia(c)).motivo).toBe(motivo)
    }
  })
  it('recusa assinatura isolada alterada, selo falso e chave substituída', async () => {
    for (const campo of ['assinatura', 'selo', 'chave']) {
      const adulterado = structuredClone(pacote)
      if (campo === 'assinatura') adulterado.elos_assinados[0].assinatura = '0'.repeat(128)
      if (campo === 'selo') adulterado.selo = 'outro'
      if (campo === 'chave') adulterado.cadeia.chave = '0'.repeat(64)
      expect((await conferirElosCosmos(adulterado, fases)).verificado).toBe(false)
    }
  })
  it('recusa fase alterada mesmo com hash recalculado', async () => {
    const adulteradas = structuredClone(fases)
    adulteradas[0].situacao = 'fechado'
    adulteradas[0].hash_teoria = await calcularHashTeoria(adulteradas[0])
    expect((await conferirElosCosmos(pacote, adulteradas)).verificado).toBe(false)
  })
  it('mantém as outras fases puras e inclui todas na cadeia assinada', () => {
    expect(outras.fases.map((fase) => fase.id)).toEqual(['F5', 'F6', 'F7', 'F8'])
    for (const fase of outras.fases) expect(fase.pessoa).toBeNull()
    expect(pacote.elos_assinados.map((elo) => elo.fase)).toEqual(['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])
  })
  it('confere o pacote público com nove fases e sem chave privada', async () => {
    expect(PACOTE_COSMOS.fases).toHaveLength(9)
    expect(PACOTE_COSMOS.pubkey).toBe(PUBKEY_SELO_502426C)
    expect((await conferirElosCosmos(PACOTE_COSMOS, PACOTE_COSMOS.fases)).verificado).toBe(true)
    expect(Object.keys(PACOTE_COSMOS)).toEqual(['formato', 'selo', 'pubkey', 'fases', 'elos_assinados', 'cadeia', 'resumo_final', 'carimbo_ots'])
    expect(PACOTE_COSMOS.resumo_final).toBe((await conferirCadeia(PACOTE_COSMOS.cadeia)).cabeca)
    expect(PACOTE_COSMOS.carimbo_ots).toBe('pendente')
  })
  it('recusa F8 adulterada e a remoção conjunta dos quatro elos finais', async () => {
    const adulteradas = structuredClone(fases)
    adulteradas[8].situacao = 'fechado'
    adulteradas[8].hash_teoria = await calcularHashTeoria(adulteradas[8])
    expect((await conferirElosCosmos(pacote, adulteradas)).verificado).toBe(false)
    const truncado = structuredClone(pacote)
    truncado.cadeia.elos = truncado.cadeia.elos.slice(0, 5)
    truncado.elos_assinados = truncado.elos_assinados.slice(0, 5)
    expect((await conferirElosCosmos(truncado, fases.slice(0, 5))).verificado).toBe(false)
    expect((await conferirElosCosmos({ ...PACOTE_COSMOS, resumo_final: '0'.repeat(64) }, fases)).verificado).toBe(false)
  })
})
