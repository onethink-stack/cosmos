// Um worker auxiliar do motor de fundo: recebe uma checagem por vez, roda e
// devolve (o mesmo que src/motor/subtrabalho.ts faz no navegador). Usa o
// banco de provas do SQLite.

import { parentPort, workerData } from 'node:worker_threads'
import { definirBanco } from '../src/motor/bancoProvas'
import { executarTrabalho, type Trabalho } from '../src/motor/paralelo'
import { abrir, bancoSqlite } from './armazem'

definirBanco(bancoSqlite(abrir((workerData as { arquivo: string }).arquivo)))

parentPort!.on('message', (t: Trabalho) => {
  try {
    parentPort!.postMessage({ resultado: executarTrabalho(t) })
  } catch (x) {
    parentPort!.postMessage({ erro: (x as Error).message })
  }
})
