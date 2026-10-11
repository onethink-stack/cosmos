// Dados do mundo: tabelas em que cada linha é um objeto (com propriedades e
// relações) ou um caso medido (com valores numéricos). Leis e teses são
// testadas por avaliação direta: a tabela já é um cenário — o real, até
// onde foi observado. Sem o motor de cenários (que buscaria um cenário
// qualquer); aqui o cenário é dado.
//
// Lógica de três valores: o que não foi observado (célula vazia, coluna que
// não existe) fica desconhecido, nunca falso.
//
// Também a indução: leis gerais que os dados apoiam sem nenhum contraexemplo
// (com quantos objetos ou casos as apoiam). São hipóteses (grau M): os dados
// observados não garantem os que faltam observar.

import type { Formula, Termo } from '../logica/ast'

export type TipoColuna = 'nome' | 'booleano' | 'categoria' | 'objeto' | 'numero' | 'ignorar'

export interface ColunaDados {
  /** cabeçalho como veio na tabela */
  titulo: string
  tipo: TipoColuna
  /** booleano: predicado P(x) · objeto: relação R(x, y) · numero: constante numérica (o valor de cada caso) */
  simbolo: string
  /** categoria: valor → predicado (Planeta(x), Estrela(x)…) */
  valores?: Record<string, string>
}

export interface ConjuntoDados {
  id: string
  nome: string
  /** de onde veio: arquivo, endereço, consulta */
  fonte: string
  /** pasta (tag) das leis induzidas destes dados */
  pasta: string
  criadoEm: string
  /** tolerância relativa nas comparações de números (medições têm erro): 0,02 = 2% */
  tolerancia: number
  colunas: ColunaDados[]
  /** células como texto (null = não observado) */
  linhas: (string | null)[][]
}

/** 1 verdadeiro · 0 desconhecido · −1 falso */
export type V3 = 1 | 0 | -1

// ------------------------------------------------------------------ valores

const BOOL_V = new Set(['sim', 's', 'verdadeiro', 'v', 'true', 't', 'yes', 'y', 'x', '✓', '1'])
const BOOL_F = new Set(['não', 'nao', 'n', 'falso', 'f', 'false', 'no', '✗', '0'])

/** "sim"/"não" e parecidos → true/false; o resto → null */
export function lerBooleano(s: string | null): boolean | null {
  if (s === null) return null
  const t = s.trim().toLowerCase()
  if (BOOL_V.has(t)) return true
  if (BOOL_F.has(t)) return false
  return null
}

/** "1,5" ou "1.5" ou "6,674e-11" → número; o resto → null */
export function lerNumero(s: string | null): number | null {
  if (s === null) return null
  let t = s.trim().replace(/\s/g, '').replace('−', '-')
  if (!t) return null
  // "1.234,5" (milhar com ponto, decimal com vírgula) e "1,234.5"
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '')
  else t = t.replace(',', '.')
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null
  const x = Number(t)
  return Number.isFinite(x) ? x : null
}

/** Separa os valores de uma célula com vários (Wikidata: "Sol | Júpiter"). */
export const valoresDaCelula = (s: string) =>
  s
    .split(/\s*[|;]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Número em texto decimal, sem expoente (a linguagem não tem 1e-11): 4 algarismos significativos. */
export function numeroTexto(x: number, significativos = 4): string {
  if (x === 0 || !Number.isFinite(x)) return '0'
  // os algarismos e o expoente, e a vírgula posta à mão (toFixed escreve 1e+21 para os grandes)
  const [mantissa, e] = Math.abs(x).toExponential(significativos - 1).split('e')
  const digitos = mantissa.replace('.', '')
  const antes = Number(e) + 1 // algarismos antes do ponto
  let t =
    antes <= 0
      ? `0.${'0'.repeat(-antes)}${digitos}`
      : antes >= digitos.length
        ? digitos + '0'.repeat(antes - digitos.length)
        : `${digitos.slice(0, antes)}.${digitos.slice(antes)}`
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '')
  return (x < 0 ? '−' : '') + t
}

// ------------------------------------------------------------ mundo de objetos

