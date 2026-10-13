import { useEffect, useReducer } from 'preact/hooks'
import type { PedidoCadeia, RelatorioCadeia } from '../motor/cadeia'
import type { ResultadoDescoberta } from '../motor/descobrir'
import type { ResultadoLacunas } from '../motor/lacunas'
import { OPCOES_PADRAO, type Grupo, type ResultadoMotor, type ResultadoPergunta } from '../motor/motor'
import { assinatura, executarTarefas, type PedidoMotor, type RespostaMotor, type Tarefa } from '../motor/tarefas'
import MotorWorker from '../motor/worker?worker&inline'
import { abrirBancoProvas, bancoAtual, bancoNaMemoria, definirBanco, type EstatisticasBanco } from '../motor/bancoProvas'
import { manterAcordado } from './acordado'
import { motorFundo } from './motorFundo'
import { prepararCadeia } from './cadeia'
import { lerConfig, gravarConfig } from './db'
import { estado } from './estado'
import { conselheiro } from './conselheiro'
import { achadosDaCadeia, achadosDoModelo, historico } from './historico'
import { z3 } from './z3'
import { K_ABSOLUTO, limitePorWorker, N_ABSOLUTO, N_MANUAL, perfil } from './perfil'
import type { Formula } from '../logica/ast'
import { disponibilidadeZ3 } from './z3'
import type { EntradaDicionario } from './tipos'
import type { EntradaModelo } from './mundo'
import { assinaturaModelo, type ExecucaoModelo } from './modelo'
import type { RelatorioModelo } from '../motor/modelo'

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

export type Ocupacao = 'verificar' | 'perguntar' | 'descobrir' | 'teoremas' | 'lacunas' | 'cadeia' | 'modelo'

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
  /** parou antes do fim (cancelada, ou o app foi fechado no meio) */
  interrompida?: boolean
  /** a rodada em si terminou (o aprimoramento pode continuar depois) */
  baseTerminada?: boolean
}

/** Uma rodada que estava rodando quando o app foi fechado (ou descartado pelo sistema). */
export interface CadeiaPendente {
  numero: number
  motivo: string
  quando: number
  /** quantas vezes já foi retomada sem terminar (evita repetir sem fim) */
  tentativas: number
}

/** Fim de um trabalho do motor (para avisos e para o que estava esperando a vez). */
export interface Conclusao {
  tipo: Ocupacao
  ms: number
  /** a rodada da cadeia terminou, mas o aprimoramento continua */
  parcial?: boolean
}

const MAX_RODADAS_GUARDADAS = 6

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

/** limites dos campos de N e K (o perfil do aparelho limita mais) */
export const N_MAXIMO = N_ABSOLUTO
export const K_MAXIMO = K_ABSOLUTO
/** quantas vezes seguidas o aprimoramento pode refazer a rodada sozinho */
const MAX_VIRADAS = 3

/**
 * Modo de horas: o Z3 tenta cada pendente por 10 s, depois 2 min, 10 min e
 * 30 min (e repete 30 min até o prazo). Uma tentativa só não passa de 30 min:
 * se a reação for parada, o Z3 ainda termina a tentativa em curso.
 */
const TEMPOS_Z3_HORAS = [10_000, 120_000, 600_000, 1_800_000]
/** as escolhas do modo de horas (0 = o tempo do aparelho) */
export const PACIENCIAS_HORAS = [0, 1, 5, 10] as const
export type PacienciaHoras = (typeof PACIENCIAS_HORAS)[number]

