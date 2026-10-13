// Gerador de teoremas por saturação: parte das leis e fatos, deriva
// consequências e cada conclusão nova vira ponto de partida para outras — a
// reação em cadeia que não para. É o método dos provadores do TPTP (E,
// Vampire), em versão simples: resolução e fatoração sobre cláusulas, com o
// laço da "cláusula escolhida" (a mais leve primeiro, e de vez em quando a
// mais antiga, para nenhuma ficar esquecida).
//
// A igualdade é nativa, como nesses provadores (os axiomas dela — simétrica,
// transitiva, trocar iguais por iguais em cada função e predicado — faziam a
// busca explodir, e teoria de grupos não saía):
//   - paramodulação: de "s = t" e de uma cláusula com um pedaço que unifica
//     com s, a mesma cláusula com t no lugar;
//   - reescrita: as igualdades de um literal só que uma ordem dos termos
//     orienta (o lado maior vira o menor: "inv(inv(x)) = x") simplificam toda
//     cláusula nova — reescrever sempre encurta, então sempre termina;
//   - resolução da igualdade: "s ≠ t ou C", com s e t unificáveis, dá C.
//
// O que sai daqui vale para QUALQUER número de objetos (é prova, não busca de
// cenário): resolução é correta. Uma cláusula vazia prova que as leis se
// contradizem.
//
// O filtro (o que separa o banco útil do lixo infinito):
//   - nada de tautologia (A ou não A), nada que uma cláusula mais geral já diga
//     (subsunção), nada que só repita uma lei;
//   - só o que é curto (peso até o limite) e escrito só com nomes do usuário
//     (sem os nomes inventados no lugar de um "existe");
//   - cada teorema guarda de quais leis e de quais teoremas veio, e quantas
//     vezes serviu para provar outro (os mais usados são os mais úteis).
//
// Limites (não há como escapar): de leis quaisquer saem infinitas
// consequências, então o peso máximo cresce aos poucos (aprofundamento); e
// nem tudo é decidível — o que não aparece aqui não é "falso", é "não sei".

import type { Formula, Termo } from '../logica/ast'
import { imprimir } from '../logica/impressao'

/** variável (índice) ou símbolo aplicado (constante = sem argumentos) */
export type TermoC = number | { f: string; a: TermoC[] }

export interface Literal {
  pos: boolean
  /** predicado, "=" ou "∈" */
  p: string
  a: TermoC[]
}

const IGUAL = '='
const PERTENCE = '∈'
const VAZIO = '∅'
/** começo dos nomes inventados no lugar de um "existe" */
const SK = '§'
/** origem das cláusulas que o gerador põe por conta própria (igualdade, ∅) */
export const ORIGEM_INTERNA = '#'

interface Clausula {
  id: number
  lits: Literal[]
  peso: number
  /** quantas inferências desde as leis (0 = cláusula de uma lei) */
  prof: number
  /** notas (e origens internas) usadas, ordenadas */
  apoio: string[]
  chave: string
  /** tipos de literal que ela tem (sinal, predicado, aridade): uma cláusula só subsume outra que tenha todos os dela */
  sig: string[]
  /** teoremas guardados mais próximos de onde esta veio (para contar usos) */
  ancestrais: string[]
  guardada: boolean
  /** esperando a vez, já combinada com as outras (ativa), ou fora (outra mais geral diz o mesmo) */
  estado: 'esperando' | 'ativa' | 'fora'
}

const tipoL = (l: Literal) => `${l.pos ? '+' : '-'}${l.p}/${l.a.length}`

export interface TeoremaGerado {
  /** forma canônica da cláusula: identifica o teorema */
  chave: string
  /** na notação do caderno */
  formula: string
  peso: number
  prof: number
  /** notas de onde vem (só as do usuário) */
  apoio: string[]
  /** teoremas guardados de onde veio (chaves) */
  pais: string[]
}

export type EventoGerador =
  | { tipo: 'teorema'; t: TeoremaGerado }
  /** o teorema serviu para provar outro */
  | { tipo: 'uso'; chave: string }
  /** um teorema mais geral apareceu: este fica escondido */
  | { tipo: 'superado'; chave: string }
  /** cláusula vazia: as leis se contradizem (provado, para qualquer tamanho) */
  | { tipo: 'contradicao'; apoio: string[] }

export interface OpcoesGerador {
  /** maior peso (símbolos) de uma cláusula guardada para continuar gerando */
  pesoMax: number
  /** mais literais que isto, a cláusula sai */
  litMax: number
  /** aninhamento máximo de funções, f(f(f(x))) = 3 */
  profTermo: number
  /** quantas cláusulas esperando, no máximo (acima disso, o peso máximo baixa) */
  passivasMax: number
}

export const OPCOES_GERADOR: OpcoesGerador = { pesoMax: 14, litMax: 4, profTermo: 3, passivasMax: 200_000 }

// ---------------------------------------------------------------- termos

const ehVar = (t: TermoC): t is number => typeof t === 'number'

function ver(t: TermoC, s: Map<number, TermoC>): TermoC {
  while (ehVar(t)) {
    const b = s.get(t)
    if (b === undefined) return t
    t = b
  }
  return t
}

function ocorre(v: number, t: TermoC, s: Map<number, TermoC>): boolean {
  t = ver(t, s)
  if (ehVar(t)) return t === v
  return t.a.some((x) => ocorre(v, x, s))
}