export interface MundoObjetos {
  /** nomes dos objetos (as constantes) */
  objetos: string[]
  indice: Map<string, number>
  /** "P(0)", "R(0,3)" → valor observado; ausente = desconhecido */
  atomos: Map<string, boolean>
  /** predicados que os dados cobrem → aridade */
  predicados: Map<string, number>
}

const chaveAtomo = (p: string, args: number[]) => `${p}(${args.join(',')})`

/** O cenário observado: os objetos (linhas e os citados nelas) e o que se sabe deles. */
export function mundoDeObjetos(c: ConjuntoDados): MundoObjetos {
  const iNome = c.colunas.findIndex((x) => x.tipo === 'nome')
  const objetos: string[] = []
  const indice = new Map<string, number>()
  const objeto = (nome: string) => {
    let i = indice.get(nome)
    if (i === undefined) {
      i = objetos.length
      objetos.push(nome)
      indice.set(nome, i)
    }
    return i
  }
  const linhaObj = c.linhas.map((l, k) => objeto((iNome >= 0 && l[iNome]?.trim()) || `linha${k + 1}`))
  // objetos citados em colunas de relação também fazem parte do cenário
  c.colunas.forEach((col, j) => {
    if (col.tipo === 'objeto') for (const l of c.linhas) if (l[j]) for (const v of valoresDaCelula(l[j]!)) objeto(v)
  })
  const atomos = new Map<string, boolean>()
  const predicados = new Map<string, number>()
  c.colunas.forEach((col, j) => {
    if (col.tipo === 'booleano') {
      predicados.set(col.simbolo, 1)
      c.linhas.forEach((l, k) => {
        const b = lerBooleano(l[j])
        if (b !== null) atomos.set(chaveAtomo(col.simbolo, [linhaObj[k]]), b)
      })
    } else if (col.tipo === 'categoria' && col.valores) {
      const vals = Object.entries(col.valores)
      for (const [, p] of vals) predicados.set(p, 1)
      c.linhas.forEach((l, k) => {
        const v = l[j]?.trim()
        if (!v) return
        for (const [valor, p] of vals) atomos.set(chaveAtomo(p, [linhaObj[k]]), valor === v)
      })
    } else if (col.tipo === 'objeto') {
      predicados.set(col.simbolo, 2)
      c.linhas.forEach((l, k) => {
        if (!l[j]) return
        const alvos = new Set(valoresDaCelula(l[j]!).map((v) => indice.get(v)!))
        // célula preenchida: os citados estão relacionados, os outros não
        for (let o = 0; o < objetos.length; o++) atomos.set(chaveAtomo(col.simbolo, [linhaObj[k], o]), alvos.has(o))
      })
    }
  })
  return { objetos, indice, atomos, predicados }
}

type Env = Map<string, number>

const e3 = (a: V3, b: V3): V3 => (Math.min(a, b) as V3)
const ou3 = (a: V3, b: V3): V3 => (Math.max(a, b) as V3)
const nao3 = (a: V3): V3 => (-a as V3)

function objetoDe(t: Termo, m: MundoObjetos, env: Env): number | undefined {
  if (t.k === 'nome') return env.has(t.nome) ? env.get(t.nome) : m.indice.get(t.nome)
  return undefined
}

