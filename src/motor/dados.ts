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
  /** "P(0)" → valor observado (colunas de sim/não e de categoria); ausente = desconhecido */
  atomos: Map<string, boolean>
  /**
   * Colunas de relação: objeto da linha → os citados na célula. Célula
   * preenchida: os citados estão relacionados, os outros não; sem célula,
   * desconhecido. Só os pares verdadeiros: guardar também os falsos eram
   * linhas × objetos entradas (milhões numa tabela grande).
   */
  relacoes: Map<string, Map<number, Set<number>>>
  /** predicados que os dados cobrem → aridade */
  predicados: Map<string, number>
}

const chaveAtomo = (p: string, args: number[]) => `${p}(${args.join(',')})`

/** O que o cenário observado diz de P(args): 1, −1, ou 0 (não observado). */
export function valorObservado(m: MundoObjetos, p: string, args: number[]): V3 {
  if (args.length === 2) {
    const alvos = m.relacoes.get(p)?.get(args[0])
    return alvos === undefined ? 0 : alvos.has(args[1]) ? 1 : -1
  }
  const v = m.atomos.get(chaveAtomo(p, args))
  return v === undefined ? 0 : v ? 1 : -1
}

/**
 * Os cenários já montados, por conjunto. Um conjunto não muda depois de
 * criado (editar troca o objeto inteiro); montar o cenário de uma tabela
 * grande para cada lei conferida parava a tela por segundos.
 */
const cenarios = new WeakMap<ConjuntoDados, MundoObjetos>()
const casosGuardados = new WeakMap<ConjuntoDados, Map<string, number>[]>()

/** Predicado → aridade, direto das colunas (sem montar o cenário). */
function predicadosDasColunas(c: ConjuntoDados): Map<string, number> {
  const ps = new Map<string, number>()
  for (const col of c.colunas) {
    if (col.tipo === 'booleano') ps.set(col.simbolo, 1)
    else if (col.tipo === 'categoria' && col.valores) for (const p of Object.values(col.valores)) ps.set(p, 1)
    else if (col.tipo === 'objeto') ps.set(col.simbolo, 2)
  }
  return ps
}

/** O cenário observado: os objetos (linhas e os citados nelas) e o que se sabe deles (montado uma vez por conjunto). */
export function mundoDeObjetos(c: ConjuntoDados): MundoObjetos {
  let m = cenarios.get(c)
  if (!m) cenarios.set(c, (m = montarCenario(c)))
  return m
}

function montarCenario(c: ConjuntoDados): MundoObjetos {
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
  const relacoes = new Map<string, Map<number, Set<number>>>()
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
      const rel = relacoes.get(col.simbolo) ?? new Map<number, Set<number>>()
      relacoes.set(col.simbolo, rel)
      // célula preenchida: os citados estão relacionados, os outros não
      c.linhas.forEach((l, k) => {
        if (l[j]) rel.set(linhaObj[k], new Set(valoresDaCelula(l[j]!).map((v) => indice.get(v)!)))
      })
    }
  })
  return { objetos, indice, atomos, relacoes, predicados }
}

type Env = Map<string, number>

const e3 = (a: V3, b: V3): V3 => (Math.min(a, b) as V3)
const ou3 = (a: V3, b: V3): V3 => (Math.max(a, b) as V3)
const nao3 = (a: V3): V3 => (-a as V3)

function objetoDe(t: Termo, m: MundoObjetos, env: Env): number | undefined {
  if (t.k === 'nome') return env.has(t.nome) ? env.get(t.nome) : m.indice.get(t.nome)
  return undefined
}

/**
 * Teto de passos para conferir uma fórmula nos dados. Uma lei com três
 * "para todo" numa tabela de n objetos podia passar por n³ combinações
 * (175 milhões com 560 objetos: minutos parado); acima do teto, os dados
 * "não decidem" (nunca um palpite).
 */
export const MAX_PASSOS_DADOS = 3_000_000

class GrandeDemais extends Error {}

interface Orcamento {
  passos: number
}

const gastar = (orc: Orcamento, k: number) => {
  orc.passos += k
  if (orc.passos > MAX_PASSOS_DADOS) throw new GrandeDemais()
}

