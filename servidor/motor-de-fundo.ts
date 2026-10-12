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
import type { EntradaDicionario } from '../src/dados/tipos'
import type { LimitesAprimoramento } from '../src/motor/cadeia'
import type { Grupo } from '../src/motor/motor'
import type { EventoGerador } from '../src/motor/saturacao'
import type { PedidoMotor, RespostaMotor } from '../src/motor/tarefas'
import type { RespostaComNucleo, ResultadoZ3 } from '../src/motor/z3'
import type { PedidoGerador, RespostaGerador } from './gerador-worker'
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
  if (r.tipo === 'z3-pedido') return void provarNoZ3(t, r.pedido, r.conjuntos, r.ate, r.grupos)
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
  private esperando = new Map<number, (r: { resultado?: ResultadoZ3; nucleo?: number[] | null; erro?: string }) => void>()
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
      const m = data as { id: number; resultado?: ResultadoZ3; nucleo?: number[] | null; erro?: string }
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
  checar(formulas: Formula[], tempoMs: number, numericos: string[], grupos?: (number | null)[]): Promise<RespostaComNucleo> {
    const r = this.fila.then(() => this.uma(formulas, tempoMs, numericos, grupos, 0))
    this.fila = r.catch(() => {})
    return r
  }

  private async uma(formulas: Formula[], tempoMs: number, numericos: string[], grupos: (number | null)[] | undefined, tentativa: number): Promise<RespostaComNucleo> {
    const w = this.obter()
    this.feitas++
    this.checagens++
    const id = ++this.prox
    const r = await new Promise<{ resultado?: ResultadoZ3; nucleo?: number[] | null; erro?: string }>((ok) => {
      // o Z3 às vezes ignora o prazo: passou do dobro, travou
      const vigia = setTimeout(() => {
        if (this.esperando.has(id) && this.w === w) this.descartar('travou')
      }, 2 * tempoMs + 15_000)
      this.esperando.set(id, (x) => {
        clearTimeout(vigia)
        ok(x)
      })
      w.postMessage({ id, formulas, tempoMs, numericos, ...(grupos ? { grupos } : {}) })
    })
    if (r.resultado) return { resultado: r.resultado, nucleo: r.nucleo ?? null }
    if (this.w === w) this.descartar()
    if (tentativa === 0) return this.uma(formulas, tempoMs, numericos, grupos, 1)
    return { resultado: 'unknown', nucleo: null }
  }
}

const z3 = new Z3DoMotor()
const chaveZ3 = (fs: Formula[], grupos?: (number | null)[]) =>
  `f:${resumo(JSON.stringify(fs, (k, v) => (k === 'pos' || k === 'end' ? undefined : v)))}${grupos ? `:${resumo(JSON.stringify(grupos))}` : ''}`

/** O motor pediu provas ao Z3: cada conjunto sem modelo (ou com) é avisado assim que sai; no fim, "z3-fim". */
async function provarNoZ3(t: Trabalho, pedido: number, conjuntos: Formula[][], ate?: number, grupos?: (number | null)[][]) {
  const w = motor
  const ainda = () => atual === t && t.situacao === 'rodando' && motor === w
  const numericos = t.pedido.dicionario.filter((e) => e.numerico).map((e) => e.simbolo)
  const decididos = new Set<number>()
  const avisar = (indice: number, resultado: 'sat' | 'unsat', nucleo: number[] | null) => {
    decididos.add(indice)
    if (ainda()) w!.postMessage({ tipo: 'z3-resposta', pedido, indice, resultado, nucleo })
  }
  // o que já foi provado em outro dia vem do armazém
  conjuntos.forEach((fs, i) => {
    const r = fs.length ? guardadasZ3.obter(chaveZ3(fs, grupos?.[i])) : undefined
    if (r) avisar(i, r.resultado, r.nucleo)
  })
  const tempos = ate ? TEMPOS_COM_PRAZO : [TEMPO_SEM_PRAZO]
  for (let nivel = 0; ; nivel++) {
    const tempo = tempos[Math.min(nivel, tempos.length - 1)]
    for (const [i, fs] of conjuntos.entries()) {
      if (!ainda()) return
      if (decididos.has(i) || !fs.length) continue
      if (ate && Date.now() >= ate) break
      const ini = Date.now()
      const r = await z3.checar(fs, ate ? Math.min(tempo, Math.max(1000, ate - Date.now())) : tempo, numericos, grupos?.[i])
      if (r.resultado === 'sat' || r.resultado === 'unsat') {
        guardadasZ3.guardar(chaveZ3(fs, grupos?.[i]), r.resultado, Date.now() - ini, r.nucleo)
        avisar(i, r.resultado, r.nucleo)
      }
    }
    if (!ate || Date.now() >= ate || decididos.size >= conjuntos.filter((c) => c.length).length) break
  }
  if (ainda()) w!.postMessage({ tipo: 'z3-fim', pedido })
}

