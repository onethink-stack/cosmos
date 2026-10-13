// Caçar falhas lógicas: alvos (um sistema de um programa de recompensa), as
// regras que o código segue e as promessas da documentação. O exame roda num
// worker só da caçada (src/motor/cacada.ts) e de novo sozinho a cada mudança;
// o Z3 tenta provar, para qualquer tamanho, o que o motor finito conferiu até N.
// Um cenário em que a promessa fura vira um achado, que só chega a relatório
// depois de confirmado no código, com um teste que reproduz a falha.

import { useEffect, useReducer } from 'preact/hooks'
import type { Formula } from '../logica/ast'
import { paraSubscrito } from '../logica/impressao'
import { validar } from '../logica/validador'
import type { ExamePromessa, PedidoCacada, RespostaCacada } from '../motor/cacada'
import { examinarTudo } from '../motor/cacada'
import CacadaWorker from '../motor/cacadaWorker?worker&inline'
import { analisar, nao, type Modelo, type MundoExplicado } from '../motor/motor'
import type { PassoExplicacao } from '../motor/avaliar'
import { lerPacoteDeAlvos, mesclarAlvos, pacoteDeAlvos, type Mescla } from './cacadaArquivo'
import type { CasoTreino, ModeloInicial } from './cacadaTreinos'
import { gravarConfig, lerConfig } from './db'
import { disponibilidadeZ3, PRIORIDADE, z3 } from './z3'

export interface RegraAlvo {
  id: string
  titulo: string
  formula: string
  /** onde isso está no código ou na documentação (arquivo, função, linha, endereço) */
  fonte: string
  ativa: boolean
}

export interface PromessaAlvo {
  id: string
  titulo: string
  /** o texto da documentação que promete */
  citacao: string
  formula: string
  fonte: string
}

/** Do cenário ao relatório: só "poc" e "reportado" têm prova no código. */
export type EstadoAchado = 'pista' | 'faltava-regra' | 'no-codigo' | 'poc' | 'reportado' | 'descartado'

export const ESTADOS_ACHADO: { estado: EstadoAchado; nome: string; dica: string }[] = [
  { estado: 'pista', nome: 'Pista', dica: 'as regras escritas permitem a falha; falta ver se o código também permite' },
  { estado: 'faltava-regra', nome: 'Faltava uma regra', dica: 'o código tem uma checagem que o modelo não tinha: escreva-a como regra' },
  { estado: 'no-codigo', nome: 'Confirmado no código', dica: 'há uma sequência de chamadas reais que leva ao cenário' },
  { estado: 'poc', nome: 'Teste pronto (PoC)', dica: 'um teste no código (numa cópia local da rede) reproduz a falha' },
  { estado: 'reportado', nome: 'Reportado', dica: 'enviado ao programa' },
  { estado: 'descartado', nome: 'Descartado', dica: 'não é falha (fora do escopo, já conhecida, sem impacto)' },
]

export interface Achado {
  id: string
  promessaId: string
  quando: number
  /** a promessa e as regras ativas no momento (o cenário vale para elas) */
  promessa: string
  regras: { id: string; titulo: string; formula: string; fonte: string }[]
  mundo: MundoExplicado
  estado: EstadoAchado
  /** o que foi conferido no código, por que mudou de estado */
  anotacao: string
  /** a prova de conceito: onde está o teste e como rodar */
  poc: string
}

export interface Alvo {
  id: string
  nome: string
  /** endereço do programa de recompensa */
  programa: string
  /** o que está no escopo (contratos, impactos aceitos) */
  escopo: string
  regras: RegraAlvo[]
  promessas: PromessaAlvo[]
  achados: Achado[]
  /** veio de um caso de treino (o id dele) */
  treino?: string
  /** veio de um modelo inicial (o id dele) */
  modelo?: string
  criadoEm: string
  atualizadoEm: string
}

/** O que o Z3 disse de uma promessa (para qualquer número de objetos). */
export type ParecerZ3Cacada =
  | { estado: 'desligado' | 'rodando' | 'nao-sei' }
  /** as regras implicam a promessa; `regras`: as que a prova usou */
  | { estado: 'provada'; regras: string[] }
  /** as regras implicam o contrário da promessa */
  | { estado: 'provada-falsa'; regras: string[] }
  /** há cenário (talvez grande demais para mostrar) com as regras e a promessa falsa */
  | { estado: 'fura' }
  /** as regras se contradizem */
  | { estado: 'regras-contraditorias' }