/** Valor da fórmula no cenário observado (três valores). */
export function avaliarNosObjetos(f: Formula, m: MundoObjetos, env: Env = new Map()): V3 {
  switch (f.k) {
    case 'const':
      return f.valor ? 1 : -1
    case 'pred': {
      if (m.predicados.get(f.nome) !== f.args.length) return 0
      const args = f.args.map((a) => objetoDe(a, m, env))
      if (args.some((a) => a === undefined)) return 0
      const v = m.atomos.get(chaveAtomo(f.nome, args as number[]))
      return v === undefined ? 0 : v ? 1 : -1
    }
    case 'rel': {
      if (f.op !== '=' && f.op !== '≠') return 0
      const a = objetoDe(f.l, m, env)
      const b = objetoDe(f.r, m, env)
      if (a === undefined || b === undefined) return 0
      return (a === b) === (f.op === '=') ? 1 : -1
    }
    case 'not':
      return nao3(avaliarNosObjetos(f.f, m, env))
    case 'and':
      return e3(avaliarNosObjetos(f.l, m, env), avaliarNosObjetos(f.r, m, env))
    case 'or':
      return ou3(avaliarNosObjetos(f.l, m, env), avaliarNosObjetos(f.r, m, env))
    case 'imp':
      return ou3(nao3(avaliarNosObjetos(f.l, m, env)), avaliarNosObjetos(f.r, m, env))
    case 'iff': {
      const a = avaliarNosObjetos(f.l, m, env)
      const b = avaliarNosObjetos(f.r, m, env)
      return a === 0 || b === 0 ? 0 : a === b ? 1 : -1
    }
    case 'forall':
    case 'exists': {
      if (f.dom) return 0
      let r: V3 = f.k === 'forall' ? 1 : -1
      for (let d = 0; d < m.objetos.length; d++) {
        const v = avaliarNosObjetos(f.corpo, m, new Map(env).set(f.v, d))
        r = f.k === 'forall' ? e3(r, v) : ou3(r, v)
        if ((f.k === 'forall' && r === -1) || (f.k === 'exists' && r === 1)) break
      }
      return r
    }
    default:
      return 0
  }
}

// --------------------------------------------------------- casos numéricos

/** Cada linha como um caso: símbolo numérico → valor medido. */
export function casosNumericos(c: ConjuntoDados): Map<string, number>[] {
  const nums = c.colunas.map((col, j) => [col, j] as const).filter(([col]) => col.tipo === 'numero')
  return c.linhas.map((l) => {
    const m = new Map<string, number>()
    for (const [col, j] of nums) {
      const x = lerNumero(l[j])
      if (x !== null) m.set(col.simbolo, x)
    }
    return m
  })
}

function valorNumerico(t: Termo, caso: Map<string, number>): number | undefined {
  switch (t.k) {
    case 'num':
      return Number(t.valor)
    case 'nome':
      return caso.get(t.nome)
    case 'neg': {
      const x = valorNumerico(t.t, caso)
      return x === undefined ? undefined : -x
    }
    case 'arit': {
      const a = valorNumerico(t.l, caso)
      const b = valorNumerico(t.r, caso)
      if (a === undefined || b === undefined) return undefined
      switch (t.op) {
        case '+':
          return a + b
        case '−':
          return a - b
        case '·':
          return a * b
        case '/':
          return b === 0 ? undefined : a / b
        case '^':
          return a ** b
      }
      return undefined
    }
    default:
      return undefined
  }
}

/** a = b dentro da tolerância relativa (medições têm erro) */
export const quaseIgual = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b)) || Math.abs(a - b) < 1e-12

/** Valor da fórmula num caso medido (três valores; números com tolerância). */
export function avaliarNoCaso(f: Formula, caso: Map<string, number>, tol: number): V3 {
  switch (f.k) {
    case 'const':
      return f.valor ? 1 : -1
    case 'rel': {
      const a = valorNumerico(f.l, caso)
      const b = valorNumerico(f.r, caso)
      if (a === undefined || b === undefined) return 0
      const igual = quaseIgual(a, b, tol)
      switch (f.op) {
        case '=':
          return igual ? 1 : -1
        case '≠':
          return igual ? -1 : 1
        case '≤':
          return igual || a < b ? 1 : -1
        case '≥':
          return igual || a > b ? 1 : -1
        case '<':
          return igual ? 0 : a < b ? 1 : -1
        case '>':
          return igual ? 0 : a > b ? 1 : -1
        default:
          return 0
      }
    }
    case 'not':
      return nao3(avaliarNoCaso(f.f, caso, tol))
    case 'and':
      return e3(avaliarNoCaso(f.l, caso, tol), avaliarNoCaso(f.r, caso, tol))
    case 'or':
      return ou3(avaliarNoCaso(f.l, caso, tol), avaliarNoCaso(f.r, caso, tol))
    case 'imp':
      return ou3(nao3(avaliarNoCaso(f.l, caso, tol)), avaliarNoCaso(f.r, caso, tol))
    case 'iff': {
      const a = avaliarNoCaso(f.l, caso, tol)
      const b = avaliarNoCaso(f.r, caso, tol)
      return a === 0 || b === 0 ? 0 : a === b ? 1 : -1
    }
    default:
      return 0
  }
}

