// Tradução das fórmulas (já expandidas) para o Z3 e checagem de
// satisfatibilidade em lógica de primeira ordem, SEM limite de tamanho:
//   unsat → contradição provada (vale para qualquer tamanho, inclusive infinito)
//   sat   → existe modelo (que pode ser maior que N, ou infinito)
//   unknown → o Z3 não decidiu dentro do tempo
//
// Mesma semântica do motor finito: um tipo de objetos e um de mundos; o
// mundo real é w0; constantes rígidas; ∈, predicados e funções por mundo;
// □/◇ sobre todos os mundos (S5); B[a] pela relação de a, com axiomas KD45.
//
// Este módulo não carrega o Z3: recebe a API já inicializada (navegador ou
// Node), para poder ser testado fora do navegador.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ORDEM, type Formula, type Termo } from '../logica/ast'

export type ResultadoZ3 = 'sat' | 'unsat' | 'unknown'

/**
 * Versão desta tradução. Mude sempre que a tradução (ou a versão do Z3) mudar
 * o que uma fórmula quer dizer: ela entra na chave das respostas guardadas, e
 * as de outra versão deixam de ser usadas.
 */
export const VERSAO_TRADUCAO_Z3 = 't1'

export const TEMPO_Z3_MS = 20_000
/** Seed explícita para repetir a busca na mesma versão do Z3; não fixa o tempo de CPU. */
export const SEED_Z3 = 0

function validarPrazoZ3(tempoMs: number): void {
  if (!Number.isFinite(tempoMs) || !Number.isInteger(tempoMs) || tempoMs <= 0 || tempoMs >= 0xffffffff) {
    throw new RangeError('O prazo Z3 deve ser um inteiro positivo menor que 4294967295 ms.')
  }
}

type Expr = any

/**
 * Um contexto novo por checagem: reaproveitar o mesmo contexto depois de
 * checagens interrompidas pelo tempo limite fazia o Z3 (WebAssembly) quebrar
 * em problemas com números e quantificadores.
 */
function obterContexto(api: any) {
  return new api.Context('caderno')
}

interface Liberacoes {
  checando: number
  adiadas: (() => void)[]
}
const liberacoesPorZ3 = new WeakMap<object, Liberacoes>()

/**
 * O z3-solver solta termos e solvers quando o coletor de lixo do JavaScript os
 * recolhe (Z3_dec_ref, Z3_solver_dec_ref...): na thread principal, a qualquer
 * momento, inclusive enquanto o check() roda noutra thread do WebAssembly. O
 * Z3 não aguenta as duas threads mexendo na memória dele ao mesmo tempo: de
 * vez em quando a checagem responde errado, quebra ("memory access out of
 * bounds") ou nunca termina (e trava todas as seguintes, que esperam a vez).
 * Por isso, durante uma checagem, essas liberações esperam numa fila.
 */
function liberacoes(api: any): Liberacoes {
  let l = liberacoesPorZ3.get(api.Z3)
  if (!l) {
    const novo: Liberacoes = { checando: 0, adiadas: [] }
    for (const nome of Object.keys(api.Z3)) {
      if (!/(^|_)dec_ref$|^del_context$|^rcf_del$/.test(nome)) continue
      const liberar = api.Z3[nome]
      api.Z3[nome] = (...args: any[]) => (novo.checando > 0 ? void novo.adiadas.push(() => liberar(...args)) : liberar(...args))
    }
    liberacoesPorZ3.set(api.Z3, novo)
    l = novo
  }
  return l
}

/**
 * As fórmulas têm modelo? (todas afirmadas no mundo real). `numericos`: nomes
 * de constantes e funções que são números reais (funções numéricas recebem
 * números e não variam com o mundo, como a matemática).
 */
export async function checarZ3(api: any, formulas: Formula[], tempoMs = TEMPO_Z3_MS, numericos: Set<string> = new Set()): Promise<ResultadoZ3> {
  return (await checarZ3ComNucleo(api, formulas, tempoMs, numericos)).resultado
}

export interface RespostaComNucleo {
  resultado: ResultadoZ3
  /** sem modelo: os grupos que a prova usou (null se nenhum grupo foi marcado) */
  nucleo: number[] | null
}

