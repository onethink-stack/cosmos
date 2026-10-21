// O modelo exato (modelo-exato-t1-v1) de um sat com números, tirado do modelo do Z3. Antes da consulta, cada ∃ sobre
// ℝ ou ℤ de polaridade positiva vira uma constante nova: uma testemunha só para cada um, mesmo debaixo de ∀, □ ou B
// (se o Z3 acha modelo assim, a testemunha serve; se não acha, não há certificado, o que não quer dizer que não haja
// modelo). O resto vem do modelo do Z3, que dá cada função por casos com um padrão. No fim, a conferência do Caderno
// (falhasDoModeloExato) tem de aceitar o certificado.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Formula, Termo } from '../logica/ast'
import { diferenca, doInteiro, escrever, isolarRaiz, lerRacional, mdc, oposto, produto, quociente, soma, UM, ZERO, type Racional } from './exato'
import { assinaturas, falhasDoModeloExato, FORMATO_EXATO, quantificadoresNumericos, type Assinaturas, type ModeloExato, type PorMundo, type Rigida, type ValorReal } from './modeloExato'
import { checarComModelo, TEMPO_Z3_MS } from './z3'

const SP = { pos: 0, end: 0 }
/** o prefixo das constantes que fazem as vezes das testemunhas (o ! não cabe num nome da m2: não colide) */
const TESTEMUNHA = 'testemunha!'

// ---- os ∃ sobre ℝ ou ℤ de polaridade positiva viram constantes

function trocarTermo(t: Termo, v: string, nome: string): Termo {
  switch (t.k) {
    case 'nome':
      return t.nome === v ? { ...t, nome } : t
    case 'app':
      return { ...t, args: t.args.map((a) => trocarTermo(a, v, nome)) }
    case 'arit':
    case 'inter':
    case 'uniao':
      return { ...t, l: trocarTermo(t.l, v, nome), r: trocarTermo(t.r, v, nome) }
    case 'neg':
      return { ...t, t: trocarTermo(t.t, v, nome) }
    default:
      return t
  }
}

/** f com a variável livre v trocada pela constante `nome` */
function trocar(f: Formula, v: string, nome: string): Formula {
  switch (f.k) {
    case 'pred':
      return { ...f, args: f.args.map((a) => trocarTermo(a, v, nome)) }
    case 'rel':
      return { ...f, l: trocarTermo(f.l, v, nome), r: trocarTermo(f.r, v, nome) }
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      return { ...f, f: trocar(f.f, v, nome) }
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return { ...f, l: trocar(f.l, v, nome), r: trocar(f.r, v, nome) }
    case 'forall':
    case 'exists':
      return f.v === v ? f : { ...f, corpo: trocar(f.corpo, v, nome) }
    default:
      return f
  }
}

interface Troca {
  formula: number
  variavel: string
  constante: string
}

/** As fórmulas da consulta: cada ∃x∈ℝ φ de polaridade positiva vira φ[x := c]; cada ∃x∈ℤ φ, φ[x := c] ∧ ∃k∈ℤ k = c. */
function trocarTestemunhas(fs: Formula[]): { formulas: Formula[]; trocas: Troca[] } {
  const trocas: Troca[] = []
  const formula = (f: Formula, pol: number, i: number): Formula => {
    switch (f.k) {
      case 'not':
        return { ...f, f: formula(f.f, -pol, i) }
      case 'and':
      case 'or':
        return { ...f, l: formula(f.l, pol, i), r: formula(f.r, pol, i) }
      case 'imp':
        return { ...f, l: formula(f.l, -pol, i), r: formula(f.r, pol, i) }
      case 'nec':
      case 'pos':
      case 'crenca':
        return { ...f, f: formula(f.f, pol, i) }
      case 'forall':
      case 'exists': {
        if (f.k === 'exists' && f.dom && pol === 1) {
          const constante = `${TESTEMUNHA}${trocas.length}`
          trocas.push({ formula: i, variavel: f.v, constante })
          const corpo = formula(trocar(f.corpo, f.v, constante), pol, i)
          if (f.dom.k !== 'inteiros') return corpo
          const k = `inteiro!${trocas.length - 1}`
          const inteiro: Formula = {
            k: 'exists',
            v: k,
            vPos: 0,
            dom: { k: 'inteiros', ...SP },
            corpo: { k: 'rel', op: '=', l: { k: 'nome', nome: k, ...SP }, r: { k: 'nome', nome: constante, ...SP }, ...SP },
            ...SP,
          }
          return { k: 'and', l: corpo, r: inteiro, ...SP }
        }
        return { ...f, corpo: formula(f.corpo, pol, i) }
      }
      default:
        // ⟺ e as atômicas: dentro de ⟺ nada vira constante (lá o ∃ não é positivo)
        return f
    }
  }
  return { formulas: fs.map((f, i) => formula(f, 1, i)), trocas }
}