// ------------------------------------------------------------------- testar

/** O que os dados dizem de uma fórmula. */
export type VereditoDados =
  /** vale em todos os objetos/casos em que se pôde conferir */
  | { tipo: 'vale'; conjunto: string; conferidos: number; desconhecidos: number; total: number; modo: 'objetos' | 'casos' }
  /** falha: os objetos ou casos (linhas) que contradizem */
  | { tipo: 'falha'; conjunto: string; contra: string[]; conferidos: number; modo: 'objetos' | 'casos' }
  /** os dados não decidem (falta observar) */
  | { tipo: 'incerto'; conjunto: string; modo: 'objetos' | 'casos' }

/** Nomes usados numa fórmula (predicados com aridade; constantes). */
function vocabulario(f: Formula, ligadas = new Set<string>(), out = { preds: new Map<string, number>(), nomes: new Set<string>(), arit: false }) {
  const termo = (t: Termo) => {
    switch (t.k) {
      case 'nome':
        if (!ligadas.has(t.nome)) out.nomes.add(t.nome)
        break
      case 'app':
        out.nomes.add(`${t.fn}()`)
        t.args.forEach(termo)
        break
      case 'arit':
        out.arit = true
        termo(t.l)
        termo(t.r)
        break
      case 'neg':
        out.arit = true
        termo(t.t)
        break
      case 'num':
        out.arit = true
        break
      case 'inter':
      case 'uniao':
        termo(t.l)
        termo(t.r)
        break
    }
  }
  switch (f.k) {
    case 'pred':
      out.preds.set(f.nome, f.args.length)
      f.args.forEach(termo)
      break
    case 'rel':
      if (['<', '≤', '>', '≥'].includes(f.op)) out.arit = true
      termo(f.l)
      termo(f.r)
      break
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      vocabulario(f.f, ligadas, out)
      break
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      vocabulario(f.l, ligadas, out)
      vocabulario(f.r, ligadas, out)
      break
    case 'forall':
    case 'exists':
      vocabulario(f.corpo, new Set(ligadas).add(f.v), out)
      break
  }
  return out
}

/**
 * Testa a fórmula (já sem açúcar) num conjunto de dados. null: a fórmula não
 * fala do que estes dados observam.
 */
export function testarNosDados(f: Formula, c: ConjuntoDados): VereditoDados | null {
  const voc = vocabulario(f)
  const numericas = new Set(c.colunas.filter((x) => x.tipo === 'numero').map((x) => x.simbolo))
  // casos numéricos: só constantes numéricas das colunas, sem predicados
  if (!voc.preds.size && voc.nomes.size && [...voc.nomes].every((n) => numericas.has(n))) {
    const casos = casosNumericos(c)
    const contra: string[] = []
    let conferidos = 0
    casos.forEach((caso, k) => {
      const v = avaliarNoCaso(f, caso, c.tolerancia)
      if (v === 0) return
      conferidos++
      if (v === -1) contra.push(`linha ${k + 1}`)
    })
    if (contra.length) return { tipo: 'falha', conjunto: c.id, contra, conferidos, modo: 'casos' }
    if (!conferidos) return { tipo: 'incerto', conjunto: c.id, modo: 'casos' }
    return { tipo: 'vale', conjunto: c.id, conferidos, desconhecidos: casos.length - conferidos, total: casos.length, modo: 'casos' }
  }
  // cenário de objetos: os predicados têm de ser os das colunas, e as constantes, objetos da tabela
  if (voc.arit || (!voc.preds.size && !voc.nomes.size)) return null
  const m = mundoDeObjetos(c)
  if (![...voc.preds].every(([p, ar]) => m.predicados.get(p) === ar)) return null
  if (![...voc.nomes].every((n) => m.indice.has(n))) return null
  // um "para todo" no topo: confere objeto por objeto (para contar e apontar os contraexemplos)
  if (f.k === 'forall' && !f.dom) {
    const contra: string[] = []
    let conferidos = 0
    for (let d = 0; d < m.objetos.length; d++) {
      const v = avaliarNosObjetos(f.corpo, m, new Map([[f.v, d]]))
      if (v === 0) continue
      conferidos++
      if (v === -1) contra.push(m.objetos[d])
    }
    if (contra.length) return { tipo: 'falha', conjunto: c.id, contra, conferidos, modo: 'objetos' }
    if (!conferidos) return { tipo: 'incerto', conjunto: c.id, modo: 'objetos' }
    return { tipo: 'vale', conjunto: c.id, conferidos, desconhecidos: m.objetos.length - conferidos, total: m.objetos.length, modo: 'objetos' }
  }
  const v = avaliarNosObjetos(f, m)
  if (v === 0) return { tipo: 'incerto', conjunto: c.id, modo: 'objetos' }
  return v === 1
    ? { tipo: 'vale', conjunto: c.id, conferidos: 1, desconhecidos: 0, total: 1, modo: 'objetos' }
    : { tipo: 'falha', conjunto: c.id, contra: ['o cenário observado'], conferidos: 1, modo: 'objetos' }
}