/**
 * Como checarZ3, marcando de qual grupo (nota) vem cada fórmula: `grupos[i]`
 * é o grupo da i-ésima (null = sem grupo, ex.: a negação do teorema). Se não
 * houver modelo, devolve o núcleo — os grupos que a prova de fato usou —, em
 * vez de "todas as notas".
 */
export async function checarZ3ComNucleo(
  api: any,
  formulas: Formula[],
  tempoMs = TEMPO_Z3_MS,
  numericos: Set<string> = new Set(),
  grupos?: (number | null)[],
): Promise<RespostaComNucleo> {
  // Validar o prazo original: Math.min poderia esconder Infinity ou um estouro.
  validarPrazoZ3(tempoMs)
  // o Z3 é instável aqui: as mesmas leis às vezes saem em menos de 1 s marcando as
  // notas e travam sem marcar, às vezes o contrário. Primeiro marcando, com prazo
  // curto (se sair, já vem com as notas que a prova usou); senão, sem marcar
  if (grupos?.some((g) => g !== null && g !== undefined)) {
    const marcado = await checarUmaVez(api, formulas, Math.min(tempoMs, TEMPO_NUCLEO_MS), numericos, grupos)
    if (marcado.resultado !== 'unknown') return marcado
  }
  const { resultado } = await checarUmaVez(api, formulas, tempoMs, numericos)
  return { resultado, nucleo: null }
}

/** quanto tempo, no máximo, a tentativa marcando as notas (a que dá o núcleo da prova) */
const TEMPO_NUCLEO_MS = 5000

/** Uma checagem no Z3 (com as notas marcadas, se `grupos`). */
export async function checarUmaVez(
  api: any,
  formulas: Formula[],
  tempoMs: number,
  numericos: Set<string>,
  grupos?: (number | null)[],
  /** opções do Z3 (ex.: smt.mbqi, smt.random_seed) */
  opcoes: Record<string, string | number | boolean> = {},
): Promise<RespostaComNucleo> {
  const espera = liberacoes(api)
  const solver = montarSolver(api, formulas, tempoMs, numericos, grupos, opcoes)
  espera.checando++
  try {
    const resultado = (await solver.check()) as ResultadoZ3
    let nucleo: number[] | null = null
    if (resultado === 'unsat' && grupos) {
      const usados = new Set<number>()
      for (const e of solver.unsatCore().values()) usados.add(Number(String(e).replace('grupo!', '')))
      nucleo = [...usados].sort((a, b) => a - b)
    }
    return { resultado, nucleo }
  } finally {
    if (--espera.checando === 0) for (const liberar of espera.adiadas.splice(0)) liberar()
  }
}

/**
 * Uma checagem no Z3 que devolve também o modelo, quando há (o objeto do Z3, do mesmo contexto do solver): é de onde
 * sai o modelo exato de um sat com números (z3Modelo.ts).
 */
export async function checarComModelo(api: any, formulas: Formula[], tempoMs: number, numericos: Set<string>): Promise<{ resultado: ResultadoZ3; modelo: any }> {
  const espera = liberacoes(api)
  const solver = montarSolver(api, formulas, tempoMs, numericos)
  espera.checando++
  try {
    const resultado = (await solver.check()) as ResultadoZ3
    return { resultado, modelo: resultado === 'sat' ? solver.model() : null }
  } finally {
    if (--espera.checando === 0) for (const liberar of espera.adiadas.splice(0)) liberar()
  }
}

/**
 * O problema exato que a tradução t1 manda ao Z3, em SMT-LIB 2: as declarações e as asserções,
 * sem o check-sat. É o que um certificado de unsat prova, e outro solucionador lê este texto.
 */
export function problemaSmt(api: any, formulas: Formula[], numericos: Set<string> = new Set()): string {
  liberacoes(api)
  return String(montarSolver(api, formulas, TEMPO_Z3_MS, numericos).toString()).trim()
}

