import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { criarObservabilidadeP0, observarHttpP0, operacaoHttpP0 } from '../src/integracoes/observabilidade-node'

const evento = () => ({ tipo: 'http', canal: 'api', operacao: 'estado', resultado: 'ok', status: 200, duracaoMs: 2 })
describe('P0 diagnóstico com schema fechado e memória limitada', () => {
  it('reconstrói evento e retorna snapshots imutáveis', () => {
    const o = criarObservabilidadeP0(), e = evento()
    expect(o.registrar(e)).toBe(true)
    e.status = 500
    const d = o.consultar()
    expect(d).toMatchObject({ simulado: true, persistencia: 'memoria-volatil', registrados: 1, descartados: 0 })
    expect(d.eventos[0].evento).toMatchObject({ status: 200 })
    expect(Object.isFrozen(d)).toBe(true); expect(Object.isFrozen(d.eventos)).toBe(true)
    expect(Object.isFrozen(d.eventos[0])).toBe(true); expect(Object.isFrozen(d.eventos[0].evento)).toBe(true)
  })
  it('não admite valores livres, campos extras, corpo, headers ou exceções', () => {
    const o = criarObservabilidadeP0(), segredo = 'SEGREDO-FICTICIO\r\nBearer abc'
    for (const k of ['token', 'apiKey', 'seed', 'pergunta', 'trecho', 'headers', 'stack', 'erro', 'url', 'hash']) {
      expect(o.registrar({ ...evento(), [k]: segredo })).toBe(false)
    }
    expect(o.registrar({ ...evento(), operacao: segredo })).toBe(false)
    expect(o.registrar(new Error(segredo))).toBe(false)
    expect(JSON.stringify(o.consultar())).not.toContain(segredo)
    expect(o.consultar().eventos).toHaveLength(0)
  })
  it('getters e coerção de status não são executados', () => {
    const o = criarObservabilidadeP0(), ler = vi.fn(() => 'SEGREDO-FICTICIO')
    expect(o.registrar(Object.defineProperty(evento(), 'tipo', { get: ler }))).toBe(false)
    expect(o.registrar(Object.defineProperty(evento(), 'status', { get: ler }))).toBe(false)
    expect(o.registrar({ ...evento(), status: { valueOf: ler } })).toBe(false)
    expect(o.registrar(Object.create(evento()))).toBe(false)
    expect(ler).not.toHaveBeenCalled()
  })
  it('buffer circular descarta antigos e mantém contadores limitados e snapshots independentes', () => {
    const o = criarObservabilidadeP0(2)
    o.registrar(evento()); o.registrar(evento())
    const antigo = o.consultar()
    o.registrar(evento()); o.registrar({ mensagem: 'NAO-REFLETIR' })
    expect(o.consultar()).toMatchObject({ capacidade: 2, registrados: 3, descartados: 2 })
    expect(o.consultar().eventos.map(e => e.sequencia)).toEqual([2, 3])
    expect(antigo.eventos.map(e => e.sequencia)).toEqual([1, 2])
    for (const capacidade of [0, -1, .5, Infinity, NaN, 257]) expect(() => criarObservabilidadeP0(capacidade)).toThrow()
  })
  it('recusa status, durações e estados incoerentes', () => {
    const o = criarObservabilidadeP0()
    for (const status of [0, 199, 600, NaN, Infinity, .5]) expect(o.registrar({ ...evento(), status })).toBe(false)
    for (const duracaoMs of [-1, Infinity, .5, 60001]) expect(o.registrar({ ...evento(), duracaoMs })).toBe(false)
    expect(o.registrar({ ...evento(), status: 401, resultado: 'ok' })).toBe(false)
    expect(o.registrar({ tipo: 'execucao', estado: 'concluida', medicao: 'limite-conservador', reservado: 5, debitado: 5 })).toBe(false)
    expect(o.registrar({ tipo: 'execucao', estado: 'cancelada', medicao: 'limite-conservador', reservado: 5, debitado: 0 })).toBe(false)
    expect(o.registrar({ tipo: 'execucao', estado: 'cancelada', medicao: 'simulada', reservado: 5, debitado: 0 })).toBe(true)
  })
  it('aceita resultados fechados, sem transformar HTTP 200 em prova de conexão real', () => {
    const o = criarObservabilidadeP0()
    for (const e of [{ tipo: 'teste', estado: 'invalido' }, { tipo: 'teste', estado: 'sem-quota' },
      { tipo: 'rag', estado: 'inconclusivo' }, { tipo: 'servico', canal: 'ponte', estado: 'encerrado' },
      { tipo: 'execucao', estado: 'concluida', medicao: 'simulada', reservado: 23, debitado: 18 }]) expect(o.registrar(e)).toBe(true)
    expect(o.consultar().eventos).toHaveLength(5)
  })
  it('não imprime em console nem faz fetch', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}), erro = vi.spyOn(console, 'error').mockImplementation(() => {}), fetch = vi.spyOn(globalThis, 'fetch')
    try {
      const o = criarObservabilidadeP0(); o.registrar(evento()); o.registrar(new Error('SEGREDO-FICTICIO')); o.consultar()
      expect(log).not.toHaveBeenCalled(); expect(erro).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
    } finally { log.mockRestore(); erro.mockRestore(); fetch.mockRestore() }
  })
  it('classifica sem guardar path, query, id ou digest de fonte', () => {
    expect(operacaoHttpP0('/integracoes/p0/estado', 'api')).toBe('estado')
    expect(operacaoHttpP0('/cosmos/__p0/testar', 'ponte')).toBe('testar')
    expect(operacaoHttpP0(`/integracoes/p0/fontes/fonte-sigilosa/1/${'a'.repeat(64)}`, 'api')).toBe('fonte')
    for (const path of [undefined, '/integracoes/p0/estado?token=NAO-REFLETIR', '/integracoes/p0/NAO-REFLETIR']) expect(operacaoHttpP0(path, 'api')).toBe('desconhecida')
  })
  it('finish e close não duplicam registro e removem listeners', () => {
    const o = criarObservabilidadeP0(), res = Object.assign(new EventEmitter(), { statusCode: 200 })
    observarHttpP0(o, 'api', '/integracoes/p0/estado?segredo=NAO-REFLETIR', res as unknown as ServerResponse)
    res.emit('finish'); res.emit('close')
    expect(o.consultar().eventos).toHaveLength(1)
    expect(o.consultar().eventos[0].evento).toMatchObject({ resultado: 'ok', operacao: 'desconhecida', status: 200 })
    expect(res.listenerCount('finish') + res.listenerCount('close')).toBe(0)
    expect(JSON.stringify(o.consultar())).not.toContain('NAO-REFLETIR')
  })
  it('desconexão é 499 local, sem registrar mensagem de transporte', () => {
    const o = criarObservabilidadeP0(), res = Object.assign(new EventEmitter(), { statusCode: 200 })
    observarHttpP0(o, 'ponte', '/cosmos/__p0/testar', res as unknown as ServerResponse)
    res.emit('close'); res.emit('finish')
    expect(o.consultar().eventos).toHaveLength(1)
    expect(o.consultar().eventos[0].evento).toMatchObject({ resultado: 'interrompido', status: 499 })
  })
})
