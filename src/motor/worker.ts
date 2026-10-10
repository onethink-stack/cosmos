/// <reference lib="webworker" />
// Roda o motor fora da linha principal, para a tela não travar.
import { executarTarefas, type PedidoMotor, type RespostaMotor } from './tarefas'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<PedidoMotor>) => {
  executarTarefas(e.data, (r: RespostaMotor) => ctx.postMessage(r))
}
