// TPTP: a biblioteca de problemas de lógica de primeira ordem usada pelos
// provadores automáticos (tptp.org). Lê arquivos .p/.ax no formato FOF e CNF
// e traduz para a linguagem do caderno: axiomas viram leis; conjecturas e
// teoremas viram teoremas (o motor confere).
//
//   fof(nome, papel, ![X]: (p(X) => q(X))).      cnf(nome, papel, ~p(X) | q(X)).
//
// Variáveis (maiúscula) viram minúsculas; nomes com "_" viram camelCase (na
// linguagem, "_" é subscrito). Não segue include().
//
// TFF com tipos simples (TF0, sem aritmética) também: cada tipo vira um
// predicado, ∀x:nat φ ⟶ ∀x (tipoNat(x) ⟹ φ), mais as leis de que cada
// função devolve o seu tipo e de que nenhum tipo é vazio. É exato: segue e
// não segue o mesmo que no original. Não lê THF, TFF com aritmética nem tipos
// polimórficos (TF1).

import { validar } from '../logica/validador'
import { notaVazia } from './estado'
import type { EntradaDicionario, Nota } from './tipos'

type Tk = { t: 'palavra' | 'var' | 'aspas' | 'distinto' | 'num' | 'sim'; v: string }

function tokens(texto: string): Tk[] {
  const r: Tk[] = []
  let i = 0
  const n = texto.length
  while (i < n) {
    const c = texto[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '%') {
      while (i < n && texto[i] !== '\n') i++
      continue
    }
    if (c === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2)
      i = fim < 0 ? n : fim + 2
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      let v = ''
      while (j < n && texto[j] !== c) {
        if (texto[j] === '\\') j++
        v += texto[j++]
      }
      r.push({ t: c === "'" ? 'aspas' : 'distinto', v })
      i = j + 1
      continue
    }
    if (/[a-z$]/.test(c)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_$]/.test(texto[j])) j++
      r.push({ t: 'palavra', v: texto.slice(i, j) })
      i = j
      continue
    }
    if (/[A-Z]/.test(c)) {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_]/.test(texto[j])) j++
      r.push({ t: 'var', v: texto.slice(i, j) })
      i = j
      continue
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1
      while (j < n && /[0-9.]/.test(texto[j])) j++
      r.push({ t: 'num', v: texto.slice(i, j) })
      i = j
      continue
    }
    const sim = ['<=>', '<~>', '=>', '<=', '~|', '~&', '!=', ':=', '!', '?', '~', '&', '|', '=', '(', ')', '[', ']', ',', '.', ':', '>', '*'].find((s) =>
      texto.startsWith(s, i),
    )
    if (!sim) throw new Error(`símbolo inesperado “${c}”`)
    r.push({ t: 'sim', v: sim })
    i += sim.length
  }
  return r
}

/** Fórmula intermediária (a tradução sai dela). */
type F =
  | { k: 'atomo'; p: string; args: T[] }
  | { k: 'igual'; neg: boolean; l: T; r: T }
  | { k: 'verdade'; v: boolean }
  | { k: 'nao'; f: F }
  | { k: 'bin'; op: string; l: F; r: F }
  | { k: 'quant'; q: '!' | '?'; vars: string[]; f: F; tipos?: string[] }
type T = { k: 'var'; v: string } | { k: 'fn'; f: string; args: T[] }

/** o tipo de quem não declara (FOF, CNF e as variáveis sem tipo em TFF) */
const INDIVIDUO = '$i'
/** variável sem restrição de tipo (só nas leis que o próprio tradutor escreve) */
const SEM_TIPO = ''

/** tipo atômico de uma variável ou de um argumento: só os do próprio arquivo e $i */
function tipoSimples(t: Tk, onde: string): string {
  // nome entre aspas ('A_set$', '$ki_world') é um nome como outro qualquer (como nos símbolos,
  // fica sem as aspas; só '$i' e '$o' entre aspas não são os do sistema)
  if (t.t === 'aspas') return t.v === INDIVIDUO || t.v === '$o' ? `'${t.v}'` : t.v
  if (t.t !== 'palavra') throw new Error(`esperava um tipo ${onde}, veio “${t.v}”`)
  if (t.v === '$o' && onde === 'na variável') throw new Error('variáveis do tipo $o (verdadeiro/falso) não são lidas')
  if (t.v.startsWith('$') && t.v !== INDIVIDUO && t.v !== '$o') throw new Error(`o tipo ${t.v} não é lido`)
  return t.v
}