// ------------------------------------------------------------------ indução

export interface LeiInduzida {
  formula: string
  /** leitura em português */
  leitura: string
  /** objetos/casos em que a lei foi posta à prova (a hipótese aplicou) e valeu */
  apoio: number
  /** objetos/casos do conjunto */
  total: number
  conjunto: string
}

/** mínimo de objetos ou casos que precisam apoiar uma lei para ela ser proposta */
export const APOIO_MINIMO = 3

/**
 * Leis gerais que o cenário observado apoia sem nenhum contraexemplo.
 * `vars`: nomes de variáveis livres (que não colidem com o dicionário).
 */
export function induzirObjetos(c: ConjuntoDados, vars: [string, string, string], maximo = 40): LeiInduzida[] {
  const m = mundoDeObjetos(c)
  const [x, y, z] = vars
  const n = m.objetos.length
  const val = (p: string, args: number[]): V3 => {
    const v = m.atomos.get(chaveAtomo(p, args))
    return v === undefined ? 0 : v ? 1 : -1
  }
  // de que coluna vem cada predicado (os de uma mesma categoria se excluem por construção)
  const coluna = new Map<string, number>()
  const leitura = new Map<string, string>()
  c.colunas.forEach((col, j) => {
    if (col.tipo === 'booleano') {
      coluna.set(col.simbolo, j)
      leitura.set(col.simbolo, col.titulo)
    }
    if (col.tipo === 'categoria' && col.valores)
      for (const [v, p] of Object.entries(col.valores)) {
        coluna.set(p, j)
        leitura.set(p, `${col.titulo} = ${v}`)
      }
    if (col.tipo === 'objeto') leitura.set(col.simbolo, col.titulo)
  })
  const unarios = [...m.predicados].filter(([, a]) => a === 1).map(([p]) => p)
  const binarios = [...m.predicados].filter(([, a]) => a === 2).map(([p]) => p)
  const leis: LeiInduzida[] = []
  const lei = (formula: string, ler: string, apoio: number) => {
    if (apoio >= APOIO_MINIMO) leis.push({ formula, leitura: ler, apoio, total: n, conjunto: c.id })
  }
  const L = (p: string) => `“${leitura.get(p) ?? p}”`

  // P ⟹ Q e P ⟹ ¬Q
  const implica = new Set<string>()
  for (const p of unarios)
    for (const q of unarios) {
      if (p === q || coluna.get(p) === coluna.get(q)) continue
      let apoio = 0
      let contraSim = 0
      let contraNao = 0
      for (let d = 0; d < n; d++) {
        if (val(p, [d]) !== 1) continue
        const v = val(q, [d])
        if (v === 0) continue
        apoio++
        if (v === -1) contraSim++
        else contraNao++
      }
      if (!contraSim) {
        implica.add(`${p}>${q}`)
        lei(`∀${x} (${p}(${x}) ⟹ ${q}(${x}))`, `todo objeto com ${L(p)} tem ${L(q)}`, apoio)
      }
      if (!contraNao && p < q) lei(`∀${x} (${p}(${x}) ⟹ ¬${q}(${x}))`, `nenhum objeto com ${L(p)} tem ${L(q)}`, apoio)
    }
  // P ∧ Q ⟹ R (quando nem P nem Q sozinhos bastam)
  for (let i = 0; i < unarios.length; i++)
    for (let j = i + 1; j < unarios.length; j++) {
      const p = unarios[i]
      const q = unarios[j]
      if (coluna.get(p) === coluna.get(q)) continue
      for (const r of unarios) {
        if (r === p || r === q || implica.has(`${p}>${r}`) || implica.has(`${q}>${r}`)) continue
        if (coluna.get(r) === coluna.get(p) || coluna.get(r) === coluna.get(q)) continue
        let apoio = 0
        let contra = 0
        for (let d = 0; d < n && !contra; d++) {
          if (val(p, [d]) !== 1 || val(q, [d]) !== 1) continue
          const v = val(r, [d])
          if (v === 0) continue
          apoio++
          if (v === -1) contra++
        }
        if (!contra) lei(`∀${x} (${p}(${x}) ∧ ${q}(${x}) ⟹ ${r}(${x}))`, `todo objeto com ${L(p)} e ${L(q)} tem ${L(r)}`, apoio)
      }
    }
  // relações: de quem saem, para quem vão, função, irreflexiva, assimétrica, transitiva
  for (const rel of binarios) {
    const pares: [number, number][] = []
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (val(rel, [a, b]) === 1) pares.push([a, b])
    if (pares.length < APOIO_MINIMO) continue
    for (const p of unarios) {
      if (pares.every(([a]) => val(p, [a]) !== -1)) {
        const apoio = pares.filter(([a]) => val(p, [a]) === 1).length
        lei(`∀${x} ∀${y} (${rel}(${x}, ${y}) ⟹ ${p}(${x}))`, `quem tem ${L(rel)} com algo tem ${L(p)}`, apoio)
      }
      if (pares.every(([, b]) => val(p, [b]) !== -1)) {
        const apoio = pares.filter(([, b]) => val(p, [b]) === 1).length
        lei(`∀${x} ∀${y} (${rel}(${x}, ${y}) ⟹ ${p}(${y}))`, `o que é alvo de ${L(rel)} tem ${L(p)}`, apoio)
      }
    }
    const porOrigem = new Map<number, number[]>()
    for (const [a, b] of pares) porOrigem.set(a, [...(porOrigem.get(a) ?? []), b])
    if ([...porOrigem.values()].every((bs) => bs.length === 1))
      lei(`∀${x} ∀${y} ∀${z} (${rel}(${x}, ${y}) ∧ ${rel}(${x}, ${z}) ⟹ ${y} = ${z})`, `cada objeto tem ${L(rel)} com no máximo um`, porOrigem.size)
    if (pares.every(([a, b]) => a !== b)) lei(`∀${x} ¬${rel}(${x}, ${x})`, `nada tem ${L(rel)} consigo mesmo`, pares.length)
    if (pares.every(([a, b]) => val(rel, [b, a]) !== 1))
      lei(`∀${x} ∀${y} (${rel}(${x}, ${y}) ⟹ ¬${rel}(${y}, ${x}))`, `${L(rel)} nunca vale nos dois sentidos`, pares.length)
    const cadeias = pares.flatMap(([a, b]) => pares.filter(([b2]) => b2 === b).map(([, c2]) => [a, c2] as const))
    if (cadeias.length >= APOIO_MINIMO && cadeias.every(([a, c2]) => val(rel, [a, c2]) !== -1))
      lei(`∀${x} ∀${y} ∀${z} (${rel}(${x}, ${y}) ∧ ${rel}(${y}, ${z}) ⟹ ${rel}(${x}, ${z}))`, `${L(rel)} é transitiva`, cadeias.length)
  }
  return leis.sort((a, b) => b.apoio - a.apoio).slice(0, maximo)
}

