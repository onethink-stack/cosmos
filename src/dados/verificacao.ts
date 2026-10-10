import { useEffect, useReducer } from 'preact/hooks'
import type { PedidoCadeia, RelatorioCadeia } from '../motor/cadeia'
import type { ResultadoDescoberta } from '../motor/descobrir'
import type { ResultadoLacunas } from '../motor/lacunas'
import { OPCOES_PADRAO, type Grupo, type ResultadoMotor, type ResultadoPergunta } from '../motor/motor'
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

export type Ocupacao = 'verificar' | 'perguntar' | 'descobrir' | 'teoremas' | 'lacunas' | 'cadeia'

/** Uma rodada da reação em cadeia. */
export interface RodadaCadeia {
  numero: number
  /** o que disparou a rodada (ex.: "aprovada: Extensionalidade") */
  motivo: string
  relatorios: RelatorioCadeia[]
  erro: string | null
  ms: number
  terminada: boolean
  /** identifica as entradas; se mudar, a rodada está desatualizada */
  assinatura: string
}

export interface ResultadoDasLacunas {
  resultado: ResultadoLacunas | null
  erro: string | null
  ms: number
  /** fórmula do teorema, premissas e notas desativadas; se mudar, o resultado está desatualizado */
  assinatura: string
}

export interface ResultadoTeorema {
  resultado: ResultadoPergunta
  ms: number
  N: number
  /** fórmula conferida e premissas usadas; se mudar, o resultado está desatualizado */
  assinatura: string
}

export const N_MAXIMO = 12
export const K_MAXIMO = 5