// ---------------------------------------------------------------- gerador (o banco de verdades)

/** "nota~resumo das fórmulas": o teorema só vale enquanto a nota tiver as mesmas fórmulas */
const identidadeDe = (g: Grupo) => `${g.id}~${resumo(g.formulas.join('\n'))}`
const notaDe = (identidade: string) => identidade.slice(0, identidade.lastIndexOf('~'))

interface EstadoGerador {
  assinatura: string
  grupos: Grupo[]
  dicionario: EntradaDicionario[]
  identidades: Set<string>
  /** o andamento: tamanho, combinações feitas, esperando, guardadas */
  andamento: Omit<Extract<RespostaGerador, { tipo: 'estado' }>, 'tipo'> | null
  saturadoAte: number | null
  fim: 'contradicao' | 'esgotou' | null
  contradicao: string[] | null
  ignoradas: { nota: string; motivo: string }[]
}

let ger: EstadoGerador | null = null
let geradorW: WorkerParecido | null = null

function lerConfig<T>(chave: string): T | null {
  const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave) as { valor: string } | undefined
  return r ? (JSON.parse(r.valor) as T) : null
}
const gravarConfig = (chave: string, valor: unknown) => void db.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').run(chave, JSON.stringify(valor))

const valida = (apoio: string[]) => !!ger && apoio.every((a) => ger!.identidades.has(a))

/** As leis do caderno mudaram (ou o motor ligou): o gerador recomeça sobre elas, sem repetir o que já está no banco. */
function iniciarGerador(grupos: Grupo[], dicionario: EntradaDicionario[]): boolean {
  const assinatura = resumo(JSON.stringify([grupos.map((g) => [g.id, g.formulas]), dicionario.map((e) => [e.simbolo, e.tipo, e.aridade])]))
  if (ger?.assinatura === assinatura && geradorW) return false
  const comIdentidade = grupos.map((g) => ({ ...g, id: identidadeDe(g) }))
  ger = {
    assinatura,
    grupos,
    dicionario,
    identidades: new Set(comIdentidade.map((g) => g.id)),
    andamento: null,
    saturadoAte: null,
    fim: null,
    contradicao: null,
    ignoradas: [],
  }
  gravarConfig('gerador', { grupos, dicionario })
  // o que já está no banco e continua valendo não sai de novo
  const emitidos = (db.prepare('SELECT chave, apoio FROM verdades').all() as { chave: string; apoio: string }[])
    .filter((r) => valida(JSON.parse(r.apoio)))
    .map((r) => r.chave)
  geradorW?.terminate()
  const w = new WorkerParecido(arquivoDoMotor('gerador-worker'), undefined, { maxOldGenerationSizeMb: 1536 })
  w.onmessage = ({ data }) => receberDoGerador(data as RespostaGerador)
  w.onerror = (e) => {
    if (geradorW !== w) return
    geradorW = null
    log(`o gerador caiu (${e.message}); recomeça em 30 s`)
    const g = ger
    setTimeout(() => {
      if (ger === g && !geradorW && g) {
        g.assinatura = ''
        iniciarGerador(g.grupos, g.dicionario)
      }
    }, 30_000)
  }
  geradorW = w
  w.postMessage({ tipo: 'iniciar', grupos: comIdentidade, dicionario, emitidos } satisfies PedidoGerador)
  log(`gerador: ${grupos.length} leis e fatos, ${emitidos.length} teoremas já no banco`)
  return true
}