class Leitor {
  i = 0
  constructor(private ts: Tk[]) {}
  ver(v?: string) {
    const t = this.ts[this.i]
    return v === undefined ? t : t && t.t === 'sim' && t.v === v
  }
  pegar(v?: string): Tk {
    const t = this.ts[this.i]
    if (!t) throw new Error('o arquivo acabou no meio de uma fórmula')
    if (v !== undefined && !(t.t === 'sim' && t.v === v)) throw new Error(`esperava “${v}”, veio “${t.v}”`)
    this.i++
    return t
  }
  formula(): F {
    let l = this.unitaria()
    const t = this.ver() as Tk | undefined
    if (t?.t === 'sim' && ['&', '|'].includes(t.v)) {
      while (this.ver(t.v)) {
        this.pegar()
        l = { k: 'bin', op: t.v, l, r: this.unitaria() }
      }
      return l
    }
    if (t?.t === 'sim' && ['<=>', '<~>', '=>', '<=', '~|', '~&'].includes(t.v)) {
      this.pegar()
      return { k: 'bin', op: t.v, l, r: this.unitaria() }
    }
    return l
  }
  unitaria(): F {
    if (this.ver('~')) {
      this.pegar()
      return { k: 'nao', f: this.unitaria() }
    }
    if (this.ver('!') || this.ver('?')) {
      const q = this.pegar().v as '!' | '?'
      this.pegar('[')
      const vars: string[] = []
      const tipos: string[] = []
      do {
        vars.push(this.pegar().v)
        // variável com tipo (TFF): "X: nat"
        if (this.ver(':')) {
          this.pegar()
          tipos.push(tipoSimples(this.pegar(), 'na variável'))
        } else tipos.push(INDIVIDUO)
      } while (this.ver(',') && this.pegar())
      this.pegar(']')
      this.pegar(':')
      const f = this.unitaria()
      return tipos.some((t) => t !== INDIVIDUO) ? { k: 'quant', q, vars, f, tipos } : { k: 'quant', q, vars, f }
    }
    if (this.ver('(')) {
      this.pegar()
      const f = this.formula()
      this.pegar(')')
      return f
    }
    return this.atomica()
  }
  atomica(): F {
    const t = this.ver() as Tk | undefined
    if (t?.t === 'palavra' && (t.v === '$true' || t.v === '$false')) {
      this.pegar()
      return { k: 'verdade', v: t.v === '$true' }
    }
    const l = this.termo()
    if (this.ver('=') || this.ver('!=')) {
      const neg = this.pegar().v === '!='
      return { k: 'igual', neg, l, r: this.termo() }
    }
    if (l.k === 'var') throw new Error(`a variável ${l.v} está sozinha onde devia haver uma fórmula`)
    return { k: 'atomo', p: l.f, args: l.args }
  }
  termo(): T {
    const t = this.pegar()
    if (t.t === 'var') return { k: 'var', v: t.v }
    if (t.t === 'sim') throw new Error(`esperava um termo, veio “${t.v}”`)
    const args: T[] = []
    if (this.ver('(')) {
      this.pegar()
      do args.push(this.termo())
      while (this.ver(',') && this.pegar())
      this.pegar(')')
    }
    return { k: 'fn', f: t.t === 'distinto' ? `"${t.v}"` : t.v, args }
  }
}

export interface FormulaTptp {
  nome: string
  papel: string
  linguagem: 'fof' | 'cnf' | 'tff'
  formula: F
  original: string
}

/** Declaração de tipo do TFF: "nat: $tType" (um tipo novo) ou "soma: (nat * nat) > nat". */
export interface DeclaracaoTptp {
  nome: string
  simbolo: string
  /** declara um tipo (e não um símbolo) */
  tipoNovo: boolean
  args: string[]
  /** o tipo do resultado; $o num predicado */
  resultado: string
  original: string
}