function unificar(x: TermoC, y: TermoC, s: Map<number, TermoC>): boolean {
  x = ver(x, s)
  y = ver(y, s)
  if (ehVar(x)) {
    if (ehVar(y) && x === y) return true
    if (ocorre(x, y, s)) return false
    s.set(x, y)
    return true
  }
  if (ehVar(y)) return unificar(y, x, s)
  if (x.f !== y.f || x.a.length !== y.a.length) return false
  for (let i = 0; i < x.a.length; i++) if (!unificar(x.a[i], y.a[i], s)) return false
  return true
}

function aplicar(t: TermoC, s: Map<number, TermoC>): TermoC {
  t = ver(t, s)
  return ehVar(t) ? t : t.a.length ? { f: t.f, a: t.a.map((x) => aplicar(x, s)) } : t
}

const deslocar = (t: TermoC, d: number): TermoC => (ehVar(t) ? t + d : t.a.length ? { f: t.f, a: t.a.map((x) => deslocar(x, d)) } : t)

function igualT(x: TermoC, y: TermoC): boolean {
  if (ehVar(x) || ehVar(y)) return x === y
  return x.f === y.f && x.a.length === y.a.length && x.a.every((z, i) => igualT(z, y.a[i]))
}

/** casamento de um lado só: as variáveis de `p` se ligam a pedaços de `t` (as de `t` ficam fixas) */
function casar(p: TermoC, t: TermoC, s: Map<number, TermoC>): boolean {
  if (ehVar(p)) {
    const b = s.get(p)
    if (b === undefined) {
      s.set(p, t)
      return true
    }
    return igualT(b, t)
  }
  if (ehVar(t) || p.f !== t.f || p.a.length !== t.a.length) return false
  for (let i = 0; i < p.a.length; i++) if (!casar(p.a[i], t.a[i], s)) return false
  return true
}

/** x é uma variável que não aparece em t (pode ser trocada por t) */
const trocavel = (x: TermoC, t: TermoC) => ehVar(x) && !ocorre(x, t, new Map())

/** troca as variáveis de t pelo que `s` diz, uma vez só (sem seguir o que foi posto no lugar) */
const trocarVars = (t: TermoC, s: Map<number, TermoC>): TermoC => (ehVar(t) ? (s.get(t) ?? t) : t.a.length ? { f: t.f, a: t.a.map((x) => trocarVars(x, s)) } : t)

function contarVars(t: TermoC, m: Map<number, number> = new Map()): Map<number, number> {
  if (ehVar(t)) m.set(t, (m.get(t) ?? 0) + 1)
  else t.a.forEach((x) => contarVars(x, m))
  return m
}

/**
 * s ≻ t na ordem dos termos (Knuth-Bendix, com peso 1 por símbolo e desempate
 * pelo nome): toda variável de t aparece em s ao menos as mesmas vezes, e s é
 * mais pesado (ou, de mesmo peso, maior na ordem dos símbolos e depois dos
 * argumentos). Trocar s por t, em qualquer lugar, sempre encurta: a reescrita
 * termina.
 */
export function maior(s: TermoC, t: TermoC): boolean {
  if (ehVar(s)) return false
  if (ehVar(t)) return ocorre(t, s, new Map())
  const vs = contarVars(s)
  for (const [v, n] of contarVars(t)) if ((vs.get(v) ?? 0) < n) return false
  const ps = pesoT(s)
  const pt = pesoT(t)
  if (ps !== pt) return ps > pt
  if (s.f !== t.f) return s.f > t.f
  if (s.a.length !== t.a.length) return s.a.length > t.a.length
  for (let i = 0; i < s.a.length; i++) if (!igualT(s.a[i], t.a[i])) return maior(s.a[i], t.a[i])
  return false
}

/** os pedaços de t que não são variáveis, com o caminho até cada um */
function posicoes(t: TermoC, caminho: number[] = [], r: { t: { f: string; a: TermoC[] }; c: number[] }[] = []) {
  if (ehVar(t)) return r
  r.push({ t, c: caminho })
  t.a.forEach((x, i) => posicoes(x, [...caminho, i], r))
  return r
}

/** t com o pedaço do caminho trocado por `por` */
function trocarEm(t: TermoC, caminho: number[], por: TermoC, k = 0): TermoC {
  if (k === caminho.length || ehVar(t)) return por
  return { f: t.f, a: t.a.map((y, i) => (i === caminho[k] ? trocarEm(y, caminho, por, k + 1) : y)) }
}

const pesoT = (t: TermoC): number => (ehVar(t) ? 1 : 1 + t.a.reduce<number>((n, x) => n + pesoT(x), 0))
const altura = (t: TermoC): number => (ehVar(t) ? 0 : t.a.length ? 1 + Math.max(...t.a.map(altura)) : 0)
const temSkolem = (t: TermoC): boolean => !ehVar(t) && (t.f.startsWith(SK) || t.a.some(temSkolem))

function textoT(t: TermoC, nome: (v: number) => string): string {
  if (ehVar(t)) return nome(t)
  return t.a.length ? `${t.f}(${t.a.map((x) => textoT(x, nome)).join(',')})` : t.f
}

const textoL = (l: Literal, nome: (v: number) => string) => `${l.pos ? '' : '¬'}${l.p}(${l.a.map((x) => textoT(x, nome)).join(',')})`

// ---------------------------------------------------------------- cláusulas