// ---- a leitura dos valores do Z3 (S-expressões como 2.0, (- (/ 1.0 3.0)), (root-obj (+ (^ x 2) (- 2)) 1))

type S = string | S[]

function lerS(texto: string): S {
  const fichas = texto.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/)
  let i = 0
  const ler = (): S => {
    const f = fichas[i++]
    if (f !== '(') return f
    const lista: S[] = []
    while (fichas[i] !== ')') {
      if (i >= fichas.length) throw new Error(`S-expressão sem fim: ${texto}`)
      lista.push(ler())
    }
    i++
    return lista
  }
  const s = ler()
  if (i !== fichas.length) throw new Error(`S-expressão com sobra: ${texto}`)
  return s
}

function decimal(a: string): Racional | null {
  return /^\d+(\.\d+)?$/.test(a) ? lerRacional(a) : null
}

/** Um número racional escrito como o Z3 escreve; null se não é. */
function racionalDe(s: S): Racional | null {
  if (typeof s === 'string') return decimal(s)
  const [op, ...xs] = s
  const vs = xs.map(racionalDe)
  if (vs.some((v) => v === null)) return null
  const rs = vs as Racional[]
  if (op === '-' && rs.length === 1) return oposto(rs[0])
  if (op === '-' && rs.length === 2) return diferenca(rs[0], rs[1])
  if (op === '/' && rs.length === 2 && rs[1].n !== 0n) return quociente(rs[0], rs[1])
  if (op === '+' && rs.length >= 1) return rs.reduce(soma)
  if (op === '*' && rs.length >= 1) return rs.reduce(produto)
  return null
}

/** O polinômio em x de um root-obj, com coeficientes racionais (grau crescente). */
function poliDe(s: S): Racional[] {
  const somar = (a: Racional[], b: Racional[]) => [...Array(Math.max(a.length, b.length)).keys()].map((i) => soma(a[i] ?? ZERO, b[i] ?? ZERO))
  const multiplicar = (a: Racional[], b: Racional[]) => {
    const r: Racional[] = Array(a.length + b.length - 1).fill(ZERO)
    a.forEach((x, i) => b.forEach((y, j) => (r[i + j] = soma(r[i + j], produto(x, y)))))
    return r
  }
  if (s === 'x') return [ZERO, UM]
  if (typeof s === 'string') {
    const r = decimal(s)
    if (!r) throw new Error(`root-obj com termo estranho: ${s}`)
    return [r]
  }
  const [op, ...xs] = s
  if (op === '^' && xs.length === 2 && typeof xs[1] === 'string' && /^\d+$/.test(xs[1])) {
    let r: Racional[] = [UM]
    for (let i = 0; i < Number(xs[1]); i++) r = multiplicar(r, poliDe(xs[0]))
    return r
  }
  const ps = xs.map(poliDe)
  if (op === '+') return ps.reduce(somar)
  if (op === '*') return ps.reduce(multiplicar)
  if (op === '-' && ps.length === 1) return ps[0].map(oposto)
  if (op === '-' && ps.length === 2) return somar(ps[0], ps[1].map(oposto))
  throw new Error(`root-obj com operação estranha: ${String(op)}`)
}

/** Os coeficientes inteiros, primitivos e de líder positivo do polinômio racional (as raízes são as mesmas). */
function inteirosDe(p: Racional[]): bigint[] {
  while (p.length && p[p.length - 1].n === 0n) p = p.slice(0, -1)
  const mmc = p.reduce((m, c) => (m / mdc(m, c.d)) * c.d, 1n)
  let cs = p.map((c) => (c.n * mmc) / c.d)
  const g = cs.reduce((x, c) => mdc(x, c), 0n)
  cs = cs.map((c) => c / g)
  return cs[cs.length - 1] < 0n ? cs.map((c) => -c) : cs
}

