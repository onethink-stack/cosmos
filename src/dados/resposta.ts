// Responder uma pergunta (uma fórmula) a partir das notas, só com o que dá
// para garantir: prova do Z3 (para qualquer número de objetos), cenário real
// em que as notas valem e a fórmula falha, ou "não sei" — com o porquê.
// O tradutor (português → fórmula) nunca decide nada: só o motor finito e o Z3.

import type { Formula } from '../logica/ast'
import { renomear } from '../logica/nomes'
import { analisar, gruposRelevantes, nao, nomesDaFormula, type GrupoPronto, type MundoExplicado, type ResultadoPergunta } from '../motor/motor'
import type { Tarefa } from '../motor/tarefas'
import type { ResultadoZ3 } from '../motor/z3'
import type { EntradaDicionario } from './tipos'
import { verificacao, type Ocupacao } from './verificacao'
import { disponibilidadeZ3, z3 } from './z3'

export type Veredito =
  /** provado (Z3): segue das notas, com qualquer número de objetos */
  | 'sim'
  /** provado (Z3): as notas dizem o contrário */
  | 'nao'
  /** há cenário em que as notas valem e ela vale, e outro em que falha: as notas não decidem */
  | 'nao-decidem'
  /** há cenário em que as notas valem e ela falha (não se sabe se a contradizem) */
  | 'nao-decorre'
  /** vale em todos os cenários até N, sem prova para tamanhos maiores */
  | 'quase-sim'
  /** falha em todos os cenários até N, sem prova para tamanhos maiores */
  | 'quase-nao'
  | 'nao-sei'
  /** as notas se contradizem: qualquer coisa "seguiria" delas */
  | 'contraditorias'
  /** o motor finito e o Z3 discordam (defeito: não dá para responder) */
  | 'discordam'

export interface ParecerZ3 {
  resultado: ResultadoZ3
  /** sem modelo: as notas que a prova usou */
  notas: string[]
}

export interface Resposta {
  formula: string
  veredito: Veredito
  /** decidida de vez: prova do Z3, ou um cenário real */
  definitiva: boolean
  /** as notas que decidem (as que a prova usou; ou, sem prova, as necessárias até N) */
  notas: string[]
  /** um cenário em que as notas valem e a fórmula falha */
  mundo?: MundoExplicado
  /** até quantos objetos o motor finito conferiu */
  N?: number
  /** o que faltou para decidir (quando não é definitiva) */
  motivos: string[]
  finito: ResultadoPergunta | null
  /** Z3 com as notas e a fórmula negada (sem modelo = segue) */
  z3Segue: ParecerZ3 | null
  /** Z3 com as notas e a fórmula (sem modelo = contradiz) */
  z3Contradiz: ParecerZ3 | null
}

/**
 * Junta o que o motor finito e o Z3 disseram numa resposta. `cenarioConfiavel`:
 * o motor finito leu todas as notas (as com números ele deixa de fora, e aí o
 * cenário dele pode não valer para elas).
 */
