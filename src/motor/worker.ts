/// <reference lib="webworker" />
// Roda o motor fora da linha principal, para a tela não travar. Na primeira
// tarefa, carrega o banco de provas do aparelho (o que já foi conferido).
import { abrirBancoProvas, bancoNaMemoria, definirBanco } from './bancoProvas'
import { executarTarefas, type PedidoMotor, type RespostaMotor } from './tarefas'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let banco: Promise<void> | null = null

ctx.onmessage = async (e: MessageEvent<PedidoMotor>) => {
  banco ??= abrirBancoProvas()
    .then(definirBanco)
    .catch(() => definirBanco(bancoNaMemoria()))
  await banco
  executarTarefas(e.data, (r: RespostaMotor) => ctx.postMessage(r))
}
