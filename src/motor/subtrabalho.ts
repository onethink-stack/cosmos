/// <reference lib="webworker" />
// Um dos workers auxiliares do motor: recebe um trabalho por vez (uma
// checagem independente), roda e devolve. Usa o mesmo banco de provas do
// aparelho.
import { abrirBancoProvas, bancoNaMemoria, definirBanco } from './bancoProvas'
import { executarTrabalho, type Trabalho } from './paralelo'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let banco: Promise<void> | null = null

ctx.onmessage = async (e: MessageEvent<Trabalho>) => {
  banco ??= abrirBancoProvas()
    .then(definirBanco)
    .catch(() => definirBanco(bancoNaMemoria()))
  await banco
  try {
    ctx.postMessage({ resultado: executarTrabalho(e.data) })
  } catch (x) {
    ctx.postMessage({ erro: (x as Error).message })
  }
}
