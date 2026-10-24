import type { ConfiguracaoIntegracao } from '../integracoes/contratos'
import { validarConfiguracaoIntegracao, validarEstadoServico } from '../integracoes/politica'

export class ErroIntegracoes extends Error {
  constructor(readonly tipo: 'sem-servico' | 'sessao-expirada' | 'conflito' | 'limite' | 'indisponivel' | 'invalido') { super(tipo) }
}
export interface OrcamentoPublico {
  readonly simulado: true
  readonly criterio: 'bytes-utf8-simulados'
  readonly pedidos: number; readonly ativos: number
  readonly unidadesReservadas: number; readonly unidadesDebitas: number
}
function objeto(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ErroIntegracoes('invalido')
  return v as Record<string, unknown>
}
function orcamento(v: unknown): Readonly<OrcamentoPublico> {
  const o = objeto(v), chaves = ['simulado', 'criterio', 'pedidos', 'ativos', 'unidadesReservadas', 'unidadesDebitas']
  if (Object.keys(o).length !== chaves.length || Object.keys(o).some(k => !chaves.includes(k)) || o.simulado !== true || o.criterio !== 'bytes-utf8-simulados') throw new ErroIntegracoes('invalido')
  for (const k of chaves.slice(2)) if (typeof o[k] !== 'number' || !Number.isSafeInteger(o[k]) || (o[k] as number) < 0) throw new ErroIntegracoes('invalido')
  if ((o.pedidos as number) > 20 || (o.ativos as number) > 1 || (o.unidadesReservadas as number) + (o.unidadesDebitas as number) > 20000) throw new ErroIntegracoes('invalido')
  return Object.freeze(o) as unknown as Readonly<OrcamentoPublico>
}

/** Somente origem local atual, sem URL de provedor, token ou credencial no cliente.
 * Caminhos fechados; ponte server-only injeta Bearer. Nada em storage ou logs.
 */
export function criarClienteIntegracoes(origem: string, buscar: typeof fetch = fetch) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origem) || new URL(origem).origin !== origem) throw new ErroIntegracoes('sem-servico')
  async function requisicao(recurso: 'configuracao' | 'estado' | 'orcamento' | 'testar', metodo: 'GET' | 'PUT' | 'POST', corpo?: unknown, signal?: AbortSignal): Promise<unknown> {
    const controle = new AbortController(), cancelar = () => controle.abort()
    if (signal?.aborted) controle.abort()
    else signal?.addEventListener('abort', cancelar, { once: true })
    const timer = setTimeout(cancelar, 12000)
    try {
      const r = await buscar(`${origem}/cosmos/__p0/${recurso}`, { method: metodo,
        headers: { 'X-Cosmos-P0': '1', Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'same-origin', signal: controle.signal,
      })
      if (!r.ok) throw new ErroIntegracoes(r.status === 401 ? 'sessao-expirada' : [404, 503].includes(r.status) ? 'sem-servico' : r.status === 409 ? 'conflito' : r.status === 429 ? 'limite' : 'invalido')
      if (!r.headers.get('content-type')?.startsWith('application/json') || !r.body) throw new ErroIntegracoes('sem-servico')
      const leitor = r.body.getReader(), partes: Uint8Array[] = []
      let tamanho = 0
      try {
        for (;;) {
          const p = await leitor.read()
          if (p.done) break
          tamanho += p.value.length
          if (tamanho > 32768) { await leitor.cancel(); throw new ErroIntegracoes('invalido') }
          partes.push(p.value)
        }
      } finally { leitor.releaseLock() }
      const bytes = new Uint8Array(tamanho)
      let posicao = 0
      for (const p of partes) { bytes.set(p, posicao); posicao += p.length }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
    } catch (e) { throw e instanceof ErroIntegracoes ? e : new ErroIntegracoes('indisponivel') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancelar) }
  }
  async function carregar(signal?: AbortSignal) {
    const envelope = objeto(await requisicao('configuracao', 'GET', undefined, signal))
    if (Object.keys(envelope).length !== 1 || !Object.hasOwn(envelope, 'configuracao')) throw new ErroIntegracoes('invalido')
    const configuracao = envelope.configuracao === null ? null : validarConfiguracaoIntegracao(envelope.configuracao)
    const servico = validarEstadoServico(await requisicao('estado', 'GET', undefined, signal), configuracao, Date.now())
    const consumo = orcamento(await requisicao('orcamento', 'GET', undefined, signal))
    return Object.freeze({ configuracao, servico, consumo })
  }
  return Object.freeze({
    carregar,
    async salvar(c: unknown, signal?: AbortSignal) {
      const configuracao = validarConfiguracaoIntegracao(c)
      validarEstadoServico(await requisicao('configuracao', 'PUT', configuracao, signal), configuracao, Date.now())
      return carregar(signal)
    },
    async testar(configuracao: Readonly<ConfiguracaoIntegracao>, signal?: AbortSignal) {
      const c = validarConfiguracaoIntegracao(configuracao)
      if (!c.habilitada) throw new ErroIntegracoes('invalido')
      validarEstadoServico(await requisicao('testar', 'POST', undefined, signal), c, Date.now())
      return carregar(signal)
    },
  })
}
export type SnapshotIntegracoes = Awaited<ReturnType<ReturnType<typeof criarClienteIntegracoes>['carregar']>>