/**
 * Arruma uma cláusula: tira literais repetidos e os falsos (¬ t = t),
 * descobre tautologias (t = t, ou A e ¬A) e numera as variáveis numa ordem
 * fixa — duas cláusulas iguais a menos dos nomes das variáveis e da ordem
 * dos literais ficam com a mesma chave. null = tautologia.
 */
function normalizar(lits: Literal[], destrutiva = true): { lits: Literal[]; chave: string } | null {
  // igualdade destrutiva: "¬(x = t) ou C(x)" diz o mesmo que "C(t)" (x variável fora de t).
  // Não vale para os axiomas da igualdade (todos têm essa forma: virariam tautologias)
  for (; destrutiva; ) {
    const i = lits.findIndex((l) => !l.pos && l.p === IGUAL && (trocavel(l.a[0], l.a[1]) || trocavel(l.a[1], l.a[0])))
    if (i < 0) break
    const l = lits[i]
    const [x, t] = trocavel(l.a[0], l.a[1]) ? [l.a[0] as number, l.a[1]] : [l.a[1] as number, l.a[0]]
    const s = new Map<number, TermoC>([[x, t]])
    lits = lits.filter((_, k) => k !== i).map((m) => ({ ...m, a: m.a.map((u) => aplicar(u, s)) }))
  }
  const vistos = new Map<string, Literal>()
  for (const l of lits) {
    if (l.p === IGUAL && igualT(l.a[0], l.a[1])) {
      if (l.pos) return null
      continue
    }
    const k = textoL(l, (v) => `v${v}`)
    vistos.set(k, l)
  }
  for (const [k, l] of vistos) if (vistos.has(l.pos ? `¬${k}` : k.slice(1))) return null
  // ordem dos literais sem olhar os nomes das variáveis; depois, variáveis numeradas nessa ordem
  const ordenados = [...vistos.values()]
    .map((l) => ({ l, k: textoL(l, () => '?') }))
    .sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : 0))
    .map((x) => x.l)
  const novo = new Map<number, number>()
  const ren = (t: TermoC): TermoC => {
    if (ehVar(t)) {
      if (!novo.has(t)) novo.set(t, novo.size)
      return novo.get(t)!
    }
    return t.a.length ? { f: t.f, a: t.a.map(ren) } : t
  }
  const prontos = ordenados.map((l) => ({ pos: l.pos, p: l.p, a: l.a.map(ren) }))
  return { lits: prontos, chave: prontos.map((l) => textoL(l, (v) => `v${v}`)).join(' | ') }
}

/** dois literais iguais na cláusula (a arrumação junta os dois) */
const temRepetido = (lits: Literal[]) =>
  lits.some((l, i) => lits.some((m, j) => j > i && m.pos === l.pos && m.p === l.p && m.a.every((t, k) => igualT(t, l.a[k]))))

const pesoC = (lits: Literal[]) => lits.reduce<number>((n, l) => n + 1 + l.a.reduce<number>((m, x) => m + pesoT(x), 0), 0)
const nVars = (lits: Literal[]) => {
  let n = 0
  const ver = (t: TermoC): void => (ehVar(t) ? void (n = Math.max(n, t + 1)) : t.a.forEach(ver))
  lits.forEach((l) => l.a.forEach(ver))
  return n
}

/** C subsume D: alguma substituição leva os literais de C para dentro de D (C diz o mesmo, mais geral) */
export function subsume(c: Literal[], d: Literal[]): boolean {
  if (c.length > d.length) return false
  const rec = (i: number, s: Map<number, TermoC>): boolean => {
    if (i === c.length) return true
    const l = c[i]
    for (const m of d) {
      if (m.pos !== l.pos || m.p !== l.p || m.a.length !== l.a.length) continue
      const s2 = new Map(s)
      if (l.a.every((x, k) => casar(x, m.a[k], s2)) && rec(i + 1, s2)) return true
      // a = b também casa com b = a
      if (l.p === IGUAL) {
        const s3 = new Map(s)
        if (casar(l.a[0], m.a[1], s3) && casar(l.a[1], m.a[0], s3) && rec(i + 1, s3)) return true
      }
    }
    return false
  }
  return rec(0, new Map())
}

// ---------------------------------------------------------------- das fórmulas às cláusulas

type NNF =
  | { k: 'lit'; pos: boolean; p: string; a: Termo[] }
  | { k: 'and' | 'or'; l: NNF; r: NNF }
  | { k: 'forall' | 'exists'; v: string; c: NNF }
  | { k: 'v' | 'f' }

class NaoSuportada extends Error {}

