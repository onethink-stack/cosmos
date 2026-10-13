import type { EntradaDicionario } from '../dados/tipos'
import { SPAN0, type Formula, type Rel, type Termo } from './ast'
import { imprimir } from './impressao'
import { validar } from './validador'

// Tradutor de "português simples" para fórmulas, no próprio aparelho: sem
// internet e sem adivinhar. Entende frases feitas com as palavras do
// dicionário (o nome por extenso de cada ficha) e um punhado de construções:
//   "Sócrates é mortal?"            mortal(Sócrates)
//   "Todo homem é mortal?"          ∀x (homem(x) ⟹ mortal(x))
//   "Algum homem é sábio?"          ∃x (homem(x) ∧ sábio(x))
//   "Nenhum deus é mortal?"         ∀x (deus(x) ⟹ ¬mortal(x))
//   "Existe algum deus?"            ∃x deus(x)
//   "João ama Maria?"               ama(João, Maria)
//   "O vazio está contido em tudo?" ∀x (∅ ⊆ x)
//   "Se chove, então molha"         chove ⟹ molha
//   "Quem é mortal?"                mortal(x), com x livre (a resposta são nomes)
// Plural e gênero não precisam bater com a ficha ("homens", "mortais").
// O que ele não entende, devolve com as palavras que não conhece.

export type Traducao =
  | { ok: true; tipo: 'sim-ou-nao'; formula: string }
  /** "quem…?", "quais…?": a fórmula tem `variavel` livre; a resposta são os nomes que a tornam verdadeira */
  | { ok: true; tipo: 'quem'; formula: string; variavel: string }
  | { ok: false; erro: string; desconhecidas: string[] }

