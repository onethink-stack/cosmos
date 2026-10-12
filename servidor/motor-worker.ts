// O motor do motor de fundo: roda os pedidos (reação em cadeia, segundo
// modelo, verificar...) numa thread só dele, para o servidor continuar
// respondendo enquanto ele calcula. É o mesmo que src/motor/worker.ts faz no
// navegador: workers auxiliares para as checagens independentes, e o Z3 (na
// thread principal do servidor) para provar sem limite de tamanho.

import { parentPort, workerData } from 'node:worker_threads'
import type { Formula } from '../src/logica/ast'
import { definirBanco } from '../src/motor/bancoProvas'
import type { RespostasZ3 } from '../src/motor/cadeia'
import { definirPool, PoolWorkers, poolAtual, semParalelo } from '../src/motor/paralelo'
import { executarTarefas, type PedidoMotor, type RespostaMotor } from '../src/motor/tarefas'
import { arquivoDoMotor, WorkerParecido } from './adaptador'
import { abrir, bancoSqlite } from './armazem'

const { arquivo, memoriaPorAuxiliarMb } = workerData as { arquivo: string; memoriaPorAuxiliarMb: number }
definirBanco(bancoSqlite(abrir(arquivo)))

type MensagemZ3 =
  | { tipo: 'z3-resposta'; pedido: number; indice: number; resultado?: 'sat' | 'unsat'; nucleo?: number[] | null }
  | { tipo: 'z3-fim'; pedido: number; desligado?: boolean }

const respostasPorPedido = new Map<number, { r: RespostasZ3; acabar: (x: { desligado?: boolean }) => void }>()
let pedidosZ3 = 0

function ajustarParalelo(n: number, teto?: number) {
  const atual = poolAtual()
  if (atual.tamanho === n && n > 1 && atual instanceof PoolWorkers) {
    atual.teto = teto
    return
  }
  if (atual.tamanho === n) return
  if (n <= 1) return semParalelo()
  const criar = () =>
    new WorkerParecido(arquivoDoMotor('sub-worker'), { arquivo }, { maxOldGenerationSizeMb: memoriaPorAuxiliarMb }) as unknown as Worker
  definirPool(new PoolWorkers(criar, n, teto))
}

parentPort!.on('message', async (m: PedidoMotor | MensagemZ3) => {
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
  ajustarParalelo(m.paralelo ?? 1, m.limiteParalelo)
  const ajudaZ3 = (conjuntos: Formula[][], ate?: number, grupos?: (number | null)[][]): RespostasZ3 => {
    const pedido = ++pedidosZ3
    let acabar: (x: { desligado?: boolean }) => void = () => {}
    const r: RespostasZ3 = { semModelo: new Set(), comModelo: new Set(), nucleos: new Map(), fim: new Promise((ok) => (acabar = ok)) }
    respostasPorPedido.set(pedido, { r, acabar })
    parentPort!.postMessage({ id: m.id, tipo: 'z3-pedido', pedido, conjuntos, ...(ate ? { ate } : {}), ...(grupos ? { grupos } : {}) } satisfies RespostaMotor)
    return r
  }
  await executarTarefas(m, (r) => parentPort!.postMessage(r), ajudaZ3)
})