function receberDoGerador(r: RespostaGerador) {
  if (!ger) return
  if (r.tipo === 'estado') ger.andamento = { peso: r.peso, escolhidas: r.escolhidas, geradas: r.geradas, esperando: r.esperando, guardadas: r.guardadas }
  else if (r.tipo === 'ignoradas') ger.ignoradas = r.ignoradas.map((x) => ({ ...x, nota: notaDe(x.nota) }))
  else if (r.tipo === 'saturou') ger.saturadoAte = r.peso
  else if (r.tipo === 'fim') {
    ger.fim = r.motivo
    log(r.motivo === 'esgotou' ? 'gerador: tudo até o tamanho máximo já foi gerado' : 'gerador: as leis se contradizem')
  } else gravarEventos(r.eventos)
}

function gravarEventos(eventos: EventoGerador[]) {
  const inserir = db.prepare(
    `INSERT INTO verdades (chave, formula, peso, prof, apoio, pais, criado) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET formula = excluded.formula, peso = excluded.peso, prof = excluded.prof,
       apoio = excluded.apoio, pais = excluded.pais, superado_por = NULL`,
  )
  const usar = db.prepare('UPDATE verdades SET usos = usos + 1 WHERE chave = ?')
  db.exec('BEGIN')
  try {
    let ultimo: string | null = null
    for (const e of eventos) {
      if (e.tipo === 'teorema') {
        inserir.run(e.t.chave, e.t.formula, e.t.peso, e.t.prof, JSON.stringify(e.t.apoio), JSON.stringify(e.t.pais), Date.now())
        ultimo = e.t.chave
      } else if (e.tipo === 'uso') usar.run(e.chave)
      // superado pelo teorema que acabou de sair (o mais geral)
      else if (e.tipo === 'superado' && ultimo) db.prepare('UPDATE verdades SET superado_por = ? WHERE chave = ?').run(ultimo, e.chave)
      else if (e.tipo === 'contradicao' && ger) ger.contradicao = e.apoio.map(notaDe)
    }
    db.exec('COMMIT')
  } catch (x) {
    db.exec('ROLLBACK')
    throw x
  }
}

interface Verdade {
  chave: string
  formula: string
  peso: number
  prof: number
  apoio: string[]
  pais: { chave: string; formula: string }[]
  usos: number
  criado: number
}

/** Os teoremas que valem com as leis de agora, sem os superados por um mais geral que também vale. */
function verdades(ordem: string, limite: number, busca: string): { total: number; itens: Verdade[] } {
  type Linha = { chave: string; formula: string; peso: number; prof: number; apoio: string; pais: string; usos: number; superado_por: string | null; criado: number }
  const todas = db.prepare('SELECT * FROM verdades').all() as Linha[]
  const validas = new Map<string, Linha>()
  for (const r of todas) if (valida(JSON.parse(r.apoio))) validas.set(r.chave, r)
  let lista = [...validas.values()].filter((r) => !(r.superado_por && validas.has(r.superado_por)))
  const total = lista.length
  if (busca) lista = lista.filter((r) => r.formula.toLowerCase().includes(busca.toLowerCase()))
  lista.sort((a, b) =>
    ordem === 'curtos' ? a.peso - b.peso || b.usos - a.usos : ordem === 'novos' ? b.criado - a.criado : b.usos - a.usos || a.peso - b.peso,
  )
  const itens = lista.slice(0, limite).map((r) => ({
    chave: r.chave,
    formula: r.formula,
    peso: r.peso,
    prof: r.prof,
    apoio: (JSON.parse(r.apoio) as string[]).map(notaDe),
    pais: (JSON.parse(r.pais) as string[]).flatMap((k) => {
      const p = validas.get(k)
      return p ? [{ chave: k, formula: p.formula }] : []
    }),
    usos: r.usos,
    criado: r.criado,
  }))
  return { total, itens }
}

