/// <reference lib="webworker" />
// Roda o motor fora da linha principal, para a tela não travar. Na primeira
// tarefa, carrega o banco de provas do aparelho (o que já foi conferido).
// As checagens independentes vão para workers auxiliares, um por núcleo
// livre; e as conclusões que só valem "até N objetos" vão também para o Z3 da
// linha principal, que pode prová-las para qualquer tamanho.
import type { Formula } from '../logica/ast'
import type { RespostasZ3 } from './cadeia'
import { abrirBancoProvas, bancoNaMemoria, definirBanco } from './bancoProvas'
import { definirPool, PoolWorkers, poolAtual, semParalelo } from './paralelo'
import SubTrabalho from './subtrabalho?worker&inline'
import { executarTarefas, type PedidoMotor, type RespostaMotor } from './tarefas'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let banco: Promise<void> | null = null

/** pedidos ao Z3 esperando resposta: os índices vão entrando conforme o Z3 decide */
const respostasPorPedido = new Map<number, { r: RespostasZ3; acabar: (x: { desligado?: boolean }) => void }>()
let pedidosZ3 = 0

/** Ajusta quantos workers auxiliares existem (1 = nenhum: tudo aqui) e a parte da memória de cada um. */
function ajustarParalelo(n: number, teto?: number) {
  const atual = poolAtual()
  if (atual.tamanho === n && n > 1 && atual instanceof PoolWorkers) {
    atual.teto = teto
    return
  }
  if (atual.tamanho === n) return
  if (n <= 1) return semParalelo()
  try {
    definirPool(new PoolWorkers(() => new SubTrabalho(), n, teto))
  } catch {
    semParalelo() // este navegador não deixa um worker criar outros
  }
}

type MensagemZ3 =
  | { tipo: 'z3-resposta'; pedido: number; indice: number; resultado?: 'sat' | 'unsat'; nucleo?: number[] | null }
  | { tipo: 'z3-fim'; pedido: number; desligado?: boolean }

ctx.onmessage = async (e: MessageEvent<PedidoMotor | MensagemZ3>) => {
  const m = e.data
  if ('tipo' in m) {
    const p = respostasPorPedido.get(m.pedido)
    if (!p) return
    if (m.tipo === 'z3-fim') {
      p.acabar({ desligado: m.desligado })
      respostasPorPedido.delete(m.pedido)
    } else {
      if (m.resultado !== 'sat' && m.nucleo) p.r.nucleos.set(m.indice, m.nucleo)
      ;(m.resultado === 'sat' ? p.r.comModelo : p.r.semModelo).add(m.indice)
    }
    return
  }
  banco ??= abrirBancoProvas()
    .then(definirBanco)
    .catch(() => definirBanco(bancoNaMemoria()))
  await banco
  ajustarParalelo(m.paralelo ?? 1, m.limiteParalelo)
  const ajudaZ3 = (conjuntos: Formula[][], ate?: number, grupos?: (number | null)[][]): RespostasZ3 => {
    const pedido = ++pedidosZ3
    let acabar: (x: { desligado?: boolean }) => void = () => {}
    const r: RespostasZ3 = { semModelo: new Set(), comModelo: new Set(), nucleos: new Map(), fim: new Promise((ok) => (acabar = ok)) }
    respostasPorPedido.set(pedido, { r, acabar })
    ctx.postMessage({ id: m.id, tipo: 'z3-pedido', pedido, conjuntos, ...(ate ? { ate } : {}), ...(grupos ? { grupos } : {}) } satisfies RespostaMotor)
    return r
  }
  await executarTarefas(m, (r: RespostaMotor) => ctx.postMessage(r), ajudaZ3)
}
