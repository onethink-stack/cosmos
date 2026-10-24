import { performance } from 'node:perf_hooks'
import type { ServerResponse } from 'node:http'

const OPERACOES = ['estado', 'configuracao', 'testar', 'orcamento', 'executar', 'cancelar', 'contexto-rag', 'fonte', 'desconhecida'] as const
type Operacao = typeof OPERACOES[number]
export type EventoP0 =
  | Readonly<{ tipo: 'http'; canal: 'api' | 'ponte'; operacao: Operacao; resultado: 'ok' | 'recusado' | 'erro' | 'interrompido'; status: number; duracaoMs: number }>
  | Readonly<{ tipo: 'execucao'; estado: 'concluida' | 'cancelada' | 'prazo-excedido' | 'indisponivel'; medicao: 'simulada' | 'limite-conservador'; reservado: number; debitado: number }>
  | Readonly<{ tipo: 'rag'; estado: 'inconclusivo' | 'fontes-encontradas' }>
  | Readonly<{ tipo: 'teste'; estado: 'ok' | 'invalido' | 'indisponivel' | 'sem-quota' }>
  | Readonly<{ tipo: 'servico'; canal: 'api' | 'ponte'; estado: 'iniciado' | 'encerrado' | 'sessao-emitida' | 'sessao-revogada' | 'protocolo-recusado' }>
interface RegistroP0 { readonly sequencia: number; readonly instanteMs: number; readonly evento: EventoP0 }
const inteiro = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max
const umDe = (v: unknown, permitidos: readonly string[]) => typeof v === 'string' && permitidos.includes(v)

function eventoSeguro(entrada: unknown): EventoP0 | null {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(entrada))) return null
  const tipo = Object.getOwnPropertyDescriptor(entrada, 'tipo')
  if (!tipo || !('value' in tipo)) return null
  const esquemas: Record<string, readonly string[]> = {
    http: ['tipo', 'canal', 'operacao', 'resultado', 'status', 'duracaoMs'],
    execucao: ['tipo', 'estado', 'medicao', 'reservado', 'debitado'],
    rag: ['tipo', 'estado'], teste: ['tipo', 'estado'], servico: ['tipo', 'canal', 'estado'],
  }
  if (typeof tipo.value !== 'string' || !Object.hasOwn(esquemas, tipo.value)) return null
  const chaves = esquemas[tipo.value], proprias = Reflect.ownKeys(entrada)
  if (proprias.length !== chaves.length || proprias.some(k => typeof k !== 'string' || !chaves.includes(k))) return null
  const copia: Record<string, unknown> = Object.create(null)
  for (const k of chaves) {
    const d = Object.getOwnPropertyDescriptor(entrada, k)
    if (!d || !d.enumerable || !('value' in d)) return null
    copia[k] = d.value
  }
  const canal = umDe(copia.canal, ['api', 'ponte'])
  const status = copia.status as number
  switch (copia.tipo) {
    case 'http': {
      if (!canal || !umDe(copia.operacao, OPERACOES) || !inteiro(status, 599) || status < 200
          || !inteiro(copia.duracaoMs, 60000)) return null
      const resultado = status === 499 ? 'interrompido' : status >= 500 ? 'erro' : status >= 400 ? 'recusado' : 'ok'
      if (copia.resultado !== resultado) return null
      break
    }
    case 'execucao':
      if (!umDe(copia.estado, ['concluida', 'cancelada', 'prazo-excedido', 'indisponivel'])
          || !umDe(copia.medicao, ['simulada', 'limite-conservador']) || !inteiro(copia.reservado, 20000)
          || !inteiro(copia.debitado, copia.reservado as number) || copia.reservado === 0) return null
      if (copia.medicao === 'limite-conservador' && copia.debitado !== copia.reservado) return null
      if (copia.estado === 'concluida' && (copia.medicao !== 'simulada' || copia.debitado === 0)) return null
      if (copia.estado !== 'concluida' && copia.medicao === 'simulada' && copia.debitado !== 0) return null
      break
    case 'rag': if (!umDe(copia.estado, ['inconclusivo', 'fontes-encontradas'])) return null; break
    case 'teste': if (!umDe(copia.estado, ['ok', 'invalido', 'indisponivel', 'sem-quota'])) return null; break
    case 'servico': if (!canal || !umDe(copia.estado, ['iniciado', 'encerrado', 'sessao-emitida', 'sessao-revogada', 'protocolo-recusado'])) return null; break
    default: return null
  }
  return Object.freeze(copia) as unknown as EventoP0
}

