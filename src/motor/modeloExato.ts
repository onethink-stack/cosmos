// O modelo exato como certificado de um "não segue" com números (formato modelo-exato-t1-v1, descrito em
// especificacao/modelos-exatos-t1.md): objetos e mundos com nome, números racionais ou do corpo Q(α), funções e
// predicados por casos com um padrão (totais mesmo com argumentos reais), a divisão por zero (D0) e uma testemunha
// para cada ∃ sobre ℝ ou ℤ de polaridade positiva. Quem confere não faz busca nenhuma: avalia cada fórmula, na árvore
// expandida, no mundo real.

import type { Formula, Termo } from '../logica/ast'
import { Corpo, comparar, doInteiro, indiceAcimaDe, irredutivel, lerRacional, mdc, pvalor, raizesEntre, sinal, UM, type Elemento } from './exato'
import type { Modelo } from './motor'
import { falhasQuadro } from './quadro'

export const FORMATO_EXATO = 'modelo-exato-t1-v1'

/** Um número: racional escrito ("2", "-3/2", "0.5"), "alpha", ou a + b·α + … escrito {"coeficientes": [a, b, …]} */
export type ValorReal = string | { coeficientes: string[] }
/** Um argumento: o nome de um objeto ou um número */
export type Argumento = ValorReal

export interface PorMundo<T> {
  padrao: T
  porMundo?: Record<string, T>
  excecoes?: { mundo: string; argumentos: Argumento[]; valor: T }[]
}
export interface Rigida {
  padrao: ValorReal
  excecoes?: { argumentos: Argumento[]; valor: ValorReal }[]
}

export interface ModeloExato {
  formato: typeof FORMATO_EXATO
  objetos: string[]
  mundos: string[]
  mundoReal: string
  /** α: a raiz única do polinômio (inteiro, grau crescente) no intervalo aberto; o índice (1 = a menor) é conferido */
  algebrico?: { polinomio: number[]; intervaloAberto: [string, string]; indiceDaRaiz?: number }
  constantesObjeto: Record<string, string>
  constantesReais: Record<string, ValorReal>
  funcoesObjeto: Record<string, PorMundo<string>>
  funcoesReais: Record<string, Rigida>
  predicados: Record<string, PorMundo<boolean>>
  pertence: [string, string, string][]
  acessos: Record<string, [string, string][]>
  divZero?: { padrao: ValorReal; excecoes?: { numerador: ValorReal; valor: ValorReal }[] }
  testemunhas: { formula: number; variavel: string; valor: ValorReal }[]
}

export const FORMATO_DO_MODELO_EXATO =
  'O modelo exato (modelo-exato-t1-v1) dá nomes aos objetos e aos mundos, os números como racionais escritos ou em Q(α), cada função e predicado por casos com um padrão, D0 para a divisão por zero e uma testemunha para cada ∃ sobre ℝ ou ℤ de polaridade positiva. ' +
  'Quem confere checa a forma, α (polinômio primitivo, irredutível, com uma raiz só no intervalo, por Sturm), o quadro KD45 de cada titular e se cada fórmula, na árvore expandida, vale no mundo real. ∀ sobre ℝ ou ℤ, e ∃ sobre ℝ ou ℤ debaixo de ¬, à esquerda de ⟹ ou dentro de ⟺, são recusados: uma testemunha não os confere. Não há busca nenhuma.'

// ---- a polaridade dos quantificadores numéricos

export interface QuantificadorNumerico {
  /** índice da fórmula, a partir de 0 */
  formula: number
  variavel: string
  inteiro: boolean
}

const ehPotenciaEscrita = (t: Termo) => t.k === 'num' && /^\d+$/.test(t.valor) && Number(t.valor) <= 12