export function decidir(
  formula: string,
  fin: ResultadoPergunta | null,
  zSegue: ParecerZ3 | null,
  zContra: ParecerZ3 | null,
  cenarioConfiavel: boolean,
  motivos: string[] = [],
): Resposta {
  const base = { formula, finito: fin, z3Segue: zSegue, z3Contradiz: zContra, motivos: [] as string[] }
  const provaSim = zSegue?.resultado === 'unsat'
  const provaNao = zContra?.resultado === 'unsat'
  const mundoFalha = cenarioConfiavel && fin && (fin.tipo === 'nao-segue' || fin.tipo === 'contradiz') ? fin.mundo : undefined
  // o motor finito achou um cenário das notas onde ela vale
  const finitoVale = cenarioConfiavel && (fin?.tipo === 'segue' || (fin?.tipo === 'nao-segue' && !fin.semMundoAFavor))

  if (provaSim && provaNao) return { ...base, veredito: 'contraditorias', definitiva: true, notas: [...new Set([...zSegue.notas, ...zContra.notas])] }
  if (provaSim) {
    if (mundoFalha) return { ...base, veredito: 'discordam', definitiva: false, notas: [], mundo: mundoFalha }
    return { ...base, veredito: 'sim', definitiva: true, notas: zSegue.notas }
  }
  if (provaNao) {
    if (finitoVale) return { ...base, veredito: 'discordam', definitiva: false, notas: [] }
    return { ...base, veredito: 'nao', definitiva: true, notas: zContra.notas, ...(mundoFalha ? { mundo: mundoFalha } : {}) }
  }
  if (fin?.tipo === 'premissas-contraditorias' && zSegue?.resultado !== 'sat' && zContra?.resultado !== 'sat')
    return { ...base, veredito: 'contraditorias', definitiva: false, notas: [], N: fin.N, motivos }

  const falha = !!mundoFalha || zSegue?.resultado === 'sat'
  const vale = finitoVale || zContra?.resultado === 'sat'
  if (falha && vale) return { ...base, veredito: 'nao-decidem', definitiva: true, notas: [], ...(mundoFalha ? { mundo: mundoFalha } : {}) }
  if (fin?.tipo === 'contradiz' && cenarioConfiavel) return { ...base, veredito: 'quase-nao', definitiva: false, notas: fin.notas, N: fin.N, mundo: fin.mundo, motivos }
  if (falha) return { ...base, veredito: 'nao-decorre', definitiva: true, notas: [], ...(mundoFalha ? { mundo: mundoFalha } : {}) }
  if (fin?.tipo === 'segue' && cenarioConfiavel) return { ...base, veredito: 'quase-sim', definitiva: false, notas: fin.notas, N: fin.N, motivos }
  return { ...base, veredito: 'nao-sei', definitiva: false, notas: [], motivos }
}

const OCUPACAO: Record<Ocupacao, string> = {
  verificar: 'verificando as notas',
  perguntar: 'respondendo outra pergunta',
  descobrir: 'descobrindo consequências',
  teoremas: 'conferindo os teoremas',
  lacunas: 'procurando leis que faltam',
  cadeia: 'na reação em cadeia',
  modelo: 'no segundo modelo',
}

/** o que o motor finito disse, ou por que não disse */
function perguntarAoMotorFinito(tarefa: Tarefa, formula: string, dicionario: EntradaDicionario[]): Promise<{ r: ResultadoPergunta | null; motivo?: string }> {
  const v = verificacao
  // não interrompe outro trabalho (a reação em cadeia pode levar horas): responde só com o Z3
  if (v.ocupado && v.ocupado !== 'perguntar') return Promise.resolve({ r: null, motivo: `o motor finito estava ocupado (${OCUPACAO[v.ocupado]})` })
  const inicio = new Date().toISOString()
  v.perguntar(tarefa, formula, dicionario)
  return new Promise((ok) => {
    const sair = v.assinar(() => {
      if (v.ocupado === 'perguntar') return
      sair()
      const p = v.pergunta
      if (p && p.formula === formula && p.chave === tarefa.chave && p.quando >= inicio)
        ok(p.erro ? { r: null, motivo: `o motor finito falhou: ${p.erro}` } : { r: p.resultado })
      else ok({ r: null, motivo: 'a pergunta ao motor finito foi interrompida' })
    })
  })
}

/** o que o motor finito disse e que não decide (para o "não sei") */
function motivoDoFinito(r: ResultadoPergunta): string | null {
  switch (r.tipo) {
    case 'grande-demais':
      return `ficou grande demais para o motor finito com ${r.n} objetos`
    case 'tempo':
      return `o motor finito passou do prazo com ${r.n} objetos`
    case 'aritmetica':
      return 'a pergunta usa números: só o Z3 decide'
    case 'formula-invalida':
      return 'a fórmula é inválida'
    default:
      return null
  }
}

/** tempo do Z3 para cada checagem de uma pergunta */
const TEMPO_PERGUNTA_MS = 10_000
/** depois de provar que segue, a checagem de que as notas não se contradizem é curta */
const TEMPO_CONSISTENCIA_MS = 3_000

/**
 * Z3: as notas junto com `fixa` não têm modelo? Primeiro só as notas ligadas
 * à pergunta pelos nomes (sem modelo com menos notas = sem modelo com todas);
 * um cenário só vale achado com todas.
 */