/** forma normal negativa: só ∧, ∨, quantificadores e literais (as negações descem até os átomos) */
function nnf(f: Formula, pos: boolean): NNF {
  const e = (l: NNF, r: NNF): NNF => ({ k: 'and', l, r })
  const ou = (l: NNF, r: NNF): NNF => ({ k: 'or', l, r })
  switch (f.k) {
    case 'pred':
      return { k: 'lit', pos, p: f.nome, a: f.args }
    case 'rel':
      if (f.op !== '=' && f.op !== '∈') throw new NaoSuportada('números')
      return { k: 'lit', pos, p: f.op, a: [f.l, f.r] }
    case 'const':
      return { k: f.valor === pos ? 'v' : 'f' }
    case 'not':
      return nnf(f.f, !pos)
    case 'and':
      return pos ? e(nnf(f.l, true), nnf(f.r, true)) : ou(nnf(f.l, false), nnf(f.r, false))
    case 'or':
      return pos ? ou(nnf(f.l, true), nnf(f.r, true)) : e(nnf(f.l, false), nnf(f.r, false))
    case 'imp':
      return pos ? ou(nnf(f.l, false), nnf(f.r, true)) : e(nnf(f.l, true), nnf(f.r, false))
    case 'iff':
      return pos
        ? e(ou(nnf(f.l, false), nnf(f.r, true)), ou(nnf(f.l, true), nnf(f.r, false)))
        : e(ou(nnf(f.l, true), nnf(f.r, true)), ou(nnf(f.l, false), nnf(f.r, false)))
    case 'forall':
    case 'exists': {
      if (f.dom) throw new NaoSuportada('domínio')
      const universal = (f.k === 'forall') === pos
      return { k: universal ? 'forall' : 'exists', v: f.v, c: nnf(f.corpo, pos) }
    }
    default:
      throw new NaoSuportada('lógica modal')
  }
}

/** uma fórmula vira mais cláusulas que isto: fica de fora (distribuir ∨ sobre ∧ pode explodir) */
const MAX_CLAUSULAS_POR_FORMULA = 400

interface Contexto {
  vars: number
  sk: number
  usaVazio: boolean
}

function paraClausulas(n: NNF, env: Map<string, TermoC>, univ: number[], ctx: Contexto): Literal[][] {
  const termo = (t: Termo): TermoC => {
    switch (t.k) {
      case 'nome':
        return env.get(t.nome) ?? { f: t.nome, a: [] }
      case 'app':
        return { f: t.fn, a: t.args.map(termo) }
      case 'vazio':
        ctx.usaVazio = true
        return { f: VAZIO, a: [] }
      default:
        throw new NaoSuportada('termo')
    }
  }
  switch (n.k) {
    case 'v':
      return []
    case 'f':
      return [[]]
    case 'lit':
      return [[{ pos: n.pos, p: n.p, a: n.a.map(termo) }]]
    case 'and':
      return [...paraClausulas(n.l, env, univ, ctx), ...paraClausulas(n.r, env, univ, ctx)]
    case 'or': {
      const l = paraClausulas(n.l, env, univ, ctx)
      const r = paraClausulas(n.r, env, univ, ctx)
      if (l.length * r.length > MAX_CLAUSULAS_POR_FORMULA) throw new NaoSuportada('longa demais')
      return l.flatMap((x) => r.map((y) => [...x, ...y]))
    }
    case 'forall': {
      const v = ctx.vars++
      return paraClausulas(n.c, new Map(env).set(n.v, v), [...univ, v], ctx)
    }
    case 'exists': {
      // um nome novo no lugar do "existe" (função das variáveis "para todo" de fora)
      const sk: TermoC = { f: `${SK}${++ctx.sk}`, a: [...univ] }
      return paraClausulas(n.c, new Map(env).set(n.v, sk), univ, ctx)
    }
  }
}

/** As cláusulas de uma fórmula (já expandida). Lança NaoSuportada para lógica modal, números, etc. */
export function clausificar(f: Formula, ctx: Contexto = { vars: 0, sk: 0, usaVazio: false }): Literal[][] {
  return paraClausulas(nnf(f, true), new Map(), [], ctx)
}

// ---------------------------------------------------------------- de volta à notação do caderno

const NOMES_VARS = ['x', 'y', 'z', 'w', 'u', 'v', 's', 't']

/** A cláusula como fórmula do caderno: ∀x ∀y (A ∧ B ⟹ C ∨ D), ou só C, ou ¬A. */
export function formulaDaClausula(lits: Literal[], ocupados: Set<string>): string {
  const livres = [...NOMES_VARS, ...NOMES_VARS.map((n) => `${n}1`), ...NOMES_VARS.map((n) => `${n}2`)].filter((n) => !ocupados.has(n))
  const neg = lits.filter((l) => !l.pos)
  const posi = lits.filter((l) => l.pos)
  // as variáveis ganham nome na ordem em que aparecem (x, y, z…)
  const ordem: number[] = []
  const achar = (t: TermoC): void => (ehVar(t) ? void (ordem.includes(t) || ordem.push(t)) : t.a.forEach(achar))
  ;[...neg, ...posi].forEach((l) => l.a.forEach(achar))
  const nome = (v: number) => livres[ordem.indexOf(v)] ?? `x${v}`
  const sp = { pos: 0, end: 0 }
  const termo = (t: TermoC): Termo =>
    ehVar(t)
      ? { k: 'nome', nome: nome(t), ...sp }
      : t.a.length
        ? { k: 'app', fn: t.f, args: t.a.map(termo), subscrito: false, ...sp }
        : t.f === VAZIO
          ? { k: 'vazio', ...sp }
          : { k: 'nome', nome: t.f, ...sp }
  const atomo = (l: Literal, negado = false): Formula =>
    l.p === IGUAL || l.p === PERTENCE
      ? { k: 'rel', op: l.p === IGUAL ? (negado ? '≠' : '=') : negado ? '∉' : '∈', l: termo(l.a[0]), r: termo(l.a[1]), ...sp }
      : negado
        ? { k: 'not', f: { k: 'pred', nome: l.p, args: l.a.map(termo), ...sp }, ...sp }
        : { k: 'pred', nome: l.p, args: l.a.map(termo), ...sp }
  const juntar = (fs: Formula[], k: 'and' | 'or'): Formula => fs.reduce((a, b) => ({ k, l: a, r: b, ...sp }))
  let corpo: Formula
  if (!lits.length) corpo = { k: 'const', valor: false, ...sp }
  else if (!neg.length) corpo = juntar(posi.map((l) => atomo(l)), 'or')
  else if (!posi.length)
    corpo = neg.length === 1 ? atomo(neg[0], true) : { k: 'not', f: juntar(neg.map((l) => atomo(l)), 'and'), ...sp }
  else corpo = { k: 'imp', l: juntar(neg.map((l) => atomo(l)), 'and'), r: juntar(posi.map((l) => atomo(l)), 'or'), ...sp }
  for (const v of [...ordem].reverse()) corpo = { k: 'forall', v: nome(v), vPos: 0, corpo, ...sp }
  return imprimir(corpo)
}