export interface ResultadoPromessa {
  exame: ExamePromessa
  ms: number
  z3?: ParecerZ3Cacada
}

export interface ExameAlvo {
  assinatura: string
  rodando: boolean
  msg?: string
  /** promessa em exame agora */
  promessaId?: string
  resultados: Record<string, ResultadoPromessa>
  /** as regras e as promessas examinadas (o Z3 confere estas, mesmo que o alvo mude no meio) */
  regras: { id: string; formula: string }[]
  promessas: Record<string, string>
}

/** até quantos objetos o motor finito procura (as falhas lógicas costumam aparecer com poucos) */
export const N_CACADA = 8
/** tempo de cada promessa no motor finito */
const PRAZO_PROMESSA_MS = 60_000
/** tempo do Z3 por checagem */
const TEMPO_Z3_MS = 10_000
/** espera depois de uma mudança antes de examinar de novo */
const ESPERA_MS = 800

const CHAVE = 'cacadaAlvos'

const novoId = (prefixo: string) => `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/** Os avisos de uma fórmula (ex.: E14, o escopo de um quantificador que passa do parêntese). */
export function avisosDaFormula(texto: string): string[] {
  if (!texto.trim()) return []
  return validar(texto, []).diags.filter((d) => d.nivel === 'aviso').map((d) => d.msg)
}

/** Os erros de uma fórmula (vazia = válida). Sem dicionário: os nomes valem pelo uso. */
export function errosDaFormula(texto: string): string[] {
  if (!texto.trim()) return ['fórmula vazia']
  return validar(texto, []).diags.filter((d) => d.nivel === 'erro').map((d) => d.msg)
}

const valida = (texto: string) => !errosDaFormula(texto).length

/** muda se as regras ativas ou as promessas (as fórmulas) mudarem */
export function assinaturaAlvo(a: Alvo): string {
  return JSON.stringify([
    N_CACADA,
    a.regras.filter((r) => r.ativa && valida(r.formula)).map((r) => [r.id, r.formula]),
    a.promessas.filter((p) => valida(p.formula)).map((p) => [p.id, p.formula]),
  ])
}

class Cacada {
  alvos: Alvo[] = []
  carregado = false
  exames = new Map<string, ExameAlvo>()
  private ouvintes = new Set<() => void>()
  private worker: Worker | null = null
  private semWorker = false
  private pedido = 0
  private esperas = new Map<string, ReturnType<typeof setTimeout>>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  /** o Z3 foi ligado (ou ficou disponível) depois do exame: o que ficou sem ele vai para ele agora */
  private z3Ligou = () => {
    if (!z3.ativo || !disponibilidadeZ3().ok) return
    for (const [alvoId, e] of this.exames)
      for (const [promessaId, r] of Object.entries(e.resultados))
        if (r.z3?.estado === 'desligado') void this.pedirZ3(alvoId, e.assinatura, promessaId, r.exame)
  }

  async carregar() {
    if (this.carregado) return
    z3.assinar(this.z3Ligou)
    try {
      this.alvos = (await lerConfig<Alvo[]>(CHAVE)) ?? []
    } catch {
      /* sem banco */
    }
    this.carregado = true
    this.avisar()
  }

  private async gravar() {
    this.avisar()
    await gravarConfig(CHAVE, this.alvos).catch(() => {})
  }

  alvo(id: string) {
    return this.alvos.find((a) => a.id === id)
  }

  novoAlvo(nome = 'Novo alvo'): Alvo {
    const agora = new Date().toISOString()
    const a: Alvo = { id: novoId('alvo'), nome, programa: '', escopo: '', regras: [], promessas: [], achados: [], criadoEm: agora, atualizadoEm: agora }
    this.alvos = [a, ...this.alvos]
    void this.gravar()
    return a
  }

  /** Um alvo com as regras e a promessa de um caso real (a correção fica de fora, para treinar). */
  deTreino(c: CasoTreino): Alvo {
    const agora = new Date().toISOString()
    const a: Alvo = {
      id: novoId('alvo'),
      nome: `Treino — ${c.nome}`,
      programa: '',
      escopo: `${c.quando}. ${c.resumo}`,
      regras: c.regras.map((r) => ({ ...r, ativa: true })),
      promessas: [{ id: 'promessa', titulo: c.promessa.titulo, citacao: c.promessa.citacao, formula: c.promessa.formula, fonte: '' }],
      achados: [],
      treino: c.id,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    this.alvos = [a, ...this.alvos]
    void this.gravar()
    this.agendar(a.id)
    return a
  }

  /** Um alvo a partir de um modelo inicial (regras tiradas do código público). */
  deModelo(m: ModeloInicial): Alvo {
    const agora = new Date().toISOString()
    const a: Alvo = {
      id: novoId('alvo'),
      nome: m.nome,
      programa: m.programa,
      escopo: m.escopo,
      regras: m.regras.map((r) => ({ ...r, ativa: true })),
      promessas: m.promessas.map((p) => ({ ...p })),
      achados: [],
      modelo: m.id,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    this.alvos = [a, ...this.alvos]
    void this.gravar()
    this.agendar(a.id)
    return a
  }

  /** Grava o alvo e examina de novo (depois de uma pausa: várias mudanças seguidas viram um exame só). */
  salvar(a: Alvo) {
    const novo = { ...a, atualizadoEm: new Date().toISOString() }
    this.alvos = this.alvos.map((x) => (x.id === a.id ? novo : x))
    void this.gravar()
    this.agendar(a.id)
  }

  remover(id: string) {
    this.alvos = this.alvos.filter((a) => a.id !== id)
    this.exames.delete(id)
    void this.gravar()
  }

  /** O arquivo com estes alvos (para levar a outro aparelho). */
  exportar(ids?: string[]): string {
    const alvos = ids ? this.alvos.filter((a) => ids.includes(a.id)) : this.alvos
    return JSON.stringify(pacoteDeAlvos(alvos), null, 2)
  }

  /** Junta os alvos de um arquivo (de outro aparelho, ou um backup): o mais novo de cada fica, e os achados se somam. */
  async importar(conteudo: string): Promise<{ ok: true; mescla: Mescla; ignorados: number } | { ok: false; erro: string }> {
    const lido = lerPacoteDeAlvos(conteudo)
    if (!lido.ok) return lido
    await this.carregar()
    const mescla = mesclarAlvos(this.alvos, lido.alvos)
    this.alvos = mescla.alvos
    for (const a of lido.alvos) this.exames.delete(a.id)
    await this.gravar()
    return { ok: true, mescla, ignorados: lido.ignorados }
  }

  /** troca todos os alvos (restaurar um backup) */
  async substituir(alvos: Alvo[]) {
    await this.carregar()
    this.alvos = alvos
    this.exames.clear()
    await this.gravar()
  }

  /** os do backup substituem os de mesmo id; os outros ficam */
  async mesclar(alvos: Alvo[]) {
    await this.carregar()
    const ids = new Set(alvos.map((a) => a.id))
    this.alvos = [...alvos, ...this.alvos.filter((a) => !ids.has(a.id))]
    for (const id of ids) this.exames.delete(id)
    await this.gravar()
  }

  private agendar(id: string) {
    clearTimeout(this.esperas.get(id))
    this.esperas.set(
      id,
      setTimeout(() => {
        this.esperas.delete(id)
        const a = this.alvo(id)
        // títulos, citações e fontes não mudam o exame
        if (a) this.garantirExame(a)
      }, ESPERA_MS),
    )
  }

  /** Examina, se o exame que existe não é destas regras e promessas (a tela chama ao abrir o alvo). */
  garantirExame(a: Alvo) {
    const e = this.exames.get(a.id)
    if (e?.assinatura === assinaturaAlvo(a) || this.esperas.has(a.id)) return
    this.examinar(a)
  }

  /** Examina todas as promessas do alvo (um exame de antes, deste ou de outro alvo, para). */
  examinar(a: Alvo) {
    const assinatura = assinaturaAlvo(a)
    const regras = a.regras.filter((r) => r.ativa && valida(r.formula)).map((r) => ({ id: r.id, rotulo: r.titulo || r.formula, formulas: [r.formula] }))
    const promessas = a.promessas.filter((p) => valida(p.formula)).map((p) => ({ id: p.id, formula: p.formula }))
    // os outros alvos com exame pela metade ficam para quando forem abertos de novo
    for (const [id, e] of this.exames) if (id !== a.id && e.rodando) this.exames.set(id, { ...e, rodando: false, assinatura: '' })
    this.exames.set(a.id, {
      assinatura,
      rodando: promessas.length > 0,
      resultados: {},
      regras: regras.map((r) => ({ id: r.id, formula: r.formulas[0] })),
      promessas: Object.fromEntries(promessas.map((p) => [p.id, p.formula])),
    })
    this.avisar()
    this.worker?.terminate()
    this.worker = null
    if (!promessas.length) return
    const p: PedidoCacada = { id: ++this.pedido, regras, promessas, opcoes: { N: N_CACADA, K: 1, limite: 2_000_000 }, prazoMs: PRAZO_PROMESSA_MS }
    const receber = (r: RespostaCacada) => this.receber(a.id, p.id, r)
    if (!this.semWorker) {
      try {
        const w = new CacadaWorker()
        w.onmessage = (e: MessageEvent<RespostaCacada>) => receber(e.data)
        w.onerror = () => {
          w.terminate()
          if (this.worker !== w) return
          this.worker = null
          this.semWorker = true
          setTimeout(() => examinarTudo(p, receber))
        }
        this.worker = w
        w.postMessage(p)
        return
      } catch {
        this.semWorker = true
      }
    }
    // sem worker (navegador restrito): aqui mesmo, depois de a tela desenhar
    setTimeout(() => examinarTudo(p, receber))
  }

  private receber(alvoId: string, pedido: number, r: RespostaCacada) {
    if (pedido !== this.pedido) return
    const e = this.exames.get(alvoId)
    if (!e) return
    if (r.tipo === 'progresso') {
      this.exames.set(alvoId, { ...e, msg: r.msg, promessaId: r.promessaId })
    } else if (r.tipo === 'exame') {
      const res: ResultadoPromessa = { exame: r.exame, ms: r.ms }
      this.exames.set(alvoId, { ...e, msg: undefined, promessaId: undefined, resultados: { ...e.resultados, [r.promessaId]: res } })
      void this.pedirZ3(alvoId, e.assinatura, r.promessaId, r.exame)
    } else {
      this.exames.set(alvoId, { ...e, rodando: false, msg: undefined, promessaId: undefined })
      this.worker?.terminate()
      this.worker = null
    }
    this.avisar()
  }

  private mudarZ3(alvoId: string, assinatura: string, promessaId: string, z: ParecerZ3Cacada) {
    const e = this.exames.get(alvoId)
    const r = e?.resultados[promessaId]
    if (!e || !r || e.assinatura !== assinatura) return
    this.exames.set(alvoId, { ...e, resultados: { ...e.resultados, [promessaId]: { ...r, z3: z } } })
    this.avisar()
  }

  /** O Z3 confere o que o motor finito só viu até N (um cenário que fura já é definitivo). */
  private async pedirZ3(alvoId: string, assinatura: string, promessaId: string, exame: ExamePromessa) {
    if (exame.tipo === 'fura' || exame.tipo === 'invalida') return
    if (!z3.ativo || !disponibilidadeZ3().ok) return this.mudarZ3(alvoId, assinatura, promessaId, { estado: 'desligado' })
    // as regras e a promessa do exame (não as de agora: o alvo pode ter mudado no meio)
    const e = this.exames.get(alvoId)
    const formulaPromessa = e?.promessas[promessaId]
    if (!e || e.assinatura !== assinatura || formulaPromessa === undefined) return
    const regras = e.regras
    const formulas: Formula[] = []
    const grupos: number[] = []
    for (const [i, r] of regras.entries())
      for (const f of analisar([r.formula], [], true)) {
        formulas.push(f.expandida)
        grupos.push(i)
      }
    const [phi] = analisar([formulaPromessa], [], true)
    if (!phi) return
    this.mudarZ3(alvoId, assinatura, promessaId, { estado: 'rodando' })
    const provar = (extra: Formula[]) => z3.provarFormulas([...formulas, ...extra], [], TEMPO_Z3_MS, [...grupos, ...extra.map(() => null)], PRIORIDADE.pergunta)
    const nomes = (nucleo?: number[] | null) => (nucleo ? [...new Set(nucleo.map((i) => regras[i]?.id).filter((x): x is string => !!x))] : regras.map((r) => r.id))
    if (exame.tipo === 'regras-contraditorias') {
      const r = await provar([])
      return this.mudarZ3(alvoId, assinatura, promessaId, r?.resultado === 'unsat' ? { estado: 'regras-contraditorias' } : { estado: 'nao-sei' })
    }
    // a promessa segue? (as regras com a promessa negada não têm cenário)
    const segue = exame.tipo === 'sempre-falsa' ? null : await provar([nao(phi.expandida)])
    if (segue?.resultado === 'unsat') return this.mudarZ3(alvoId, assinatura, promessaId, { estado: 'provada', regras: nomes(segue.nucleo) })
    if (segue?.resultado === 'sat') return this.mudarZ3(alvoId, assinatura, promessaId, { estado: 'fura' })
    // o contrário segue?
    const contra = await provar([phi.expandida])
    if (contra?.resultado === 'unsat') return this.mudarZ3(alvoId, assinatura, promessaId, { estado: 'provada-falsa', regras: nomes(contra.nucleo) })
    this.mudarZ3(alvoId, assinatura, promessaId, { estado: 'nao-sei' })
  }

  /** Guarda o cenário de uma promessa que fura como achado (uma pista, ainda). */
  guardarAchado(alvoId: string, promessaId: string, mundo: MundoExplicado): Achado | null {
    const a = this.alvo(alvoId)
    const pr = a?.promessas.find((p) => p.id === promessaId)
    if (!a || !pr) return null
    const achado: Achado = {
      id: novoId('achado'),
      promessaId,
      quando: Date.now(),
      promessa: pr.formula,
      regras: a.regras.filter((r) => r.ativa && valida(r.formula)).map(({ id, titulo, formula, fonte }) => ({ id, titulo, formula, fonte })),
      mundo,
      estado: 'pista',
      anotacao: '',
      poc: '',
    }
    this.salvarSemExame({ ...a, achados: [achado, ...a.achados] })
    return achado
  }

  mudarAchado(alvoId: string, achadoId: string, m: Partial<Pick<Achado, 'estado' | 'anotacao' | 'poc'>>) {
    const a = this.alvo(alvoId)
    if (!a) return
    this.salvarSemExame({ ...a, achados: a.achados.map((x) => (x.id === achadoId ? { ...x, ...m } : x)) })
  }

  removerAchado(alvoId: string, achadoId: string) {
    const a = this.alvo(alvoId)
    if (a) this.salvarSemExame({ ...a, achados: a.achados.filter((x) => x.id !== achadoId) })
  }

  /** os achados não mudam o exame */
  private salvarSemExame(a: Alvo) {
    this.alvos = this.alvos.map((x) => (x.id === a.id ? { ...a, atualizadoEm: new Date().toISOString() } : x))
    void this.gravar()
  }
}

export const cacada = new Cacada()

export function useCacada(): Cacada {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => cacada.assinar(() => forcar(undefined)), [])
  return cacada
}

export const novaRegra = (): RegraAlvo => ({ id: novoId('regra'), titulo: '', formula: '', fonte: '', ativa: true })
export const novaPromessa = (): PromessaAlvo => ({ id: novoId('promessa'), titulo: '', citacao: '', formula: '', fonte: '' })

// ------------------------------------------------------------- o relatório

/** o nome de um objeto do cenário, como na tela (d₁, d₂…) */
const objeto = (d: number) => `d${paraSubscrito(String(d + 1)) ?? d + 1}`

/** Os fatos do cenário, um por linha (com os nomes dos objetos da tela: d₁, d₂…). */
export function fatosDoCenario(m: Modelo): string[] {
  const linhas = [`objects: ${[...Array(m.n).keys()].map(objeto).join(', ')}`]
  for (const c of m.constantes) linhas.push(`${c.nome} = ${objeto(c.valor)}`)
  for (const f of m.funcoes) for (const x of f.tabela.filter((t) => (t.w ?? 0) === 0)) linhas.push(`${f.nome}(${x.args.map(objeto).join(', ')}) = ${objeto(x.valor)}`)
  for (const p of m.predicados) {
    const vs = p.verdadeiros.filter((a) => (a.w ?? 0) === 0)
    if (p.aridade === 0) linhas.push(vs.length ? p.nome : `¬${p.nome}`)
    else if (!vs.length) linhas.push(`${p.nome}: false for every object`)
    else linhas.push(`${p.nome}: true for ${vs.map((a) => (a.args.length === 1 ? objeto(a.args[0]) : `(${a.args.map(objeto).join(', ')})`)).join(', ')} (false otherwise)`)
  }
  return linhas
}

/** As primeiras linhas da explicação: onde a promessa falha no cenário (T/F de cada parte, sem os motivos). */
export function ondeFalha(p: PassoExplicacao, profundidade = 4): string[] {
  const linhas: string[] = []
  const ir = (q: PassoExplicacao, nivel: number) => {
    linhas.push(`${'  '.repeat(nivel)}${q.valor ? 'T' : 'F'}  ${q.formula}`)
    if (nivel + 1 < profundidade) for (const f of q.filhos) ir(f, nivel + 1)
  }
  ir(p, 0)
  return linhas
}

/**
 * Esqueleto da prova de conceito em Foundry: o teste que precisa chegar ao
 * cenário por chamadas reais, numa cópia local da rede. Só o esqueleto: os
 * endereços, as chamadas e a asserção são de quem caça.
 */
export function esqueletoFoundry(a: Alvo, achado: Achado): string {
  const pr = a.promessas.find((p) => p.id === achado.promessaId)
  const comentario = (linhas: string[]) => linhas.map((l) => `        //   ${l}`)
  return [
    '// SPDX-License-Identifier: UNLICENSED',
    'pragma solidity ^0.8.20;',
    '',
    'import {Test} from "forge-std/Test.sol";',
    '',
    `/// PoC (draft): ${a.nome} — "${pr?.titulo || achado.promessa}" does not hold`,
    ...(a.programa ? [`/// Program: ${a.programa}`] : []),
    '/// Run on a LOCAL fork only (never mainnet or a public testnet):',
    '///   RPC_URL=<your node> forge test --match-contract PoC -vvv',
    'contract PoC is Test {',
    '    // TODO: the in-scope contracts (addresses from the program\'s scope page)',
    '    // address constant TARGET = 0x0000000000000000000000000000000000000000;',
    '',
    '    function setUp() public {',
    '        vm.createSelectFork(vm.envString("RPC_URL"));',
    '    }',
    '',
    '    function test_promiseDoesNotHold() public {',
    '        // Target state (the scenario the model found):',
    ...comentario(fatosDoCenario(achado.mundo.modelo)),
    '        // Rules this state relies on (each must also hold in the real code):',
    ...comentario(achado.regras.map((r, i) => `${i + 1}. ${r.titulo || r.formula}${r.fonte ? ` — ${r.fonte}` : ''}`)),
    '',
    '        // 1) TODO: reach the state above with real calls (vm.prank for each actor).',
    '',
    `        // 2) TODO: show the documented property fails: ${achado.promessa}`,
    '        // assertTrue(<what should never happen>, "promise violated");',
    '    }',
    '}',
    '',
  ].join('\n')
}

