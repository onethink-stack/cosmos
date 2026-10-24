import { describe, expect, it, vi } from 'vitest'
import { FORMATO_CONFIGURACAO_INTEGRACAO } from '../src/integracoes/contratos'
import { TETOS_P0, POLITICA_SAIDA_P0 } from '../src/integracoes/politica'
import { resolverCredencialSimulada } from '../src/integracoes/credenciais-node'
import { criarProvedorSimulado } from '../src/integracoes/provedores-node'

const config = () => ({ formato: FORMATO_CONFIGURACAO_INTEGRACAO, id: 'local', revisao: 1,
  provedor: 'simulado', destino: 'sem-rede', modelo: 'resposta-simulada-v1', habilitada: true,
  limites: { ...TETOS_P0 }, permissoes: { envioRemoto: false, fontesPrivadas: false } })
describe('P0 credenciais e adaptador sem rede', () => {
  it('resolve somente metadados sem chave ou referência de cofre', () => {
    const r = resolverCredencialSimulada(config())
    expect(r).toEqual({ configuracaoId: 'local', configuracaoRevisao: 1,
      metadados: { apiProvedor: 'nao-aplicavel', sessao: 'nao-incluida', carteira: 'fora-do-escopo' } })
    expect(Object.isFrozen(r)).toBe(true); expect(Object.isFrozen(r.metadados)).toBe(true)
  })
  it('recusa segredo, sessão, seed, URL e referência de arquivo sem refletir valores', () => {
    for (const campo of ['apiKey', 'token', 'seed', 'endpoint', 'credencialRef']) {
      expect(() => resolverCredencialSimulada({ ...config(), [campo]: 'NAO-REFLETIR' })).toThrow()
      try { resolverCredencialSimulada({ ...config(), [campo]: 'NAO-REFLETIR' }) }
      catch (e) { expect(String(e)).not.toContain('NAO-REFLETIR') }
    }
  })
  it('não executa accessor da configuração', () => {
    const getter = vi.fn(() => 'SEGREDO')
    const c = Object.defineProperty(config(), 'provedor', { enumerable: true, get: getter })
    expect(() => resolverCredencialSimulada(c)).toThrow(); expect(getter).not.toHaveBeenCalled()
  })
  it('não chama fetch e mantém saída totalmente negada', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Não chamar'))
    try {
      const r = await criarProvedorSimulado().testar(config(), new AbortController().signal)
      expect(r.estado).toBe('conectado'); expect(fetch).not.toHaveBeenCalled()
      expect(POLITICA_SAIDA_P0).toMatchObject({ acessoRede: false, resolverDns: false, seguirRedirecionamentos: false, destinosPermitidos: [] })
    } finally { fetch.mockRestore() }
  })
  it('recusa parâmetros simulados inválidos', () => {
    for (const atrasoMs of [-1, .5, NaN, Infinity, 10001]) expect(() => criarProvedorSimulado({ atrasoMs })).toThrow()
    expect(() => criarProvedorSimulado({ resultado: 'segredo' as 'ok' })).toThrow()
  })
  it('cancelamento e configuração desativada não produzem conexão', async () => {
    const c = new AbortController(); c.abort()
    await expect(criarProvedorSimulado().testar(config(), c.signal)).rejects.toThrow('Teste cancelado')
    await expect(criarProvedorSimulado().testar({ ...config(), habilitada: false }, new AbortController().signal)).rejects.toThrow('Configuração desativada')
  })
})
