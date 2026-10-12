// O Z3 do motor de fundo, numa thread só dele: como no navegador, cada
// checagem deixa memória presa no Z3, então quem usa troca esta thread por
// uma nova de tempos em tempos (e na hora, se ela quebrar ou travar).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { parentPort } from 'node:worker_threads'
import { init } from 'z3-solver'
import type { Formula } from '../src/logica/ast'
import { checarZ3ComNucleo } from '../src/motor/z3'

const api: Promise<any> = init()

parentPort!.on('message', async (m: { id: number; formulas: Formula[]; tempoMs: number; numericos: string[]; grupos?: (number | null)[] }) => {
  try {
    const { resultado, nucleo } = await checarZ3ComNucleo(await api, m.formulas, m.tempoMs, new Set(m.numericos), m.grupos)
    parentPort!.postMessage({ id: m.id, resultado, nucleo })
  } catch (x) {
    parentPort!.postMessage({ id: m.id, erro: (x as Error).message || 'o Z3 falhou' })
  }
})
