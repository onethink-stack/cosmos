// O motor de fundo do PC (pasta servidor/, "npm run motor"): quando ele está
// ligado, o app manda para lá os trabalhos do motor em vez de rodá-los na aba.
// Lá não há o teto de memória do navegador, o Z3 está sempre ligado e o
// trabalho continua mesmo com o navegador fechado; ao reabrir, o app volta a
// acompanhar o que ficou rodando.
//
// Para o resto do app, o motor de fundo é só mais um worker: o WorkerRemoto
// tem a mesma cara (postMessage, onmessage, terminate) e repassa as mesmas
// mensagens que o worker do navegador mandaria.

import { useEffect, useReducer } from 'preact/hooks'
import type { PedidoMotor, RespostaMotor } from '../motor/tarefas'
import { gravarConfig, lerConfig } from './db'

export const ENDERECO_MOTOR = 'http://127.0.0.1:47390'

export interface EstadoServidor {
  versao: number
  ocupado: boolean
  mensagem: string
  trabalho: { id: string; tipo: 'cadeia' | 'modelo' | 'conferencia'; situacao: string; inicio: number; fim?: number } | null
  capacidade: { nucleos: number; paralelo: number; memoriaGB: number; limiteSozinho: number; limiteParalelo: number; N: number }
  z3: { checagens: number; reinicios: number }
}

/** de quanto em quanto tempo o app confere se o motor de fundo está ligado */
const SONDAR_A_CADA_MS = 20_000

class MotorFundo {
  /** usar o motor de fundo quando ele estiver ligado (fica gravado) */
  usar = true
  conectado = false
  /** já foi conferido ao menos uma vez (ligado ou não) */
  sondado = false
  info: EstadoServidor | null = null
  /**
   * o navegador não deixa o Caderno (um site) falar com este computador: a
   * permissão "Acesso à rede local" foi negada, ou ainda não foi perguntada
   */
  bloqueio: 'negado' | 'perguntar' | null = null
  private ouvintes = new Set<() => void>()
  private relogio: ReturnType<typeof setInterval> | null = null

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  /** usando o motor de fundo agora */
  get ativo() {
    return this.usar && this.conectado
  }

  async carregarConfig() {
    try {
      this.usar = (await lerConfig<boolean>('motorFundo')) ?? true
    } catch {
      /* sem banco */
    }
    await this.sondar()
    this.relogio ??= setInterval(() => void this.sondar(), SONDAR_A_CADA_MS)
  }

  definirUsar(v: boolean) {
    this.usar = v
    void gravarConfig('motorFundo', v).catch(() => {})
    this.avisar()
  }

  /** O motor de fundo está ligado neste PC? */
  async sondar(): Promise<boolean> {
    if (__MODO_ARQUIVO__ || typeof fetch === 'undefined') {
      this.sondado = true
      return false
    }
    try {
      const r = await fetch(`${ENDERECO_MOTOR}/estado`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
      this.info = r.ok ? ((await r.json()) as EstadoServidor) : null
      this.conectado = r.ok && this.info?.versao === 1
      this.bloqueio = null
    } catch {
      this.conectado = false
      this.info = null
      const p = await permissaoRedeLocal()
      this.bloqueio = p === 'denied' ? 'negado' : p === 'prompt' ? 'perguntar' : null
    }
    this.sondado = true
    this.avisar()
    return this.conectado
  }

  /** o motor de fundo não respondeu no meio de um trabalho */
  caiu() {
    this.conectado = false
    this.avisar()
  }

  criarWorker(): Worker {
    return new WorkerRemoto(this) as unknown as Worker
  }
}

/** A permissão do navegador para o site falar com este computador (o nome mudou entre versões do Chrome). */
async function permissaoRedeLocal(): Promise<PermissionState | null> {
  for (const nome of ['local-network-access', 'loopback-network', 'local-network']) {
    try {
      return (await navigator.permissions.query({ name: nome as PermissionName })).state
    } catch {
      /* este navegador não conhece esse nome */
    }
  }
  return null
}

export const motorFundo = new MotorFundo()

export function useMotorFundo(): MotorFundo {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => motorFundo.assinar(() => forcar(undefined)), [])
  return motorFundo
}

/** Um worker do motor que, na verdade, é o motor de fundo do PC. */
class WorkerRemoto {
  onmessage: ((e: { data: RespostaMotor }) => void) | null = null
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null
  private trabalho: string | null = null
  private vez = 0

  constructor(private dono: MotorFundo) {}

  postMessage(m: PedidoMotor | { tipo: string }) {
    // as respostas do Z3 da aba são para o worker do navegador; lá o Z3 é do próprio motor de fundo
    if ('tipo' in m) return
    const vez = ++this.vez
    void this.rodar(m, vez).catch((e: Error) => {
      if (vez !== this.vez) return
      this.dono.caiu()
      this.onerror?.({ message: `o motor de fundo não respondeu (${e.message})`, preventDefault() {} })
    })
  }

  private async rodar(pedido: PedidoMotor, vez: number) {
    const r = await fetch(`${ENDERECO_MOTOR}/trabalho`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) })
    if (!r.ok) throw new Error(`resposta ${r.status}`)
    const { trabalho, geracao: g } = (await r.json()) as { trabalho: string; geracao: number }
    if (vez !== this.vez) return
    this.trabalho = trabalho
    let geracao = g
    let desde = 0
    let espera = 400
    for (;;) {
      const s = (await (
        await fetch(`${ENDERECO_MOTOR}/trabalho/${trabalho}?desde=${desde}&geracao=${geracao}&id=${pedido.id}`, { cache: 'no-store' })
      ).json()) as { geracao: number; seq: number; situacao: string; eventos: RespostaMotor[] }
      if (vez !== this.vez) return
      geracao = s.geracao
      desde = s.seq
      for (const e of s.eventos) this.onmessage?.({ data: e })
      if (s.eventos.some((e) => e.tipo === 'fim')) return
      // sem novidade, pergunta mais devagar (até a cada 3 s)
      espera = s.eventos.length ? 400 : Math.min(3000, espera * 1.5)
      await new Promise((ok) => setTimeout(ok, espera))
    }
  }

  /** para o trabalho lá (como o worker do navegador, que para ao ser encerrado) */
  terminate() {
    this.vez++
    const t = this.trabalho
    this.trabalho = null
    if (t) void fetch(`${ENDERECO_MOTOR}/trabalho/${t}/parar`, { method: 'POST' }).catch(() => {})
  }
}
