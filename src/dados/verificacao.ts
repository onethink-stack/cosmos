import { useEffect, useReducer } from 'preact/hooks'
import type { ResultadoDescoberta } from '../motor/descobrir'
import { OPCOES_PADRAO, type ResultadoMotor, type ResultadoPergunta } from '../motor/motor'
import { assinatura, executarTarefas, type PedidoMotor, type RespostaMotor, type Tarefa } from '../motor/tarefas'
import MotorWorker from '../motor/worker?worker&inline'
import { lerConfig, gravarConfig } from './db'
import type { EntradaDicionario } from './tipos'

export { assinatura, montarTarefas } from '../motor/tarefas'

export interface ResultadoTarefa {
  chave: string
  rotulo: string
  resultado: ResultadoMotor | null
  erro: string | null
  quando: string
  ms: number
  N: number
  /** identifica as entradas; se mudar, o resultado está desatualizado */
  assinatura: string
}

export interface ResultadoDaPergunta {
  /** conjunto perguntado: "geral" ou "visao:<titular>" */
  chave: string
  rotulo: string
  formula: string
  resultado: ResultadoPergunta | null
  erro: string | null
  quando: string
  ms: number
  N: number
  assinatura: string
}

export interface ResultadoDaDescoberta {
  chave: string
  rotulo: string
  resultado: ResultadoDescoberta | null
  erro: string | null
  quando: string
  ms: number
  N: number
  assinatura: string
}

export type Ocupacao = 'verificar' | 'perguntar' | 'descobrir'

export const N_MAXIMO = 12

class Verificacao {
  N = OPCOES_PADRAO.N
  rodando: { chave: string; msg: string } | null = null
  resultados = new Map<string, ResultadoTarefa>()
  /** última pergunta feita ("isto segue das notas?") */
  pergunta: ResultadoDaPergunta | null = null
  /** última busca de consequências */
  descoberta: ResultadoDaDescoberta | null = null
  /** o que o motor está fazendo agora */
  ocupado: Ocupacao | null = null
  get perguntando() {
    return this.ocupado === 'perguntar'
  }
  private worker: Worker | null = null
  /** o worker falhou ao carregar neste navegador: daqui em diante roda na linha principal */
  private semWorker = false
  private pedidoAtual: PedidoMotor | null = null
  private recebeuDoWorker = false
  private pedido = 0
  private ouvintes = new Set<() => void>()
  private pendentes = new Map<string, Tarefa>()
  private formulaPerguntada: string | undefined
  private dicionario: EntradaDicionario[] = []

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  async carregarConfig() {
    try {
      const n = await lerConfig<number>('N')
      if (n) this.N = n
    } catch {
      /* sem banco: fica o padrão */
    }
    this.avisar()
  }

  definirN(n: number) {
    this.N = Math.max(1, Math.min(N_MAXIMO, Math.round(n) || OPCOES_PADRAO.N))
    void gravarConfig('N', this.N).catch(() => {})
    this.avisar()
  }

  private obterWorker(): Worker | null {
    if (this.semWorker) return null
    if (this.worker) return this.worker
    try {
      this.worker = new MotorWorker()
      this.worker.onmessage = (e: MessageEvent<RespostaMotor>) => {
        this.recebeuDoWorker = true
        this.receber(e.data)
      }
      this.worker.onerror = (e) => {
        if (!this.recebeuDoWorker && this.pedidoAtual) {
          // o worker nem chegou a rodar (ex.: arquivo local em navegador restrito)
          this.semWorker = true
          this.worker?.terminate()
          this.worker = null
          this.rodarAqui(this.pedidoAtual)
          return
        }
        this.receber({ id: this.pedido, tipo: 'erro', chave: this.rodando?.chave ?? 'geral', msg: e.message || 'falha no worker' })
        this.receber({ id: this.pedido, tipo: 'fim' })
      }
    } catch {
      this.semWorker = true
      this.worker = null
    }
    return this.worker
  }

  /** Sem worker: roda na linha principal (a tela pode travar durante a busca). */
  private rodarAqui(pedido: PedidoMotor) {
    setTimeout(() => executarTarefas(pedido, (r) => this.receber(r)), 30)
  }

