// Motor de fundo do Caderno Lógico: o mesmo motor do app, rodando no PC fora
// do navegador — sem o teto de memória de uma aba, com o Z3 sempre ligado,
// com prioridade baixa (o PC continua leve) e sem parar quando o navegador
// fecha. O app (no site ou local) o encontra em http://127.0.0.1:47390 e
// manda para cá os mesmos pedidos que mandaria ao worker dele; aqui eles
// rodam até o fim e ficam guardados (SQLite, fora da pasta do projeto). Se o
// motor ou o PC forem reiniciados no meio, o trabalho recomeça sozinho e
// aproveita tudo o que já estava no banco de provas.
//
// Segurança: só escuta em 127.0.0.1, só aceita os endereços do app e recusa
// pedidos com outro "Host" (contra sites que tentem se passar por localhost).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { availableParallelism, constants, setPriority, totalmem } from 'node:os'
import type { DatabaseSync } from 'node:sqlite'
import type { Formula } from '../src/logica/ast'
import { resumo } from '../src/logica/resumo'
import type { LimitesAprimoramento } from '../src/motor/cadeia'
import type { PedidoMotor, RespostaMotor } from '../src/motor/tarefas'
import type { ResultadoZ3 } from '../src/motor/z3'
import { arquivoDoMotor, WorkerParecido } from './adaptador'
import { abrir, arquivoPadrao, respostasZ3 } from './armazem'

const VERSAO = 1
const PORTA = Number(process.env.CADERNO_PORTA) || 47390
const ORIGENS = new Set([
  'https://onethink-stack.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  ...(process.env.CADERNO_ORIGENS?.split(',').map((s) => s.trim()) ?? []),
])
const MIN = 60_000

// ---------------------------------------------------------------- capacidade

const BYTES_POR_CLAUSULA = 700
const nucleos = availableParallelism()
/** metade dos núcleos: o PC continua livre (CADERNO_NUCLEOS muda) */
const paralelo = Number(process.env.CADERNO_NUCLEOS) || Math.max(1, Math.floor(nucleos / 2))
/** 40% da memória do PC para o motor (CADERNO_MEMORIA_GB muda) */
const memoriaMotor = (Number(process.env.CADERNO_MEMORIA_GB) || (totalmem() * 0.4) / 1e9) * 1e9
/** maior problema (cláusulas) de uma checagem sozinha, e de cada uma em paralelo */
const limiteSozinho = Math.min(8_000_000, Math.floor(memoriaMotor / BYTES_POR_CLAUSULA))
const limiteParalelo = Math.max(300_000, Math.floor(memoriaMotor / paralelo / BYTES_POR_CLAUSULA))
/** memória (MB) de uma thread que monta problemas desse tamanho, com folga */
const memoriaPara = (clausulas: number) => Math.ceil((clausulas * BYTES_POR_CLAUSULA * 1.3) / 1e6) + 512
/** até onde o aprofundamento vai aqui (o app pede o do aparelho dele; aqui há mais) */
const APRIMORAR: Pick<LimitesAprimoramento, 'N' | 'K' | 'tempoChecagemMs' | 'orcamentoMs'> = {
  N: 24,
  K: 6,
  tempoChecagemMs: 10 * MIN,
  orcamentoMs: 3 * 60 * MIN,
}

try {
  // o sistema dá preferência aos outros programas: o PC continua leve
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL)
} catch {
  /* sem permissão: segue na prioridade normal */
}

/** O pedido do app com a capacidade daqui (só aumenta: mais memória, mais tamanho, mais tempo). */
function ajustar(p: PedidoMotor): PedidoMotor {
  const maior = (l: LimitesAprimoramento): LimitesAprimoramento => ({
    ...l,
    N: Math.max(l.N, APRIMORAR.N),
    K: Math.max(l.K, APRIMORAR.K),
    limite: Math.max(l.limite, limiteParalelo),
    tempoChecagemMs: Math.max(l.tempoChecagemMs, APRIMORAR.tempoChecagemMs),
    orcamentoMs: Math.max(l.orcamentoMs, APRIMORAR.orcamentoMs),
  })
  return {
    ...p,
    paralelo,
    limiteParalelo,
    opcoes: { ...p.opcoes, limite: Math.max(p.opcoes.limite, limiteSozinho) },
    ...(p.cadeia ? { cadeia: { ...p.cadeia, ...(p.cadeia.aprimorar ? { aprimorar: maior(p.cadeia.aprimorar) } : {}) } } : {}),
    ...(p.modelo ? { modelo: { ...p.modelo, ...(p.modelo.aprimorar ? { aprimorar: maior(p.modelo.aprimorar) } : {}) } } : {}),
  }
}