// ---- o certificado

export type Emissao = { modelo: ModeloExato } | { motivo: string }

/**
 * O modelo exato de fórmulas expandidas que têm números, tirado do Z3; ou o motivo de não haver (o Z3 não achou
 * modelo com uma testemunha só para cada ∃, a forma das fórmulas não cabe na v1, ou a conferência recusou).
 */
export async function modeloExatoPeloZ3(api: any, fs: Formula[], numericos: Set<string>, tempoMs = TEMPO_Z3_MS): Promise<Emissao> {
  const { recusas } = quantificadoresNumericos(fs)
  if (recusas.length) return { motivo: recusas.join('; ') }
  const { a: sig, falhas } = assinaturas(fs, numericos)
  if (falhas.length) return { motivo: falhas.join('; ') }
  const { formulas, trocas } = trocarTestemunhas(fs)
  const comTestemunhas = new Set([...numericos, ...trocas.map((t) => t.constante)])
  const { resultado, modelo: m } = await checarComModelo(api, formulas, tempoMs, comTestemunhas)
  if (resultado !== 'sat') return { motivo: `com uma testemunha só para cada ∃ sobre ℝ ou ℤ, o Z3 deu ${resultado}` }
  try {
    const c = lerModelo(m, sig, trocas)
    const recusado = falhasDoModeloExato(c, fs, numericos)
    return recusado.length ? { motivo: `a conferência recusou o modelo: ${recusado.join('; ')}` } : { modelo: c }
  } catch (erro) {
    return { motivo: String((erro as Error).message ?? erro) }
  }
}