// ---------------------------------------------------------------- o gerador

/** fila das cláusulas esperando a vez: a mais leve primeiro (empate: a mais antiga) */
class Fila {
  private h: Clausula[] = []
  get tamanho() {
    return this.h.length
  }
  private menor = (i: number, j: number) => this.h[i].peso < this.h[j].peso || (this.h[i].peso === this.h[j].peso && this.h[i].id < this.h[j].id)
  por(c: Clausula) {
    const h = this.h
    h.push(c)
    for (let i = h.length - 1; i > 0; ) {
      const p = (i - 1) >> 1
      if (!this.menor(i, p)) break
      ;[h[i], h[p]] = [h[p], h[i]]
      i = p
    }
  }
  tirar(): Clausula | undefined {
    const h = this.h
    if (!h.length) return undefined
    const topo = h[0]
    const ultimo = h.pop()!
    if (h.length) {
      h[0] = ultimo
      for (let i = 0; ; ) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < h.length && this.menor(l, m)) m = l
        if (r < h.length && this.menor(r, m)) m = r
        if (m === i) break
        ;[h[i], h[m]] = [h[m], h[i]]
        i = m
      }
    }
    return topo
  }
}

export interface NotaParaGerar {
  id: string
  formulas: Formula[]
}

export interface EstatisticasGerador {
  /** cláusulas escolhidas (já combinadas com as outras) */
  escolhidas: number
  geradas: number
  esperando: number
  guardadas: number
  descartadas: number
  /** passaram do peso máximo (seriam geradas com um peso maior) */
  pesadas: number
  /** reescritas por uma regra (saíram, e entrou a versão simplificada) */
  simplificadas: number
}

/**
 * O gerador para um conjunto de leis. `passo(n)` faz até n rodadas do laço e
 * devolve o que achou; chamado de novo, continua de onde parou. `emitidos`:
 * teoremas já entregues antes (não saem de novo, mas contam como guardados).
 */
export class Gerador {
  /** fórmulas que o gerador não lê (lógica modal, números, longas demais) */
  readonly ignoradas: { nota: string; motivo: string }[] = []
  readonly estatisticas: EstatisticasGerador = { escolhidas: 0, geradas: 0, esperando: 0, guardadas: 0, descartadas: 0, pesadas: 0, simplificadas: 0 }
  contradicao: string[] | null = null
  private proximo = 0
  private fila = new Fila()
  /** todas, na ordem em que nasceram (para escolher de vez em quando a mais antiga) */
  private antigas: Clausula[] = []
  private inicioAntigas = 0
  private esperando = 0
  private ativas: Clausula[] = []
  private indice = new Map<string, { c: Clausula; i: number }[]>()
  private foraDesdeArrumar = 0
  private entradas: Literal[][] = []
  private guardados: { chave: string; lits: Literal[] }[] = []
  private chaves = new Set<string>()
  private escolhas = 0
  private pesoMax: number
  /** as leis usam "=": paramodulação, reescrita e resolução da igualdade */
  private igualdade = false
  /** igualdades de um literal só, orientadas (o lado maior vira o menor), pelo símbolo do lado maior */
  private reescritas = new Map<string, { l: TermoC; r: TermoC; c: Clausula }[]>()

  constructor(
    notas: NotaParaGerar[],
    /** nomes do usuário (as variáveis da saída não podem ter esses nomes) */
    private ocupados: Set<string>,
    private op: OpcoesGerador = OPCOES_GERADOR,
    private emitidos: Set<string> = new Set(),
  ) {
    this.pesoMax = op.pesoMax
    const ctx: Contexto = { vars: 0, sk: 0, usaVazio: false }
    let usaIgual = false
    for (const n of notas)
      for (const f of n.formulas) {
        let cs: Literal[][]
        try {
          cs = clausificar(f, ctx)
        } catch (e) {
          if (!(e instanceof NaoSuportada)) throw e
          this.ignoradas.push({ nota: n.id, motivo: e.message })
          continue
        }
        for (const c of cs) {
          if (c.some((l) => l.p === IGUAL)) usaIgual = true
          this.entrada(c, n.id)
        }
      }
    if (ctx.usaVazio) this.entrada([{ pos: false, p: PERTENCE, a: [0, { f: VAZIO, a: [] }] }], `${ORIGEM_INTERNA}vazio`)
    // a igualdade é nativa (paramodulação, reescrita, resolução da igualdade): sem axiomas dela
    this.igualdade = usaIgual
  }