/** Memória limitada, schema fechado e somente primitivas. Nunca recebe mensagem
 * livre, id, URL, hash, header, corpo, fonte, stack ou erro do provedor.
 * Não escreve em console/disco/rede nem oferece endpoint. Não é auditoria durável.
 */
export function criarObservabilidadeP0(capacidade = 256) {
  if (!Number.isSafeInteger(capacidade) || capacidade < 1 || capacidade > 256) throw new Error('Capacidade de diagnóstico inválida')
  const registros: Readonly<RegistroP0>[] = []
  let sequencia = 0, descartados = 0
  const descartar = () => { descartados = Math.min(Number.MAX_SAFE_INTEGER, descartados + 1) }
  return Object.freeze({
    registrar(entrada: unknown): boolean {
      // Diagnóstico inválido nunca impede uma operação; não imprime a falha.
      try {
        const evento = eventoSeguro(entrada), instanteMs = Date.now()
        if (!evento || !inteiro(instanteMs, Number.MAX_SAFE_INTEGER) || sequencia === Number.MAX_SAFE_INTEGER) { descartar(); return false }
        if (registros.length === capacidade) { registros.shift(); descartar() }
        registros.push(Object.freeze({ sequencia: ++sequencia, instanteMs, evento }))
        return true
      } catch { descartar(); return false }
    },
    consultar() {
      return Object.freeze({ formato: 'cosmos-diagnostico-p0-v1' as const, simulado: true as const,
        persistencia: 'memoria-volatil' as const, capacidade, registrados: sequencia, descartados,
        eventos: Object.freeze([...registros]),
      })
    },
  })
}
export type ObservabilidadeP0 = ReturnType<typeof criarObservabilidadeP0>

/** Converte a rota em classe fixa; não guarda caminho bruto nem id/hash da fonte. */
export function operacaoHttpP0(caminho: string | undefined, canal: 'api' | 'ponte'): Operacao {
  const prefixo = canal === 'api' ? '/integracoes/p0/' : '/cosmos/__p0/'
  if (!caminho?.startsWith(prefixo)) return 'desconhecida'
  const recurso = caminho.slice(prefixo.length)
  if (OPERACOES.slice(0, 7).some(o => o === recurso)) return recurso as Operacao
  return /^fontes\/[a-z][a-z0-9-]{0,47}\/[1-9][0-9]{0,15}\/[a-f0-9]{64}$/.test(recurso) ? 'fonte' : 'desconhecida'
}
export function observarHttpP0(observabilidade: ObservabilidadeP0, canal: 'api' | 'ponte', caminho: string | undefined, res: ServerResponse) {
  const operacao = operacaoHttpP0(caminho, canal), inicio = performance.now()
  let finalizado = false
  const concluir = (status: number) => {
    if (finalizado) return
    finalizado = true; res.off('finish', finish); res.off('close', close)
    observabilidade.registrar({ tipo: 'http', canal, operacao, status,
      resultado: status === 499 ? 'interrompido' : status >= 500 ? 'erro' : status >= 400 ? 'recusado' : 'ok',
      duracaoMs: Math.min(60000, Math.max(0, Math.floor(performance.now() - inicio))),
    })
  }
  const finish = () => concluir(res.statusCode)
  const close = () => concluir(499)
  res.once('finish', finish); res.once('close', close)
}