// ---------------------------------------------------------------- trabalhos

type Situacao = 'rodando' | 'terminado' | 'parado' | 'erro'

interface Trabalho {
  /** resumo do pedido: o mesmo pedido de novo (ex.: o app reaberto) pega este trabalho em vez de recomeçar */
  id: string
  pedido: PedidoMotor
  inicio: number
  fim?: number
  situacao: Situacao
  /** o que o motor respondeu; de cada tipo que é um retrato (cadeia, progresso…) só o último */
  eventos: { seq: number; e: RespostaMotor }[]
  seq: number
  /** muda quando o trabalho recomeça do zero (o motor caiu): quem acompanha relê tudo */
  geracao: number
  tentativas: number
}

const arquivo = arquivoPadrao()
const db: DatabaseSync = abrir(arquivo)
const guardadasZ3 = respostasZ3(db)
let atual: Trabalho | null = null
let motor: WorkerParecido | null = null
let idInterno = 0
let sujo = false
let mensagem = ''

const identidade = (p: PedidoMotor) => resumo(JSON.stringify({ ...p, id: 0, paralelo: 0, limiteParalelo: 0 }))

const RETRATOS = new Set<RespostaMotor['tipo']>(['cadeia', 'modelo', 'progresso', 'banco'])

function registrar(t: Trabalho, e: RespostaMotor) {
  if (RETRATOS.has(e.tipo)) t.eventos = t.eventos.filter((x) => x.e.tipo !== e.tipo)
  t.eventos.push({ seq: ++t.seq, e })
  if (e.tipo === 'progresso') mensagem = e.msg
  sujo = true
}

