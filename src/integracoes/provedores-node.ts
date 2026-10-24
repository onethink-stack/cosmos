import { setTimeout as esperar } from 'node:timers/promises'
import type { EstadoServico, EstadoTeste } from './contratos'
import { FORMATO_ESTADO_SERVICO } from './contratos'
import { validarConfiguracaoIntegracao, validarEstadoServico } from './politica'
import { resolverCredencialSimulada } from './credenciais-node'

export interface OpcoesProvedorSimulado {
  /** Somente processo confiável: nunca parâmetros HTTP ou configuração do navegador. */
  resultado?: EstadoTeste | 'falha'
  atrasoMs?: number
}

/** Sem fetch, socket, DNS, URL ou injeção de adaptador externo. Nenhum conteúdo RAG
 * é enviado no teste. O prazo limita a espera simulada, não é orçamento de tokens.
 */
export function criarProvedorSimulado(opcoes: OpcoesProvedorSimulado = {}) {
  const resultado = opcoes.resultado ?? 'ok', atraso = opcoes.atrasoMs ?? 0
  if (!['ok', 'invalido', 'indisponivel', 'sem-quota', 'falha'].includes(resultado)
      || !Number.isSafeInteger(atraso) || atraso < 0 || atraso > 10000) throw new Error('Simulação P0 inválida')
  return Object.freeze({
    async testar(entrada: unknown, signal: AbortSignal): Promise<Readonly<EstadoServico>> {
      const c = validarConfiguracaoIntegracao(entrada)
      if (!c.habilitada) throw new Error('Configuração desativada')
      const credencial = resolverCredencialSimulada(c)
      // Prazo da espera simulada; não inicia nem interrompe operações externas.
      const prazo = AbortSignal.timeout(c.limites.prazoMs)
      const cancelamento = AbortSignal.any([signal, prazo])
      let status: EstadoTeste = resultado === 'falha' ? 'indisponivel' : resultado
      try { await esperar(atraso, undefined, { signal: cancelamento }) }
      catch {
        if (signal.aborted) throw new Error('Teste cancelado')
        status = 'indisponivel'
      }
      if (signal.aborted) throw new Error('Teste cancelado')
      const agora = Date.now()
      return validarEstadoServico({
        formato: FORMATO_ESTADO_SERVICO, configuracaoId: c.id, configuracaoRevisao: c.revisao,
        credenciais: credencial.metadados,
        estado: status === 'ok' ? 'conectado' : status,
        teste: { escopo: 'adaptador-simulado', simulado: true, executadoEmMs: agora,
          configuracaoId: c.id, configuracaoRevisao: c.revisao, resultado: status },
      }, c, agora)
    },
  })
}
