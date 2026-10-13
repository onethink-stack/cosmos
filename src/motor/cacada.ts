// Caçar falhas lógicas: as regras de um sistema (o que o código faz) contra
// as promessas da documentação. Para cada promessa, procura um cenário
// pequeno em que todas as regras valem e a promessa falha. Quando ela vale,
// aponta as regras que a sustentam (o mínimo necessário: sem qualquer uma
// delas, a promessa fura) e o cenário que aparece sem cada uma — o que o
// código precisa garantir em todos os caminhos.
//
// Um cenário é uma pista, não um bug: ele diz que as regras ESCRITAS
// permitem a falha. Pode faltar uma regra que o código tem; só um teste no
// código (a prova de conceito) mostra que a falha é real.
//
// Roda no worker da caçada (cacadaWorker.ts), sem dicionário: os nomes valem
// pelo uso (P(x) é predicado, f(x) é função, o resto é constante).

import type { Formula } from '../logica/ast'
import { imprimir } from '../logica/impressao'
import { analisar, buscarModelo, perguntar, type Grupo, type MundoExplicado, type OpcoesMotor, type Progresso } from './motor'

export type ExamePromessa =
  /** um cenário em que todas as regras valem e a promessa falha; `tambemVale`: em outro cenário ela vale */
  | { tipo: 'fura'; N: number; mundo: MundoExplicado; tambemVale: boolean }
  /** as regras implicam o contrário da promessa (até N): ela falha em todo cenário; `regras`: as que bastam para isso */
  | { tipo: 'sempre-falsa'; N: number; mundo: MundoExplicado; regras: string[] }
  /**
   * vale em todos os cenários até N. `sustentam`: as regras necessárias, cada
   * uma com o cenário em que a promessa fura sem ela. `vazia`: o que a
   * promessa supõe nunca acontece com estas regras (ela vale "de graça").
   */
  | { tipo: 'vale'; N: number; sustentam: { id: string; semEla?: MundoExplicado }[]; vazia?: string }
  /** as regras não têm cenário nenhum até N: qualquer promessa "valeria" */
  | { tipo: 'regras-contraditorias'; N: number }
  /** o motor finito não decidiu (grande demais, prazo, números) */
  | { tipo: 'nao-decide'; motivo: string }
  | { tipo: 'invalida' }

export interface PedidoCacada {
  id: number
  regras: Grupo[]
  promessas: { id: string; formula: string }[]
  opcoes: OpcoesMotor
  /** tempo de cada promessa (as regras que a sustentam têm o mesmo tempo, à parte) */
  prazoMs: number
}

export type RespostaCacada =
  | { id: number; tipo: 'progresso'; promessaId: string; msg: string }
  | { id: number; tipo: 'exame'; promessaId: string; exame: ExamePromessa; ms: number }
  | { id: number; tipo: 'fim' }

/**
 * "O que a promessa supõe": de ∀x ∀y (A ⟹ B), a fórmula ∃x ∃y A. Se as
 * regras não deixam isso acontecer, a promessa vale sem dizer nada.
 */
export function hipotese(f: Formula): Formula | null {
  const vars: { v: string; vPos: number }[] = []
  let corpo = f
  while (corpo.k === 'forall' && !corpo.dom) {
    vars.push({ v: corpo.v, vPos: corpo.vPos })
    corpo = corpo.corpo
  }
  if (corpo.k !== 'imp') return null
  let h: Formula = corpo.l
  for (const { v, vPos } of vars.reverse()) h = { k: 'exists', v, vPos, corpo: h, pos: 0, end: 0 }
  return h
}

function motivoNaoDecide(r: { tipo: string; n?: number }): string {
  switch (r.tipo) {
    case 'grande-demais':
      return `ficou grande demais para o motor finito com ${r.n} objetos`
    case 'tempo':
      return `passou do prazo com ${r.n} objetos (até ${(r.n ?? 1) - 1} não há cenário que fure)`
    case 'aritmetica':
      return 'usa números: só o Z3 decide'
    default:
      return 'o motor finito não decidiu'
  }
}

/** Examina uma promessa contra as regras. */
export function examinarPromessa(regras: Grupo[], formula: string, op: OpcoesMotor, progresso?: Progresso): ExamePromessa {
  const r = perguntar(regras, formula, [], op, progresso)
  switch (r.tipo) {
    case 'nao-segue':
      return { tipo: 'fura', N: r.N, mundo: r.mundo, tambemVale: !r.semMundoAFavor }
    case 'contradiz':
      return { tipo: 'sempre-falsa', N: r.N, mundo: r.mundo, regras: r.notas }
    case 'premissas-contraditorias':
      return { tipo: 'regras-contraditorias', N: r.N }
    case 'formula-invalida':
      return { tipo: 'invalida' }
    case 'segue':
      break
    default:
      return { tipo: 'nao-decide', motivo: motivoNaoDecide(r) }
  }
  // vale até N: sem cada regra da prova, a promessa fura? (cada busca com o seu tempo). A lista do
  // motor pode trazer uma regra que as outras já cobrem: sem ela a promessa continua valendo, e ela sai
  const PRAZO_CADA_MS = 15_000
  const sustentam: { id: string; semEla?: MundoExplicado }[] = []
  for (const [i, id] of r.notas.entries()) {
    progresso?.(`sem a regra ${i + 1} de ${r.notas.length} da prova, a promessa fura?`)
    const sem = perguntar(
      regras.filter((g) => g.id !== id),
      formula,
      [],
      op.prazo ? { ...op, prazo: Math.max(op.prazo, Date.now() + PRAZO_CADA_MS) } : op,
    )
    if (sem.tipo === 'nao-segue' || sem.tipo === 'contradiz') sustentam.push({ id, semEla: sem.mundo })
    // sem decidir (prazo): fica, sem o cenário
    else if (sem.tipo !== 'segue') sustentam.push({ id })
  }
  // vale "de graça"? (o que ela supõe nunca acontece)
  const [phi] = analisar([formula], [])
  const h = phi && hipotese(phi.expandida)
  let vazia: string | undefined
  if (h && phi) {
    progresso?.('o que a promessa supõe pode acontecer?')
    const premissas = regras.flatMap((g) => analisar(g.formulas, []).map((x) => x.expandida))
    if (buscarModelo([...premissas, h], op).status === 'sem-modelo') vazia = imprimir(hipotese(phi.original) ?? h)
  }
  return { tipo: 'vale', N: r.N, sustentam, ...(vazia ? { vazia } : {}) }
}

/** Examina as promessas uma a uma, mandando cada resultado assim que sai. */
export function examinarTudo(p: PedidoCacada, enviar: (r: RespostaCacada) => void) {
  for (const pr of p.promessas) {
    const ini = Date.now()
    const op = { ...p.opcoes, prazo: Date.now() + p.prazoMs }
    let exame: ExamePromessa
    try {
      exame = examinarPromessa(p.regras, pr.formula, op, (msg) => enviar({ id: p.id, tipo: 'progresso', promessaId: pr.id, msg }))
    } catch (e) {
      exame = { tipo: 'nao-decide', motivo: `falha no motor: ${(e as Error).message}` }
    }
    enviar({ id: p.id, tipo: 'exame', promessaId: pr.id, exame, ms: Date.now() - ini })
  }
  enviar({ id: p.id, tipo: 'fim' })
}