async function semModeloNoZ3(prontos: GrupoPronto[], alvo: Formula, fixa: Formula, dicionario: EntradaDicionario[], tempoMs: number): Promise<ParecerZ3 | null> {
  const ligadas = gruposRelevantes(prontos, [{ texto: '', original: alvo, expandida: alvo, aritmetica: false }])
  const conjuntos = ligadas.length < prontos.length ? [ligadas, prontos] : [prontos]
  let ultimo: ParecerZ3 | null = null
  for (const [k, gs] of conjuntos.entries()) {
    const formulas = gs.flatMap((x) => x.itens.map((i) => i.expandida))
    const grupos = gs.flatMap((x, gi) => x.itens.map(() => gi))
    const r = await z3.provarFormulas([...formulas, fixa], dicionario, tempoMs, [...grupos, null])
    if (!r) continue
    if (r.resultado === 'unsat') return { resultado: 'unsat', notas: r.nucleo ? r.nucleo.map((i) => gs[i].g.id) : gs.map((x) => x.g.id) }
    // com notas a menos, um cenário não diz nada: só vale o de todas
    if (k === conjuntos.length - 1) ultimo = { resultado: r.resultado, notas: [] }
  }
  return ultimo
}

/** Responde se a fórmula segue das notas da tarefa (leis e fatos, ou uma visão). */
export async function responder(formula: string, tarefa: Tarefa, dicionario: EntradaDicionario[], aviso?: (msg: string) => void): Promise<Resposta> {
  const motivos: string[] = []
  const [phi] = analisar([formula], dicionario, true)
  if (!phi) return { ...decidir(formula, { tipo: 'formula-invalida' }, null, null, false), motivos: ['a fórmula é inválida'] }
  const prontos: GrupoPronto[] = tarefa.grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario, true) })).filter((x) => x.itens.length)
  // o motor finito deixa de fora as notas com números: o cenário dele pode não valer para elas
  const cenarioConfiavel = !prontos.some((x) => x.itens.some((i) => i.aritmetica))

  const z3Pronto = z3.ativo && disponibilidadeZ3().ok
  if (!z3.ativo) motivos.push('o Z3 está desligado (sem ele, nada é provado para qualquer número de objetos)')
  else if (!z3Pronto) {
    const d = disponibilidadeZ3()
    if (!d.ok) motivos.push(`o Z3 não está disponível: ${d.motivo}`)
  }

  aviso?.('o motor finito procura cenários; o Z3 tenta provar')
  const finito = perguntarAoMotorFinito(tarefa, formula, dicionario)
  const provas = (async () => {
    if (!z3Pronto) return { segue: null, contradiz: null }
    const segue = await semModeloNoZ3(prontos, phi.expandida, nao(phi.expandida), dicionario, TEMPO_PERGUNTA_MS)
    // provado que segue: só falta ver se não é porque as notas se contradizem (curto)
    const contradiz = await semModeloNoZ3(prontos, phi.expandida, phi.expandida, dicionario, segue?.resultado === 'unsat' ? TEMPO_CONSISTENCIA_MS : TEMPO_PERGUNTA_MS)
    return { segue, contradiz }
  })()
  const [f, z] = await Promise.all([finito, provas])
  if (f.motivo) motivos.push(f.motivo)
  if (f.r) {
    const m = motivoDoFinito(f.r)
    if (m) motivos.push(m)
  }
  if (z3Pronto && z.segue?.resultado !== 'unsat' && z.contradiz?.resultado !== 'unsat') motivos.push('o Z3 não achou prova no tempo que teve')
  if (!cenarioConfiavel && f.r && (f.r.tipo === 'nao-segue' || f.r.tipo === 'contradiz' || f.r.tipo === 'segue'))
    motivos.push('o motor finito deixou de fora as notas com números')
  return decidir(formula, f.r, z.segue, z.contradiz, cenarioConfiavel, motivos)
}

/** Os nomes (constantes) que uma pergunta de "quem" testa: os que aparecem nas notas do conjunto. */
export function candidatosDeQuem(tarefa: Tarefa, dicionario: EntradaDicionario[]): EntradaDicionario[] {
  const usados = new Set<string>()
  for (const g of tarefa.grupos) for (const p of analisar(g.formulas, dicionario, true)) for (const n of nomesDaFormula(p.expandida)) usados.add(n)
  return dicionario.filter((e) => e.tipo === 'constante' && !e.numerico && usados.has(e.simbolo))
}

/** A pergunta de "quem" para um nome: a variável livre trocada pelo símbolo dele. */
export const perguntaPara = (modelo: string, variavel: string, simbolo: string, dicionario: EntradaDicionario[]) =>
  renomear(modelo, variavel, simbolo, dicionario)