/** O que se calcula uma vez por cenário para escolher os objetos que importam. */
interface Indices {
  /** predicado unário → objetos em que ele NÃO dá 1 / NÃO dá −1 */
  naoDa: Map<string, number[]>
  relacoes: Map<
    string,
    {
      /** linha → os citados nela, em ordem */
      alvos: Map<number, number[]>
      /** objeto → as linhas que o citam, em ordem */
      citadoPor: Map<number, number[]>
      /** objetos sem a célula preenchida (não se sabe com quem se relacionam) */
      semLinha: number[]
      /** linhas que citam alguém, e os sem célula */
      comAlvosOuSemLinha: number[]
      /** todos os citados */
      citados: number[]
      /** objeto → as linhas que o citam, e os sem célula (feito quando pedido) */
      podemCitar: Map<number, number[]>
    }
  >
}
const indices = new WeakMap<MundoObjetos, Indices>()

function indicesDe(m: MundoObjetos): Indices {
  let ix = indices.get(m)
  if (!ix) indices.set(m, (ix = { naoDa: new Map(), relacoes: new Map() }))
  return ix
}

const ordenado = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b)

function relacaoIndexada(m: MundoObjetos, p: string) {
  const ix = indicesDe(m)
  let r = ix.relacoes.get(p)
  if (!r) {
    const rel = m.relacoes.get(p) ?? new Map<number, Set<number>>()
    const alvos = new Map<number, number[]>()
    const citadoPor = new Map<number, number[]>()
    for (const [a, bs] of rel) {
      alvos.set(a, ordenado(bs))
      for (const b of bs) {
        const l = citadoPor.get(b)
        if (l) l.push(a)
        else citadoPor.set(b, [a])
      }
    }
    for (const [b, l] of citadoPor) citadoPor.set(b, ordenado(l))
    const semLinha: number[] = []
    for (let d = 0; d < m.objetos.length; d++) if (!rel.has(d)) semLinha.push(d)
    const comAlvos = [...rel].filter(([, bs]) => bs.size > 0).map(([a]) => a)
    r = { alvos, citadoPor, semLinha, comAlvosOuSemLinha: ordenado([...comAlvos, ...semLinha]), citados: ordenado(citadoPor.keys()), podemCitar: new Map() }
    ix.relacoes.set(p, r)
  }
  return r
}

/** objetos em que o predicado unário p NÃO dá `alvo` */
function ondeUnarioNaoDa(m: MundoObjetos, p: string, alvo: 1 | -1): number[] {
  const ix = indicesDe(m)
  const chave = `${p} ${alvo}`
  let l = ix.naoDa.get(chave)
  if (!l) {
    l = []
    for (let d = 0; d < m.objetos.length; d++) if (valorObservado(m, p, [d]) !== alvo) l.push(d)
    ix.naoDa.set(chave, l)
  }
  return l
}

/** união e interseção de listas em ordem (null = todos os objetos) */
function uniao(a: number[] | null, b: number[] | null, orc: Orcamento): number[] | null {
  if (!a || !b) return null
  if (!a.length) return b
  if (!b.length) return a
  gastar(orc, a.length + b.length)
  const r: number[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) r.push(a[i++])
    else if (i >= a.length || b[j] < a[i]) r.push(b[j++])
    else {
      r.push(a[i++])
      j++
    }
  }
  return r
}

/** a posição de x na lista em ordem (ou −1) */
function buscar(xs: number[], x: number): number {
  let i = 0
  let j = xs.length - 1
  while (i <= j) {
    const k = (i + j) >> 1
    if (xs[k] === x) return k
    if (xs[k] < x) i = k + 1
    else j = k - 1
  }
  return -1
}

function intersecao(a: number[] | null, b: number[] | null, orc: Orcamento): number[] | null {
  if (!a) return b
  if (!b) return a
  if (!a.length || !b.length) return []
  // uma pequena e outra grande (os citados por um objeto e quase todos): busca na grande
  if (a.length > b.length) [a, b] = [b, a]
  if (a.length * 16 < b.length) {
    gastar(orc, a.length)
    return a.filter((x) => buscar(b, x) >= 0)
  }
  gastar(orc, a.length + b.length)
  const r: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] < b[j]) i++
    else if (b[j] < a[i]) j++
    else {
      r.push(a[i++])
      j++
    }
  }
  return r
}

/** um argumento de um átomo: a variável do quantificador, uma de dentro (sem valor ainda), um objeto, ou nada conhecido */
type Arg = { k: 'v' } | { k: 'livre' } | { k: 'obj'; o: number } | { k: 'nada' }

function classificar(t: Termo, v: string, livres: Set<string>, m: MundoObjetos, env: Env): Arg {
  if (t.k !== 'nome') return { k: 'nada' }
  if (t.nome === v) return { k: 'v' }
  if (livres.has(t.nome)) return { k: 'livre' }
  const o = objetoDe(t, m, env)
  return o === undefined ? { k: 'nada' } : { k: 'obj', o }
}