function lerModelo(m: any, sig: Assinaturas, trocas: Troca[]): ModeloExato {
  const ctx = m.ctx
  const universo = (nome: string): any[] | null => {
    try {
      return [...m.sortUniverse(ctx.Sort.declare(nome))]
    } catch {
      return null
    }
  }
  const sufixo = (e: any) => Number(String(e.sexpr()).split('!').pop())
  const nomes = new Map<string, string>()
  const objetosZ3 = (universo('Obj') ?? []).sort((x, y) => sufixo(x) - sufixo(y))
  objetosZ3.forEach((e, i) => nomes.set(String(e.sexpr()), `o${i}`))
  const objetos = objetosZ3.length ? objetosZ3.map((_, i) => `o${i}`) : ['o0']
  let mundosZ3 = universo('Mundo') ?? []
  if (mundosZ3.length) {
    // o mundo real primeiro: é o w0
    const real = String(m.eval(ctx.Const('w0', ctx.Sort.declare('Mundo')), true).sexpr())
    mundosZ3 = mundosZ3.sort((x, y) => sufixo(x) - sufixo(y))
    mundosZ3 = [...mundosZ3.filter((e) => String(e.sexpr()) === real), ...mundosZ3.filter((e) => String(e.sexpr()) !== real)]
  }
  mundosZ3.forEach((e, i) => nomes.set(String(e.sexpr()), `w${i}`))
  const mundos = mundosZ3.length ? mundosZ3.map((_, i) => `w${i}`) : ['w0']
  const nomeDe = (e: any): string => nomes.get(String(e.sexpr())) ?? fora(e)
  const fora = (e: any): never => {
    throw new Error(`o Z3 deu um valor fora da forma por casos: ${String(e.sexpr()).slice(0, 120)}`)
  }

  // os números: racionais, ou α (um só por modelo, na v1)
  let algebrico: ModeloExato['algebrico']
  let chaveDeAlfa = ''
  const real = (e: any): ValorReal => {
    const texto = String(e.sexpr())
    const s = lerS(texto)
    const r = racionalDe(s)
    if (r) return escrever(r)
    if (Array.isArray(s) && s[0] === 'root-obj' && s.length === 3 && typeof s[2] === 'string') {
      const cs = inteirosDe(poliDe(s[1]))
      const indice = Number(s[2])
      const chave = `${cs.join(',')}|${indice}`
      if (!algebrico) {
        const intervalo = isolarRaiz(doInteiro(cs), indice)
        if (!intervalo) throw new Error(`root-obj sem a raiz ${indice}: ${texto}`)
        if (!cs.every((x) => Number.isSafeInteger(Number(x)) && BigInt(Number(x)) === x)) throw new Error('coeficientes grandes demais para a v1')
        algebrico = { polinomio: cs.map(Number), intervaloAberto: [escrever(intervalo[0]), escrever(intervalo[1])], indiceDaRaiz: indice }
        chaveDeAlfa = chave
      } else if (chave !== chaveDeAlfa) throw new Error('dois números algébricos diferentes no modelo: a v1 só tem um α')
      return 'alpha'
    }
    return fora(e)
  }
  const booleano = (e: any): boolean => {
    const s = String(e.sexpr())
    return s === 'true' ? true : s === 'false' ? false : fora(e)
  }
  const sorteDe = (s: any) => String(s.name())
  const argumento = (e: any, sorte: string): ValorReal => (sorte === 'Real' ? real(e) : nomeDe(e))
  const valorDe = (e: any, sorte: string): ValorReal | boolean => (sorte === 'Bool' ? booleano(e) : argumento(e, sorte))

  // as declarações do modelo, pelo nome sem a assinatura ([:sig])
  const decls = new Map<string, any>()
  for (const d of m.decls()) {
    const nome = String(d.name())
    const x = /^(f|fn|p):(.+)\/(\d+)(?::[RO]+)?$/.exec(nome)
    decls.set(x ? `${x[1]}:${x[2]}/${x[3]}` : nome, d)
  }

  /** a tabela de uma função de argumentos finitos (objetos e mundos), por casos: o valor mais comum é o padrão */
  const porEnumeracao = (d: any, comMundo: boolean) => {
    const dominio = [...Array(d.arity()).keys()].map((i) => d.domain(i))
    const valores = dominio.map((s) => (sorteDe(s) === 'Mundo' ? mundosZ3 : objetosZ3))
    const linhas: { args: any[]; valor: ValorReal | boolean }[] = []
    const percorrer = (prefixo: any[]) => {
      if (prefixo.length === dominio.length) {
        linhas.push({ args: prefixo, valor: valorDe(m.eval(d.call(...prefixo), true), sorteDe(d.range())) })
        return
      }
      for (const v of valores[prefixo.length]) percorrer([...prefixo, v])
    }
    percorrer([])
    const contagem = new Map<string, number>()
    for (const l of linhas) contagem.set(JSON.stringify(l.valor), (contagem.get(JSON.stringify(l.valor)) ?? 0) + 1)
    const padrao = JSON.parse([...contagem].reduce((x, y) => (y[1] > x[1] ? y : x))[0])
    const excecoes = linhas
      .filter((l) => JSON.stringify(l.valor) !== JSON.stringify(padrao))
      .map((l) => {
        const args = l.args.map((e) => nomeDe(e))
        return comMundo ? { mundo: args[0], argumentos: args.slice(1), valor: l.valor } : { argumentos: args, valor: l.valor }
      })
    return { padrao, excecoes }
  }
  /** a tabela de uma função com argumento numérico, como o Z3 a dá: os casos e o padrão (que tem de ser um valor) */
  const porCasos = (d: any, comMundo: boolean) => {
    const fi = m.get(d)
    if (!fi || typeof fi.numEntries !== 'function') throw new Error(`o Z3 não deu a tabela de ${String(d.name())}`)
    const dominio = [...Array(d.arity()).keys()].map((i) => sorteDe(d.domain(i)))
    const imagem = sorteDe(d.range())
    const excecoes = [...Array(fi.numEntries()).keys()].map((j) => {
      const e = fi.entry(j)
      const args = dominio.map((s, i) => argumento(e.argValue(i), s))
      const valor = valorDe(e.value(), imagem)
      return comMundo ? { mundo: args[0] as string, argumentos: args.slice(1), valor } : { argumentos: args, valor }
    })
    return { padrao: valorDe(fi.elseValue(), imagem), excecoes }
  }
  const tabela = (d: any, comMundo: boolean) => {
    const finita = [...Array(d.arity()).keys()].every((i) => ['Mundo', 'Obj'].includes(sorteDe(d.domain(i))))
    const t = finita ? porEnumeracao(d, comMundo) : porCasos(d, comMundo)
    return t.excecoes.length ? t : { padrao: t.padrao }
  }

  const constantesObjeto: Record<string, string> = {}
  const constantesReais: Record<string, ValorReal> = {}
  for (const [nome, s] of [...sig.constantes].sort()) {
    if (s === 'R') constantesReais[nome] = real(m.eval(ctx.Real.const(`n:${nome}`), true))
    else constantesObjeto[nome] = nomeDe(m.eval(ctx.Const(`c:${nome}`, ctx.Sort.declare('Obj')), true))
  }
  if (sig.usaVazio) constantesObjeto['∅'] = nomeDe(m.eval(ctx.Const('c:∅', ctx.Sort.declare('Obj')), true))
  const funcoesObjeto: Record<string, PorMundo<string>> = {}
  const funcoesReais: Record<string, Rigida> = {}
  for (const [chave, { numerica }] of [...sig.funcoes].sort()) {
    const d = decls.get(`${numerica ? 'fn' : 'f'}:${chave}`)
    if (numerica) funcoesReais[chave] = (d ? tabela(d, false) : { padrao: '0' }) as Rigida
    else funcoesObjeto[chave] = (d ? tabela(d, true) : { padrao: objetos[0] }) as PorMundo<string>
  }
  const predicados: Record<string, PorMundo<boolean>> = {}
  for (const [chave] of [...sig.predicados].sort()) {
    const d = decls.get(`p:${chave}`)
    predicados[chave] = (d ? tabela(d, true) : { padrao: false }) as PorMundo<boolean>
  }
  const pertence: [string, string, string][] = []
  const pert = decls.get('pertence')
  if (pert && (sig.usaPertence || sig.usaVazio))
    for (const w of mundosZ3) for (const x of objetosZ3) for (const y of objetosZ3) if (booleano(m.eval(pert.call(w, x, y), true))) pertence.push([nomeDe(w), nomeDe(x), nomeDe(y)])
  const acessos: Record<string, [string, string][]> = {}
  for (const h of [...sig.titulares].sort()) {
    const R = decls.get(`R:${h}`)
    if (!R) throw new Error(`o Z3 não deu a relação de ${h}`)
    acessos[h] = []
    for (const w of mundosZ3) for (const v of mundosZ3) if (booleano(m.eval(R.call(w, v), true))) acessos[h].push([nomeDe(w), nomeDe(v)])
  }
  let divZero: ModeloExato['divZero']
  if (sig.usaDivisao) {
    // o Z3 dá a divisão por zero como a função /0 (numerador, denominador): só os casos de denominador 0 contam
    const d = decls.get('/0')
    if (!d) divZero = { padrao: '0' }
    else {
      const t = porCasos(d, false)
      const excecoes = t.excecoes
        .filter((e) => {
          const den = lerRacional(String(e.argumentos[1]))
          return den !== null && den.n === 0n
        })
        .map((e) => ({ numerador: e.argumentos[0] as ValorReal, valor: e.valor as ValorReal }))
      divZero = excecoes.length ? { padrao: t.padrao as ValorReal, excecoes } : { padrao: t.padrao as ValorReal }
    }
  }
  const testemunhas = trocas.map((t) => ({ formula: t.formula, variavel: t.variavel, valor: real(m.eval(ctx.Real.const(`n:${t.constante}`), true)) }))
  // o α escrito tem de ser o número do Z3: cada constante (ou testemunha) que vale alpha fica no intervalo, pelo Z3
  if (algebrico) {
    const [a, b] = algebrico.intervaloAberto
    const nomesAlfa = [
      ...Object.keys(constantesReais).filter((n) => constantesReais[n] === 'alpha'),
      ...trocas.filter((_, i) => testemunhas[i].valor === 'alpha').map((t) => t.constante),
    ]
    for (const n of nomesAlfa) {
      const x = ctx.Real.const(`n:${n}`)
      if (String(m.eval(ctx.And(x.gt(ctx.Real.val(a)), x.lt(ctx.Real.val(b))), true)) !== 'true') throw new Error(`o α escrito não é o valor que o Z3 deu a ${n}`)
    }
  }
  return {
    formato: FORMATO_EXATO,
    objetos,
    mundos,
    mundoReal: 'w0',
    ...(algebrico ? { algebrico } : {}),
    constantesObjeto,
    constantesReais,
    funcoesObjeto,
    funcoesReais,
    predicados,
    pertence,
    acessos,
    ...(divZero ? { divZero } : {}),
    testemunhas,
  }
}
