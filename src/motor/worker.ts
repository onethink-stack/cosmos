/// <reference lib="webworker" />
// Roda o motor fora da linha principal, para a tela não travar. Na primeira
// tarefa, carrega o banco de provas do aparelho (o que já foi conferido).
// As checagens independentes vão para workers auxiliares, um por núcleo
// livre; e as conclusões que só valem "até N objetos" vão também para o Z3 da
// linha principal, que pode prová-las para qualquer tamanho.
import type { Formula } from '../logica/ast'
import { abrirBancoProvas, bancoNaMemoria, definirBanco } from './bancoProvas'
import { definirPool, PoolWorkers, poolAtual, semParalelo } from './paralelo'
import SubTrabalho from './subtrabalho?worker&inline'
import { executarTarefas, type PedidoMotor, type RespostaMotor } from './tarefas'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let banco: Promise<void> | null = null

/** pedidos ao Z3 esperando resposta: os índices provados vão entrando no conjunto */
const provadasPorPedido = new Map<number, Set<number>>()
let pedidosZ3 = 0

/** Ajusta quantos workers auxiliares existem (1 = nenhum: tudo aqui). */
function ajustarParalelo(n: number) {
  if (poolAtual().tamanho === n) return
  if (n <= 1) return semParalelo()
  try {
    definirPool(new PoolWorkers(() => new SubTrabalho(), n))
  } catch {
    semParalelo() // este navegador não deixa um worker criar outros
  }
}

ctx.onmessage = async (e: MessageEvent<PedidoMotor | { tipo: 'z3-resposta'; pedido: number; indice: number }>) => {
  const m = e.data
  if ('tipo' in m) {
    provadasPorPedido.get(m.pedido)?.add(m.indice)
    return
  }
  banco ??= abrirBancoProvas()
    .then(definirBanco)
    .catch(() => definirBanco(bancoNaMemoria()))
  await banco
  ajustarParalelo(m.paralelo ?? 1)
  const ajudaZ3 = (conjuntos: Formula[][]) => {
    const pedido = ++pedidosZ3
    const provadas = new Set<number>()
    provadasPorPedido.set(pedido, provadas)
    ctx.postMessage({ id: m.id, tipo: 'z3-pedido', pedido, conjuntos } satisfies RespostaMotor)
    return provadas
  }
  await executarTarefas(m, (r: RespostaMotor) => ctx.postMessage(r), ajudaZ3)
}
