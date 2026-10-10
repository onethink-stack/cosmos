import type { EntradaDicionario } from '../dados/tipos'
import { expandir } from '../logica/acucar'
import type { Formula } from '../logica/ast'
import { validar } from '../logica/validador'
import { Aterrador, GrandeDemais, type ProblemaCNF } from './aterrar'
import { resolver } from './sat'

/** Um grupo de fórmulas que entra ou sai junto (uma nota). */
export interface Grupo {
  id: string
  rotulo: string
  formulas: string[]
}

export interface OpcoesMotor {
  /** maior tamanho de domínio testado */
  N: number
  /** limite de tamanho do problema aterrado (nós do circuito / cláusulas) */
  limite: number
}

export const OPCOES_PADRAO: OpcoesMotor = { N: 8, limite: 2_000_000 }

export interface Modelo {
  n: number
  constantes: { nome: string; valor: number }[]
  funcoes: { nome: string; tabela: { args: number[]; valor: number }[] }[]
  predicados: { nome: string; aridade: number; verdadeiros: number[][] }[]
  /** pares (a, b) com a ∈ b */
  pertence: [number, number][]
}

export type Busca =
  | { status: 'modelo'; n: number; modelo: Modelo }
  | { status: 'sem-modelo' }
  /** tamanho n ficou grande demais; até n-1 não havia modelo */
  | { status: 'grande-demais'; n: number }

export type ResultadoMotor =
  | { tipo: 'vazio' }
  | { tipo: 'consistente'; n: number; modelo: Modelo }
  | { tipo: 'sem-modelo'; N: number; conflito: string[] }
  | { tipo: 'grande-demais'; n: number }

export type Progresso = (msg: string) => void

/** Analisa e expande as fórmulas de um grupo. Fórmulas com erro são ignoradas. */
export function prepararFormulas(textos: string[], dicionario: EntradaDicionario[]): Formula[] {
  const r: Formula[] = []
  for (const t of textos) {
    const v = validar(t, dicionario)
    if (v.ast && v.ok) r.push(expandir(v.ast))
  }
  return r
}

function lerModelo(n: number, p: ProblemaCNF, valores: Int8Array): Modelo {
  const constantes: Modelo['constantes'] = []
  const funcoes = new Map<string, Modelo['funcoes'][number]['tabela']>()
  const predicados = new Map<string, { aridade: number; verdadeiros: number[][] }>()
  const pertence: [number, number][] = []
  for (const [v, info] of p.info) {
    if (valores[v] !== 1) continue
    switch (info.k) {
      case 'const':
        constantes.push({ nome: info.nome, valor: info.d })
        break
      case 'func':
        if (!funcoes.has(info.nome)) funcoes.set(info.nome, [])
        funcoes.get(info.nome)!.push({ args: info.args, valor: info.d })
        break
      case 'pred':
        if (!predicados.has(info.nome)) predicados.set(info.nome, { aridade: info.args.length, verdadeiros: [] })
        predicados.get(info.nome)!.verdadeiros.push(info.args)
        break
      case 'in':
        pertence.push([info.a, info.b])
        break
    }
  }
  // predicados usados mas falsos em tudo também aparecem
  for (const info of p.info.values())
    if (info.k === 'pred' && !predicados.has(info.nome)) predicados.set(info.nome, { aridade: info.args.length, verdadeiros: [] })

  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }
  return {
    n,
    constantes: constantes.sort((a, b) => a.nome.localeCompare(b.nome)),
    funcoes: [...funcoes].map(([nome, tabela]) => ({ nome, tabela: tabela.sort((a, b) => cmp(a.args, b.args)) })).sort((a, b) => a.nome.localeCompare(b.nome)),
    predicados: [...predicados].map(([nome, x]) => ({ nome, ...x, verdadeiros: x.verdadeiros.sort(cmp) })).sort((a, b) => a.nome.localeCompare(b.nome)),
    pertence: pertence.sort((a, b) => a[1] - b[1] || a[0] - b[0]),
  }
}

/** Procura modelo com domínio de 1 a N elementos. */
export function buscarModelo(formulas: Formula[], op: OpcoesMotor, progresso?: Progresso): Busca {
  for (let n = 1; n <= op.N; n++) {
    progresso?.(`testando domínio com ${n} objeto${n > 1 ? 's' : ''}`)
    let p: ProblemaCNF
    try {
      const at = new Aterrador(n, op.limite)
      for (const f of formulas) at.afirmar(f)
      p = at.cnf()
    } catch (e) {
      if (e instanceof GrandeDemais) return { status: 'grande-demais', n }
      throw e
    }
    const r = resolver(p.nVars, p.clausulas)
    if (r.sat) return { status: 'modelo', n, modelo: lerModelo(n, p, r.valores) }
  }
  return { status: 'sem-modelo' }
}

/**
 * Verifica se o conjunto de grupos tem modelo até N. Sem modelo, encontra um
 * conjunto de grupos em conflito que é mínimo no sentido de irredutível:
 * tirar qualquer um deles faz aparecer um modelo (removendo um por vez e
 * testando de novo). Grupos são testados para remoção na ordem dada.
 */
export function verificar(grupos: Grupo[], dicionario: EntradaDicionario[], op: OpcoesMotor, progresso?: Progresso): ResultadoMotor {
  const prontos = grupos.map((g) => ({ g, fs: prepararFormulas(g.formulas, dicionario) })).filter((x) => x.fs.length)
  if (!prontos.length) return { tipo: 'vazio' }

  const r = buscarModelo(
    prontos.flatMap((x) => x.fs),
    op,
    progresso,
  )
  if (r.status === 'modelo') return { tipo: 'consistente', n: r.n, modelo: r.modelo }
  if (r.status === 'grande-demais') return { tipo: 'grande-demais', n: r.n }

  let conjunto = prontos
  for (let i = 0; i < prontos.length; i++) {
    const alvo = prontos[i]
    if (!conjunto.includes(alvo) || conjunto.length === 1) continue
    const sem = conjunto.filter((x) => x !== alvo)
    progresso?.(`procurando o conflito mínimo: testando sem "${alvo.g.rotulo}" (${i + 1}/${prontos.length})`)
    const r2 = buscarModelo(
      sem.flatMap((x) => x.fs),
      op,
    )
    // sem modelo mesmo sem ele → ele não é necessário para o conflito
    if (r2.status === 'sem-modelo') conjunto = sem
  }
  return { tipo: 'sem-modelo', N: op.N, conflito: conjunto.map((x) => x.g.id) }
}
