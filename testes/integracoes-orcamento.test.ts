import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarOrcamentoSessao } from '../src/integracoes/orcamento-node'
import { criarExecutorSimulado, validarPedidoExecucao } from '../src/integracoes/execucao-node'
import { FORMATO_CONFIGURACAO_INTEGRACAO, type LimitesIntegracao } from '../src/integracoes/contratos'
import { TETOS_P0 } from '../src/integracoes/politica'

const config = (limites: Partial<LimitesIntegracao> = {}, revisao = 1) => ({
  formato: FORMATO_CONFIGURACAO_INTEGRACAO, id: 'local', revisao, provedor: 'simulado', destino: 'sem-rede', modelo: 'resposta-simulada-v1', habilitada: true,
  limites: { ...TETOS_P0, ...limites }, permissoes: { envioRemoto: false, fontesPrivadas: false },
})
const pedido = (id = 'p1') => ({ id, entrada: 'abc', maxTokensSaida: 20 })
afterEach(() => vi.useRealTimers())

describe('P0 orçamento por sessão: reserva e reconciliação', () => {
  it('reserva integralmente antes de despachar e só libera saldo após reconciliação', () => {
    const o = criarOrcamentoSessao(), c = config({ maxTokensSessao: 100, maxTokensSaida: 50 })
    const r = o.reservar(c, 80)
    expect(o.estado()).toEqual({ pedidos: 1, ativos: 1, unidadesReservadas: 80, unidadesDebitas: 0 })
    r.concluir(30)
    expect(o.estado()).toEqual({ pedidos: 1, ativos: 0, unidadesReservadas: 0, unidadesDebitas: 30 })
    expect(() => o.reservar(c, 71)).toThrow('quota_tokens')
    o.reservar(c, 70).concluir(70)
    expect(o.estado().unidadesDebitas).toBe(100)
  })
  it('uso desconhecido conserva reserva e reconciliação é idempotente', () => {
    const o = criarOrcamentoSessao(), r = o.reservar(config(), 80)
    expect(r.concluir(null)).toEqual(r.concluir(null))
    expect(o.estado().unidadesDebitas).toBe(80)
    expect(() => r.concluir(0)).toThrow('Reconciliação divergente')
    expect(o.estado().ativos).toBe(0)
  })
  it('reconciliação fora da reserva não libera saldo', () => {
    const o = criarOrcamentoSessao(), r = o.reservar(config(), 5)
    for (const n of [-1, 6, Infinity, NaN, .5]) expect(() => r.concluir(n)).toThrow()
    expect(o.estado().unidadesReservadas).toBe(5)
    r.concluir(null)
  })
  it('nega segunda reserva concorrente atomicamente', () => {
    const o = criarOrcamentoSessao(), r = o.reservar(config(), 10)
    expect(() => o.reservar(config(), 10)).toThrow('concorrencia_execucao')
    expect(o.estado().pedidos).toBe(1); r.concluir(0)
  })
  it('limite de pedidos inclui cancelamentos sem consumo', () => {
    const o = criarOrcamentoSessao(), c = config({ maxRequisicoesSessao: 1 })
    o.reservar(c, 10).concluir(0)
    expect(() => o.reservar(c, 10)).toThrow('quota_pedidos')
  })
  it('janela móvel não zera ao atravessar limite de minuto fixo', () => {
    let t = 59999
    const o = criarOrcamentoSessao(() => t), c = config({ requisicoesPorMinuto: 1 })
    o.reservar(c, 1).concluir(0); t = 60000
    expect(() => o.reservar(c, 1)).toThrow('limite_minuto')
    t = 119998; expect(() => o.reservar(c, 1)).toThrow('limite_minuto')
    t = 119999; o.reservar(c, 1).concluir(0)
  })
  it('nova revisão/novo id não apaga consumo e limite reduzido bloqueia', () => {
    const o = criarOrcamentoSessao()
    o.reservar(config(), 100).concluir(100)
    const c = { ...config({ maxTokensSessao: 100, maxTokensSaida: 50 }, 2), id: 'outro' }
    expect(() => o.reservar(c, 1)).toThrow('quota_tokens')
    expect(o.estado().unidadesDebitas).toBe(100)
  })
  it('recusa unidades inválidas e relógio regressivo antes da mutação', () => {
    let t = 100
    const o = criarOrcamentoSessao(() => t)
    for (const n of [0, -1, .5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => o.reservar(config(), n)).toThrow()
    o.reservar(config(), 1).concluir(0); t = 99
    expect(() => o.reservar(config(), 1)).toThrow('Relógio')
    expect(o.estado().pedidos).toBe(1)
  })
})

describe('P0 execução e cancelamento sem provedor real', () => {
  it('repetições concorrentes e concluídas compartilham promessa, reserva e resultado', async () => {
    vi.useFakeTimers()
    const e = criarExecutorSimulado({ atrasoMs: 20 }), c = config()
    const p = e.executar(c, pedido())
    expect(e.executar(c, pedido())).toBe(p)
    expect(e.estado().unidadesReservadas).toBe(23)
    await vi.runAllTimersAsync()
    const r = await p
    expect(r).toMatchObject({ estado: 'concluida', simulado: true, resposta: 'Resposta local.', uso: { reservado: 23, debitado: 18, medicao: 'simulada' } })
    expect(e.executar(c, pedido())).toBe(p)
    expect(e.estado()).toEqual({ pedidos: 1, ativos: 0, unidadesReservadas: 0, unidadesDebitas: 18 })
    expect(Object.isFrozen(r.uso)).toBe(true)
  })
  it('reutilização da chave com conteúdo, teto ou revisão diferente é conflito', async () => {
    const e = criarExecutorSimulado(), p = e.executar(config(), pedido())
    for (const novo of [{ ...pedido(), entrada: 'outro' }, { ...pedido(), maxTokensSaida: 19 }]) expect(() => e.executar(config(), novo)).toThrow('conflito_idempotencia')
    expect(() => e.executar(config({}, 2), pedido())).toThrow('conflito_idempotencia')
    e.cancelarTodos(); await p
  })
  it('cancelamento anterior ao despacho estorna tokens, mas conserva pedido e replay', async () => {
    const e = criarExecutorSimulado(), p = e.executar(config(), pedido())
    expect(e.cancelar('p1')).toBe(true)
    expect(await p).toMatchObject({ estado: 'cancelada', uso: { debitado: 0, medicao: 'simulada' } })
    expect(e.executar(config(), pedido())).toBe(p)
    expect(e.estado().pedidos).toBe(1); expect(e.estado().ativos).toBe(0)
  })
  it('cancelamento após despacho conserva limite por uso desconhecido', async () => {
    vi.useFakeTimers()
    const e = criarExecutorSimulado({ atrasoMs: 100 }), p = e.executar(config(), pedido())
    await vi.advanceTimersByTimeAsync(1)
    e.cancelar('p1')
    expect(await p).toMatchObject({ estado: 'cancelada', uso: { debitado: 23, medicao: 'limite-conservador' } })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(200)
    expect(e.estado().unidadesDebitas).toBe(23)
  })
  it('timeout cancela timers, reconcilia uma vez e não vira sucesso tardio', async () => {
    vi.useFakeTimers()
    const e = criarExecutorSimulado({ atrasoMs: 100 }), p = e.executar(config({ prazoMs: 10 }), pedido())
    await vi.advanceTimersByTimeAsync(10)
    expect(await p).toMatchObject({ estado: 'prazo-excedido', uso: { debitado: 23, medicao: 'limite-conservador' } })
    expect(vi.getTimerCount()).toBe(0)
    expect(e.estado().ativos).toBe(0)
  })
  it('falha simulada conserva reserva, sem resposta nem repetição automática', async () => {
    vi.useFakeTimers()
    const e = criarExecutorSimulado({ falhar: true }), p = e.executar(config(), pedido())
    await vi.runAllTimersAsync()
    expect(await p).toMatchObject({ estado: 'indisponivel', resposta: null, uso: { debitado: 23, medicao: 'limite-conservador' } })
    expect(e.executar(config(), pedido())).toBe(p); expect(e.estado().pedidos).toBe(1)
  })
  it('conta UTF-8 e limita saída independentemente do texto', async () => {
    vi.useFakeTimers()
    const e = criarExecutorSimulado(), p = e.executar(config(), { ...pedido(), entrada: 'φ🙂', maxTokensSaida: 1 })
    expect(e.estado().unidadesReservadas).toBe(7)
    await vi.runAllTimersAsync()
    expect(await p).toMatchObject({ resposta: 'R', uso: { debitado: 7 } })
  })
  it('recusa bytes, teto, campo secreto e getters antes da reserva', () => {
    const e = criarExecutorSimulado()
    expect(() => e.executar(config({ maxBytesEntrada: 1 }), pedido())).toThrow('pedido_invalido')
    expect(() => e.executar(config(), { ...pedido(), maxTokensSaida: 1025 })).toThrow('pedido_invalido')
    expect(() => e.executar(config(), { ...pedido(), apiKey: 'NAO-REFLETIR' })).toThrow('pedido_invalido')
    const getter = vi.fn(() => 'segredo')
    expect(() => validarPedidoExecucao(Object.defineProperty(pedido(), 'entrada', { get: getter }))).toThrow()
    expect(getter).not.toHaveBeenCalled(); expect(e.estado().pedidos).toBe(0)
  })
  it('falta de saldo bloqueia antes do despacho e não aumenta tentativas', () => {
    const e = criarExecutorSimulado()
    expect(() => e.executar(config({ maxTokensSessao: 10, maxTokensSaida: 10 }), { ...pedido(), maxTokensSaida: 10 })).toThrow('quota_tokens')
    expect(e.estado().pedidos).toBe(0)
  })
  it('encerramento cancela tudo e impede novas execuções', async () => {
    const e = criarExecutorSimulado(), p = e.executar(config(), pedido())
    e.encerrar(); await p
    expect(e.estado().ativos).toBe(0)
    expect(() => e.executar(config(), pedido('p2'))).toThrow('sessao_encerrada')
    expect(e.cancelar('inexistente')).toBe(false)
  })
})