/**
 * Os objetos d em que a fórmula, com v = d, pode NÃO dar `alvo` (1 ou −1):
 * em todos os outros ela dá `alvo` com certeza — assim um "para todo" só
 * percorre esses (fora deles a fórmula vale). null: podem ser todos.
 * `livres`: variáveis de quantificadores de dentro (valem para qualquer valor delas).
 */
function ondePodeNaoDar(f: Formula, alvo: 1 | -1, v: string, m: MundoObjetos, env: Env, livres: Set<string>, orc: Orcamento): number[] | null {
  switch (f.k) {
    case 'const':
      return (f.valor ? 1 : -1) === alvo ? [] : null
    case 'pred': {
      if (m.predicados.get(f.nome) !== f.args.length) return null
      const args = f.args.map((t) => classificar(t, v, livres, m, env))
      if (args.some((a) => a.k === 'nada')) return null
      // sem a variável: o mesmo valor para todo d
      if (args.every((a) => a.k === 'obj')) return valorObservado(m, f.nome, args.map((a) => (a as { o: number }).o)) === alvo ? [] : null
      if (args.length === 1) return args[0].k === 'v' ? ondeUnarioNaoDa(m, f.nome, alvo) : null
      // relação: fora dos objetos abaixo ela é falsa (célula preenchida sem eles)
      if (args.length !== 2 || alvo !== -1) return null
      const [a, b] = args
      const r = relacaoIndexada(m, f.nome)
      if (a.k === 'v' && b.k === 'obj') {
        let l = r.podemCitar.get(b.o)
        if (!l) r.podemCitar.set(b.o, (l = uniao(r.citadoPor.get(b.o) ?? [], r.semLinha, orc)!))
        return l
      }
      if (a.k === 'obj' && b.k === 'v') return r.alvos.get(a.o) ?? null
      if (a.k === 'v' && b.k === 'livre') return r.comAlvosOuSemLinha
      if (a.k === 'livre' && b.k === 'v') return r.semLinha.length ? null : r.citados
      return null
    }
    case 'rel': {
      if (f.op !== '=' && f.op !== '≠') return null
      const a = classificar(f.l, v, livres, m, env)
      const b = classificar(f.r, v, livres, m, env)
      if (a.k === 'obj' && b.k === 'obj') return ((a.o === b.o) === (f.op === '=') ? 1 : -1) === alvo ? [] : null
      const o = a.k === 'v' && b.k === 'obj' ? b.o : b.k === 'v' && a.k === 'obj' ? a.o : undefined
      if (o === undefined) return null
      // v = o só vale em o; v ≠ o só falha em o
      return (f.op === '=') === (alvo === -1) ? [o] : null
    }
    case 'not':
      return ondePodeNaoDar(f.f, alvo === 1 ? -1 : 1, v, m, env, livres, orc)
    case 'and':
      return alvo === 1
        ? uniao(ondePodeNaoDar(f.l, 1, v, m, env, livres, orc), ondePodeNaoDar(f.r, 1, v, m, env, livres, orc), orc)
        : intersecao(ondePodeNaoDar(f.l, -1, v, m, env, livres, orc), ondePodeNaoDar(f.r, -1, v, m, env, livres, orc), orc)
    case 'or':
      return alvo === 1
        ? intersecao(ondePodeNaoDar(f.l, 1, v, m, env, livres, orc), ondePodeNaoDar(f.r, 1, v, m, env, livres, orc), orc)
        : uniao(ondePodeNaoDar(f.l, -1, v, m, env, livres, orc), ondePodeNaoDar(f.r, -1, v, m, env, livres, orc), orc)
    case 'imp':
      return alvo === 1
        ? intersecao(ondePodeNaoDar(f.l, -1, v, m, env, livres, orc), ondePodeNaoDar(f.r, 1, v, m, env, livres, orc), orc)
        : uniao(ondePodeNaoDar(f.l, 1, v, m, env, livres, orc), ondePodeNaoDar(f.r, -1, v, m, env, livres, orc), orc)
    case 'forall':
    case 'exists':
      // "para todo w" dá 1 se dá 1 para cada w; "existe w" dá −1 se dá −1 para cada w
      if (f.dom || f.v === v || (f.k === 'forall') !== (alvo === 1)) return null
      return ondePodeNaoDar(f.corpo, alvo, v, m, env, new Set(livres).add(f.v), orc)
    default:
      return null
  }
}