function estadoGerador() {
  if (!ger) return { ligado: false }
  return {
    ligado: true,
    rodando: !!geradorW && !ger.fim,
    leis: ger.grupos.length,
    andamento: ger.andamento,
    saturadoAte: ger.saturadoAte,
    fim: ger.fim,
    contradicao: ger.contradicao,
    ignoradas: ger.ignoradas,
  }
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

/** Aberto no navegador (http://127.0.0.1:47390): mostra que o motor está ligado e o que ele faz. */
function pagina(res: ServerResponse) {
  const e = estado()
  const t = e.trabalho
  const nomeTipo: Record<string, string> = { cadeia: 'reação em cadeia', modelo: 'segundo modelo', conferencia: 'conferência' }
  const quando = (ms?: number) => (ms ? new Date(ms).toLocaleString('pt-BR') : '')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const agora = t
    ? t.situacao === 'rodando'
      ? `Trabalhando agora: ${nomeTipo[t.tipo]}, desde ${quando(t.inicio)}${e.mensagem ? ` — ${esc(e.mensagem)}` : ''}.`
      : `Último trabalho: ${nomeTipo[t.tipo]}, ${t.situacao} em ${quando(t.fim)}.`
    : 'Nenhum trabalho ainda: abra o Caderno e rode a reação em cadeia.'
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="10"><title>Motor de fundo</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#222;background:#fafafa}
h1{font-size:22px}.ok{color:#1a7f37;font-weight:600}a.botao{display:inline-block;margin-top:12px;padding:10px 16px;background:#2457c5;color:#fff;border-radius:8px;text-decoration:none}
p.suave{color:#666;font-size:14px}</style></head><body>
<h1>Motor de fundo do Caderno Lógico</h1>
<p class="ok">✓ Ligado neste PC.</p>
<p>${agora}</p>
<p>Usa ${e.capacidade.paralelo} de ${e.capacidade.nucleos} núcleos e até ${e.capacidade.memoriaGB.toLocaleString('pt-BR')} GB, com prioridade baixa. Z3: ${e.z3.checagens} checagens nesta sessão.</p>
<a class="botao" href="https://onethink-stack.github.io/cosmos/#/cadeia">Abrir o Caderno Lógico</a>
<p class="suave">O motor não tem janela: ele trabalha escondido e o Caderno (no navegador) manda os trabalhos para cá. Esta página se atualiza sozinha a cada 10 s.</p>
</body></html>`)
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
      // as duas versões da permissão do Chrome para um site falar com este computador
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Allow-Local-Network': 'true',
      'Access-Control-Max-Age': '600',
    })
    return res.end()
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORTA}`)
  const partes = url.pathname.split('/').filter(Boolean)
  try {
    if (req.method === 'GET' && url.pathname === '/estado') return json(res, 200, estado(), cors)
    if (req.method === 'GET' && url.pathname === '/') return pagina(res)
    if (url.pathname === '/gerador') {
      if (req.method === 'GET') return json(res, 200, estadoGerador(), cors)
      if (req.method === 'POST') {
        if (!String(req.headers['content-type']).startsWith('application/json')) return json(res, 415, { erro: 'esperava JSON' }, cors)
        const { grupos, dicionario } = (await lerCorpo(req)) as { grupos: Grupo[]; dicionario: EntradaDicionario[] }
        return json(res, 200, { mudou: iniciarGerador(grupos, dicionario) }, cors)
      }
    }
    if (req.method === 'GET' && url.pathname === '/verdades') {
      const ordem = url.searchParams.get('ordem') ?? 'uteis'
      const limite = Math.min(2000, Number(url.searchParams.get('limite')) || 300)
      return json(res, 200, { gerador: estadoGerador(), ...verdades(ordem, limite, url.searchParams.get('busca') ?? '') }, cors)
    }
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
  if (e.code !== 'EADDRINUSE') throw e
  // a porta está ocupada: se é o próprio motor de fundo (ligado noutra janela, ou pelo
  // Windows), está tudo certo e este sai sem erro; se é outro programa, é erro
  void fetch(`http://127.0.0.1:${PORTA}/estado`, { signal: AbortSignal.timeout(3000) })
    .then((r) => r.json() as Promise<{ versao?: number }>)
    .then((x) => {
      if (x.versao !== VERSAO) throw new Error('outro programa')
      log(`O motor de fundo já está rodando (porta ${PORTA}): nada a fazer.`)
      process.exit(0)
    })
    .catch(() => {
      console.error(`A porta ${PORTA} está ocupada por outro programa. Para usar outra: CADERNO_PORTA=…`)
      process.exit(1)
    })
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
  // o gerador volta a trabalhar sobre as últimas leis que o app mandou
  const g = lerConfig<{ grupos: Grupo[]; dicionario: EntradaDicionario[] }>('gerador')
  if (g) iniciarGerador(g.grupos, g.dicionario)
})

// fechar com Ctrl+C: o trabalho fica marcado como "rodando" e recomeça na próxima vez
process.on('SIGINT', () => {
  if (atual && sujo) salvar(atual)
  process.exit(0)
})