  private entrada(lits: Literal[], origem: string) {
    const n = normalizar(lits, !origem.startsWith(ORIGEM_INTERNA))
    if (!n) return
    if (!n.lits.length) {
      this.contradicao = [origem]
      return
    }
    this.entradas.push(n.lits)
    this.nova(n.lits, n.chave, [], [origem], 0, [])
  }

  private nova(lits: Literal[], chave: string, pais: number[], apoio: string[], prof: number, ancestrais: string[]) {
    if (this.chaves.has(chave)) return
    this.chaves.add(chave)
    const sig = [...new Set(lits.map(tipoL))]
    const c: Clausula = { id: this.proximo++, lits, peso: pesoC(lits), prof, apoio, chave, sig, ancestrais, guardada: false, estado: 'esperando' }
    this.estatisticas.geradas++
    this.esperando++
    this.fila.por(c)
    this.antigas.push(c)
  }

  /** não há mais nenhuma esperando: tudo até o peso máximo já foi gerado */
  get saturado() {
    return !this.contradicao && this.esperando === 0
  }

  get pesoAtual() {
    return this.pesoMax
  }

  /** Até `n` rodadas do laço; devolve os teoremas novos (e usos, superados, contradição). */
  passo(n: number): EventoGerador[] {
    const eventos: EventoGerador[] = []
    if (this.contradicao) return eventos
    for (let k = 0; k < n; k++) {
      const g = this.escolher()
      if (!g) break
      this.esperando--
      // a escolhida, reescrita pelas regras de agora: se mudou, a versão simplificada entra no lugar dela
      if (this.reescritas.size && this.simplificar(g, eventos)) {
        if (this.contradicao) break
        continue
      }
      const sigG = new Set(g.sig)
      // alguma ativa já diz o mesmo, mais geral: esta não acrescenta nada
      if (this.ativas.some((a) => a.estado === 'ativa' && a.lits.length <= g.lits.length && a.sig.every((x) => sigG.has(x)) && subsume(a.lits, g.lits))) {
        g.estado = 'fora'
        this.estatisticas.descartadas++
        continue
      }
      // e esta torna desnecessárias as ativas mais específicas
      for (const a of this.ativas)
        if (a.estado === 'ativa' && a.lits.length >= g.lits.length && g.sig.every((x) => a.sig.includes(x)) && subsume(g.lits, a.lits)) {
          a.estado = 'fora'
          this.foraDesdeArrumar++
        }
      g.estado = 'ativa'
      const regra = this.ativar(g)
      this.estatisticas.escolhidas++
      this.avaliar(g, eventos)
      // uma regra nova: as ativas que ela simplifica saem, e entram as versões simplificadas
      if (regra && this.simplificarAtivas(g, eventos)) break
      if (this.combinar(g, eventos)) break
    }
    this.estatisticas.esperando = this.esperando
    return eventos
  }

  /** a próxima: a mais leve; a cada 5, a mais antiga que ainda espera (nenhuma fica esquecida) */
  private escolher(): Clausula | undefined {
    if (++this.escolhas % 5 === 0) {
      while (this.inicioAntigas < this.antigas.length && this.antigas[this.inicioAntigas].estado !== 'esperando') this.inicioAntigas++
      if (this.inicioAntigas > 50_000) {
        this.antigas = this.antigas.slice(this.inicioAntigas)
        this.inicioAntigas = 0
      }
      if (this.inicioAntigas < this.antigas.length) return this.antigas[this.inicioAntigas++]
    }
    for (;;) {
      const c = this.fila.tirar()
      if (!c) return undefined
      if (c.estado === 'esperando') return c
    }
  }

  /** põe a cláusula entre as ativas; true se ela virou uma regra de reescrita */
  private ativar(c: Clausula): boolean {
    // de tempos em tempos, as que saíram deixam a lista e o índice
    if (this.foraDesdeArrumar > 1000) {
      this.ativas = this.ativas.filter((a) => a.estado === 'ativa')
      this.indice.clear()
      for (const a of this.ativas) this.indexar(a)
      this.foraDesdeArrumar = 0
    }
    this.ativas.push(c)
    this.indexar(c)
    // uma igualdade de um literal só que a ordem orienta passa a reescrever as cláusulas novas
    const [l] = c.lits
    if (this.igualdade && c.lits.length === 1 && l.pos && l.p === IGUAL) {
      const [s, t] = l.a
      const regra = maior(s, t) ? { l: s, r: t } : maior(t, s) ? { l: t, r: s } : null
      if (regra && !ehVar(regra.l)) {
        const lista = this.reescritas.get(regra.l.f)
        if (lista) lista.push({ ...regra, c })
        else this.reescritas.set(regra.l.f, [{ ...regra, c }])
        return true
      }
    }
    return false
  }

  /**
   * A cláusula reescrita pelas regras de agora (sem a regra dela mesma). Se
   * mudou, ela sai (e deixa de ser regra, se era; se era um teorema guardado,
   * fica superado) e a versão simplificada entra; true nesse caso.
   */
  private simplificar(c: Clausula, eventos: EventoGerador[]): boolean {
    const usadas = new Set<Clausula>()
    const orc = { n: MAX_REESCRITAS }
    const lits = c.lits.map((l) => ({ ...l, a: l.a.map((t) => this.formaNormal(t, usadas, orc, c)) }))
    if (!usadas.size) return false
    if (c.estado === 'ativa') this.foraDesdeArrumar++
    c.estado = 'fora'
    this.estatisticas.simplificadas++
    for (const [f, lista] of this.reescritas) {
      const resto = lista.filter((r) => r.c !== c)
      if (resto.length !== lista.length) this.reescritas.set(f, resto)
    }
    if (c.guardada) {
      eventos.push({ tipo: 'superado', chave: c.chave })
      this.guardados = this.guardados.filter((g) => g.chave !== c.chave)
    }
    return this.derivar(lits, [c, ...usadas], eventos)
  }