  /** Pergunta se a fórmula segue do conjunto da tarefa. Cancela o que estiver rodando. */
  perguntar(tarefa: Tarefa, formula: string, dicionario: EntradaDicionario[]) {
    this.iniciar([tarefa], dicionario, formula)
  }

  /** Descobre consequências simples do conjunto da tarefa. Cancela o que estiver rodando. */
  descobrir(tarefa: Tarefa, dicionario: EntradaDicionario[]) {
    this.iniciar([tarefa], dicionario, undefined, true)
  }

  /** Roda as tarefas (ou uma pergunta, ou a busca de consequências). Um pedido novo cancela o anterior. */
  iniciar(tarefas: Tarefa[], dicionario: EntradaDicionario[], pergunta?: string, descobrir = false) {
    if (!tarefas.length) return
    this.cancelar(false)
    this.ocupado = descobrir ? 'descobrir' : pergunta !== undefined ? 'perguntar' : 'verificar'
    this.formulaPerguntada = pergunta
    const id = ++this.pedido
    this.dicionario = dicionario
    this.pendentes = new Map(tarefas.map((t) => [t.chave, t]))
    this.rodando = { chave: tarefas[0].chave, msg: 'preparando' }
    this.avisar()
    const pedido: PedidoMotor = { id, tarefas, dicionario, opcoes: { ...OPCOES_PADRAO, N: this.N }, pergunta, descobrir }
    this.pedidoAtual = pedido
    const w = this.obterWorker()
    if (w) w.postMessage(pedido)
    else this.rodarAqui(pedido)
  }

  cancelar(avisar = true) {
    if (this.rodando && this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pedido++
    this.rodando = null
    this.ocupado = null
    if (avisar) this.avisar()
  }

  private receber(r: RespostaMotor) {
    if (r.id !== this.pedido) return
    if (r.tipo === 'progresso') {
      this.rodando = { chave: r.chave, msg: r.msg }
    } else if (r.tipo === 'descobertas' || (r.tipo === 'erro' && this.ocupado === 'descobrir')) {
      const t = this.pendentes.get(r.chave)!
      this.descoberta = {
        chave: r.chave,
        rotulo: t.rotulo,
        resultado: r.tipo === 'descobertas' ? r.resultado : null,
        erro: r.tipo === 'erro' ? r.msg : null,
        quando: new Date().toISOString(),
        ms: r.tipo === 'descobertas' ? r.ms : 0,
        N: this.N,
        assinatura: assinatura(t, this.dicionario, this.N),
      }
    } else if (r.tipo === 'resposta' || (r.tipo === 'erro' && this.ocupado === 'perguntar')) {
      const t = this.pendentes.get(r.chave)!
      const formula = this.formulaPerguntada ?? ''
      this.pergunta = {
        chave: r.chave,
        rotulo: t.rotulo,
        formula,
        resultado: r.tipo === 'resposta' ? r.resultado : null,
        erro: r.tipo === 'erro' ? r.msg : null,
        quando: new Date().toISOString(),
        ms: r.tipo === 'resposta' ? r.ms : 0,
        N: this.N,
        assinatura: assinatura(t, this.dicionario, this.N, formula),
      }
    } else if (r.tipo === 'resultado' || r.tipo === 'erro') {
      const t = this.pendentes.get(r.chave)!
      this.resultados.set(r.chave, {
        chave: r.chave,
        rotulo: t.rotulo,
        resultado: r.tipo === 'resultado' ? r.resultado : null,
        erro: r.tipo === 'erro' ? r.msg : null,
        quando: new Date().toISOString(),
        ms: r.tipo === 'resultado' ? r.ms : 0,
        N: this.N,
        assinatura: assinatura(t, this.dicionario, this.N),
      })
    } else {
      this.rodando = null
      this.ocupado = null
    }
    this.avisar()
  }

  esquecer(chaves: string[]) {
    for (const k of [...this.resultados.keys()]) if (!chaves.includes(k)) this.resultados.delete(k)
  }
}

export const verificacao = new Verificacao()

export function useVerificacao(): Verificacao {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => verificacao.assinar(() => forcar(undefined)), [])
  return verificacao
}