interface Tok {
  /** sem acento, minúsculo (para comparar) */
  n: string
  /** como foi escrito */
  o: string
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

function tokenizar(texto: string): Tok[] {
  return (texto.match(/[\p{L}\p{N}'’_-]+|∅|[,;]/gu) ?? []).map((o) => ({ o, n: o === ';' ? ',' : normalizar(o).replace(/’/g, "'") }))
}

/** formas de uma palavra sem plural, gênero e (num verbo) infinitivo: "homens" ~ "homem", "mortais" ~ "mortal", "ama" ~ "amar" */
function formas(w: string): Set<string> {
  const r = new Set([w])
  if (w.length < 3) return r
  const add = (s: string) => s.length >= 2 && r.add(s)
  if (/(oes|aes)$/.test(w)) add(w.slice(0, -3) + 'ao')
  if (w.endsWith('ns')) add(w.slice(0, -2) + 'm')
  if (/[aeou]is$/.test(w)) add(w.slice(0, -2) + 'l')
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s')) add(w.slice(0, -1))
  const m = /^(.+)([aei])r$/.exec(w)
  if (m) {
    const terminacao = m[2] === 'a' ? 'a' : 'e'
    add(m[1] + terminacao)
    add(m[1] + terminacao + 'm')
  }
  for (const s of [...r]) {
    if (s.endsWith('a')) add(s.slice(0, -1) + 'o')
    if (s.endsWith('o')) add(s.slice(0, -1) + 'a')
  }
  return r
}

// ------------------------------------------------------------ árvore da frase

type TermoS = { k: 'const'; s: string } | { k: 'vazio' } | { k: 'num'; valor: string } | { k: 'func'; f: string; arg: TermoS }
interface Nominal {
  preds: string[]
  /** "homem que ama Maria" */
  rel?: VP
}
type Quant = 'todo' | 'algum' | 'nenhum'
type NP =
  | { k: 'termo'; t: TermoS }
  /** sem `n`: "tudo", "algo", "nada" */
  | { k: 'quant'; q: Quant; n?: Nominal }
  | { k: 'quem'; n?: Nominal }
type VP =
  | { k: 'pred1'; p: string; neg: boolean }
  | { k: 'rel'; op: Rel; obj: NP; neg: boolean }
  | { k: 'pred2'; p: string; obj: NP; neg: boolean }
type S =
  | { k: 'atomo'; sujeito: NP; vp: VP }
  | { k: 'prop'; p: string }
  | { k: 'existe'; n: Nominal; neg: boolean }
  | { k: 'nao'; s: S }
  | { k: 'e' | 'ou' | 'se' | 'sse'; a: S; b: S }

/** um resultado parcial: o valor, onde parou e a pontuação (palavras do dicionário iguais valem mais que parecidas) */
interface R<X> {
  v: X
  i: number
  s: number
}

const PREFIXOS = [
  'e verdade que',
  'sera que',
  'e certo que',
  'e fato que',
  'e correto dizer que',
  'pode-se dizer que',
  'podemos dizer que',
  'segue que',
  'decorre que',
  'verdade que',
  'por acaso',
]
const COPULAS = ['e', 'eh', 'sao', 'esta', 'estao', 'seja', 'sejam', 'foi', 'era']
const DETERMINANTES: [Quant | 'quem', string[]][] = [
  ['todo', ['todo', 'toda', 'todos os', 'todas as', 'todos', 'todas', 'qualquer', 'quaisquer', 'cada', 'todo e qualquer', 'toda e qualquer']],
  ['algum', ['algum', 'alguma', 'alguns', 'algumas', 'um', 'uma', 'pelo menos um', 'pelo menos uma']],
  ['nenhum', ['nenhum', 'nenhuma']],
  ['quem', ['quais', 'qual', 'que', 'quais sao os', 'quais sao as']],
]
const PRONOMES: [NP, string[]][] = [
  [{ k: 'quant', q: 'todo' }, ['tudo', 'todas as coisas', 'qualquer coisa', 'todos']],
  [{ k: 'quant', q: 'algum' }, ['algo', 'alguma coisa', 'alguem']],
  [{ k: 'quant', q: 'nenhum' }, ['nada', 'ninguem']],
  [{ k: 'quem' }, ['quem', 'o que']],
]
const RELACOES: [Rel, string[]][] = [
  ['=', ['igual a', 'igual ao', 'identico a', 'identica a', 'o mesmo que', 'a mesma coisa que']],
  ['≠', ['diferente de', 'diferente do', 'diferente da', 'distinto de', 'distinta de']],
  ['∈', ['elemento de', 'um elemento de', 'membro de', 'um membro de', 'em', 'no', 'na']],
  ['⊆', ['contido em', 'contida em', 'contido no', 'contida na', 'subconjunto de', 'um subconjunto de', 'incluido em', 'incluida em']],
  ['≥', ['maior ou igual a']],
  ['≤', ['menor ou igual a']],
  ['>', ['maior que', 'maior do que']],
  ['<', ['menor que', 'menor do que']],
]
const SEM_COPULA: [Rel, string[]][] = [['∈', ['pertence a', 'pertence ao', 'pertencem a', 'pertencem ao']]]
const PREPOSICOES = ['de', 'do', 'da', 'dos', 'das', 'a', 'ao', 'aos', 'em', 'no', 'na', 'com', 'que', 'por']
const EXISTE = ['existe', 'existem', 'ha'].flatMap((x) => [x, ...['algum', 'alguma', 'alguns', 'algumas', 'um', 'uma', 'pelo menos um', 'pelo menos uma'].map((d) => `${x} ${d}`)])

/** todas as palavras que a gramática usa (o resto precisa estar no dicionário) */
const GRAMATICA = new Set(
  [
    ...PREFIXOS,
    ...COPULAS,
    ...DETERMINANTES.flatMap(([, f]) => f),
    ...PRONOMES.flatMap(([, f]) => f),
    ...RELACOES.flatMap(([, f]) => f),
    ...SEM_COPULA.flatMap(([, f]) => f),
    ...PREPOSICOES,
    ...EXISTE,
    'se e somente so sse equivale equivalente implica acarreta entao ou nao verdade falso caso o a os as um uma uns umas vazio conjunto ,',
  ].flatMap((f) => f.split(' ')),
)

const TIPOS = {
  unario: (e: EntradaDicionario) => e.tipo === 'predicado' && e.aridade === 1,
  binario: (e: EntradaDicionario) => e.tipo === 'predicado' && e.aridade === 2,
  proposicao: (e: EntradaDicionario) => e.tipo === 'predicado' && e.aridade === 0,
  constante: (e: EntradaDicionario) => e.tipo === 'constante',
  funcao: (e: EntradaDicionario) => e.tipo === 'funcao' && e.aridade === 1,
  qualquer: () => true,
}
type Tipo = keyof typeof TIPOS

export function traduzirPortugues(texto: string, dicionario: EntradaDicionario[]): Traducao {
  // já é uma fórmula?
  const limpo = texto.trim().replace(/[?.!]+$/, '').trim()
  if (!limpo) return { ok: false, erro: 'Escreva uma pergunta.', desconhecidas: [] }
  const v = validar(limpo, dicionario, { exigirFichas: true })
  if (v.ok && v.ast && !v.diags.some((d) => d.codigo === 'E12' || d.codigo === 'E13')) return { ok: true, tipo: 'sim-ou-nao', formula: limpo }

  const T = tokenizar(limpo)
  const fim = T.length

  // ---- dicionário: cada ficha pelo nome por extenso e pelo símbolo
  interface Lexema {
    e: EntradaDicionario
    palavras: string[]
    /** símbolo de uma letra: só vale escrito igual ("A", não o artigo "a") */
    exato?: string
  }
  const lexemas: Lexema[] = []
  for (const e of dicionario) {
    const vistos = new Set<string>()
    for (const nome of [e.termo, e.simbolo]) {
      const ps = tokenizar(nome ?? '').map((t) => t.n)
      const k = ps.join(' ')
      if (!ps.length || vistos.has(k)) continue
      vistos.add(k)
      lexemas.push({ e, palavras: ps, ...(nome === e.simbolo && [...e.simbolo].length === 1 ? { exato: e.simbolo } : {}) })
    }
  }
  const cacheFormas = new Map<string, Set<string>>()
  const formasDe = (w: string) => {
    let f = cacheFormas.get(w)
    if (!f) cacheFormas.set(w, (f = formas(w)))
    return f
  }
  const parecidas = (a: string, b: string) => {
    if (a.length < 3 || b.length < 3) return false
    const fb = formasDe(b)
    for (const x of formasDe(a)) if (fb.has(x)) return true
    return false
  }

  const casados = new Map<string, R<EntradaDicionario>[]>()
  /** as fichas do tipo cujo nome começa em i (e onde ele termina) */
  const casar = (i: number, tipo: Tipo): R<EntradaDicionario>[] => {
    const chave = `${i}|${tipo}`
    const ja = casados.get(chave)
    if (ja) return ja
    const r: R<EntradaDicionario>[] = []
    casados.set(chave, r)
    for (const l of lexemas) {
      if (!TIPOS[tipo](l.e)) continue
      if (l.exato) {
        if (T[i]?.o === l.exato) r.push({ v: l.e, i: i + 1, s: 2 })
        continue
      }
      let s = 0
      let k = 0
      for (; k < l.palavras.length; k++) {
        const t = T[i + k]
        if (!t) break
        if (t.n === l.palavras[k]) s += 2
        else if (parecidas(t.n, l.palavras[k])) s += 1
        else break
      }
      if (k === l.palavras.length) r.push({ v: l.e, i: i + k, s })
    }
    return r
  }

  /** a frase (ou uma delas) começa em i? devolve onde cada uma termina */
  const frases = (i: number, lista: string[]): number[] => {
    const r: number[] = []
    for (const f of lista) {
      const ps = f.split(' ')
      if (ps.every((p, k) => T[i + k]?.n === p)) r.push(i + ps.length)
    }
    return r
  }
  const tem = (i: number, ...lista: string[]) => frases(i, lista)

  /** cada leitura a partir de i é calculada uma vez só */
  const memo = <X>(fn: (i: number) => R<X>[]) => {
    const m = new Map<number, R<X>[]>()
    return (i: number): R<X>[] => {
      let r = m.get(i)
      if (!r) m.set(i, (r = fn(i)))
      return r
    }
  }

  // ---- gramática (cada função devolve todas as leituras possíveis a partir de i)

  const termo = memo((i: number): R<TermoS>[] => {
    const r: R<TermoS>[] = []
    if (T[i]?.o === '∅') r.push({ v: { k: 'vazio' }, i: i + 1, s: 2 })
    if (T[i] && /^\d+([.,]\d+)?$/.test(T[i].n)) r.push({ v: { k: 'num', valor: T[i].n.replace(',', '.') }, i: i + 1, s: 2 })
    for (const j of [i, ...tem(i, 'o', 'a', 'os', 'as')]) {
      for (const c of casar(j, 'constante')) r.push({ v: { k: 'const', s: c.v.simbolo }, i: c.i, s: c.s })
      for (const k of tem(j, 'vazio', 'conjunto vazio')) r.push({ v: { k: 'vazio' }, i: k, s: 2 })
      for (const f of casar(j, 'funcao'))
        for (const k of tem(f.i, 'de', 'do', 'da', 'dos', 'das'))
          for (const a of termo(k)) r.push({ v: { k: 'func', f: f.v.simbolo, arg: a.v }, i: a.i, s: f.s + a.s })
    }
    return r
  })

  const nominal = memo((i: number): R<Nominal>[] => {
    const r: R<Nominal>[] = []
    for (const p of casar(i, 'unario')) {
      r.push({ v: { preds: [p.v.simbolo] }, i: p.i, s: p.s })
      // substantivo e adjetivo: "número primo"
      for (const q of casar(p.i, 'unario')) if (q.v !== p.v) r.push({ v: { preds: [p.v.simbolo, q.v.simbolo] }, i: q.i, s: p.s + q.s })
    }
    for (const x of [...r]) for (const j of tem(x.i, 'que')) for (const vp of predicado(j)) r.push({ v: { ...x.v, rel: vp.v }, i: vp.i, s: x.s + vp.s })
    return r
  })

  const sintagma = memo((i: number): R<NP>[] => {
    const r: R<NP>[] = []
    for (const [q, lista] of DETERMINANTES)
      for (const j of frases(i, lista)) for (const n of nominal(j)) r.push({ v: q === 'quem' ? { k: 'quem', n: n.v } : { k: 'quant', q, n: n.v }, i: n.i, s: n.s })
    for (const [np, lista] of PRONOMES) for (const j of frases(i, lista)) r.push({ v: np, i: j, s: 0 })
    for (const t of termo(i)) r.push({ v: { k: 'termo', t: t.v }, i: t.i, s: t.s })
    return r
  })

  const copula = (i: number): R<null>[] => {
    const t = T[i]
    if (!t || !COPULAS.includes(t.n)) return []
    // "e" sem acento pode ser o "é" de quem não pôs acento, mas vale menos
    return [{ v: null, i: i + 1, s: t.o.toLowerCase() === 'e' ? -1 : 0 }]
  }

  const predicado = memo((i: number): R<VP>[] => {
    const r: R<VP>[] = []
    const comNegacao: [number, boolean][] = [[i, false], ...tem(i, 'nao').map((k): [number, boolean] => [k, true])]
    for (const [j, neg] of comNegacao) {
      for (const c of copula(j)) {
        const k0 = c.i
        for (const k of [k0, ...tem(k0, 'um', 'uma', 'uns', 'umas')])
          for (const p of casar(k, 'unario')) r.push({ v: { k: 'pred1', p: p.v.simbolo, neg }, i: p.i, s: c.s + p.s })
        for (const [op, lista] of RELACOES)
          for (const k of frases(k0, lista)) for (const o of sintagma(k)) r.push({ v: { k: 'rel', op, obj: o.v, neg }, i: o.i, s: c.s + o.s + 1 })
        // "é pai de Platão"
        for (const k of [k0, ...tem(k0, 'o', 'a', 'um', 'uma')])
          for (const p of casar(k, 'binario'))
            for (const k2 of [p.i, ...frases(p.i, PREPOSICOES)])
              for (const o of sintagma(k2)) r.push({ v: { k: 'pred2', p: p.v.simbolo, obj: o.v, neg }, i: o.i, s: c.s + p.s + o.s })
        // "é Platão", "é o pai de Platão": o mesmo objeto
        for (const o of sintagma(k0)) if (o.v.k !== 'quant') r.push({ v: { k: 'rel', op: '=', obj: o.v, neg }, i: o.i, s: c.s + o.s - 1 })
      }
      for (const [op, lista] of SEM_COPULA) for (const k of frases(j, lista)) for (const o of sintagma(k)) r.push({ v: { k: 'rel', op, obj: o.v, neg }, i: o.i, s: o.s + 1 })
      // verbo: "ama Maria", "morre"
      for (const p of casar(j, 'binario'))
        for (const k2 of [p.i, ...frases(p.i, PREPOSICOES)]) for (const o of sintagma(k2)) r.push({ v: { k: 'pred2', p: p.v.simbolo, obj: o.v, neg }, i: o.i, s: p.s + o.s })
      for (const p of casar(j, 'unario')) r.push({ v: { k: 'pred1', p: p.v.simbolo, neg }, i: p.i, s: p.s - 1 })
    }
    return r
  })

  const atomo = (i: number): R<S>[] => {
    const r: R<S>[] = []
    for (const p of casar(i, 'proposicao')) r.push({ v: { k: 'prop', p: p.v.simbolo }, i: p.i, s: p.s })
    for (const j of tem(i, 'nao')) for (const p of casar(j, 'proposicao')) r.push({ v: { k: 'nao', s: { k: 'prop', p: p.v.simbolo } }, i: p.i, s: p.s })
    for (const [neg, lista] of [
      [false, EXISTE],
      [true, EXISTE.map((x) => `nao ${x}`)],
    ] as [boolean, string[]][])
      for (const j of frases(i, lista)) for (const n of nominal(j)) r.push({ v: { k: 'existe', n: n.v, neg }, i: n.i, s: n.s })
    for (const np of sintagma(i)) for (const vp of predicado(np.i)) r.push({ v: { k: 'atomo', sujeito: np.v, vp: vp.v }, i: vp.i, s: np.s + vp.s })
    return r
  }

  const negacao = memo((i: number): R<S>[] => {
    const r: R<S>[] = []
    for (const j of tem(i, 'nao e verdade que', 'e falso que', 'nao e o caso que'))
      for (const a of [...frase(j), ...negacao(j)]) r.push({ v: { k: 'nao', s: a.v }, i: a.i, s: a.s })
    r.push(...atomo(i))
    return r
  })

  /** a, b, …: partes ligadas por "e" (ou "ou"), com vírgula opcional antes */
  const lista = (i: number, parte: (i: number) => R<S>[], sep: string, k: 'e' | 'ou'): R<S>[] => {
    const r: R<S>[] = []
    const fila = [...parte(i)]
    r.push(...fila)
    while (fila.length) {
      const x = fila.pop()!
      const seps = [...tem(x.i, sep), ...tem(x.i, ',', sep)]
      if (k === 'e') seps.push(...tem(x.i, ','))
      for (const j of seps) {
        // "é" com acento não é o "e" de ligar
        const pena = T[j - 1]?.o.toLowerCase() === 'é' ? -3 : 0
        for (const b of parte(j)) {
          const y: R<S> = { v: { k, a: x.v, b: b.v }, i: b.i, s: x.s + b.s + pena }
          r.push(y)
          fila.push(y)
        }
      }
    }
    return r
  }
  const conjuncao = memo((i: number) => lista(i, negacao, 'e', 'e'))
  const disjuncao = memo((i: number) => lista(i, conjuncao, 'ou', 'ou'))

  function frase(i: number): R<S>[] {
    const r: R<S>[] = []
    for (const j of tem(i, 'se'))
      for (const a of disjuncao(j))
        for (const k of [a.i, ...tem(a.i, ',')])
          for (const k2 of [k, ...tem(k, 'entao')]) for (const b of disjuncao(k2)) r.push({ v: { k: 'se', a: a.v, b: b.v }, i: b.i, s: a.s + b.s })
    for (const a of disjuncao(i)) {
      r.push(a)
      for (const j of tem(a.i, 'se e somente se', 'se e so se', 'sse', 'equivale a', 'e equivalente a'))
        for (const b of disjuncao(j)) r.push({ v: { k: 'sse', a: a.v, b: b.v }, i: b.i, s: a.s + b.s })
      for (const j of tem(a.i, 'implica que', 'implica', 'acarreta que', 'acarreta'))
        for (const b of disjuncao(j)) r.push({ v: { k: 'se', a: a.v, b: b.v }, i: b.i, s: a.s + b.s })
    }
    return r
  }

  // ---- leituras completas
  const completas: R<S>[] = []
  for (const j of [0, ...frases(0, PREFIXOS)]) for (const x of frase(j)) if (x.i === fim) completas.push(x)

  if (!completas.length) {
    // as palavras que não são da gramática nem de nenhuma ficha
    const cobertas = new Set<number>()
    T.forEach((t, i) => {
      if (GRAMATICA.has(t.n) || /^\d/.test(t.n) || t.o === '∅') cobertas.add(i)
      for (const m of casar(i, 'qualquer')) for (let k = i; k < m.i; k++) cobertas.add(k)
    })
    const desconhecidas = [...new Set(T.filter((_, i) => !cobertas.has(i)).map((t) => t.o))]
    return {
      ok: false,
      desconhecidas,
      erro: desconhecidas.length
        ? `Não conheço ${desconhecidas.map((d) => `“${d}”`).join(', ')}: não ${desconhecidas.length > 1 ? 'estão' : 'está'} no dicionário.`
        : 'Não entendi a construção da frase.',
    }
  }

  // ---- de frase para fórmula: a leitura com mais palavras iguais às do dicionário
  completas.sort((a, b) => b.s - a.s)
  let primeiroErro = ''
  for (const c of completas) {
    const r = montar(c.v, dicionario)
    if (r.ok) return r
    primeiroErro ||= r.erro
  }
  return { ok: false, erro: primeiroErro || 'Não entendi a construção da frase.', desconhecidas: [] }
}

// ------------------------------------------------------------ da frase à fórmula

const nome = (n: string): Termo => ({ k: 'nome', nome: n, ...SPAN0 })
const pred = (p: string, args: Termo[]): Formula => ({ k: 'pred', nome: p, args, ...SPAN0 })
const nao = (f: Formula): Formula => ({ k: 'not', f, ...SPAN0 })
const bin = (k: 'and' | 'or' | 'imp' | 'iff', l: Formula, r: Formula): Formula => ({ k, l, r, ...SPAN0 })
const quant = (k: 'forall' | 'exists', v: string, corpo: Formula): Formula => ({ k, v, vPos: 0, corpo, ...SPAN0 })

function montar(s: S, dicionario: EntradaDicionario[]): Traducao {
  const ocupados = new Set(dicionario.map((e) => e.simbolo))
  const usadas = new Set<string>()
  const fresca = (): string => {
    for (let n = 0; ; n++)
      for (const b of ['x', 'y', 'z', 'w', 'u', 'v']) {
        const v = n ? `${b}${n}` : b
        if (!ocupados.has(v) && !usadas.has(v)) {
          usadas.add(v)
          return v
        }
      }
  }
  let pergunta: string | null = null
  let duasPerguntas = false

  const semTermo = (t: TermoS): Termo => {
    switch (t.k) {
      case 'const':
        return nome(t.s)
      case 'vazio':
        return { k: 'vazio', ...SPAN0 }
      case 'num':
        return { k: 'num', valor: t.valor, ...SPAN0 }
      case 'func':
        return { k: 'app', fn: t.f, args: [semTermo(t.arg)], subscrito: false, ...SPAN0 }
    }
  }
  const semNominal = (n: Nominal, t: Termo): Formula => {
    let f = n.preds.map((p) => pred(p, [t])).reduce((a, b) => bin('and', a, b))
    if (n.rel) f = bin('and', f, semVP(n.rel, t))
    return f
  }
  const semNP = (np: NP, escopo: (t: Termo) => Formula): Formula => {
    if (np.k === 'termo') return escopo(semTermo(np.t))
    if (np.k === 'quem') {
      if (pergunta) duasPerguntas = true
      const v = (pergunta ??= fresca())
      return np.n ? bin('and', semNominal(np.n, nome(v)), escopo(nome(v))) : escopo(nome(v))
    }
    const v = fresca()
    const x = nome(v)
    if (!np.n) return quant(np.q === 'algum' ? 'exists' : 'forall', v, np.q === 'nenhum' ? nao(escopo(x)) : escopo(x))
    if (np.q === 'algum') return quant('exists', v, bin('and', semNominal(np.n, x), escopo(x)))
    return quant('forall', v, bin('imp', semNominal(np.n, x), np.q === 'nenhum' ? nao(escopo(x)) : escopo(x)))
  }
  function semVP(vp: VP, t: Termo): Formula {
    const f =
      vp.k === 'pred1'
        ? pred(vp.p, [t])
        : vp.k === 'rel'
          ? semNP(vp.obj, (u): Formula => ({ k: 'rel', op: vp.op, l: t, r: u, ...SPAN0 }))
          : semNP(vp.obj, (u) => pred(vp.p, [t, u]))
    return vp.neg ? nao(f) : f
  }
  const semS = (x: S): Formula => {
    switch (x.k) {
      case 'atomo':
        return semNP(x.sujeito, (t) => semVP(x.vp, t))
      case 'prop':
        return pred(x.p, [])
      case 'existe': {
        const v = fresca()
        const f = quant('exists', v, semNominal(x.n, nome(v)))
        return x.neg ? nao(f) : f
      }
      case 'nao':
        return nao(semS(x.s))
      case 'e':
        return bin('and', semS(x.a), semS(x.b))
      case 'ou':
        return bin('or', semS(x.a), semS(x.b))
      case 'se':
        return bin('imp', semS(x.a), semS(x.b))
      case 'sse':
        return bin('iff', semS(x.a), semS(x.b))
    }
  }

  const f = semS(s)
  if (duasPerguntas) return { ok: false, erro: 'Faça uma pergunta de “quem” (ou “quais”) por vez.', desconhecidas: [] }
  const formula = imprimir(f)
  const v = validar(formula, dicionario, { exigirFichas: true })
  // na pergunta de "quem", a variável livre é de propósito
  const erros = v.diags.filter((d) => d.nivel === 'erro' && !(pergunta && d.codigo === 'E6'))
  if (!v.ast || erros.length) return { ok: false, erro: erros[0]?.msg ?? 'a fórmula montada não é válida', desconhecidas: [] }
  return pergunta ? { ok: true, tipo: 'quem', formula, variavel: pergunta } : { ok: true, tipo: 'sim-ou-nao', formula }
}