  /** a regra nova `r` simplifica as ativas: as simplificadas saem e as versões novas entram; true se achou a contradição */
  private simplificarAtivas(r: Clausula, eventos: EventoGerador[]): boolean {
    for (const a of [...this.ativas]) {
      if (a === r || a.estado !== 'ativa') continue
      if (this.simplificar(a, eventos) && this.contradicao) return true
    }
    return false
  }

  /** t reescrito até não dar mais (as regras usadas entram em `usadas`; `orc`: no máximo tantas reescritas) */
  private formaNormal(t: TermoC, usadas: Set<Clausula>, orc: { n: number }, exceto?: Clausula): TermoC {
    if (ehVar(t)) return t
    const u: { f: string; a: TermoC[] } = t.a.length ? { f: t.f, a: t.a.map((x) => this.formaNormal(x, usadas, orc, exceto)) } : t
    for (const regra of this.reescritas.get(u.f) ?? []) {
      if (orc.n <= 0) return u
      if (regra.c === exceto) continue
      const s = new Map<number, TermoC>()
      if (!casar(regra.l, u, s)) continue
      orc.n--
      usadas.add(regra.c)
      return this.formaNormal(trocarVars(regra.r, s), usadas, orc, exceto)
    }
    return u
  }

  private indexar(c: Clausula) {
    c.lits.forEach((l, i) => {
      const k = tipoL(l)
      const lista = this.indice.get(k)
      if (lista) lista.push({ c, i })
      else this.indice.set(k, [{ c, i }])
    })
  }

  /** a cláusula escolhida é um teorema que vale guardar? */
  private avaliar(c: Clausula, eventos: EventoGerador[]) {
    if (c.prof === 0 || c.peso > this.pesoMax) return
    const usuario = c.apoio.filter((o) => !o.startsWith(ORIGEM_INTERNA))
    if (!usuario.length) return
    if (c.lits.some((l) => l.a.some(temSkolem))) return
    // só repete uma lei (ou é um caso dela)
    if (this.entradas.some((e) => subsume(e, c.lits))) return
    c.guardada = true
    this.estatisticas.guardadas++
    if (this.emitidos.has(c.chave)) return
    this.emitidos.add(c.chave)
    eventos.push({
      tipo: 'teorema',
      t: { chave: c.chave, formula: formulaDaClausula(c.lits, this.ocupados), peso: c.peso, prof: c.prof, apoio: usuario, pais: c.ancestrais },
    })
    for (const a of c.ancestrais) eventos.push({ tipo: 'uso', chave: a })
    // os guardados antes, mais específicos que este, ficam superados
    for (const g of this.guardados) if (g.lits.length >= c.lits.length && subsume(c.lits, g.lits)) eventos.push({ tipo: 'superado', chave: g.chave })
    this.guardados = this.guardados.filter((g) => !(g.lits.length >= c.lits.length && subsume(c.lits, g.lits)))
    this.guardados.push({ chave: c.chave, lits: c.lits })
  }

  /** resolução da escolhida com as ativas (e com ela mesma) e fatoração; true se achou a contradição */
  /** os teoremas guardados mais próximos de onde uma cláusula nova vem */
  private herdados(pais: Clausula[]) {
    const s = new Set<string>()
    for (const p of pais) for (const a of p.guardada ? [p.chave] : p.ancestrais) s.add(a)
    return [...s].slice(0, 12)
  }

  /**
   * Uma cláusula derivada de `pais`: reescrita pelas regras (as usadas entram
   * no apoio), arrumada e, se não for pesada demais, posta na fila. true se
   * for a cláusula vazia (as leis se contradizem).
   */
  private derivar(lits: Literal[], pais: Clausula[], eventos: EventoGerador[]): boolean {
    if (this.reescritas.size) {
      const usadas = new Set<Clausula>()
      const orc = { n: MAX_REESCRITAS }
      lits = lits.map((l) => ({ ...l, a: l.a.map((t) => this.formaNormal(t, usadas, orc)) }))
      for (const u of usadas) if (!pais.includes(u)) pais = [...pais, u]
    }
    // pesada demais (antes de arrumar: só literais repetidos fariam o peso cair, e são raros)
    if ((pesoC(lits) > this.pesoMax || lits.length > this.op.litMax) && !temRepetido(lits)) {
      this.estatisticas.pesadas++
      return false
    }
    const n = normalizar(lits)
    if (!n) return false
    const apoio = [...new Set(pais.flatMap((p) => p.apoio))].sort()
    if (!n.lits.length) {
      this.contradicao = apoio.filter((o) => !o.startsWith(ORIGEM_INTERNA))
      eventos.push({ tipo: 'contradicao', apoio: this.contradicao })
      return true
    }
    const peso = pesoC(n.lits)
    if (peso > this.pesoMax || n.lits.length > this.op.litMax || n.lits.some((l) => l.a.some((t) => altura(t) > this.op.profTermo))) {
      this.estatisticas.pesadas++
      return false
    }
    this.nova(n.lits, n.chave, pais.map((p) => p.id), apoio, 1 + Math.max(...pais.map((p) => p.prof)), this.herdados(pais))
    // memória: fila grande demais, o peso máximo baixa (o que for mais pesado espera um aprofundamento)
    if (this.esperando > this.op.passivasMax) this.pesoMax = Math.max(4, this.pesoMax - 1)
    return false
  }