/**
 * Os ∃ sobre ℝ ou ℤ que levam testemunha (os de polaridade positiva) e o que impede o certificado: ∀ sobre ℝ ou ℤ,
 * ∃ sobre ℝ ou ℤ debaixo de ¬, à esquerda de ⟹ ou dentro de ⟺, dois desses ∃ com a mesma variável na mesma fórmula,
 * potência que não é um natural escrito de 0 a 12, ou o que a expansão devia ter tirado. A forma decide, antes de
 * avaliar: o resultado não depende da ordem da avaliação.
 */
export function quantificadoresNumericos(fs: Formula[]): { testemunhas: QuantificadorNumerico[]; recusas: string[] } {
  const testemunhas: QuantificadorNumerico[] = []
  const recusas: string[] = []
  const termo = (t: Termo, i: number): void => {
    switch (t.k) {
      case 'app':
        for (const a of t.args) termo(a, i)
        return
      case 'arit':
        if (t.op === '^' && !ehPotenciaEscrita(t.r)) recusas.push(`fórmula ${i + 1}: potência que não é um natural escrito de 0 a 12`)
        termo(t.l, i)
        termo(t.r, i)
        return
      case 'neg':
        termo(t.t, i)
        return
      case 'inter':
      case 'uniao':
        recusas.push(`fórmula ${i + 1}: ⋂ ou ⋃ na árvore expandida`)
        return
      default:
        return
    }
  }
  // pol: 1 positiva, −1 negativa, 0 as duas (dentro de ⟺)
  const formula = (f: Formula, pol: number, i: number, nomes: Set<string>): void => {
    switch (f.k) {
      case 'pred':
        for (const a of f.args) termo(a, i)
        return
      case 'rel':
        if (f.op === '⊆') recusas.push(`fórmula ${i + 1}: ⊆ na árvore expandida`)
        termo(f.l, i)
        termo(f.r, i)
        return
      case 'not':
        formula(f.f, -pol, i, nomes)
        return
      case 'and':
      case 'or':
        formula(f.l, pol, i, nomes)
        formula(f.r, pol, i, nomes)
        return
      case 'imp':
        formula(f.l, -pol, i, nomes)
        formula(f.r, pol, i, nomes)
        return
      case 'iff':
        formula(f.l, 0, i, nomes)
        formula(f.r, 0, i, nomes)
        return
      case 'nec':
      case 'pos':
      case 'crenca':
        formula(f.f, pol, i, nomes)
        return
      case 'forall':
      case 'exists': {
        const dom = f.dom?.k
        if (dom !== undefined && dom !== 'reais' && dom !== 'inteiros') recusas.push(`fórmula ${i + 1}: ∀x∈S ou ∃x∈S na árvore expandida`)
        else if (dom !== undefined) {
          const onde = dom === 'reais' ? 'ℝ' : 'ℤ'
          if (f.k === 'forall') recusas.push(`fórmula ${i + 1}: ∀${f.v}∈${onde}: um ∀ sobre ${onde} não se confere com testemunha`)
          else if (pol !== 1) recusas.push(`fórmula ${i + 1}: ∃${f.v}∈${onde} debaixo de ¬, à esquerda de ⟹ ou dentro de ⟺: aí ele vale como um ∀`)
          else {
            if (nomes.has(f.v)) recusas.push(`fórmula ${i + 1}: dois ∃ sobre ℝ ou ℤ com a variável ${f.v}`)
            nomes.add(f.v)
            testemunhas.push({ formula: i, variavel: f.v, inteiro: dom === 'inteiros' })
          }
        }
        formula(f.corpo, pol, i, nomes)
        return
      }
      default:
        return
    }
  }
  fs.forEach((f, i) => formula(f, 1, i, new Set()))
  return { testemunhas, recusas }
}

// ---- os símbolos das fórmulas e a sorte de cada argumento

/** R: número; O: objeto */
export type Sorte = 'R' | 'O'