/**
 * Relações entre as grandezas medidas que valem em todos os casos (dentro da
 * tolerância): sinal, ordem, igualdade, proporção, soma e produto.
 */
export function induzirCasos(c: ConjuntoDados, maximo = 40): LeiInduzida[] {
  const casos = casosNumericos(c)
  const cols = c.colunas.filter((x) => x.tipo === 'numero')
  const tol = c.tolerancia
  const leis: LeiInduzida[] = []
  const nome = new Map(cols.map((x) => [x.simbolo, x.titulo]))
  const L = (s: string) => `“${nome.get(s) ?? s}”`
  /** casos com todos os valores; a lei vale em todos? quantos apoiam */
  const todos = (ss: string[], ok: (v: number[]) => boolean): number | null => {
    let apoio = 0
    for (const caso of casos) {
      const v = ss.map((s) => caso.get(s))
      if (v.some((x) => x === undefined)) continue
      if (!ok(v as number[])) return null
      apoio++
    }
    return apoio >= APOIO_MINIMO ? apoio : null
  }
  const lei = (formula: string, leitura: string, apoio: number | null) => {
    if (apoio !== null) leis.push({ formula, leitura, apoio, total: casos.length, conjunto: c.id })
  }
  const S = cols.map((x) => x.simbolo)
  // comparar, igualar e somar só faz sentido entre medidas da mesma grandeza; sem unidades, o
  // sinal disso é o nome começar igual (vi, vj, vi2; mi, mj). Proporção e produto valem entre quaisquer.
  const mesmaGrandeza = (a: string, b: string) => a[0].toLowerCase() === b[0].toLowerCase()
  for (const a of S) {
    const pos = todos([a], ([v]) => v > 0)
    if (pos) lei(`${a} > 0`, `${L(a)} é sempre positivo`, pos)
    else {
      const neg = todos([a], ([v]) => v < 0)
      if (neg) lei(`${a} < 0`, `${L(a)} é sempre negativo`, neg)
      else {
        const naoNeg = todos([a], ([v]) => v >= 0)
        if (naoNeg) lei(`${a} ≥ 0`, `${L(a)} nunca é negativo`, naoNeg)
      }
    }
  }
  for (let i = 0; i < S.length; i++)
    for (let j = 0; j < S.length; j++) {
      if (i === j) continue
      const a = S[i]
      const b = S[j]
      if (i < j) {
        const igual = mesmaGrandeza(a, b) ? todos([a, b], ([u, v]) => quaseIgual(u, v, tol)) : null
        if (igual) {
          lei(`${a} = ${b}`, `${L(a)} é igual a ${L(b)}`, igual)
          continue
        }
        // proporção constante
        let razao: number | null = null
        const prop = todos([a, b], ([u, v]) => {
          if (v === 0) return quaseIgual(u, 0, tol)
          const r = u / v
          if (razao === null) razao = r
          return quaseIgual(r, razao, tol)
        })
        if (prop && razao !== null && !quaseIgual(razao, 1, tol) && !quaseIgual(razao, 0, tol)) {
          // escrita com o coeficiente maior que 1 (d = 2 · a, não a = 0.5 · d)
          const [maior, menorS, k] = Math.abs(razao) >= 1 ? [a, b, razao] : [b, a, 1 / razao]
          lei(`${maior} = ${numeroTexto(k)} · ${menorS}`, `${L(maior)} é ${numeroTexto(k)} vezes ${L(menorS)}`, prop)
        }
      }
      const menor = mesmaGrandeza(a, b) ? todos([a, b], ([u, v]) => u < v && !quaseIgual(u, v, tol)) : null
      if (menor) lei(`${a} < ${b}`, `${L(a)} é sempre menor que ${L(b)}`, menor)
    }
  // soma e produto: a + b = c, a · b = c
  for (let i = 0; i < S.length; i++)
    for (let j = i; j < S.length; j++)
      for (const k of S) {
        const a = S[i]
        const b = S[j]
        if (k === a || k === b) continue
        const soma = mesmaGrandeza(a, b) && mesmaGrandeza(a, k) ? todos([a, b, k], ([u, v, w]) => quaseIgual(u + v, w, tol)) : null
        if (soma) lei(`${a} + ${b} = ${k}`, `${L(a)} + ${L(b)} dá ${L(k)}`, soma)
        const prod = todos([a, b, k], ([u, v, w]) => quaseIgual(u * v, w, tol))
        if (prod) lei(`${a} · ${b} = ${k}`, `${L(a)} vezes ${L(b)} dá ${L(k)}`, prod)
      }
  return leis.sort((a, b) => b.apoio - a.apoio).slice(0, maximo)
}