function salvar(t: Trabalho) {
  db.prepare(
    'INSERT OR REPLACE INTO trabalhos (id, pedido, inicio, fim, situacao, eventos, seq, geracao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(t.id, JSON.stringify(t.pedido), t.inicio, t.fim ?? null, t.situacao, JSON.stringify(t.eventos), t.seq, t.geracao)
  db.prepare('DELETE FROM trabalhos WHERE id NOT IN (SELECT id FROM trabalhos ORDER BY inicio DESC LIMIT 30)').run()
  if (t === atual) sujo = false
}

function lerTrabalho(id: string): Trabalho | null {
  const r = db.prepare('SELECT * FROM trabalhos WHERE id = ?').get(id) as
    | { id: string; pedido: string; inicio: number; fim: number | null; situacao: Situacao; eventos: string; seq: number; geracao: number }
    | undefined
  if (!r) return null
  return { ...r, fim: r.fim ?? undefined, pedido: JSON.parse(r.pedido), eventos: JSON.parse(r.eventos), tentativas: 0 }
}

// grava o trabalho em curso a cada poucos segundos (se o motor cair, o que já veio fica)
setInterval(() => {
  if (atual && sujo) salvar(atual)
}, 3000)

function obterMotor(): WorkerParecido {
  if (motor) return motor
  const w = new WorkerParecido(
    arquivoDoMotor('motor-worker'),
    { arquivo, memoriaPorAuxiliarMb: memoriaPara(limiteParalelo) },
    { maxOldGenerationSizeMb: memoriaPara(limiteSozinho) },
  )
  w.onmessage = ({ data }) => receber(data as RespostaMotor)
  w.onerror = (e) => {
    if (motor === w) motor = null
    const t = atual
    if (!t || t.situacao !== 'rodando') return
    log(`o motor caiu: ${e.message}`)
    // mais uma vez, do zero (o banco de provas guarda o que já foi feito); depois desiste
    if (t.tentativas < 1) {
      t.tentativas++
      comecar(t)
      return
    }
    registrar(t, { id: t.pedido.id, tipo: 'erro', chave: 'geral', msg: `o motor de fundo parou: ${e.message}` })
    terminar(t, 'erro')
  }
  motor = w
  return w
}

function comecar(t: Trabalho) {
  t.pedido = { ...t.pedido, id: ++idInterno }
  t.geracao++
  t.eventos = []
  t.situacao = 'rodando'
  t.fim = undefined
  atual = t
  salvar(t)
  obterMotor().postMessage(t.pedido)
}

function terminar(t: Trabalho, situacao: Situacao) {
  if (t.situacao !== 'rodando') return
  t.situacao = situacao
  t.fim = Date.now()
  if (!t.eventos.some((x) => x.e.tipo === 'fim')) registrar(t, { id: t.pedido.id, tipo: 'fim' })
  mensagem = ''
  salvar(t)
  log(`trabalho ${situacao} (${Math.round((t.fim - t.inicio) / 1000)} s)`)
}

/** Para o que estiver rodando (o worker do motor sai, e os auxiliares com ele). */
function parar(t: Trabalho) {
  if (t.situacao !== 'rodando') return
  motor?.terminate()
  motor = null
  terminar(t, 'parado')
}

function receber(r: RespostaMotor) {
  const t = atual
  if (!t || r.id !== t.pedido.id || t.situacao !== 'rodando') return
  if (r.tipo === 'z3-pedido') return void provarNoZ3(t, r.pedido, r.conjuntos, r.ate)
  registrar(t, r)
  if (r.tipo === 'fim') terminar(t, 'terminado')
}

/** Um pedido do app: o mesmo de antes pega o trabalho que já existe (rodando ou pronto); um novo para o anterior. */
function pedir(pedido: PedidoMotor): Trabalho {
  const id = identidade(pedido)
  if (atual?.id === id && (atual.situacao === 'rodando' || atual.situacao === 'terminado')) return atual
  const salvo = atual?.id === id ? null : lerTrabalho(id)
  if (atual?.situacao === 'rodando') parar(atual)
  if (salvo?.situacao === 'terminado') {
    atual = salvo
    return salvo
  }
  const t: Trabalho = { id, pedido: ajustar(pedido), inicio: Date.now(), situacao: 'rodando', eventos: [], seq: 0, geracao: 0, tentativas: 0 }
  log(`trabalho novo: ${pedido.cadeia ? 'reação em cadeia' : pedido.modelo ? 'segundo modelo' : 'conferência'}`)
  comecar(t)
  return t
}

// ---------------------------------------------------------------- Z3

/** tentativas cada vez mais longas quando há prazo (como o modo de horas do app) */
const TEMPOS_COM_PRAZO = [10_000, 120_000, 600_000, 1_800_000]
const TEMPO_SEM_PRAZO = 10_000
const RECICLAR_Z3_A_CADA = 100

class Z3DoMotor {
  checagens = 0
  reinicios = 0
  private w: WorkerParecido | null = null
  private feitas = 0
  private prox = 0
  private esperando = new Map<number, (r: { resultado?: ResultadoZ3; erro?: string }) => void>()
  private fila: Promise<unknown> = Promise.resolve()

  private descartar(motivo = 'reiniciado') {
    if (this.w) this.reinicios++
    this.w?.terminate()
    this.w = null
    for (const f of this.esperando.values()) f({ erro: motivo })
    this.esperando.clear()
  }

  private obter(): WorkerParecido {
    if (this.w && this.feitas < RECICLAR_Z3_A_CADA) return this.w
    this.descartar()
    const w = new WorkerParecido(arquivoDoMotor('z3-worker'))
    w.onmessage = ({ data }) => {
      const m = data as { id: number; resultado?: ResultadoZ3; erro?: string }
      const f = this.esperando.get(m.id)
      this.esperando.delete(m.id)
      f?.(m)
    }
    w.onerror = (e) => {
      if (this.w === w) this.descartar(e.message)
    }
    this.w = w
    this.feitas = 0
    return w
  }

  /** uma checagem por vez; se o Z3 quebrar ou travar, tenta mais uma vez numa thread nova */
  checar(formulas: Formula[], tempoMs: number, numericos: string[]): Promise<ResultadoZ3> {
    const r = this.fila.then(() => this.uma(formulas, tempoMs, numericos, 0))
    this.fila = r.catch(() => {})
    return r
  }

  private async uma(formulas: Formula[], tempoMs: number, numericos: string[], tentativa: number): Promise<ResultadoZ3> {
    const w = this.obter()
    this.feitas++
    this.checagens++
    const id = ++this.prox
    const r = await new Promise<{ resultado?: ResultadoZ3; erro?: string }>((ok) => {
      const vigia = setTimeout(() => {
        if (this.esperando.has(id) && this.w === w) this.descartar('travou')
      }, tempoMs + 60_000)
      this.esperando.set(id, (x) => {
        clearTimeout(vigia)
        ok(x)
      })
      w.postMessage({ id, formulas, tempoMs, numericos })
    })
    if (r.resultado) return r.resultado
    if (this.w === w) this.descartar()
    if (tentativa === 0) return this.uma(formulas, tempoMs, numericos, 1)
    return 'unknown'
  }
}

const z3 = new Z3DoMotor()
const chaveZ3 = (fs: Formula[]) => `f:${resumo(JSON.stringify(fs, (k, v) => (k === 'pos' || k === 'end' ? undefined : v)))}`

/** O motor pediu provas ao Z3: cada conjunto sem modelo (ou com) é avisado assim que sai; no fim, "z3-fim". */
async function provarNoZ3(t: Trabalho, pedido: number, conjuntos: Formula[][], ate?: number) {
  const w = motor
  const ainda = () => atual === t && t.situacao === 'rodando' && motor === w
  const numericos = t.pedido.dicionario.filter((e) => e.numerico).map((e) => e.simbolo)
  const decididos = new Set<number>()
  const avisar = (indice: number, resultado: 'sat' | 'unsat') => {
    decididos.add(indice)
    if (ainda()) w!.postMessage({ tipo: 'z3-resposta', pedido, indice, resultado })
  }
  // o que já foi provado em outro dia vem do armazém
  conjuntos.forEach((fs, i) => {
    const r = fs.length ? guardadasZ3.obter(chaveZ3(fs)) : undefined
    if (r) avisar(i, r)
  })
  const tempos = ate ? TEMPOS_COM_PRAZO : [TEMPO_SEM_PRAZO]
  for (let nivel = 0; ; nivel++) {
    const tempo = tempos[Math.min(nivel, tempos.length - 1)]
    for (const [i, fs] of conjuntos.entries()) {
      if (!ainda()) return
      if (decididos.has(i) || !fs.length) continue
      if (ate && Date.now() >= ate) break
      const ini = Date.now()
      const r = await z3.checar(fs, ate ? Math.min(tempo, Math.max(1000, ate - Date.now())) : tempo, numericos)
      if (r === 'sat' || r === 'unsat') {
        guardadasZ3.guardar(chaveZ3(fs), r, Date.now() - ini)
        avisar(i, r)
      }
    }
    if (!ate || Date.now() >= ate || decididos.size >= conjuntos.filter((c) => c.length).length) break
  }
  if (ainda()) w!.postMessage({ tipo: 'z3-fim', pedido })
}

// ---------------------------------------------------------------- HTTP

function log(s: string) {
  console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${s}`)
}

function json(res: ServerResponse, status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabecalhos })
  res.end(JSON.stringify(corpo))
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = []
  let total = 0
  for await (const p of req) {
    total += (p as Buffer).length
    if (total > 200e6) throw new Error('pedido grande demais')
    partes.push(p as Buffer)
  }
  return JSON.parse(Buffer.concat(partes).toString('utf8'))
}

function estado() {
  const t = atual
  return {
    versao: VERSAO,
    ocupado: t?.situacao === 'rodando',
    mensagem: t?.situacao === 'rodando' ? mensagem : '',
    trabalho: t && {
      id: t.id,
      tipo: t.pedido.cadeia ? 'cadeia' : t.pedido.modelo ? 'modelo' : 'conferencia',
      situacao: t.situacao,
      inicio: t.inicio,
      fim: t.fim,
    },
    capacidade: { nucleos, paralelo, memoriaGB: Math.round(memoriaMotor / 1e8) / 10, limiteSozinho, limiteParalelo, N: APRIMORAR.N },
    z3: { checagens: z3.checagens, reinicios: z3.reinicios },
  }
}

const servidor = createServer(async (req, res) => {
  const origem = req.headers.origin
  // só 127.0.0.1/localhost (um site que se passe por localhost manda outro Host) e só o app
  if (req.headers.host !== `127.0.0.1:${PORTA}` && req.headers.host !== `localhost:${PORTA}`) return json(res, 403, { erro: 'endereço não autorizado' })
  if (origem && !ORIGENS.has(origem)) return json(res, 403, { erro: 'origem não autorizada' })
  const cors: Record<string, string> = origem ? { 'Access-Control-Allow-Origin': origem, Vary: 'Origin' } : {}
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '600',
    })
    return res.end()
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORTA}`)
  const partes = url.pathname.split('/').filter(Boolean)
  try {
    if (req.method === 'GET' && url.pathname === '/estado') return json(res, 200, estado(), cors)
    if (req.method === 'POST' && url.pathname === '/trabalho') {
      if (!String(req.headers['content-type']).startsWith('application/json')) return json(res, 415, { erro: 'esperava JSON' }, cors)
      const t = pedir((await lerCorpo(req)) as PedidoMotor)
      return json(res, 200, { trabalho: t.id, geracao: t.geracao, situacao: t.situacao }, cors)
    }
    if (partes[0] === 'trabalho' && partes[1]) {
      const t = atual?.id === partes[1] ? atual : lerTrabalho(partes[1])
      if (!t) return json(res, 404, { erro: 'trabalho não encontrado' }, cors)
      if (req.method === 'POST' && partes[2] === 'parar') {
        if (t === atual) parar(t)
        return json(res, 200, { situacao: t.situacao }, cors)
      }
      if (req.method === 'GET' && !partes[2]) {
        // os eventos depois do último que o app viu (na mesma geração); de outra geração, tudo de novo
        const geracao = Number(url.searchParams.get('geracao'))
        const desde = geracao === t.geracao ? Number(url.searchParams.get('desde')) || 0 : 0
        const para = Number(url.searchParams.get('id')) || 0
        const eventos = t.eventos.filter((x) => x.seq > desde).map((x) => ({ ...x.e, id: para }))
        return json(res, 200, { geracao: t.geracao, seq: t.seq, situacao: t.situacao, eventos }, cors)
      }
    }
    return json(res, 404, { erro: 'não encontrado' }, cors)
  } catch (e) {
    return json(res, 400, { erro: (e as Error).message }, cors)
  }
})

servidor.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`A porta ${PORTA} já está em uso: o motor de fundo já está rodando? (outra porta: CADERNO_PORTA=…)`)
    process.exit(1)
  }
  throw e
})

servidor.listen(PORTA, '127.0.0.1', () => {
  log(`Motor de fundo do Caderno Lógico em http://127.0.0.1:${PORTA}`)
  log(`${nucleos} núcleos (usando ${paralelo} ao mesmo tempo), ${Math.round(memoriaMotor / 1e9)} GB para o motor, prioridade baixa`)
  log(`dados em ${arquivo}`)
  // o último trabalho não terminou (o motor ou o PC foram desligados no meio): recomeça sozinho
  const ultimo = db.prepare("SELECT id FROM trabalhos WHERE situacao = 'rodando' ORDER BY inicio DESC LIMIT 1").get() as { id: string } | undefined
  const t = ultimo && lerTrabalho(ultimo.id)
  if (t) {
    log('retomando o trabalho que estava rodando quando o motor parou')
    comecar(t)
  }
})

// fechar com Ctrl+C: o trabalho fica marcado como "rodando" e recomeça na próxima vez
process.on('SIGINT', () => {
  if (atual && sujo) salvar(atual)
  process.exit(0)
})