  private combinar(g: Clausula, eventos: EventoGerador[]): boolean {
    const desloc = nVars(g.lits)
    const tentar = (lits: Literal[], pais: Clausula[]): boolean => this.derivar(lits, pais, eventos)
    // resolução: um literal da escolhida contra um oposto de uma ativa (a = b também contra b ≠ a)
    for (let i = 0; i < g.lits.length; i++) {
      const l = g.lits[i]
      const oposto = this.indice.get(`${l.pos ? '-' : '+'}${l.p}/${l.a.length}`) ?? []
      for (const { c: a, i: j } of oposto) {
        if (a.estado !== 'ativa') continue
        const m = a.lits[j]
        const ordens = l.p === IGUAL ? [m.a, [m.a[1], m.a[0]]] : [m.a]
        for (const args of ordens) {
          const s = new Map<number, TermoC>()
          if (!l.a.every((x, k) => unificar(x, deslocar(args[k], desloc), s))) continue
          const resto = [
            ...g.lits.filter((_, k) => k !== i).map((x) => ({ ...x, a: x.a.map((t) => aplicar(t, s)) })),
            ...a.lits.filter((_, k) => k !== j).map((x) => ({ ...x, a: x.a.map((t) => aplicar(deslocar(t, desloc), s)) })),
          ]
          if (tentar(resto, a === g ? [g] : [g, a])) return true
        }
      }
    }
    if (this.igualdade) {
      // resolução da igualdade: "s ≠ t ou C" com s e t unificáveis dá C
      for (let i = 0; i < g.lits.length; i++) {
        const l = g.lits[i]
        if (l.pos || l.p !== IGUAL) continue
        const s = new Map<number, TermoC>()
        if (!unificar(l.a[0], l.a[1], s)) continue
        if (tentar(g.lits.filter((_, k) => k !== i).map((x) => ({ ...x, a: x.a.map((t) => aplicar(t, s)) })), [g])) return true
      }
      // paramodulação: das igualdades da escolhida para dentro das ativas (e dela mesma), e das ativas para dentro dela
      for (const a of this.ativas) {
        if (a.estado !== 'ativa') continue
        if (this.paramodular(g, a, tentar)) return true
        if (a !== g && this.paramodular(a, g, tentar)) return true
      }
    }
    // fatoração: dois literais iguais (de mesmo sinal) da escolhida viram um
    for (let i = 0; i < g.lits.length; i++)
      for (let j = i + 1; j < g.lits.length; j++) {
        const x = g.lits[i]
        const y = g.lits[j]
        if (x.pos !== y.pos || x.p !== y.p || x.a.length !== y.a.length) continue
        const s = new Map<number, TermoC>()
        if (!x.a.every((t, k) => unificar(t, y.a[k], s))) continue
        if (tentar(g.lits.filter((_, k) => k !== j).map((z) => ({ ...z, a: z.a.map((t) => aplicar(t, s)) })), [g])) return true
      }
    return false
  }

  /**
   * Paramodulação de `e` (que tem "s = t") para dentro de `d`: cada pedaço de d
   * (não variável) que unifica com s vira t. De uma variável não se troca (ela
   * casaria com tudo), nem do lado menor de uma igualdade que a ordem orienta.
   */
  private paramodular(e: Clausula, d: Clausula, tentar: (lits: Literal[], pais: Clausula[]) => boolean): boolean {
    const desloc = nVars(e.lits)
    let dl: Literal[] | null = null
    for (let k = 0; k < e.lits.length; k++) {
      const eq = e.lits[k]
      if (!eq.pos || eq.p !== IGUAL) continue
      for (const [s, t] of [
        [eq.a[0], eq.a[1]],
        [eq.a[1], eq.a[0]],
      ]) {
        if (ehVar(s) || maior(t, s)) continue
        dl ??= d.lits.map((l) => ({ ...l, a: l.a.map((x) => deslocar(x, desloc)) }))
        for (let j = 0; j < dl.length; j++) {
          const m = dl[j]
          for (let ai = 0; ai < m.a.length; ai++)
            for (const pos of posicoes(m.a[ai])) {
              if (pos.t.f !== s.f || pos.t.a.length !== s.a.length) continue
              const sub = new Map<number, TermoC>()
              if (!unificar(s, pos.t, sub)) continue
              const novo: Literal = { ...m, a: m.a.map((x, i) => (i === ai ? trocarEm(x, pos.c, t) : x)) }
              const lits = [...e.lits.filter((_, i) => i !== k), ...dl.map((l, i) => (i === j ? novo : l))].map((l) => ({
                ...l,
                a: l.a.map((x) => aplicar(x, sub)),
              }))
              if (tentar(lits, e === d ? [e] : [e, d])) return true
            }
        }
      }
    }
    return false
  }
}

/** quantas reescritas, no máximo, numa cláusula nova (a ordem garante que termina; isto só protege de um caso enorme) */
const MAX_REESCRITAS = 2000