export interface Assinaturas {
  constantes: Map<string, Sorte>
  /** nome/aridade → sortes dos argumentos; numerica: a função dá número (está em N) */
  funcoes: Map<string, { args: Sorte[]; numerica: boolean }>
  predicados: Map<string, Sorte[]>
  titulares: Set<string>
  usaVazio: boolean
  usaDivisao: boolean
  usaPertence: boolean
}

/** Os símbolos livres das fórmulas expandidas, com a sorte de cada argumento, e o que mais elas usam. */
export function assinaturas(fs: Formula[], numericos: Set<string>): { a: Assinaturas; falhas: string[] } {
  const a: Assinaturas = { constantes: new Map(), funcoes: new Map(), predicados: new Map(), titulares: new Set(), usaVazio: false, usaDivisao: false, usaPertence: false }
  const falhas: string[] = []
  const anotar = (mapa: Map<string, Sorte[]>, chave: string, args: Sorte[]) => {
    const antes = mapa.get(chave)
    if (antes && antes.join() !== args.join()) falhas.push(`${chave} usado com argumentos de sortes diferentes`)
    mapa.set(chave, args)
  }
  const sorte = (t: Termo, ligadas: Map<string, Sorte>): Sorte => {
    switch (t.k) {
      case 'nome': {
        const s = ligadas.get(t.nome)
        if (s) return s
        const livre: Sorte = numericos.has(t.nome) ? 'R' : 'O'
        a.constantes.set(t.nome, livre)
        return livre
      }
      case 'vazio':
        a.usaVazio = true
        return 'O'
      case 'app': {
        const args = t.args.map((x) => sorte(x, ligadas))
        const chave = `${t.fn}/${args.length}`
        const numerica = numericos.has(t.fn)
        const antes = a.funcoes.get(chave)
        if (antes && antes.args.join() !== args.join()) falhas.push(`${chave} usado com argumentos de sortes diferentes`)
        a.funcoes.set(chave, { args, numerica })
        return numerica ? 'R' : 'O'
      }
      case 'arit':
        if (t.op === '/') a.usaDivisao = true
        sorte(t.l, ligadas)
        sorte(t.r, ligadas)
        return 'R'
      case 'neg':
        sorte(t.t, ligadas)
        return 'R'
      default:
        return 'R'
    }
  }
  const formula = (f: Formula, ligadas: Map<string, Sorte>): void => {
    switch (f.k) {
      case 'pred':
        anotar(
          a.predicados,
          `${f.nome}/${f.args.length}`,
          f.args.map((x) => sorte(x, ligadas)),
        )
        return
      case 'rel':
        if (f.op === '∈' || f.op === '∉' || f.op === '⊆') a.usaPertence = true
        sorte(f.l, ligadas)
        sorte(f.r, ligadas)
        return
      case 'not':
      case 'nec':
      case 'pos':
        formula(f.f, ligadas)
        return
      case 'crenca':
        a.titulares.add(f.agente)
        formula(f.f, ligadas)
        return
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        formula(f.l, ligadas)
        formula(f.r, ligadas)
        return
      case 'forall':
      case 'exists':
        formula(f.corpo, new Map([...ligadas, [f.v, f.dom ? 'R' : 'O']]))
        return
      default:
        return
    }
  }
  for (const f of fs) formula(f, new Map())
  return { a, falhas }
}

// ---- a conferência

const ehTexto = (x: unknown): x is string => typeof x === 'string'
const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const distintos = (xs: unknown): xs is string[] => Array.isArray(xs) && xs.length > 0 && xs.every(ehTexto) && new Set(xs).size === xs.length

/** Um valor do modelo: o nome de um objeto ou um número (elemento do corpo) */
type Valor = string | Elemento

class Recusa extends Error {}

/**
 * As falhas do modelo exato para estas fórmulas expandidas (lista vazia = o modelo vale), com N = `numericos`.
 * Não faz busca nenhuma.
 */
export function falhasDoModeloExato(c: any, fs: Formula[], numericos: Set<string>): string[] {
  try {
    return conferir(c, fs, numericos)
  } catch (erro) {
    if (erro instanceof Recusa) return [erro.message]
    throw erro
  }
}