class Verificacao {
  N = OPCOES_PADRAO.N
  /** máximo de mundos testados quando há □, ◇ ou B[…] */
  K = OPCOES_PADRAO.K
  rodando: { chave: string; msg: string } | null = null
  resultados = new Map<string, ResultadoTarefa>()
  /** última pergunta feita ("isto segue das notas?") */
  pergunta: ResultadoDaPergunta | null = null
  /** última busca de consequências */
  descoberta: ResultadoDaDescoberta | null = null
  erroTeoremas: string | null = null
  /** teoremas conferidos: id (nota:índice) → resultado */
  teoremas = new Map<string, ResultadoTeorema>()
  /** leis que faltam: id do teorema (nota:índice) → sugestões */
  lacunas = new Map<string, ResultadoDasLacunas>()
  /** reação em cadeia: rodadas (a última é a atual) */
  rodadas: RodadaCadeia[] = []
  /** teorema cujas leis que faltam estão sendo procuradas agora */
  lacunaRodando: string | null = null
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
  private formulasTeoremas = new Map<string, string>()
  private assinaturaLacuna = ''
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
      const k = await lerConfig<number>('K')
      if (k) this.K = k
    } catch {
      /* sem banco: fica o padrão */
    }
    this.avisar()
  }

  /** identifica N e K juntos, para marcar resultados desatualizados */
  get limites() {
    return `${this.N}/${this.K}`
  }

  definirK(k: number) {
    this.K = Math.max(1, Math.min(K_MAXIMO, Math.round(k) || OPCOES_PADRAO.K))
    void gravarConfig('K', this.K).catch(() => {})
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

  /** Confere se cada teorema segue do conjunto do seu contexto (leis e fatos, ou a visão do titular). */
  conferirTeoremas(tarefas: Tarefa[], teoremas: { id: string; formula: string; contexto?: string }[], dicionario: EntradaDicionario[]) {
    if (!teoremas.length) return
    this.formulasTeoremas = new Map(teoremas.map((t) => [t.id, t.formula]))
    this.iniciar(tarefas, dicionario, undefined, false, teoremas)
  }

  /** Começa uma rodada da reação em cadeia. `nova`: apaga as rodadas anteriores. */
  iniciarCadeia(pedido: PedidoCadeia, dicionario: EntradaDicionario[], motivo: string, nova: boolean) {
    this.cancelar(false)
    if (nova) this.rodadas = []
    const numero = (this.rodadas.at(-1)?.numero ?? 0) + 1
    this.rodadas = [
      ...this.rodadas,
      { numero, motivo, relatorios: [], erro: null, ms: 0, terminada: false, assinatura: assinaturaCadeia(pedido, dicionario, this.limites) },
    ]
    this.ocupado = 'cadeia'
    const id = ++this.pedido
    this.dicionario = dicionario
    this.pendentes = new Map()
    this.rodando = { chave: 'cadeia', msg: 'preparando' }
    this.avisar()
    const p: PedidoMotor = { id, tarefas: [], dicionario, opcoes: { ...OPCOES_PADRAO, N: this.N, K: this.K }, cadeia: pedido }
    this.pedidoAtual = p
    const w = this.obterWorker()
    if (w) w.postMessage(p)
    else this.rodarAqui(p)
  }

  /** Procura leis que, junto com as leis e fatos da tarefa, fariam o teorema seguir. */
  procurarLeis(tarefa: Tarefa, teoremaId: string, formula: string, inativas: Grupo[], dicionario: EntradaDicionario[]) {
    this.assinaturaLacuna = assinaturaLacuna(tarefa, dicionario, this.limites, formula, inativas)
    this.iniciar([tarefa], dicionario, undefined, false, undefined, { teoremaId, formula, inativas })
    this.lacunaRodando = teoremaId
    this.avisar()
  }

  /** Roda as tarefas (ou uma pergunta, ou a busca de consequências). Um pedido novo cancela o anterior. */
  iniciar(
    tarefas: Tarefa[],
    dicionario: EntradaDicionario[],
    pergunta?: string,
    descobrir = false,
    teoremas?: { id: string; formula: string }[],
    lacuna?: PedidoMotor['lacuna'],
  ) {
    if (!tarefas.length) return
    this.cancelar(false)
    this.ocupado = lacuna ? 'lacunas' : teoremas ? 'teoremas' : descobrir ? 'descobrir' : pergunta !== undefined ? 'perguntar' : 'verificar'
    this.formulaPerguntada = pergunta
    const id = ++this.pedido
    this.dicionario = dicionario
    this.pendentes = new Map(tarefas.map((t) => [t.chave, t]))
    this.rodando = { chave: tarefas[0].chave, msg: 'preparando' }
    this.avisar()
    const pedido: PedidoMotor = { id, tarefas, dicionario, opcoes: { ...OPCOES_PADRAO, N: this.N, K: this.K }, pergunta, descobrir, teoremas, lacuna }
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
    this.lacunaRodando = null
    if (avisar) this.avisar()
  }

  private receber(r: RespostaMotor) {
    if (r.id !== this.pedido) return
    if (r.tipo === 'progresso') {
      this.rodando = { chave: r.chave, msg: r.msg }
    } else if (r.tipo === 'cadeia' || (r.tipo === 'erro' && this.ocupado === 'cadeia')) {
      const atual = this.rodadas.at(-1)
      if (atual)
        this.rodadas = [
          ...this.rodadas.slice(0, -1),
          r.tipo === 'cadeia' ? { ...atual, relatorios: r.relatorios, ms: r.ms } : { ...atual, erro: r.msg },
        ]
    } else if (r.tipo === 'teorema') {
      const t = this.pendentes.get(r.chave)!
      this.teoremas.set(r.teoremaId, {
        resultado: r.resultado,
        ms: r.ms,
        N: this.N,
        assinatura: assinatura(t, this.dicionario, this.limites, this.formulasTeoremas.get(r.teoremaId)),
      })
    } else if (r.tipo === 'lacunas' || (r.tipo === 'erro' && this.ocupado === 'lacunas')) {
      const id = r.tipo === 'lacunas' ? r.teoremaId : this.lacunaRodando
      if (id)
        this.lacunas.set(id, {
          resultado: r.tipo === 'lacunas' ? r.resultado : null,
          erro: r.tipo === 'erro' ? r.msg : null,
          ms: r.tipo === 'lacunas' ? r.ms : 0,
          assinatura: this.assinaturaLacuna,
        })
    } else if (r.tipo === 'erro' && this.ocupado === 'teoremas') {
      this.erroTeoremas = r.msg
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
        assinatura: assinatura(t, this.dicionario, this.limites),
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
        assinatura: assinatura(t, this.dicionario, this.limites, formula),
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
        assinatura: assinatura(t, this.dicionario, this.limites),
      })
    } else {
      if (this.ocupado === 'cadeia') {
        const atual = this.rodadas.at(-1)
        if (atual) this.rodadas = [...this.rodadas.slice(0, -1), { ...atual, terminada: true }]
      }
      this.rodando = null
      this.ocupado = null
      this.lacunaRodando = null
    }
    this.avisar()
  }

  esquecer(chaves: string[]) {
    for (const k of [...this.resultados.keys()]) if (!chaves.includes(k)) this.resultados.delete(k)
  }
}

export const verificacao = new Verificacao()

/** Identifica uma rodada da reação em cadeia (muda se qualquer nota que entra nela mudar). */
export function assinaturaCadeia(pedido: PedidoCadeia, dicionario: EntradaDicionario[], limites: string): string {
  return JSON.stringify([limites, pedido, dicionario.map((e) => [e.simbolo, e.tipo, e.aridade])])
}

/** Identifica uma busca de leis que faltam (muda se o teorema, as premissas ou as notas desativadas mudarem). */
export function assinaturaLacuna(t: Tarefa, dicionario: EntradaDicionario[], limites: string, formula: string, inativas: Grupo[]): string {
  return JSON.stringify([assinatura(t, dicionario, limites, formula), inativas])
}

export function useVerificacao(): Verificacao {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => verificacao.assinar(() => forcar(undefined)), [])
  return verificacao
}