// o que o TFF tem além de tipos simples: aritmética, tipos polimórficos (TF1), if/let (TFX)
const ARITMETICA = /\$(int|rat|real|sum|difference|product|quotient(_[etf])?|remainder_[etf]|floor|ceiling|truncate|round|uminus|less|lesseq|greater|greatereq|is_int|is_rat|to_int|to_rat|to_real)\b/
const POLIMORFICO = /!>|\$tType\s*[>*]|\[[^\]]*:\s*\$tType/
const TFX = /\$(ite|let)\w*\b|:=/

/** "f: (a * b) > c" depois do papel "type" */
function declaracao(r: Leitor): Omit<DeclaracaoTptp, 'nome' | 'original'> {
  let parenteses = 0
  while (r.ver('(')) {
    r.pegar()
    parenteses++
  }
  const simbolo = r.pegar()
  if (simbolo.t === 'var' || simbolo.t === 'sim') throw new Error(`esperava o nome de um símbolo, veio “${simbolo.v}”`)
  r.pegar(':')
  const args: string[] = []
  let resultado: string
  if (r.ver('(')) {
    r.pegar()
    do args.push(tipoSimples(r.pegar(), 'no argumento'))
    while (r.ver('*') && r.pegar())
    r.pegar(')')
    r.pegar('>')
    resultado = tipoSimples(r.pegar(), 'no resultado')
  } else {
    const t = r.pegar()
    if (t.t === 'palavra' && t.v === '$tType') {
      while (parenteses-- > 0) r.pegar(')')
      return { simbolo: tipoSimples(simbolo, 'no nome'), tipoNovo: true, args, resultado: '$tType' }
    }
    resultado = tipoSimples(t, 'no resultado')
    if (r.ver('>')) {
      r.pegar()
      args.push(resultado)
      resultado = tipoSimples(r.pegar(), 'no resultado')
    }
  }
  while (parenteses-- > 0) r.pegar(')')
  if (args.includes('$o')) throw new Error(`${simbolo.v}: argumento do tipo $o (verdadeiro/falso) não é lido`)
  const nome = simbolo.t === 'distinto' ? `"${simbolo.v}"` : simbolo.v
  return { simbolo: nome, tipoNovo: false, args, resultado }
}

/** Lê as fórmulas do arquivo; o que não entende vai para `avisos`. */
export function lerTptp(texto: string): { formulas: FormulaTptp[]; declaracoes: DeclaracaoTptp[]; avisos: string[] } {
  const avisos: string[] = []
  const tipos: DeclaracaoTptp[] = []
  // arquivos abertos juntos (marcados ao juntar): um include deles não precisa de aviso
  const abertos = new Set([...texto.matchAll(/^% === arquivo: (.+?) ===$/gm)].map((m) => m[1].trim()))
  const formulas: FormulaTptp[] = []
  // uma declaração por vez: até o ponto final de nível zero
  const declaracoes = texto.replace(/\r/g, '').split(/(?<=\))\s*\.\s*(?=\n|$|%|[a-z])/)
  for (const decl of declaracoes) {
    const d = decl.replace(/^\s*(%.*\n\s*)*/g, '').trim()
    if (!d || d.startsWith('%')) continue
    const m = d.match(/^(fof|cnf|tff|thf|tcf|include)\s*\(/)
    if (!m) continue
    if (m[1] === 'include') {
      const arquivo = d.match(/include\s*\(\s*'([^']+)'/)?.[1] ?? ''
      if (!abertos.has(arquivo.slice(arquivo.lastIndexOf('/') + 1)))
        avisos.push(`${d.replace(/\s+/g, ' ')}: este arquivo incluído não foi aberto — abra-o junto (pode escolher vários arquivos de uma vez)`)
      continue
    }
    if (m[1] === 'thf') {
      avisos.push('thf: fórmulas de ordem superior (THF) não são lidas')
      continue
    }
    // TFF (e o TCF, cláusulas com tipos): só os tipos simples
    const tff = m[1] === 'tff' || m[1] === 'tcf'
    if (tff) {
      const corpo = d.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")
      const fora = ARITMETICA.test(corpo) ? 'aritmética' : POLIMORFICO.test(corpo) ? 'tipos polimórficos (TF1)' : TFX.test(corpo) ? 'if/let (TFX)' : null
      if (fora) {
        avisos.push(`${m[1]}: fórmulas com ${fora} não são lidas`)
        continue
      }
    }
    try {
      const ts = tokens(d.slice(m[0].length))
      const r = new Leitor(ts)
      const nome = r.pegar().v
      r.pegar(',')
      const papel = r.pegar().v
      r.pegar(',')
      if (tff && papel === 'type') tipos.push({ nome, ...declaracao(r), original: `${d}.` })
      else formulas.push({ nome, papel, linguagem: tff ? 'tff' : (m[1] as 'fof' | 'cnf'), formula: r.formula(), original: `${d}.` })
    } catch (e) {
      avisos.push(`${d.slice(0, 60).replace(/\s+/g, ' ')}…: ${(e as Error).message}`)
    }
  }
  return { formulas, declaracoes: tipos, avisos }
}