/** A tradução t1: as fórmulas, os axiomas do ∅ e o quadro KD45 de cada titular, num solver do Z3. */
function montarSolver(
  api: any,
  formulas: Formula[],
  tempoMs: number,
  numericos: Set<string>,
  grupos?: (number | null)[],
  opcoes: Record<string, string | number | boolean> = {},
): any {
  validarPrazoZ3(tempoMs)
  const ctx = obterContexto(api)
  // nomes das variáveis novas contados a partir de 0 em cada checagem: a mesma lista de fórmulas
  // chega ao Z3 sempre com os mesmos nomes, e o resultado não depende do que rodou antes
  let contador = 0
  const { Sort, Function: Funcao, Const, ForAll, Exists, And, Or, Not, Implies, Eq, Bool, Solver, Real, IsInt } = ctx
  const Obj = Sort.declare('Obj')
  const Mundo = Sort.declare('Mundo')
  const B = Bool.sort()
  const w0 = Const('w0', Mundo)
  const pertence = Funcao.declare('pertence', Mundo, Obj, Obj, B)

  const constantes = new Map<string, Expr>()
  const funcoes = new Map<string, any>()
  const predicados = new Map<string, any>()
  const acessos = new Map<string, any>()
  let usaVazio = false

  const constante = (nome: string) => {
    if (!constantes.has(nome)) constantes.set(nome, Const(`c:${nome}`, Obj))
    return constantes.get(nome)
  }
  // cada argumento com o seu tipo (número ou objeto): o validador garante que um
  // símbolo recebe sempre os mesmos; a assinatura vai no nome para não misturar
  const ehReal = (e: Expr) => String(e.sort.name()) === 'Real'
  const sinal = (args: Expr[]) => (args.some(ehReal) ? `:${args.map((a) => (ehReal(a) ? 'R' : 'O')).join('')}` : '')
  const funcao = (nome: string, args: Expr[]) => {
    const k = `${nome}/${args.length}${sinal(args)}`
    if (!funcoes.has(k)) funcoes.set(k, Funcao.declare(`f:${k}`, Mundo, ...args.map((a) => a.sort), Obj))
    return funcoes.get(k)
  }
  const predicado = (nome: string, args: Expr[]) => {
    const k = `${nome}/${args.length}${sinal(args)}`
    if (!predicados.has(k)) predicados.set(k, Funcao.declare(`p:${k}`, Mundo, ...args.map((a) => a.sort), B))
    return predicados.get(k)
  }
  const acesso = (agente: string) => {
    if (!acessos.has(agente)) acessos.set(agente, Funcao.declare(`R:${agente}`, Mundo, Mundo, B))
    return acessos.get(agente)
  }
  const nova = (base: string, sort: any) => Const(`${base}!${++contador}`, sort)
  const reaisC = new Map<string, Expr>()
  const reaisF = new Map<string, any>()
  const constanteReal = (nome: string) => {
    if (!reaisC.has(nome)) reaisC.set(nome, Real.const(`n:${nome}`))
    return reaisC.get(nome)
  }
  const funcaoReal = (nome: string, args: Expr[]) => {
    const k = `${nome}/${args.length}${args.every(ehReal) ? '' : `:${args.map((a) => (ehReal(a) ? 'R' : 'O')).join('')}`}`
    if (!reaisF.has(k)) reaisF.set(k, Funcao.declare(`fn:${k}`, ...args.map((a) => a.sort), Real.sort()))
    return reaisF.get(k)
  }
  const potencia = (base: Expr, exp: Termo, env: Map<string, Expr>, w: Expr): Expr => {
    // expoente inteiro pequeno: multiplicações (o Z3 decide melhor assim)
    if (exp.k === 'num' && /^\d+$/.test(exp.valor) && Number(exp.valor) <= 12) {
      const n = Number(exp.valor)
      if (n === 0) return Real.val(1)
      let r = base
      for (let i = 1; i < n; i++) r = r.mul(base)
      return r
    }
    return base.pow(termo(exp, env, w))
  }

  const termo = (t: Termo, env: Map<string, Expr>, w: Expr): Expr => {
    switch (t.k) {
      case 'nome':
        return env.get(t.nome) ?? (numericos.has(t.nome) ? constanteReal(t.nome) : constante(t.nome))
      case 'vazio':
        usaVazio = true
        return constante('∅')
      case 'app': {
        const args = t.args.map((a) => termo(a, env, w))
        if (numericos.has(t.fn)) return funcaoReal(t.fn, args).call(...args)
        return funcao(t.fn, args).call(w, ...args)
      }
      case 'num':
        return Real.val(t.valor)
      case 'neg':
        return termo(t.t, env, w).neg()
      case 'arit': {
        const l = termo(t.l, env, w)
        if (t.op === '^') return potencia(l, t.r, env, w)
        const r = termo(t.r, env, w)
        return t.op === '+' ? l.add(r) : t.op === '−' ? l.sub(r) : t.op === '·' ? l.mul(r) : l.div(r)
      }
      default:
        throw new Error('⋂/⋃ deveriam ter sido expandidos antes do Z3')
    }
  }

  const formula = (f: Formula, env: Map<string, Expr>, w: Expr): Expr => {
    switch (f.k) {
      case 'const':
        return Bool.val(f.valor)
      case 'pred': {
        const args = f.args.map((a) => termo(a, env, w))
        return predicado(f.nome, args).call(w, ...args)
      }
      case 'rel': {
        const l = termo(f.l, env, w)
        if (f.op === '=' || f.op === '≠') {
          const e = Eq(l, termo(f.r, env, w))
          return f.op === '=' ? e : Not(e)
        }
        if (f.op === '∈' || f.op === '∉') {
          const e = pertence.call(w, l, termo(f.r, env, w))
          return f.op === '∈' ? e : Not(e)
        }
        if (ORDEM.includes(f.op)) {
          const r = termo(f.r, env, w)
          return f.op === '<' ? l.lt(r) : f.op === '≤' ? l.le(r) : f.op === '>' ? l.gt(r) : l.ge(r)
        }
        throw new Error('⊆ deveria ter sido expandido antes do Z3')
      }
      case 'not':
        return Not(formula(f.f, env, w))
      case 'and':
        return And(formula(f.l, env, w), formula(f.r, env, w))
      case 'or':
        return Or(formula(f.l, env, w), formula(f.r, env, w))
      case 'imp':
        return Implies(formula(f.l, env, w), formula(f.r, env, w))
      case 'iff':
        return Eq(formula(f.l, env, w), formula(f.r, env, w))
      case 'nec':
      case 'pos': {
        const v = nova('w', Mundo)
        const corpo = formula(f.f, env, v)
        return f.k === 'nec' ? ForAll([v], corpo) : Exists([v], corpo)
      }
      case 'crenca': {
        const v = nova('w', Mundo)
        return ForAll([v], Implies(acesso(f.agente).call(w, v), formula(f.f, env, v)))
      }
      case 'forall':
      case 'exists': {
        if (f.dom && f.dom.k !== 'reais' && f.dom.k !== 'inteiros') throw new Error('∀x∈S deveria ter sido expandido antes do Z3')
        const x = f.dom ? Real.const(`${f.v}!${++contador}`) : nova(f.v, Obj)
        const env2 = new Map(env)
        env2.set(f.v, x)
        const corpo = formula(f.corpo, env2, w)
        // ∀x∈ℤ: um real que é inteiro (assim inteiros e reais se misturam nas contas)
        if (f.dom?.k === 'inteiros') return f.k === 'forall' ? ForAll([x], Implies(IsInt(x), corpo)) : Exists([x], And(IsInt(x), corpo))
        return f.k === 'forall' ? ForAll([x], corpo) : Exists([x], corpo)
      }
    }
  }

  const solver = new Solver()
  // (o Z3 às vezes fica preso numa fase em que não confere o prazo: quem o usa
  // num worker o troca por outro se ele passar muito do prazo)
  solver.set('random_seed', SEED_Z3)
  for (const [k, v] of Object.entries(opcoes)) solver.set(k, v)
  // Opções adicionais não podem desligar o prazo passado pelo chamador.
  solver.set('timeout', tempoMs)
  formulas.forEach((f, i) => {
    const e = formula(f, new Map(), w0)
    const g = grupos?.[i]
    if (g === undefined || g === null) solver.add(e)
    else solver.addAndTrack(e, Bool.const(`grupo!${g}`))
  })

  if (usaVazio) {
    const w = nova('w', Mundo)
    const z = nova('z', Obj)
    solver.add(ForAll([w, z], Not(pertence.call(w, z, constante('∅')))))
  }
  // KD45: serial, transitiva, euclidiana
  for (const R of acessos.values()) {
    const a = nova('a', Mundo)
    const b = nova('b', Mundo)
    const c = nova('c', Mundo)
    solver.add(ForAll([a], Exists([b], R.call(a, b))))
    solver.add(ForAll([a, b, c], Implies(And(R.call(a, b), R.call(b, c)), R.call(a, c))))
    solver.add(ForAll([a, b, c], Implies(And(R.call(a, b), R.call(a, c)), R.call(b, c))))
  }
  return solver
}