/** Valor da fórmula no cenário observado (três valores); `env` é mudado durante a conta e volta como estava. */
function avaliar(f: Formula, m: MundoObjetos, env: Env, orc: Orcamento): V3 {
  switch (f.k) {
    case 'const':
      return f.valor ? 1 : -1
    case 'pred': {
      if (m.predicados.get(f.nome) !== f.args.length) return 0
      const args = f.args.map((a) => objetoDe(a, m, env))
      if (args.some((a) => a === undefined)) return 0
      return valorObservado(m, f.nome, args as number[])
    }
    case 'rel': {
      if (f.op !== '=' && f.op !== '≠') return 0
      const a = objetoDe(f.l, m, env)
      const b = objetoDe(f.r, m, env)
      if (a === undefined || b === undefined) return 0
      return (a === b) === (f.op === '=') ? 1 : -1
    }
    case 'not':
      return nao3(avaliar(f.f, m, env, orc))
    case 'and':
      return e3(avaliar(f.l, m, env, orc), avaliar(f.r, m, env, orc))
    case 'or':
      return ou3(avaliar(f.l, m, env, orc), avaliar(f.r, m, env, orc))
    case 'imp':
      return ou3(nao3(avaliar(f.l, m, env, orc)), avaliar(f.r, m, env, orc))
    case 'iff': {
      const a = avaliar(f.l, m, env, orc)
      const b = avaliar(f.r, m, env, orc)
      return a === 0 || b === 0 ? 0 : a === b ? 1 : -1
    }
    case 'forall':
    case 'exists': {
      if (f.dom) return 0
      const alvo = f.k === 'forall' ? 1 : -1
      // só os objetos em que o corpo pode não dar `alvo` mudam o resultado
      const cand = ondePodeNaoDar(f.corpo, alvo, f.v, m, env, new Set(), orc)
      const n = cand ? cand.length : m.objetos.length
      const tinha = env.has(f.v)
      const antes = env.get(f.v)
      let r: V3 = alvo
      for (let i = 0; i < n; i++) {
        gastar(orc, 1)
        env.set(f.v, cand ? cand[i] : i)
        r = alvo === 1 ? e3(r, avaliar(f.corpo, m, env, orc)) : ou3(r, avaliar(f.corpo, m, env, orc))
        if (r === -alvo) break
      }
      if (tinha) env.set(f.v, antes!)
      else env.delete(f.v)
      return r
    }
    default:
      return 0
  }
}

/** Valor da fórmula no cenário observado (três valores; grande demais para conferir = 0). */
export function avaliarNosObjetos(f: Formula, m: MundoObjetos, env: Env = new Map()): V3 {
  try {
    return avaliar(f, m, new Map(env), { passos: 0 })
  } catch (e) {
    if (e instanceof GrandeDemais) return 0
    throw e
  }
}

// --------------------------------------------------------- casos numéricos

/** Cada linha como um caso: símbolo numérico → valor medido (montados uma vez por conjunto). */
export function casosNumericos(c: ConjuntoDados): Map<string, number>[] {
  let casos = casosGuardados.get(c)
  if (!casos) casosGuardados.set(c, (casos = montarCasos(c)))
  return casos
}

function montarCasos(c: ConjuntoDados): Map<string, number>[] {
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
  /** os dados não decidem (falta observar; `grande`: a conferência passaria do teto de passos) */
  | { tipo: 'incerto'; conjunto: string; modo: 'objetos' | 'casos'; grande?: true }

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
  // (antes de montar o cenário: a maioria das leis não fala destes dados)
  const ps = predicadosDasColunas(c)
  if (![...voc.preds].every(([p, ar]) => ps.get(p) === ar)) return null
  const m = mundoDeObjetos(c)
  if (![...voc.nomes].every((n) => m.indice.has(n))) return null
  const orc: Orcamento = { passos: 0 }
  try {
    return conferirNosObjetos(f, c, m, orc)
  } catch (e) {
    if (e instanceof GrandeDemais) return { tipo: 'incerto', conjunto: c.id, modo: 'objetos', grande: true }
    throw e
  }
}