/**
 * Rascunho do relatório para o programa (em inglês, a língua dos
 * programas). O impacto e a prova de conceito são escritos por quem caça:
 * sem um teste no código, os programas não aceitam.
 */
export function rascunhoRelatorio(a: Alvo, achado: Achado): string {
  const pr = a.promessas.find((p) => p.id === achado.promessaId)
  const titulo = pr?.titulo || achado.promessa
  return [
    `# ${a.nome}: "${titulo}" does not hold`,
    '',
    '## Summary',
    '',
    pr?.citacao
      ? `The documentation states: "${pr.citacao.trim().replace(/[.!]$/, '')}"${pr.fonte ? ` (${pr.fonte})` : ''}.`
      : `Expected property: \`${achado.promessa}\`.`,
    `The rules enforced by the code (listed below, with references) allow a state in which this property is false. A concrete state with ${achado.mundo.n} object${achado.mundo.n === 1 ? '' : 's'} is given below.`,
    '',
    '## Vulnerability details',
    '',
    'Rules enforced by the code:',
    '',
    ...achado.regras.map((r, i) => `${i + 1}. ${r.titulo || 'rule'}: \`${r.formula}\`${r.fonte ? ` — ${r.fonte}` : ''}`),
    '',
    `Property (from the documentation): \`${achado.promessa}\``,
    '',
    'A state that satisfies every rule above and violates the property:',
    '',
    '```',
    ...fatosDoCenario(achado.mundo.modelo),
    '```',
    '',
    'Evaluation of the property in this state:',
    '',
    '```',
    ...ondeFalha(achado.mundo.passos),
    '```',
    '',
    '## Impact',
    '',
    '<!-- Choose the impact from the program\'s in-scope list and explain who loses what. -->',
    '',
    '## Proof of Concept',
    '',
    achado.poc.trim() ||
      '<!-- REQUIRED: a runnable test against the deployed code on a local fork (e.g. Foundry), reaching the state above through real calls. Explanations alone are not accepted. -->',
    '',
    '## Recommendation',
    '',
    '<!-- The check that blocks this state (the missing rule). -->',
    '',
  ].join('\n')
}