const CAMPOS = ['formato', 'objetos', 'mundos', 'mundoReal', 'algebrico', 'constantesObjeto', 'constantesReais', 'funcoesObjeto', 'funcoesReais', 'predicados', 'pertence', 'acessos', 'divZero', 'testemunhas']

const recusar: (msg: string) => never = (msg) => {
  throw new Recusa(msg)
}

function conferir(c: any, fs: Formula[], numericos: Set<string>): string[] {
  if (!ehObjeto(c) || c.formato !== FORMATO_EXATO) recusar(`o formato não é ${FORMATO_EXATO}`)
  // um campo com outro nome (testemunhasExistenciais, algebricos…) seria ignorado sem aviso: é recusado
  const estranho = Object.keys(c).find((k) => !CAMPOS.includes(k))
  if (estranho) recusar(`campo desconhecido: ${estranho}`)
  if (!distintos(c.objetos)) recusar('objetos: uma lista não vazia de nomes distintos')
  if (!distintos(c.mundos)) recusar('mundos: uma lista não vazia de nomes distintos')
  const O: string[] = c.objetos
  const W: string[] = c.mundos
  if (!ehTexto(c.mundoReal) || !W.includes(c.mundoReal)) recusar('o mundo real não está entre os mundos')
  const mundoReal = c.mundoReal as string
  const ehObj = (x: unknown): x is string => ehTexto(x) && O.includes(x)
  const ehMundo = (x: unknown): x is string => ehTexto(x) && W.includes(x)

  const { testemunhas: pedidas, recusas } = quantificadoresNumericos(fs)
  if (recusas.length) return recusas
  const { a: sig, falhas: falhasSig } = assinaturas(fs, numericos)
  if (falhasSig.length) return falhasSig

  // α e o corpo
  let K = new Corpo()
  if (c.algebrico !== undefined) {
    const alg = c.algebrico
    if (!ehObjeto(alg) || Object.keys(alg).some((k) => !['polinomio', 'intervaloAberto', 'indiceDaRaiz'].includes(k)))
      recusar('algebrico: só polinomio, intervaloAberto e indiceDaRaiz')
    const cs = alg.polinomio
    if (!Array.isArray(cs) || cs.length < 2 || !cs.every((x: unknown) => Number.isSafeInteger(x)))
      recusar('o polinômio de α: uma lista de inteiros, em grau crescente, de grau 1 ou mais')
    const inteiros = (cs as number[]).map((x) => BigInt(x))
    const p = doInteiro(inteiros)
    if (p.length !== inteiros.length || inteiros[inteiros.length - 1] <= 0n) recusar('o polinômio de α tem de ter o coeficiente líder positivo')
    if (inteiros.reduce((g, x) => mdc(g, x), 0n) !== 1n) recusar('o polinômio de α não é primitivo')
    const irr = irredutivel(inteiros)
    if (irr === false) recusar('o polinômio de α não é irredutível')
    if (irr === null) recusar('o polinômio de α tem grau acima de 3 (ou coeficientes grandes demais): esta conferência não sabe dizer se é irredutível')
    const iv = alg.intervaloAberto
    const ext = Array.isArray(iv) && iv.length === 2 ? iv.map(lerRacional) : []
    if (ext.length !== 2 || !ext[0] || !ext[1] || comparar(ext[0], ext[1]) >= 0) recusar('o intervalo de α: dois racionais escritos, o primeiro menor')
    const [a, b] = ext as [NonNullable<(typeof ext)[0]>, NonNullable<(typeof ext)[0]>]
    if (sinal(pvalor(p, a)) === 0 || sinal(pvalor(p, b)) === 0) recusar('um extremo do intervalo de α é raiz do polinômio')
    if (raizesEntre(p, a, b) !== 1) recusar(`o intervalo de α tem ${raizesEntre(p, a, b)} raízes do polinômio (por Sturm), e tinha de ter 1`)
    if (alg.indiceDaRaiz !== undefined && alg.indiceDaRaiz !== indiceAcimaDe(p, a))
      recusar(`o índice da raiz de α é ${indiceAcimaDe(p, a)}, não ${JSON.stringify(alg.indiceDaRaiz)}`)
    K = new Corpo(p, [a, b])
  }
  const real = (v: unknown, onde: string): Elemento => {
    if (v === 'alpha') return c.algebrico !== undefined ? K.alfa() : recusar(`${onde}: alpha sem o polinômio de α`)
    const r = lerRacional(v)
    if (r) return K.constante(r)
    if (ehObjeto(v) && Object.keys(v).join() === 'coeficientes' && Array.isArray(v.coeficientes) && v.coeficientes.length > 0) {
      const rs = v.coeficientes.map(lerRacional)
      if (rs.every((x) => x !== null) && (c.algebrico !== undefined || rs.length === 1)) {
        let soma: Elemento = []
        let potencia = K.constante(UM)
        for (const x of rs) {
          soma = K.soma(soma, K.produto(K.constante(x!), potencia))
          if (c.algebrico !== undefined) potencia = K.produto(potencia, K.alfa())
        }
        return soma
      }
    }
    return recusar(`${onde}: número mal escrito: ${JSON.stringify(v)}`)
  }
  const argumento = (v: unknown, s: Sorte, onde: string): Valor => (s === 'R' ? real(v, onde) : ehObj(v) ? v : recusar(`${onde}: ${JSON.stringify(v)} não é um objeto`))
  const igual = (x: Valor, y: Valor) => (ehTexto(x) || ehTexto(y) ? x === y : K.iguais(x, y))

  // as constantes
  const constObj = ehObjeto(c.constantesObjeto) ? c.constantesObjeto : recusar('sem constantesObjeto')
  const constReais = ehObjeto(c.constantesReais) ? c.constantesReais : recusar('sem constantesReais')
  const constantes = new Map<string, Valor>()
  for (const [nome, s] of sig.constantes) {
    if (s === 'R') constantes.set(nome, nome in constReais ? real(constReais[nome], `constante ${nome}`) : recusar(`sem a constante ${nome}`))
    else constantes.set(nome, ehObj(constObj[nome]) ? constObj[nome] : recusar(`sem a constante ${nome}, ou ela não é um objeto`))
  }
  if (sig.usaVazio) constantes.set('∅', ehObj(constObj['∅']) ? constObj['∅'] : recusar('sem o objeto de ∅'))

  // as funções e os predicados, por casos
  interface Casos<T> {
    padrao: T
    porMundo: Map<string, T>
    excecoes: { mundo: string | null; args: Valor[]; valor: T }[]
  }
  const casos = <T>(e: unknown, onde: string, args: Sorte[], porMundo: boolean, valor: (v: unknown, onde: string) => T): Casos<T> => {
    if (!ehObjeto(e) || !('padrao' in e)) recusar(`sem ${onde}, ou sem o padrão`)
    const ent = e as Record<string, unknown>
    const chaves = Object.keys(ent).filter((k) => !['padrao', 'porMundo', 'excecoes'].includes(k))
    if (chaves.length) recusar(`${onde}: campo desconhecido ${chaves[0]}`)
    const r: Casos<T> = { padrao: valor(ent.padrao, onde), porMundo: new Map(), excecoes: [] }
    if (ent.porMundo !== undefined) {
      if (!porMundo || !ehObjeto(ent.porMundo)) recusar(`${onde}: porMundo só numa função de objeto ou num predicado`)
      for (const [w, v] of Object.entries(ent.porMundo as object)) r.porMundo.set(ehMundo(w) ? w : recusar(`${onde}: ${w} não é um mundo`), valor(v, onde))
    }
    if (ent.excecoes !== undefined && !Array.isArray(ent.excecoes)) recusar(`${onde}: excecoes é uma lista`)
    for (const x of (ent.excecoes as unknown[]) ?? []) {
      if (!ehObjeto(x)) recusar(`${onde}: exceção mal formada`)
      const ex = x as Record<string, unknown>
      // numa função de objeto ou num predicado, que variam com o mundo, toda exceção diz o mundo; numa função
      // numérica, que não varia, nenhuma diz
      if (porMundo !== ('mundo' in ex)) recusar(porMundo ? `${onde}: exceção sem o mundo` : `${onde}: exceção com mundo numa função numérica, que não varia com o mundo`)
      if (porMundo && !ehMundo(ex.mundo)) recusar(`${onde}: ${JSON.stringify(ex.mundo)} não é um mundo`)
      if (!Array.isArray(ex.argumentos) || ex.argumentos.length !== args.length) recusar(`${onde}: exceção com ${args.length} argumentos esperados`)
      const vs = (ex.argumentos as unknown[]).map((v, i) => argumento(v, args[i], onde))
      const mundo = porMundo ? (ex.mundo as string) : null
      if (r.excecoes.some((y) => y.mundo === mundo && y.args.every((v, i) => igual(v, vs[i])))) recusar(`${onde}: duas exceções para os mesmos argumentos`)
      r.excecoes.push({ mundo, args: vs, valor: valor(ex.valor, onde) })
    }
    return r
  }
  const aplicar = <T>(k: Casos<T>, w: string | null, args: Valor[]): T => {
    for (const e of k.excecoes) if (e.mundo === w && e.args.every((v, i) => igual(v, args[i]))) return e.valor
    return (w !== null ? k.porMundo.get(w) : undefined) ?? k.padrao
  }
  const objeto = (v: unknown, onde: string) => (ehObj(v) ? v : recusar(`${onde}: ${JSON.stringify(v)} não é um objeto`))
  const booleano = (v: unknown, onde: string) => (typeof v === 'boolean' ? v : recusar(`${onde}: ${JSON.stringify(v)} não é true nem false`))
  const fo = ehObjeto(c.funcoesObjeto) ? c.funcoesObjeto : recusar('sem funcoesObjeto')
  const fr = ehObjeto(c.funcoesReais) ? c.funcoesReais : recusar('sem funcoesReais')
  const pr = ehObjeto(c.predicados) ? c.predicados : recusar('sem predicados')
  const funcoes = new Map<string, Casos<Valor>>()
  for (const [chave, { args, numerica }] of sig.funcoes)
    funcoes.set(chave, numerica ? casos<Valor>(fr[chave], `a função ${chave}`, args, false, real) : casos<Valor>(fo[chave], `a função ${chave}`, args, true, objeto))
  const predicados = new Map<string, Casos<boolean>>()
  for (const [chave, args] of sig.predicados) predicados.set(chave, casos(pr[chave], `o predicado ${chave}`, args, true, booleano))

  // a pertinência, os quadros e D0
  if (!Array.isArray(c.pertence)) recusar('sem pertence')
  const pertence = new Set<string>()
  for (const t of c.pertence) {
    const [w, x, y] = Array.isArray(t) && t.length === 3 ? t : []
    if (!ehMundo(w) || !ehObj(x) || !ehObj(y)) recusar(`trio inválido em pertence: ${JSON.stringify(t)}`)
    if (sig.usaVazio && y === constantes.get('∅')) recusar(`${x} pertence a ∅ no mundo ${w}`)
    pertence.add(`${w}|${x}|${y}`)
  }
  const acessos = new Map<string, Set<string>>()
  const pares: { agente: string; pares: [number, number][] }[] = []
  for (const h of sig.titulares) {
    const ps = ehObjeto(c.acessos) ? c.acessos[h] : undefined
    if (!Array.isArray(ps)) recusar(`sem os acessos de ${h}`)
    const conjunto = new Set<string>()
    const indices: [number, number][] = []
    for (const par of ps as unknown[]) {
      const [w, v] = Array.isArray(par) && par.length === 2 ? par : []
      if (!ehMundo(w) || !ehMundo(v)) recusar(`par inválido de ${h}: ${JSON.stringify(par)}`)
      conjunto.add(`${w}|${v}`)
      indices.push([W.indexOf(w as string), W.indexOf(v as string)])
    }
    acessos.set(h, conjunto)
    pares.push({ agente: h, pares: indices })
  }
  const quadro = falhasQuadro({ mundos: W.length, acessos: pares } as Modelo, [...sig.titulares])
  if (quadro.length) return quadro.map((q) => `quadro de ${q.agente} não é ${q.propriedade} (${q.mundos.map((i) => W[i]).join(', ')})`)
  let d0: { padrao: Elemento; excecoes: { numerador: Elemento; valor: Elemento }[] } | null = null
  if (sig.usaDivisao) {
    const d = ehObjeto(c.divZero) ? c.divZero : recusar('sem divZero, e há divisão nas fórmulas')
    if (Object.keys(d).some((k) => k !== 'padrao' && k !== 'excecoes')) recusar('divZero: só padrao e excecoes')
    if (d.excecoes !== undefined && !Array.isArray(d.excecoes)) recusar('divZero: excecoes é uma lista')
    const excecoes: { numerador: Elemento; valor: Elemento }[] = []
    for (const e of (d.excecoes as unknown[]) ?? []) {
      const ex = ehObjeto(e) ? e : recusar('divZero: exceção mal formada')
      const numerador = real(ex.numerador, 'divZero')
      if (excecoes.some((y) => K.iguais(y.numerador, numerador))) recusar('divZero: duas exceções para o mesmo numerador')
      excecoes.push({ numerador, valor: real(ex.valor, 'divZero') })
    }
    d0 = { padrao: real(d.padrao, 'divZero'), excecoes }
  }

  // as testemunhas: exatamente uma para cada ∃ sobre ℝ ou ℤ de polaridade positiva
  if (!Array.isArray(c.testemunhas)) recusar('sem testemunhas (a lista vazia, se não há ∃ sobre ℝ ou ℤ)')
  const testemunhas = new Map<string, Elemento>()
  for (const t of c.testemunhas as unknown[]) {
    const x = ehObjeto(t) ? t : recusar('testemunha mal formada')
    const chave = `${x.formula}|${x.variavel}`
    const pedida = pedidas.find((q) => q.formula === x.formula && q.variavel === x.variavel)
    if (!pedida) recusar(`testemunha que nenhum ∃ sobre ℝ ou ℤ pede: fórmula ${JSON.stringify(x.formula)}, variável ${JSON.stringify(x.variavel)}`)
    if (testemunhas.has(chave)) recusar(`duas testemunhas para ${x.variavel} na fórmula ${Number(x.formula) + 1}`)
    const v = real(x.valor, `a testemunha de ${x.variavel}`)
    if (pedida!.inteiro && !K.ehInteiro(v)) recusar(`a testemunha de ${x.variavel}∈ℤ não é inteira`)
    testemunhas.set(chave, v)
  }
  for (const q of pedidas) if (!testemunhas.has(`${q.formula}|${q.variavel}`)) recusar(`sem a testemunha de ${q.variavel} na fórmula ${q.formula + 1}`)

  // a avaliação, na árvore expandida
  const numero = (v: Valor, onde: string): Elemento => (ehTexto(v) ? recusar(`${onde}: um objeto onde se pede número`) : v)
  const termo = (t: Termo, env: Map<string, Valor>, w: string): Valor => {
    switch (t.k) {
      case 'nome':
        return env.get(t.nome) ?? constantes.get(t.nome) ?? recusar(`termo sem interpretação: ${t.nome}`)
      case 'vazio':
        return constantes.get('∅')!
      case 'num': {
        const r = lerRacional(t.valor)
        return r ? K.constante(r) : recusar(`número mal escrito na fórmula: ${t.valor}`)
      }
      case 'neg':
        return K.oposto(numero(termo(t.t, env, w), '−'))
      case 'arit': {
        const l = numero(termo(t.l, env, w), t.op)
        if (t.op === '^') {
          let r = K.constante(UM)
          for (let i = 0; i < Number((t.r as { valor: string }).valor); i++) r = K.produto(r, l)
          return r
        }
        const r = numero(termo(t.r, env, w), t.op)
        if (t.op === '+') return K.soma(l, r)
        if (t.op === '−') return K.diferenca(l, r)
        if (t.op === '·') return K.produto(l, r)
        if (!K.ehZero(r)) return K.produto(l, K.inverso(r))
        // dividir por zero dá D0(numerador)
        for (const e of d0!.excecoes) if (K.iguais(e.numerador, l)) return e.valor
        return d0!.padrao
      }
      case 'app': {
        const args = t.args.map((x) => termo(x, env, w))
        const chave = `${t.fn}/${args.length}`
        return aplicar(funcoes.get(chave)!, numericos.has(t.fn) ? null : w, args)
      }
      default:
        return recusar(`termo fora da árvore expandida: ${t.k}`)
    }
  }
  const formula = (f: Formula, env: Map<string, Valor>, w: string, i: number): boolean => {
    switch (f.k) {
      case 'const':
        return f.valor
      case 'pred':
        return aplicar(
          predicados.get(`${f.nome}/${f.args.length}`)!,
          w,
          f.args.map((x) => termo(x, env, w)),
        )
      case 'rel': {
        const l = termo(f.l, env, w)
        const r = termo(f.r, env, w)
        if (f.op === '=' || f.op === '≠') {
          if (ehTexto(l) !== ehTexto(r)) recusar('= entre um objeto e um número')
          return igual(l, r) === (f.op === '=')
        }
        if (f.op === '∈' || f.op === '∉') {
          if (!ehTexto(l) || !ehTexto(r)) recusar('∈ entre números')
          return pertence.has(`${w}|${l}|${r}`) === (f.op === '∈')
        }
        const k = K.comparar(numero(l, f.op), numero(r, f.op))
        return f.op === '<' ? k < 0 : f.op === '≤' ? k <= 0 : f.op === '>' ? k > 0 : k >= 0
      }
      case 'not':
        return !formula(f.f, env, w, i)
      case 'and':
        return formula(f.l, env, w, i) && formula(f.r, env, w, i)
      case 'or':
        return formula(f.l, env, w, i) || formula(f.r, env, w, i)
      case 'imp':
        return !formula(f.l, env, w, i) || formula(f.r, env, w, i)
      case 'iff':
        return formula(f.l, env, w, i) === formula(f.r, env, w, i)
      case 'nec':
        return W.every((v) => formula(f.f, env, v, i))
      case 'pos':
        return W.some((v) => formula(f.f, env, v, i))
      case 'crenca':
        return W.every((v) => !acessos.get(f.agente)!.has(`${w}|${v}`) || formula(f.f, env, v, i))
      case 'forall':
      case 'exists': {
        if (f.dom) {
          // só chega aqui um ∃ de polaridade positiva (os outros foram recusados antes): vale na testemunha
          return formula(f.corpo, new Map([...env, [f.v, testemunhas.get(`${i}|${f.v}`)!]]), w, i)
        }
        const corpo = (x: string) => formula(f.corpo, new Map([...env, [f.v, x]]), w, i)
        return f.k === 'forall' ? O.every(corpo) : O.some(corpo)
      }
    }
  }
  const falhas: string[] = []
  fs.forEach((f, i) => {
    if (!formula(f, new Map(), mundoReal, i)) falhas.push(`a fórmula ${i + 1} é falsa no mundo real`)
  })
  return falhas
}