/** "member_of" → "memberOf"; '...' e números ganham um nome válido. */
function nomeDoSimbolo(s: string): string {
  const limpo = s
    .replace(/^"|"$/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  let r = limpo.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('') || 'simbolo'
  if (/^[0-9]/.test(r)) r = `n${r}`
  return r === 'B' ? 'Bt' : r
}

export interface ImportacaoTptp {
  notas: Nota[]
  fichas: EntradaDicionario[]
  avisos: string[]
}

/** Traduz para notas do caderno (e as fichas dos símbolos novos). */
export function importarTptp(texto: string, origem: string, pasta: string, dicionario: EntradaDicionario[]): ImportacaoTptp {
  const { formulas, declaracoes, avisos } = lerTptp(texto)
  const existentes = new Map(dicionario.map((e) => [e.simbolo, e]))
  // símbolos do arquivo: tipo e aridade
  const usos = new Map<string, { tipo: EntradaDicionario['tipo']; aridade: number }>()
  // tipos das variáveis (TFF)
  const tiposUsados = new Set<string>()
  const termosDe = (t: T) => {
    if (t.k === 'var') return
    const tipo = t.args.length ? 'funcao' : 'constante'
    if (!usos.has(t.f)) usos.set(t.f, { tipo, aridade: t.args.length })
    t.args.forEach(termosDe)
  }
  const percorrer = (f: F) => {
    switch (f.k) {
      case 'atomo':
        if (!usos.has(f.p)) usos.set(f.p, { tipo: 'predicado', aridade: f.args.length })
        f.args.forEach(termosDe)
        break
      case 'igual':
        termosDe(f.l)
        termosDe(f.r)
        break
      case 'nao':
        percorrer(f.f)
        break
      case 'bin':
        percorrer(f.l)
        percorrer(f.r)
        break
      case 'quant':
        for (const t of f.tipos ?? [INDIVIDUO]) tiposUsados.add(t)
        percorrer(f.f)
        break
    }
  }
  // fórmulas com milhares de termos encadeados estouram a pilha (e o motor não daria conta delas)
  const lidas = formulas.filter((x) => {
    try {
      percorrer(x.formula)
      return true
    } catch {
      avisos.push(`${x.nome}: fórmula longa demais para o caderno`)
      return false
    }
  })
  /** variáveis livres (CNF): ficam todas sob um "para todo" */
  const livres = (f: F, ligadas = new Set<string>(), out = new Set<string>()): Set<string> => {
    const t = (x: T) => (x.k === 'var' ? !ligadas.has(x.v) && out.add(x.v) : x.args.forEach(t))
    switch (f.k) {
      case 'atomo':
        f.args.forEach(t)
        break
      case 'igual':
        t(f.l)
        t(f.r)
        break
      case 'nao':
        livres(f.f, ligadas, out)
        break
      case 'bin':
        livres(f.l, ligadas, out)
        livres(f.r, ligadas, out)
        break
      case 'quant':
        livres(f.f, new Set([...ligadas, ...f.vars]), out)
        break
    }
    return out
  }

  // TFF com mais de um tipo: cada tipo vira um predicado ("tipoNat(x)"), cada
  // quantificador fica restrito ao seu tipo, e entram as leis que os tipos
  // davam de graça: cada função devolve o seu tipo e nenhum tipo é vazio.
  // Com um tipo só (FOF, CNF ou TFF de um tipo), nada disso: fica como era
  const assinatura = new Map(declaracoes.filter((d) => !d.tipoNovo).map((d) => [d.simbolo, d]))
  const tiposNovos = new Map(declaracoes.filter((d) => d.tipoNovo).map((d) => [d.simbolo, d]))
  const assinaturaDe = (s: string, aridade: number) => assinatura.get(s) ?? { args: Array<string>(aridade).fill(INDIVIDUO), resultado: INDIVIDUO }
  for (const x of lidas) if (livres(x.formula).size) tiposUsados.add(INDIVIDUO)
  for (const [s, u] of usos) {
    if (u.tipo === 'predicado') continue
    const a = assinaturaDe(s, u.aridade)
    for (const t of [...a.args, a.resultado]) tiposUsados.add(t)
  }
  for (const t of tiposNovos.keys()) tiposUsados.add(t)
  tiposUsados.delete('$o')
  const comTipos = tiposUsados.size > 1
  const predicadoDoTipo = (t: string) => `$tipo:${t}`
  if (comTipos) {
    for (const t of tiposUsados) usos.set(predicadoDoTipo(t), { tipo: 'predicado', aridade: 1 })
    const funcoes = [...usos].filter(([s, u]) => u.tipo !== 'predicado' && !s.startsWith('$tipo:'))
    // "f: (a * b) > c" ⟶ ∀x ∀y ((tipoA(x) ∧ tipoB(y)) ⟹ tipoC(f(x, y)))
    for (const [s, u] of funcoes) {
      const a = assinaturaDe(s, u.aridade)
      const vars = a.args.map((_, i) => `X${i + 1}`)
      const atomo: F = { k: 'atomo', p: predicadoDoTipo(a.resultado), args: [{ k: 'fn', f: s, args: vars.map((v) => ({ k: 'var', v })) }] }
      const d = assinatura.get(s)
      lidas.push({
        nome: d?.nome ?? `${s}_tipo`,
        papel: 'type',
        linguagem: 'tff',
        formula: vars.length ? { k: 'quant', q: '!', vars, tipos: a.args, f: atomo } : atomo,
        original: d?.original ?? `% ${s} não tem declaração de tipo: é do tipo ${INDIVIDUO}`,
      })
    }
    // nenhum tipo é vazio (os que têm uma constante já não são)
    const comConstante = new Set(funcoes.filter(([, u]) => u.aridade === 0).map(([s]) => assinaturaDe(s, 0).resultado))
    for (const t of tiposUsados) {
      if (comConstante.has(t)) continue
      const d = tiposNovos.get(t)
      lidas.push({
        nome: d?.nome ?? 'tipo_individuo',
        papel: 'type',
        linguagem: 'tff',
        formula: { k: 'quant', q: '?', vars: ['X'], tipos: [SEM_TIPO], f: { k: 'atomo', p: predicadoDoTipo(t), args: [{ k: 'var', v: 'X' }] } },
        original: d?.original ?? `% o tipo ${INDIVIDUO} (o de quem não tem declaração) não é vazio`,
      })
    }
  }
  // nome no caderno de cada símbolo: o mesmo se já existir igual; senão, um livre
  const nomeNoCaderno = new Map<string, string>()
  const ocupados = new Set(existentes.keys())
  const fichas: EntradaDicionario[] = []
  // proposição (predicado sem argumentos): a linguagem não tem; vira predicado de um
  // lugar aplicado a uma constante só para isso, p ⟶ p(mundo). É exato: como o
  // predicado só aparece aplicado a ela, vale o mesmo que valia com p
  const proposicao = (u: { tipo: string; aridade: number }) => u.tipo === 'predicado' && u.aridade === 0
  for (const [s, u] of usos) {
    const aridade = proposicao(u) ? 1 : u.aridade
    const base = nomeDoSimbolo(s)
    const e = existentes.get(base)
    if (e && e.tipo === u.tipo && e.aridade === aridade) {
      nomeNoCaderno.set(s, base)
      continue
    }
    let nome = base
    for (let i = 2; ocupados.has(nome); i++) nome = `${base}${i}`
    ocupados.add(nome)
    nomeNoCaderno.set(s, nome)
    const doTipo = s.startsWith('$tipo:') ? s.slice('$tipo:'.length) : null
    const definicao = doTipo
      ? `Do TPTP (${origem}): ${nome}(x) quer dizer que x é do tipo ${doTipo}.`
      : proposicao(u)
        ? `Do TPTP (${origem}): proposição; ${nome}(mundo) quer dizer que ela vale.`
        : `Do TPTP (${origem}).`
    fichas.push({ id: '', simbolo: nome, termo: doTipo ? `tipo ${doTipo}` : s.replace(/^"|"$/g, ''), tipo: u.tipo, aridade, definicao })
  }
  let mundo = 'mundo'
  if ([...usos.values()].some(proposicao) && existentes.get(mundo)?.tipo !== 'constante') {
    for (let i = 2; ocupados.has(mundo); i++) mundo = `mundo${i}`
    ocupados.add(mundo)
    fichas.push({ id: '', simbolo: mundo, termo: 'mundo', tipo: 'constante', aridade: 0, definicao: 'Onde valem as proposições do TPTP: p(mundo) quer dizer que p vale.' })
  }
  const simbolos = new Set([...ocupados])
  /** variável do TPTP → nome livre em minúscula */
  const varNome = (v: string, env: Map<string, string>) => env.get(v) ?? v.toLowerCase()
  const novaVar = (v: string, env: Map<string, string>): string => {
    let base = v.toLowerCase().replace(/_/g, '')
    if (!/^[a-z]/.test(base)) base = `v${base}`
    let nome = base
    for (let i = 1; simbolos.has(nome) || [...env.values()].includes(nome); i++) nome = `${base}${i}`
    return nome
  }
  const termo = (t: T, env: Map<string, string>): string =>
    t.k === 'var' ? varNome(t.v, env) : t.args.length ? `${nomeNoCaderno.get(t.f)}(${t.args.map((a) => termo(a, env)).join(', ')})` : nomeNoCaderno.get(t.f)!
  const traduzir = (f: F, env: Map<string, string>): string => {
    switch (f.k) {
      case 'verdade': {
        // a linguagem não tem ⊤/⊥: "tudo é igual a si mesmo" (e a negação)
        const v = novaVar('V', env)
        return f.v ? `(∀${v} (${v} = ${v}))` : `¬(∀${v} (${v} = ${v}))`
      }
      case 'atomo':
        if (!f.args.length) return `${nomeNoCaderno.get(f.p)}(${mundo})`
        return `${nomeNoCaderno.get(f.p)}(${f.args.map((a) => termo(a, env)).join(', ')})`
      case 'igual': {
        const l = termo(f.l, env)
        const r = termo(f.r, env)
        // "t ≠ t" o validador recusa (no caderno, quase sempre é engano); no TPTP vem de propósito
        return f.neg ? (l === r ? `¬(${l} = ${r})` : `${l} ≠ ${r}`) : `${l} = ${r}`
      }
      case 'nao':
        return `¬(${traduzir(f.f, env)})`
      case 'bin': {
        // quantificador como lado de um conectivo vai entre parênteses: na linguagem do
        // caderno o escopo vai até o fim, e "∃x (A) ⟹ B" seria lido "∃x (A ⟹ B)"
        const lado = (g: F) => (g.k === 'quant' ? `(${traduzir(g, env)})` : traduzir(g, env))
        const l = lado(f.l)
        const r = lado(f.r)
        switch (f.op) {
          case '&':
            return `(${l} ∧ ${r})`
          case '|':
            return `(${l} ∨ ${r})`
          case '=>':
            return `(${l} ⟹ ${r})`
          case '<=':
            return `(${r} ⟹ ${l})`
          case '<=>':
            return `(${l} ⟺ ${r})`
          case '<~>':
            return `¬(${l} ⟺ ${r})`
          case '~|':
            return `¬(${l} ∨ ${r})`
          default:
            return `¬(${l} ∧ ${r})`
        }
      }
      case 'quant': {
        const env2 = new Map(env)
        const nomes = f.vars.map((v) => {
          const n = novaVar(v, env2)
          env2.set(v, n)
          return n
        })
        const quant = nomes.map((n) => `${f.q === '!' ? '∀' : '∃'}${n}`).join(' ')
        if (!comTipos) return `${quant} (${traduzir(f.f, env2)})`
        // cada variável só percorre o seu tipo: ∀x (tipoA(x) ⟹ …), ∃x (tipoA(x) ∧ …)
        const guardas = nomes.flatMap((n, i) => {
          const t = f.tipos?.[i] ?? INDIVIDUO
          return t === SEM_TIPO ? [] : [`${nomeNoCaderno.get(predicadoDoTipo(t))}(${n})`]
        })
        if (!guardas.length) return `${quant} (${traduzir(f.f, env2)})`
        const guarda = guardas.length === 1 ? guardas[0] : `(${guardas.join(' ∧ ')})`
        return `${quant} (${guarda} ${f.q === '!' ? '⟹' : '∧'} (${traduzir(f.f, env2)}))`
      }
    }
  }
  // validar com o dicionário inteiro a cada fórmula seria lento em teorias com milhares de
  // símbolos: cada fórmula leva só as fichas dos nomes que usa
  const porSimbolo = new Map([...dicionario, ...fichas.map((e) => ({ ...e, id: e.simbolo }))].map((e) => [e.simbolo, e]))
  const dicionarioDe = (texto: string) => [
    ...new Set([...texto.matchAll(/[\p{L}][\p{L}\p{N}]*/gu)].map((m) => m[0]).filter((n) => porSimbolo.has(n))),
  ].map((n) => porSimbolo.get(n)!)
  const agora = new Date().toISOString()
  const notas: Nota[] = []
  const fechada = (f: F): F => {
    const vs = [...livres(f)]
    return vs.length ? { k: 'quant', q: '!', vars: vs, f } : f
  }
  // em CNF a conjectura vem negada (o provador procura a contradição): as
  // cláusulas negadas voltam juntas como um teorema, "não valem todas juntas"
  const negadas = lidas.filter((x) => x.papel === 'negated_conjecture')
  const lista = lidas.filter((x) => x.papel !== 'negated_conjecture')
  // "e" de muitas cláusulas em árvore equilibrada (encadeado, ficaria fundo demais)
  const todas = (fs: F[]): F => (fs.length === 1 ? fs[0] : { k: 'bin', op: '&', l: todas(fs.slice(0, fs.length >> 1)), r: todas(fs.slice(fs.length >> 1)) })
  if (negadas.length)
    lista.push({
      nome: 'conjectura',
      papel: 'conjecture',
      linguagem: negadas[0].linguagem,
      formula: { k: 'nao', f: todas(negadas.map((x) => fechada(x.formula))) },
      original: `% a conjectura negada (${negadas.map((x) => x.nome).join(', ')}) não vale:\n${negadas.map((x) => x.original).join('\n')}`,
    })
  const ids = new Set<string>()
  for (const x of lista) {
    try {
      const texto = traduzir(fechada(x.formula), new Map())
      const v = validar(texto, dicionarioDe(texto))
      if (!v.ok) {
        avisos.push(`${x.nome}: a tradução não ficou válida (${v.diags.find((d) => d.nivel === 'erro')?.msg ?? 'erro'})`)
        continue
      }
      const teorema = ['conjecture', 'theorem', 'lemma', 'corollary'].includes(x.papel)
      // as leis dos tipos (escritas aqui) não podem tomar o id de uma fórmula do arquivo
      let id = `tptp-${origem.replace(/[^A-Za-z0-9]+/g, '-')}-${x.nome}`
      for (let i = 2; ids.has(id); i++) id = `tptp-${origem.replace(/[^A-Za-z0-9]+/g, '-')}-${x.nome}-${i}`
      ids.add(id)
      notas.push({
        ...notaVazia(teorema ? 'teorema' : 'lei'),
        id,
        titulo: `${x.nome} (${x.papel})`,
        formulas: [texto],
        tags: [pasta, 'tptp'],
        fonte: `TPTP: ${origem}`,
        texto: `Importado do TPTP (${origem}):\n${x.original}`,
        criadaEm: agora,
        atualizadaEm: agora,
      })
    } catch (e) {
      avisos.push(`${x.nome}: ${(e as Error).message}`)
    }
  }
  return { notas, fichas, avisos }
}
