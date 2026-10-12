// Um worker do Node (worker_threads) com a cara de um worker do navegador
// (onmessage, onerror, postMessage, terminate): assim o conjunto de workers
// do motor (src/motor/paralelo.ts) roda aqui sem mudar nada.

import { Worker as WorkerNode, type ResourceLimits } from 'node:worker_threads'

export interface EventoErro {
  message: string
  preventDefault(): void
}

export class WorkerParecido {
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: EventoErro) => void) | null = null
  private w: WorkerNode
  private encerrado = false

  constructor(arquivo: URL, dados?: unknown, limites?: ResourceLimits) {
    this.w = new WorkerNode(arquivo, { workerData: dados, resourceLimits: limites })
    this.w.on('message', (data) => this.onmessage?.({ data }))
    this.w.on('error', (e) => this.falhou(e.message))
    // saiu sem ser encerrado (ex.: faltou memória): conta como erro
    this.w.on('exit', (codigo) => {
      if (!this.encerrado) this.falhou(`o worker parou (código ${codigo}; memória?)`)
    })
  }

  private falhou(message: string) {
    if (this.encerrado) return
    this.encerrado = true
    this.onerror?.({ message, preventDefault() {} })
  }

  postMessage(m: unknown) {
    if (!this.encerrado) this.w.postMessage(m)
  }

  terminate() {
    this.encerrado = true
    void this.w.terminate()
  }
}

/** endereço de um dos arquivos do motor de fundo já construídos (servidor/dist) */
export const arquivoDoMotor = (nome: string) => new URL(`./${nome}.js`, import.meta.url)
