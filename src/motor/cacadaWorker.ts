/// <reference lib="webworker" />
// O worker da caçada de falhas: separado do motor do caderno, para a caçada
// não esperar a reação em cadeia (que pode levar horas) nem atrapalhá-la.
// Um exame novo troca o worker inteiro (a busca anterior para na hora).
import { examinarTudo, type PedidoCacada } from './cacada'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<PedidoCacada>) => examinarTudo(e.data, (r) => ctx.postMessage(r))