class Verificacao {
  N = OPCOES_PADRAO.N
  /** máximo de mundos testados quando há □, ◇ ou B[…] */
  K = OPCOES_PADRAO.K
  /** modo de horas da reação em cadeia (0 = o tempo do aparelho) */
  paciencia: PacienciaHoras = 0
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
  /** quando o trabalho atual começou (ms) */
  iniciadoEm = 0
  /** rodada da cadeia que ficou pela metade quando o app foi fechado */
  interrompida: CadeiaPendente | null = null
  /** configuração e rodadas guardadas já lidas do banco */
  configCarregada = false
  get perguntando() {
    return this.ocupado === 'perguntar'
  }
  private worker: Worker | null = null
  /** o worker atual é o motor de fundo do PC */
  private workerRemoto = false
  /** a última rodada mandada ao motor de fundo (para voltar a acompanhá-la se o app for reaberto) */
  private rodadaRemota: { numero: number; iniciadoEm: number; pedido: PedidoMotor } | null = null
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
  /** trabalhos esperando o motor ficar livre */
  private fila: (() => void)[] = []
  private aoConcluirFns = new Set<(c: Conclusao) => void>()
  private ultimaGravacao = 0
  private bancoAqui: Promise<void> | null = null
  /** banco de provas: entradas guardadas e o que foi reaproveitado nesta sessão */
  banco: EstatisticasBanco | null = null
  /** rodadas refeitas seguidas pelo aprimoramento (limite: MAX_VIRADAS) */
  private viradasSeguidas = 0
  /** segundo modelo: a última execução (ou a atual) */
  modelo: ExecucaoModelo | null = null
  private ultimaGravacaoModelo = 0

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    // no modo de horas, a tela fica acesa enquanto a reação roda (com a tela apagada, o celular congela a aba)
    manterAcordado(this.ocupado === 'cadeia' && this.paciencia > 0)
    this.ouvintes.forEach((f) => f())
  }

  /** Chamado quando um trabalho do motor termina (não quando é cancelado). */
  aoConcluir(fn: (c: Conclusao) => void) {
    this.aoConcluirFns.add(fn)
    return () => {
      this.aoConcluirFns.delete(fn)
    }
  }

  /** Roda agora se o motor está livre; senão, quando o trabalho atual terminar (sem cancelá-lo). */
  quandoLivre(fn: () => void) {
    if (!this.ocupado) fn()
    else this.fila.push(fn)
  }

  /** Próxima rodada da reação em cadeia, com as notas como estão agora. Se o motor está ocupado, espera a vez. */
  continuarCadeia(motivo: string, tentativas = 0) {
    this.viradasSeguidas = 0
    // se a rodada anterior já terminou e só está aprimorando, o aprimoramento dá lugar à rodada nova
    if (this.ocupado === 'cadeia' && this.rodadas.at(-1)?.baseTerminada) this.cancelar(false)
    this.quandoLivre(() => {
      const { pedido, pronto } = prepararCadeia(estado.notas, estado.dicionario)
      if (pronto && pedido.contextos.length) this.iniciarCadeia(pedido, estado.dicionario, motivo, false, tentativas)
    })
  }

  /** Recomeça a rodada que ficou pela metade (no lugar da rodada interrompida). */
  retomarCadeia() {
    const p = this.interrompida
    if (!p) return
    this.interrompida = null
    void gravarConfig('cadeiaPendente', null).catch(() => {})
    const ultima = this.rodadas.at(-1)
    if (ultima?.interrompida && ultima.numero === p.numero) this.rodadas = this.rodadas.slice(0, -1)
    this.continuarCadeia(p.motivo.endsWith('(retomada)') ? p.motivo : `${p.motivo} (retomada)`, p.tentativas + 1)
    this.avisar()
  }

  /**
   * Com o motor de fundo ligado: a última rodada, se ficou rodando lá quando o
   * app foi fechado (pela metade ou ainda aprofundando), volta a ser
   * acompanhada, sem recomeçar — o mesmo pedido pega o trabalho que já existe
   * lá (pronto ou não). Devolve true se voltou.
   */
  reatarNoMotorDeFundo(): boolean {
    const s = this.rodadaRemota
    const ultima = this.rodadas.at(-1)
    if (!s || !ultima || ultima.numero !== s.numero || this.ocupado || !motorFundo.ativo) return false
    if (ultima.terminada && !ultima.interrompida) return false
    this.interrompida = null
    this.rodadas = [...this.rodadas.slice(0, -1), { ...ultima, terminada: false, interrompida: undefined }]
    this.ocupado = 'cadeia'
    this.iniciadoEm = s.iniciadoEm
    const id = ++this.pedido
    this.dicionario = s.pedido.dicionario
    this.pendentes = new Map()
    this.rodando = { chave: 'cadeia', msg: 'acompanhando o motor de fundo do PC' }
    const p = { ...s.pedido, id }
    this.pedidoAtual = p
    this.obterWorker()?.postMessage(p)
    this.avisar()
    return true
  }

  /** o trabalho atual roda no motor de fundo do PC */
  get noMotorDeFundo() {
    return !!this.ocupado && this.workerRemoto
  }

  /** Esquece a rodada interrompida sem retomar. */
  descartarInterrompida() {
    this.interrompida = null
    void gravarConfig('cadeiaPendente', null).catch(() => {})
    this.avisar()
  }

  /** O que a rodada concluiu vai para o histórico (que não se perde quando vêm rodadas novas), e o conselheiro aprende com ela. */
  private registrarCadeia(r: RodadaCadeia) {
    historico.registrar(achadosDaCadeia(r.relatorios, estado.notas), `cadeia:${this.iniciadoEm}:${r.numero}`)
    const contextos = this.pedidoAtual?.cadeia?.contextos
    if (contextos) conselheiro.aprenderDaCadeia(r.relatorios, contextos, this.dicionario)
  }

  /** Grava as rodadas (no máximo a cada 3 s enquanto roda; sempre no começo e no fim). */
  private gravarCadeia(forcar = false) {
    const agora = Date.now()
    if (!forcar && agora - this.ultimaGravacao < 3000) return
    this.ultimaGravacao = agora
    void gravarConfig('cadeiaRodadas', this.rodadas.slice(-MAX_RODADAS_GUARDADAS)).catch(() => {})
  }

  async carregarConfig() {
    try {
      const n = await lerConfig<number>('N')
      if (n) this.N = n
      const k = await lerConfig<number>('K')
      if (k) this.K = k
      const h = await lerConfig<number>('pacienciaHoras')
      if (h && (PACIENCIAS_HORAS as readonly number[]).includes(h)) this.paciencia = h as PacienciaHoras
      const rodadas = await lerConfig<RodadaCadeia[]>('cadeiaRodadas')
      if (rodadas?.length && !this.rodadas.length) this.rodadas = rodadas
      const modelo = await lerConfig<ExecucaoModelo>('modeloUltimo')
      if (modelo && !this.modelo)
        this.modelo = modelo.terminada ? modelo : { ...modelo, terminada: true, interrompida: 'fechado' }
      this.rodadaRemota = (await lerConfig<{ numero: number; iniciadoEm: number; pedido: PedidoMotor }>('motorFundoRodada')) ?? null
      const pendente = await lerConfig<CadeiaPendente | null>('cadeiaPendente')
      if (pendente && this.ocupado !== 'cadeia') {
        this.interrompida = pendente
        const ultima = this.rodadas.at(-1)
        if (ultima && ultima.numero === pendente.numero && !ultima.terminada)
          this.rodadas = [...this.rodadas.slice(0, -1), { ...ultima, terminada: true, interrompida: true }]
      }
    } catch {
      /* sem banco: fica o padrão */
    }
    this.configCarregada = true
    this.avisar()
  }

  /** identifica N e K juntos, para marcar resultados desatualizados */
  get limites() {
    return `${this.N}/${this.K}`
  }

  definirK(k: number) {
    this.K = Math.max(1, Math.min(perfil.atual.limites.K, Math.round(k) || OPCOES_PADRAO.K))
    void gravarConfig('K', this.K).catch(() => {})
    this.avisar()
  }

  /** modo de horas da reação em cadeia: até quantas horas para o que ficar pendente (0 = o tempo do aparelho) */
  definirPaciencia(h: PacienciaHoras) {
    this.paciencia = h
    void gravarConfig('pacienciaHoras', h).catch(() => {})
    this.avisar()
  }

  definirN(n: number) {
    this.N = Math.max(1, Math.min(perfil.atual.limites.N, N_MANUAL, Math.round(n) || OPCOES_PADRAO.N))
    void gravarConfig('N', this.N).catch(() => {})
    this.avisar()
  }

  private obterWorker(): Worker | null {
    const remoto = motorFundo.ativo
    // o motor de fundo ligou ou desligou: o worker de antes sai (se não está no meio de um trabalho)
    if (this.worker && this.workerRemoto !== remoto && !this.rodando) {
      this.worker.terminate()
      this.worker = null
    }
    if (this.worker) return this.worker
    if (remoto) {
      const w = motorFundo.criarWorker()
      w.onmessage = (e: MessageEvent<RespostaMotor>) => this.receber(e.data)
      // o motor de fundo caiu no meio: o mesmo trabalho continua aqui, no navegador
      w.onerror = () => {
        if (this.worker !== w) return
        this.worker = null
        const p = this.pedidoAtual
        if (p && p.id === this.pedido && this.rodando) this.obterWorker()?.postMessage(p)
      }
      this.worker = w
      this.workerRemoto = true
      return w
    }
    if (this.semWorker) return null
    this.workerRemoto = false
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
    this.bancoAqui ??= abrirBancoProvas()
      .then(definirBanco)
      .catch(() => definirBanco(bancoNaMemoria()))
    void this.bancoAqui.then(() => setTimeout(() => executarTarefas(pedido, (r) => this.receber(r)), 30))
  }

  /**
   * O motor pediu ao Z3 para provar conclusões sem limite de tamanho (com o
   * Z3 ligado): cada uma provada é avisada ao worker, que deixa de aprofundá-la.
   */
  private async provarNoZ3(pedido: number, conjuntos: Formula[][], ate?: number, grupos?: (number | null)[][]) {
    const w = this.worker
    // o worker espera saber quando acabou (e se não há Z3 ligado)
    const fim = (desligado = false) => {
      if (w && this.worker === w) w.postMessage({ tipo: 'z3-fim', pedido, ...(desligado ? { desligado } : {}) })
    }
    if (!z3.ativo || !disponibilidadeZ3().ok) return fim(true)
    const dicionario = this.dicionario
    // uma tentativa curta para cada; com prazo, rodadas cada vez mais longas até ele
    const tempos = ate ? TEMPOS_Z3_HORAS : [undefined]
    const decididos = new Set<number>()
    for (let nivel = 0; ; nivel++) {
      const tempo = tempos[Math.min(nivel, tempos.length - 1)]
      for (const [indice, formulas] of conjuntos.entries()) {
        if (!w || this.worker !== w) return // o trabalho foi cancelado
        if (decididos.has(indice) || !formulas.length) continue
        if (ate && Date.now() >= ate) return fim()
        const r = await z3.provarFormulas(formulas, dicionario, tempo && ate ? Math.min(tempo, ate - Date.now()) : undefined, grupos?.[indice])
        // sem modelo (provado para qualquer tamanho, com as notas que a prova usou) ou com modelo (o Z3 achou um cenário)
        if (r && (r.resultado === 'unsat' || r.resultado === 'sat')) {
          decididos.add(indice)
          if (this.worker === w) w.postMessage({ tipo: 'z3-resposta', pedido, indice, resultado: r.resultado, nucleo: r.nucleo })
        }
      }
      if (!ate || decididos.size >= conjuntos.filter((c) => c.length).length) return fim()
    }
  }

  /** Apaga o banco de provas (tudo será conferido de novo). */
  async limparBanco() {
    this.cancelar()
    // o worker segura o banco aberto: fecha antes de apagar
    this.worker?.terminate()
    this.worker = null
    await bancoAtual()?.limpar()
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase('caderno-provas')
      r.onsuccess = r.onerror = () => ok()
      // as conexões abertas se fecham sozinhas ao ver o pedido; se alguma demorar, segue assim mesmo
      r.onblocked = () => setTimeout(ok, 2000)
    })
    this.banco = { entradas: 0, acertos: 0, parciais: 0, faltas: 0 }
    z3.esquecerTudo()
    this.avisar()
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
  iniciarCadeia(pedido: PedidoCadeia, dicionario: EntradaDicionario[], motivo: string, nova: boolean, tentativas = 0, nivel?: { N: number; K: number }) {
    this.cancelar(false)
    this.interrompida = null
    if (nova) {
      this.rodadas = []
      this.viradasSeguidas = 0
    }
    // o nível de cada rodada vem do perfil do aparelho (ou de onde o aprimoramento achou uma mudança)
    const pf = perfil.atual
    const N = Math.min(nivel?.N ?? pf.Ninicial, pf.limites.N)
    const K = Math.min(nivel?.K ?? pf.Kinicial, pf.limites.K)
    const paralelo = perfil.paralelo
    const completo: PedidoCadeia = {
      // o que o conselheiro aprendeu sobre cada conjunto (cenários e provas): só ordem e recorte, nunca o veredito
      ...conselheiro.comConselho(pedido),
      aprimorar: perfil.aprimorar ? { ...pf.limites, limite: limitePorWorker(pf.limites.limite, paralelo) } : undefined,
      // modo de horas: o que ficar pendente na rodada continua por até tantas horas
      ...(this.paciencia ? { paciencia: this.paciencia * 3_600_000 } : {}),
    }
    const numero = (this.rodadas.at(-1)?.numero ?? 0) + 1
    this.rodadas = [
      ...this.rodadas,
      { numero, motivo, relatorios: [], erro: null, ms: 0, terminada: false, assinatura: assinaturaCadeia(pedido, dicionario) },
    ].slice(-10)
    this.ocupado = 'cadeia'
    this.iniciadoEm = Date.now()
    // se o app for fechado no meio, a rodada é retomada na próxima abertura
    const pendente: CadeiaPendente = { numero, motivo, quando: Date.now(), tentativas }
    void gravarConfig('cadeiaPendente', pendente).catch(() => {})
    this.gravarCadeia(true)
    const id = ++this.pedido
    this.dicionario = dicionario
    this.pendentes = new Map()
    this.rodando = { chave: 'cadeia', msg: 'preparando' }
    this.avisar()
    const p: PedidoMotor = {
      id,
      tarefas: [],
      dicionario,
      opcoes: { N, K, limite: pf.limites.limite },
      cadeia: completo,
      paralelo,
      // cada worker auxiliar com a sua parte da memória (juntos, abaixo de uns 3 GB)
      limiteParalelo: limitePorWorker(pf.limites.limite, paralelo),
    }
    this.pedidoAtual = p
    const w = this.obterWorker()
    if (w && this.workerRemoto) {
      this.rodadaRemota = { numero, iniciadoEm: this.iniciadoEm, pedido: p }
      void gravarConfig('motorFundoRodada', this.rodadaRemota).catch(() => {})
    }
    if (w) w.postMessage(p)
    else this.rodarAqui(p)
  }

  /** Grava a execução do segundo modelo (no máximo a cada 3 s enquanto roda). */
  private gravarModelo(forcar = false) {
    const agora = Date.now()
    if (!forcar && agora - this.ultimaGravacaoModelo < 3000) return
    this.ultimaGravacaoModelo = agora
    void gravarConfig('modeloUltimo', this.modelo).catch(() => {})
  }

  /**
   * Roda o segundo modelo sobre uma cópia das notas: rodadas que desativam,
   * ativam e adotam leis sozinhas até o ponto fixo, e depois a classificação.
   */
  iniciarModelo(entrada: EntradaModelo, dicionario: EntradaDicionario[], motivo: string) {
    const { notas, pastas } = entrada
    const antes = this.modelo
    this.cancelar(false)
    const assinatura = assinaturaModelo(notas, dicionario, pastas, entrada.marcaDados)
    // recomeçar o mesmo modelo que parou no meio conta como tentativa
    const tentativas = antes && antes.assinatura === assinatura && antes.interrompida ? antes.tentativas + 1 : 0
    // a classificação de antes (da última execução que terminou), para o aviso dizer só o que mudou
    const anterior =
      antes?.relatorio?.situacao === 'pronto'
        ? Object.fromEntries(antes.relatorio.itens.map((i) => [i.id, i.classe]))
        : antes?.anterior
    this.modelo = { motivo, relatorio: null, erro: null, ms: 0, terminada: false, tentativas, assinatura, pastas, quando: Date.now(), anterior }
    this.gravarModelo(true)
    const pf = perfil.atual
    this.ocupado = 'modelo'
    this.iniciadoEm = Date.now()
    const id = ++this.pedido
    this.dicionario = dicionario
    this.pendentes = new Map()
    this.rodando = { chave: 'modelo', msg: 'preparando' }
    this.avisar()
    const p: PedidoMotor = {
      id,
      tarefas: [],
      dicionario,
      opcoes: { N: pf.Ninicial, K: pf.Kinicial, limite: pf.limites.limite },
      modelo: {
        notas,
        aprimorar: perfil.aprimorar ? { ...pf.limites, limite: limitePorWorker(pf.limites.limite, perfil.paralelo) } : undefined,
        orcamentoMs: pf.limites.orcamentoMs,
        dados: entrada.dados,
        desativadasPelosDados: entrada.desativadasPelosDados,
      },
      paralelo: perfil.paralelo,
      limiteParalelo: limitePorWorker(pf.limites.limite, perfil.paralelo),
    }
    this.pedidoAtual = p
    const w = this.obterWorker()
    if (w) w.postMessage(p)
    else this.rodarAqui(p)
  }

  /** O Z3 mudou o resultado do segundo modelo (ativou notas com números). */
  atualizarModelo(quando: number, relatorio: RelatorioModelo) {
    if (!this.modelo || this.modelo.quando !== quando) return
    this.modelo = { ...this.modelo, relatorio }
    if (relatorio.situacao === 'pronto') historico.registrar(achadosDoModelo(relatorio), `modelo:${quando}`)
    this.gravarModelo(true)
    this.avisar()
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
    this.iniciadoEm = Date.now()
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

  /** Para o trabalho atual. `avisar` = pedido do usuário (também descarta o que esperava a vez). */
  /** `motivo`: por que o aprofundamento parou (quando só ele estava rodando) */
  cancelar(avisar = true, motivo = 'parado antes do limite') {
    if (this.rodando && this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    if (this.ocupado === 'cadeia') {
      const atual = this.rodadas.at(-1)
      // o que a rodada já decidiu antes de parar fica no histórico
      if (atual) this.registrarCadeia(atual)
      if (atual && !atual.terminada)
        this.rodadas = [
          ...this.rodadas.slice(0, -1),
          atual.baseTerminada
            ? // só o aprimoramento parou: a rodada vale, no nível que alcançou
              {
                ...atual,
                terminada: true,
                relatorios: atual.relatorios.map((r) =>
                  r.aprimoramento && r.aprimoramento.situacao !== 'feito'
                    ? { ...r, aprimoramento: { ...r.aprimoramento, situacao: 'feito', parouPor: motivo } }
                    : r,
                ),
              }
            : { ...atual, terminada: true, interrompida: true },
        ]
      void gravarConfig('cadeiaPendente', null).catch(() => {})
      this.gravarCadeia(true)
    }
    if (this.ocupado === 'modelo' && this.modelo && !this.modelo.terminada) {
      this.modelo = { ...this.modelo, terminada: true, interrompida: avisar ? 'usuario' : 'outro' }
      this.gravarModelo(true)
    }
    if (avisar) this.fila = []
    this.pedido++
    this.rodando = null
    this.ocupado = null
    this.lacunaRodando = null
    if (avisar) this.avisar()
  }

  private receber(r: RespostaMotor) {
    if (r.id !== this.pedido) return
    if (r.tipo === 'z3-pedido') {
      void this.provarNoZ3(r.pedido, r.conjuntos, r.ate, r.grupos)
      return
    }
    if (r.tipo === 'banco') {
      this.banco = r.estatisticas
    } else if (r.tipo === 'progresso') {
      this.rodando = { chave: r.chave, msg: r.msg }
    } else if (r.tipo === 'cadeia' || (r.tipo === 'erro' && this.ocupado === 'cadeia')) {
      const atual = this.rodadas.at(-1)
      if (atual)
        this.rodadas = [
          ...this.rodadas.slice(0, -1),
          r.tipo === 'cadeia' ? { ...atual, relatorios: r.relatorios, ms: r.ms } : { ...atual, erro: r.msg },
        ]
      this.gravarCadeia()
      // a rodada em si acabou; o aprimoramento segue (avisa já o resultado da rodada)
      const agora = this.rodadas.at(-1)
      // da rodada pronta em diante, cada conclusão nova (continuação, aprofundamento) vai para o histórico
      if (agora && (agora.baseTerminada || (r.tipo === 'cadeia' && r.relatorios.length && r.relatorios.every((x) => x.etapa === 'fim')))) this.registrarCadeia(agora)
      if (r.tipo === 'cadeia' && agora && !agora.baseTerminada && r.relatorios.length && r.relatorios.every((x) => x.etapa === 'fim')) {
        this.rodadas = [...this.rodadas.slice(0, -1), { ...agora, baseTerminada: true }]
        void gravarConfig('cadeiaPendente', null).catch(() => {})
        this.gravarCadeia(true)
        if (r.relatorios.some((x) => x.aprimoramento)) {
          const c: Conclusao = { tipo: 'cadeia', ms: Date.now() - this.iniciadoEm, parcial: true }
          setTimeout(() => this.aoConcluirFns.forEach((f) => f(c)), 0)
        }
      }
    } else if (r.tipo === 'modelo' || (r.tipo === 'erro' && this.ocupado === 'modelo')) {
      if (this.modelo)
        this.modelo = r.tipo === 'modelo' ? { ...this.modelo, relatorio: r.relatorio, ms: r.ms } : { ...this.modelo, erro: r.msg }
      if (r.tipo === 'modelo' && r.relatorio.situacao === 'pronto' && this.modelo) historico.registrar(achadosDoModelo(r.relatorio), `modelo:${this.modelo.quando}`)
      this.gravarModelo()
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
      const tipo = this.ocupado
      if (tipo === 'modelo' && this.modelo) {
        this.modelo = { ...this.modelo, terminada: true, tentativas: 0 }
        this.gravarModelo(true)
      }
      if (tipo === 'cadeia') {
        const atual = this.rodadas.at(-1)
        if (atual) this.rodadas = [...this.rodadas.slice(0, -1), { ...atual, terminada: true, baseTerminada: true }]
        if (atual) this.registrarCadeia(atual)
        void gravarConfig('cadeiaPendente', null).catch(() => {})
        this.gravarCadeia(true)
        // o aprimoramento achou uma conclusão que cai num cenário maior: refaz a rodada nesse nível (com limite)
        const virada = atual?.relatorios.map((x) => x.aprimoramento?.virada).find((v) => !!v)
        if (virada && this.viradasSeguidas < MAX_VIRADAS) {
          this.viradasSeguidas++
          this.fila.unshift(() => {
            const { pedido, pronto } = prepararCadeia(estado.notas, estado.dicionario)
            if (pronto && pedido.contextos.length)
              this.iniciarCadeia(pedido, estado.dicionario, `aprimoramento — com ${virada.N} objetos, ${virada.descricao}: deixou de valer`, false, 0, {
                // pelo menos 2 tamanhos acima do nível da rodada (cair de novo no seguinte custaria outra volta)
                N: Math.max(virada.N, (atual?.relatorios[0]?.aprimoramento?.de.N ?? virada.N) + 2),
                K: virada.K,
              })
          })
        }
      }
      this.rodando = null
      this.ocupado = null
      this.lacunaRodando = null
      this.avisar()
      if (tipo) {
        const c: Conclusao = { tipo, ms: Date.now() - this.iniciadoEm }
        this.aoConcluirFns.forEach((f) => f(c))
      }
      // o próximo da fila (se ninguém começou outro trabalho nesse meio tempo)
      const prox = this.fila.shift()
      if (prox) setTimeout(() => (this.ocupado ? this.fila.unshift(prox) : prox()), 0)
      return
    }
    this.avisar()
  }

  esquecer(chaves: string[]) {
    for (const k of [...this.resultados.keys()]) if (!chaves.includes(k)) this.resultados.delete(k)
  }
}

export const verificacao = new Verificacao()

/** Identifica uma rodada da reação em cadeia (muda se qualquer nota que entra nela mudar). */
export function assinaturaCadeia(pedido: PedidoCadeia, dicionario: EntradaDicionario[]): string {
  // o conselho não muda o resultado (só o tempo): não entra na assinatura
  const contextos = pedido.contextos.map(({ conselho: _conselho, ...c }) => c)
  return JSON.stringify([contextos, pedido.inativas, dicionario.map((e) => [e.simbolo, e.tipo, e.aridade])])
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
