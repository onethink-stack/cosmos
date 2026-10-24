import { performance } from 'node:perf_hooks'
import { validarConfiguracaoIntegracao } from './politica'

export class FalhaOrcamento extends Error {
  constructor(readonly codigo: 'quota_tokens' | 'quota_pedidos' | 'limite_minuto' | 'concorrencia_execucao') { super(codigo) }
}
export interface ConsumoOrcamento {
  readonly pedidos: number
  readonly ativos: number
  readonly unidadesReservadas: number
  readonly unidadesDebitas: number
}

/** Contabilidade volátil por sessão, compartilhada entre revisões/configurações.
 * Unidades simuladas, nunca preço, saldo financeiro ou tokens medidos de provedor.
 * Reserva e finalização são síncronas: nenhum await entre verificar e debitar.
 */
export function criarOrcamentoSessao(agora: () => number = () => performance.now()) {
  let pedidos = 0, ativos = 0, reservadas = 0, debitas = 0, ultimo = 0
  let janela: number[] = []
  const estado = (): Readonly<ConsumoOrcamento> => Object.freeze({ pedidos, ativos, unidadesReservadas: reservadas, unidadesDebitas: debitas })
  return Object.freeze({
    estado,
    reservar(configuracao: unknown, unidades: number) {
      const c = validarConfiguracaoIntegracao(configuracao), l = c.limites
      if (!c.habilitada || !Number.isSafeInteger(unidades) || unidades < 1) throw new Error('Reserva inválida')
      const t = agora()
      if (!Number.isFinite(t) || t < ultimo || t < 0) throw new Error('Relógio de orçamento inválido')
      ultimo = t
      janela = janela.filter(x => t - x < 60000)
      if (pedidos >= l.maxRequisicoesSessao) throw new FalhaOrcamento('quota_pedidos')
      if (janela.length >= l.requisicoesPorMinuto) throw new FalhaOrcamento('limite_minuto')
      if (ativos >= l.maxConcorrencia) throw new FalhaOrcamento('concorrencia_execucao')
      if (unidades > l.maxTokensSessao - debitas - reservadas) throw new FalhaOrcamento('quota_tokens')
      pedidos++; ativos++; reservadas += unidades; janela.push(t)
      let finalizado = false, usoFinal: number | null = null
      return Object.freeze({
        unidades,
        /** null = uso desconhecido: conserva toda a reserva, sem afirmar custo real.
         * Conhecido deve caber na reserva. Finalizar duas vezes não duplica débito.
         */
        concluir(uso: number | null) {
          if (uso !== null && (!Number.isSafeInteger(uso) || uso < 0 || uso > unidades)) throw new Error('Reconciliação inválida')
          if (finalizado) {
            if (uso !== usoFinal) throw new Error('Reconciliação divergente')
            return estado()
          }
          finalizado = true; usoFinal = uso
          reservadas -= unidades; ativos--; debitas += uso ?? unidades
          return estado()
        },
      })
    },
  })
}