function conferirNosObjetos(f: Formula, c: ConjuntoDados, m: MundoObjetos, orc: Orcamento): VereditoDados {
  // um "para todo" no topo: confere objeto por objeto (para contar e apontar os contraexemplos);
  // fora dos candidatos o corpo vale com certeza (conta como conferido)
  if (f.k === 'forall' && !f.dom) {
    const env: Env = new Map()
    const cand = ondePodeNaoDar(f.corpo, 1, f.v, m, env, new Set(), orc)
    const n = cand ? cand.length : m.objetos.length
    const contra: string[] = []
    let conferidos = m.objetos.length - n
    for (let i = 0; i < n; i++) {
      gastar(orc, 1)
      const d = cand ? cand[i] : i
      env.set(f.v, d)
      const v = avaliar(f.corpo, m, env, orc)
      if (v === 0) continue
      conferidos++
      if (v === -1) contra.push(m.objetos[d])
    }
    if (contra.length) return { tipo: 'falha', conjunto: c.id, contra, conferidos, modo: 'objetos' }
    if (!conferidos) return { tipo: 'incerto', conjunto: c.id, modo: 'objetos' }
    return { tipo: 'vale', conjunto: c.id, conferidos, desconhecidos: m.objetos.length - conferidos, total: m.objetos.length, modo: 'objetos' }
  }
  const v = avaliar(f, m, new Map(), orc)
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
  // o valor de cada predicado unário em cada objeto, de uma vez (os laços abaixo passam milhões de vezes)
  const vetores = new Map<string, Int8Array>()
  const vetor = (p: string) => {
    let v = vetores.get(p)
    if (!v) {
      v = new Int8Array(n)
      for (let d = 0; d < n; d++) v[d] = valorObservado(m, p, [d])
      vetores.set(p, v)
    }
    return v
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
      const vp = vetor(p)
      const vq = vetor(q)
      let apoio = 0
      let contraSim = 0
      let contraNao = 0
      for (let d = 0; d < n; d++) {
        if (vp[d] !== 1) continue
        const v = vq[d]
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
        const vp = vetor(p)
        const vq = vetor(q)
        const vr = vetor(r)
        let apoio = 0
        let contra = 0
        for (let d = 0; d < n && !contra; d++) {
          if (vp[d] !== 1 || vq[d] !== 1) continue
          const v = vr[d]
          if (v === 0) continue
          apoio++
          if (v === -1) contra++
        }
        if (!contra) lei(`∀${x} (${p}(${x}) ∧ ${q}(${x}) ⟹ ${r}(${x}))`, `todo objeto com ${L(p)} e ${L(q)} tem ${L(r)}`, apoio)
      }
    }
  // relações: de quem saem, para quem vão, função, irreflexiva, assimétrica, transitiva
  for (const rel of binarios) {
    const val = (a: number, b: number) => valorObservado(m, rel, [a, b])
    // os pares relacionados (só os das células preenchidas)
    const pares: [number, number][] = []
    for (const [a, bs] of m.relacoes.get(rel) ?? []) for (const b of bs) pares.push([a, b])
    pares.sort((u, v) => u[0] - v[0] || u[1] - v[1])
    if (pares.length < APOIO_MINIMO) continue
    for (const p of unarios) {
      const vp = vetor(p)
      if (pares.every(([a]) => vp[a] !== -1)) {
        const apoio = pares.filter(([a]) => vp[a] === 1).length
        lei(`∀${x} ∀${y} (${rel}(${x}, ${y}) ⟹ ${p}(${x}))`, `quem tem ${L(rel)} com algo tem ${L(p)}`, apoio)
      }
      if (pares.every(([, b]) => vp[b] !== -1)) {
        const apoio = pares.filter(([, b]) => vp[b] === 1).length
        lei(`∀${x} ∀${y} (${rel}(${x}, ${y}) ⟹ ${p}(${y}))`, `o que é alvo de ${L(rel)} tem ${L(p)}`, apoio)
      }
    }
    const porOrigem = new Map<number, number[]>()
    for (const [a, b] of pares) {
      const bs = porOrigem.get(a)
      if (bs) bs.push(b)
      else porOrigem.set(a, [b])
    }
    if ([...porOrigem.values()].every((bs) => bs.length === 1))
      lei(`∀${x} ∀${y} ∀${z} (${rel}(${x}, ${y}) ∧ ${rel}(${x}, ${z}) ⟹ ${y} = ${z})`, `cada objeto tem ${L(rel)} com no máximo um`, porOrigem.size)
    if (pares.every(([a, b]) => a !== b)) lei(`∀${x} ¬${rel}(${x}, ${x})`, `nada tem ${L(rel)} consigo mesmo`, pares.length)
    if (pares.every(([a, b]) => val(b, a) !== 1))
      lei(`∀${x} ∀${y} (${rel}(${x}, ${y}) ⟹ ¬${rel}(${y}, ${x}))`, `${L(rel)} nunca vale nos dois sentidos`, pares.length)
    const cadeias = pares.flatMap(([a, b]) => (porOrigem.get(b) ?? []).map((c2) => [a, c2] as const))
    if (cadeias.length >= APOIO_MINIMO && cadeias.every(([a, c2]) => val(a, c2) !== -1))
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
