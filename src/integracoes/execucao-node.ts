import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { criarOrcamentoSessao } from './orcamento-node'
import { validarConfiguracaoIntegracao } from './politica'

export interface PedidoExecucao { readonly id: string; readonly entrada: string; readonly maxTokensSaida: number }
export interface ResultadoExecucao {
  readonly formato: 'cosmos-execucao-simulada-v1'
  readonly id: string
  readonly configuracaoId: string
  readonly configuracaoRevisao: number
  readonly simulado: true
  readonly estado: 'concluida' | 'cancelada' | 'prazo-excedido' | 'indisponivel'
  readonly resposta: string | null
  readonly uso: Readonly<{ criterio: 'bytes-utf8-simulados'; reservado: number; debitado: number; medicao: 'simulada' | 'limite-conservador' }>
}
export class FalhaExecucao extends Error {
  constructor(readonly codigo: 'pedido_invalido' | 'conflito_idempotencia' | 'configuracao_desativada' | 'sessao_encerrada') { super(codigo) }
}
export interface OpcoesExecucaoSimulada {
  /** Somente processo confiável. Sem função de provedor externo ou URL. */
  atrasoMs?: number
  falhar?: boolean
}
export function validarPedidoExecucao(entrada: unknown): Readonly<PedidoExecucao> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(entrada))) throw new FalhaExecucao('pedido_invalido')
  const chaves = Reflect.ownKeys(entrada)
  if (chaves.length !== 3 || chaves.some(x => !['id', 'entrada', 'maxTokensSaida'].includes(x as string))) throw new FalhaExecucao('pedido_invalido')
  const valores = ['id', 'entrada', 'maxTokensSaida'].map(k => {
    const d = Object.getOwnPropertyDescriptor(entrada, k)
    if (!d || !d.enumerable || !('value' in d)) throw new FalhaExecucao('pedido_invalido')
    return d.value as unknown
  })
  const [id, texto, max] = valores
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof texto !== 'string'
      || texto.length === 0 || typeof max !== 'number' || !Number.isSafeInteger(max) || max < 1) throw new FalhaExecucao('pedido_invalido')
  return Object.freeze({ id, entrada: texto, maxTokensSaida: max })
}

/** Execução determinística sem rede. Hashes de idempotência não são assinaturas,
 * nem anonimização. Guarda somente hash, resultado fixo e controle, não a pergunta.
 * Replays não gastam nova reserva. Cancelar não significa estornar provedor real.
 */
export function criarExecutorSimulado(opcoes: OpcoesExecucaoSimulada = {}) {
  const atraso = opcoes.atrasoMs ?? 0, falhar = opcoes.falhar ?? false
  if (!Number.isSafeInteger(atraso) || atraso < 0 || atraso > 10000 || typeof falhar !== 'boolean') throw new Error('Execução simulada inválida')
  const orcamento = criarOrcamentoSessao()
  const pedidos = new Map<string, { hash: string; controle: AbortController; resultado: Promise<Readonly<ResultadoExecucao>> }>()
  let encerrada = false
  function cancelarTodos() { for (const p of pedidos.values()) p.controle.abort() }
  return Object.freeze({
    estado: orcamento.estado,
    cancelar(id: string) { const p = pedidos.get(id); p?.controle.abort(); return p !== undefined },
    cancelarTodos,
    encerrar() { encerrada = true; cancelarTodos() },
    executar(configuracao: unknown, entrada: unknown): Promise<Readonly<ResultadoExecucao>> {
      if (encerrada) throw new FalhaExecucao('sessao_encerrada')
      const c = validarConfiguracaoIntegracao(configuracao), p = validarPedidoExecucao(entrada)
      if (!c.habilitada) throw new FalhaExecucao('configuracao_desativada')
      const bytes = Buffer.byteLength(p.entrada, 'utf8')
      if (bytes > c.limites.maxBytesEntrada || p.maxTokensSaida > c.limites.maxTokensSaida) throw new FalhaExecucao('pedido_invalido')
      // JSON de esquema fechado e ordem reconstruída; não modifica JCS/hashes v1.
      const hash = createHash('sha256').update(JSON.stringify([c, p])).digest('hex')
      const anterior = pedidos.get(p.id)
      if (anterior) {
        if (anterior.hash !== hash) throw new FalhaExecucao('conflito_idempotencia')
        return anterior.resultado
      }
      const reserva = orcamento.reservar(c, bytes + p.maxTokensSaida)
      const controle = new AbortController(), iniciou = performance.now()
      let disparou = false
      const resultado = new Promise<Readonly<ResultadoExecucao>>(resolve => {
        let timer: ReturnType<typeof setTimeout>, prazo: ReturnType<typeof setTimeout>, terminou = false
        const concluir = (estado: ResultadoExecucao['estado']) => {
          if (terminou) return
          terminou = true; clearTimeout(timer); clearTimeout(prazo)
          controle.signal.removeEventListener('abort', abortou)
          const resposta = estado === 'concluida' ? 'Resposta local.'.slice(0, p.maxTokensSaida) : null
          // Falha após despacho: uso desconhecido; mantém reserva integral.
          const medido = estado === 'concluida' ? bytes + Buffer.byteLength(resposta!, 'utf8') : !disparou ? 0 : null
          reserva.concluir(medido)
          resolve(Object.freeze({ formato: 'cosmos-execucao-simulada-v1', id: p.id,
            configuracaoId: c.id, configuracaoRevisao: c.revisao, simulado: true, estado, resposta,
            uso: Object.freeze({ criterio: 'bytes-utf8-simulados', reservado: reserva.unidades,
              debitado: medido ?? reserva.unidades, medicao: medido === null ? 'limite-conservador' : 'simulada' }),
          }))
        }
        const abortou = () => concluir('cancelada')
        controle.signal.addEventListener('abort', abortou, { once: true })
        prazo = setTimeout(() => concluir('prazo-excedido'), c.limites.prazoMs)
        // Despacho só no próximo microtask: cancelamento imediato libera tokens.
        queueMicrotask(() => {
          if (terminou) return
          disparou = true
          timer = setTimeout(() => concluir(performance.now() - iniciou >= c.limites.prazoMs
            ? 'prazo-excedido' : falhar ? 'indisponivel' : 'concluida'), atraso)
        })
      })
      pedidos.set(p.id, { hash, controle, resultado })
      return resultado
    },
  })
}
