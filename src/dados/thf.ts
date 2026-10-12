// THF (ordem superior, TH0) ⟶ primeira ordem com tipos, que o tradutor do
// TPTP (tptp.ts) termina como faz com o TFF.
//
// 1. As definições "c = (^[X]: …)" são abertas e os lambdas reduzidos (beta):
//    muitos problemas viram de primeira ordem só com isso.
// 2. O que sobra de ordem superior vira primeira ordem: uma variável de função
//    é um objeto, aplicado por ap(f, x); um valor lógico usado como objeto é
//    um objeto do tipo $bool (vale(b) diz que é verdadeiro; há só dois); um
//    lambda que sobra vira uma função nova com a sua definição; e entram as
//    leis de extensionalidade (funções iguais em tudo são iguais).
//
// "Segue" na tradução vale no original (cada lei nova é verdadeira lá). O
// contrário não: a tradução não garante todas as funções que a ordem superior
// garante (compreensão), então um cenário onde a conjectura falha pode não
// valer no original — o app marca esses problemas.
//
// Não lê: tipos polimórficos (TH1), escolha/descrição (@+, @-), if/let, números.

import type { DeclaracaoTptp, FormulaTptp, FTptp as F, TTptp as T } from './tptp'

type Tipo = { k: 'base'; n: string } | { k: 'fn'; a: Tipo; r: Tipo }
const BASE = (n: string): Tipo => ({ k: 'base', n })
const O = BASE('$o')
const I = BASE('$i')
const fn = (a: Tipo, r: Tipo): Tipo => ({ k: 'fn', a, r })
const igualTipo = (a: Tipo, b: Tipo): boolean => (a.k === 'base' ? b.k === 'base' && a.n === b.n : b.k === 'fn' && igualTipo(a.a, b.a) && igualTipo(a.r, b.r))
const ehO = (t: Tipo) => t.k === 'base' && t.n === '$o'

/** termo de ordem superior (as fórmulas são termos do tipo $o) */
type H =
  | { k: 'var'; v: string }
  | { k: 'const'; c: string }
  | { k: 'app'; f: H; a: H }
  | { k: 'lam'; v: string; t: Tipo; b: H }
  | { k: 'quant'; q: '!' | '?'; v: string; t: Tipo; b: H }
  | { k: 'nao'; f: H }
  | { k: 'bin'; op: string; l: H; r: H }
  | { k: 'igual'; neg: boolean; l: H; r: H }

// conectivos usados como termos: (~), (&), (=)…, e !! / ?? (para todo / existe de um predicado)
const CONECTIVOS = new Set(['~', '&', '|', '=>', '<=', '<=>', '<~>', '~|', '~&', '=', '!=', '!!', '??'])

// ---------------------------------------------------------------- leitura
type Tk = { t: 'palavra' | 'var' | 'aspas' | 'distinto' | 'num' | 'sim'; v: string }
const SIMBOLOS = ['<=>', '<~>', '@@+', '@@-', '=>', '<=', '~|', '~&', '!=', '!!', '??', '@+', '@-', '!>', '?*', ':=', '==', '!', '?', '~', '&', '|', '=', '(', ')', '[', ']', ',', '.', ':', '>', '*', '@', '^', '+']

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
      while (j < n && /[0-9./eE]/.test(texto[j])) j++
      r.push({ t: 'num', v: texto.slice(i, j) })
      i = j
      continue
    }
    const sim = SIMBOLOS.find((s) => texto.startsWith(s, i))
    if (!sim) throw new Error(`símbolo inesperado “${c}”`)
    r.push({ t: 'sim', v: sim })
    i += sim.length
  }
  return r
}

/** nome de símbolo: entre aspas e com "$", fica com as aspas (como no tptp.ts) */
const nomeLido = (t: Tk) => (t.t === 'distinto' ? `"${t.v}"` : t.t === 'aspas' && t.v.startsWith('$') ? `'${t.v}'` : t.v)

class Leitor {
  i = 0
  constructor(private ts: Tk[]) {}
  ver(v?: string): Tk | boolean | undefined {
    const t = this.ts[this.i]
    return v === undefined ? t : !!t && t.t === 'sim' && t.v === v
  }
  pegar(v?: string): Tk {
    const t = this.ts[this.i]
    if (!t) throw new Error('o arquivo acabou no meio de uma fórmula')
    if (v !== undefined && !(t.t === 'sim' && t.v === v)) throw new Error(`esperava “${v}”, veio “${t.v}”`)
    this.i++
    return t
  }
  // ---- tipos: $i, $o, nome, (τ), τ > τ (à direita), τ * τ > τ (vira τ > τ > τ)
  tipo(): Tipo {
    const partes = [this.tipoUnitario()]
    while (this.ver('*')) {
      this.pegar()
      partes.push(this.tipoUnitario())
    }
    if (this.ver('>')) {
      this.pegar()
      return partes.reduceRight((r, a) => fn(a, r), this.tipo())
    }
    if (partes.length > 1) throw new Error('produto de tipos sem ">"')
    return partes[0]
  }
  tipoUnitario(): Tipo {
    if (this.ver('(')) {
      this.pegar()
      const t = this.tipo()
      this.pegar(')')
      return t
    }
    const t = this.pegar()
    if (t.t === 'palavra') {
      if (t.v === '$tType') return BASE('$tType')
      if (t.v.startsWith('$') && t.v !== '$i' && t.v !== '$o') throw new Error(`o tipo ${t.v} não é lido`)
      return BASE(t.v)
    }
    if (t.t === 'aspas') return BASE(nomeLido(t))
    throw new Error(`esperava um tipo, veio “${t.v}”`)
  }
  // ---- fórmulas: conectivos binários < igualdade < aplicação (@) < unitárias
  formula(): H {
    const l = this.igualdade()
    const t = this.ver() as Tk | undefined
    if (t?.t === 'sim' && (t.v === '&' || t.v === '|')) {
      let r = l
      while (this.ver(t.v)) {
        this.pegar()
        r = { k: 'bin', op: t.v, l: r, r: this.igualdade() }
      }
      return r
    }
    if (t?.t === 'sim' && ['<=>', '<~>', '=>', '<=', '~|', '~&'].includes(t.v)) {
      this.pegar()
      return { k: 'bin', op: t.v, l, r: this.igualdade() }
    }
    return l
  }
  igualdade(): H {
    const l = this.aplicacao()
    if (this.ver('=') || this.ver('!=')) {
      const neg = this.pegar().v === '!='
      return { k: 'igual', neg, l, r: this.aplicacao() }
    }
    return l
  }
  aplicacao(): H {
    let l = this.unitaria()
    while (this.ver('@')) {
      this.pegar()
      l = { k: 'app', f: l, a: this.unitaria() }
    }
    return l
  }
  unitaria(): H {
    const t = this.ver() as Tk | undefined
    if (!t) throw new Error('o arquivo acabou no meio de uma fórmula')
    if (t.t === 'sim') {
      if (t.v === '~') {
        this.pegar()
        return { k: 'nao', f: this.unitaria() }
      }
      if (t.v === '!' || t.v === '?' || t.v === '^') return this.ligador()
      if (t.v === '!!' || t.v === '??') {
        this.pegar()
        return { k: 'const', c: t.v }
      }
      if (t.v === '(') {
        this.pegar()
        // conectivo como termo: (~), (&), (=)…
        const c = this.ver() as Tk | undefined
        if (c?.t === 'sim' && CONECTIVOS.has(c.v) && this.ts[this.i + 1]?.v === ')') {
          this.pegar()
          this.pegar(')')
          return { k: 'const', c: c.v }
        }
        const f = this.formula()
        this.pegar(')')
        return f
      }
      if (['@+', '@-', '@@+', '@@-'].includes(t.v)) throw new Error('escolha e descrição (@+, @-) não são lidas')
      if (t.v === '!>' || t.v === '?*') throw new Error('tipos polimórficos (TH1) não são lidos')
      throw new Error(`esperava uma fórmula, veio “${t.v}”`)
    }
    this.pegar()
    if (t.t === 'var') return { k: 'var', v: t.v }
    if (t.t === 'num') throw new Error('números (aritmética) não são lidos em ordem superior')
    if (t.t === 'palavra' && t.v.startsWith('$') && t.v !== '$true' && t.v !== '$false') throw new Error(`${t.v} não é lido`)
    return { k: 'const', c: nomeLido(t) }
  }
  /** ![X: τ, Y: τ]: corpo — o corpo é unitário, ou uma igualdade */
  ligador(): H {
    const q = this.pegar().v as '!' | '?' | '^'
    this.pegar('[')
    const vars: { v: string; t: Tipo }[] = []
    do {
      const v = this.pegar()
      if (v.t !== 'var') throw new Error(`esperava uma variável, veio “${v.v}”`)
      let t = I
      if (this.ver(':')) {
        this.pegar()
        t = this.tipo()
      }
      if (t.k === 'base' && t.n === '$tType') throw new Error('variáveis de tipo (TH1) não são lidas')
      vars.push({ v: v.v, t })
    } while (this.ver(',') && this.pegar())
    this.pegar(']')
    this.pegar(':')
    const corpo = this.igualdade()
    return vars.reduceRight<H>((b, x) => (q === '^' ? { k: 'lam', v: x.v, t: x.t, b } : { k: 'quant', q, v: x.v, t: x.t, b }), corpo)
  }
}

// ---------------------------------------------------------------- termos: variáveis livres, substituição, beta
function livres(h: H, ligadas: Set<string> = new Set(), out: Set<string> = new Set()): Set<string> {
  switch (h.k) {
    case 'var':
      if (!ligadas.has(h.v)) out.add(h.v)
      break
    case 'const':
      break
    case 'app':
      livres(h.f, ligadas, out)
      livres(h.a, ligadas, out)
      break
    case 'lam':
    case 'quant':
      livres(h.b, new Set([...ligadas, h.v]), out)
      break
    case 'nao':
      livres(h.f, ligadas, out)
      break
    case 'bin':
    case 'igual':
      livres(h.l, ligadas, out)
      livres(h.r, ligadas, out)
      break
  }
  return out
}

let contadorVar = 0
/** h[v := a], sem capturar as variáveis livres de a */
function substituir(h: H, v: string, a: H, livresA: Set<string>): H {
  switch (h.k) {
    case 'var':
      return h.v === v ? a : h
    case 'const':
      return h
    case 'app':
      return { k: 'app', f: substituir(h.f, v, a, livresA), a: substituir(h.a, v, a, livresA) }
    case 'lam':
    case 'quant': {
      if (h.v === v) return h
      if (livresA.has(h.v)) {
        const novo = `${h.v.replace(/_\d+$/, '')}_${++contadorVar}`
        const b = substituir(h.b, h.v, { k: 'var', v: novo }, new Set([novo]))
        return { ...h, v: novo, b: substituir(b, v, a, livresA) }
      }
      return { ...h, b: substituir(h.b, v, a, livresA) }
    }
    case 'nao':
      return { k: 'nao', f: substituir(h.f, v, a, livresA) }
    case 'bin':
    case 'igual':
      return { ...h, l: substituir(h.l, v, a, livresA), r: substituir(h.r, v, a, livresA) }
  }
}

/** a cabeça e os argumentos de f @ a @ b */
function espinha(h: H): { cabeca: H; args: H[] } {
  const args: H[] = []
  while (h.k === 'app') {
    args.unshift(h.a)
    h = h.f
  }
  return { cabeca: h, args }
}

const LIMITE_NOS = 50_000

/** forma normal beta, com os conectivos aplicados virando conectivos */
function normalizar(h: H, tipos: (c: string) => Tipo | undefined, conta = { n: 0 }): H {
  if (++conta.n > LIMITE_NOS) throw new Error('fórmula longa demais para o caderno (depois de abrir as definições)')
  switch (h.k) {
    case 'var':
    case 'const':
      return h
    case 'lam':
    case 'quant':
      return { ...h, b: normalizar(h.b, tipos, conta) }
    case 'nao':
      return { k: 'nao', f: normalizar(h.f, tipos, conta) }
    case 'bin':
    case 'igual':
      return { ...h, l: normalizar(h.l, tipos, conta), r: normalizar(h.r, tipos, conta) }
    case 'app': {
      const f = normalizar(h.f, tipos, conta)
      const a = normalizar(h.a, tipos, conta)
      if (f.k === 'lam') return normalizar(substituir(f.b, f.v, a, livres(a)), tipos, conta)
      const r: H = { k: 'app', f, a }
      // conectivo aplicado: (~) @ x ⟶ ~x; (&) @ a @ b ⟶ a & b; !! @ (^[X]: φ) ⟶ ![X]: φ
      const { cabeca, args } = espinha(r)
      if (cabeca.k === 'const' && CONECTIVOS.has(cabeca.c)) {
        const c = cabeca.c
        if (c === '~' && args.length === 1) return { k: 'nao', f: args[0] }
        if ((c === '!!' || c === '??') && args.length === 1) {
          const q = c === '!!' ? '!' : '?'
          const p = args[0]
          if (p.k === 'lam') return { k: 'quant', q, v: p.v, t: p.t, b: p.b }
          const t = tipoDe(p, new Map(), tipos)
          if (t.k !== 'fn') throw new Error(`${c} aplicado a algo que não é predicado`)
          const v = `X_${++contadorVar}`
          return { k: 'quant', q, v, t: t.a, b: { k: 'app', f: p, a: { k: 'var', v } } }
        }
        if (args.length === 2 && (c === '=' || c === '!=')) return { k: 'igual', neg: c === '!=', l: args[0], r: args[1] }
        if (args.length === 2 && c !== '~' && c !== '!!' && c !== '??') return { k: 'bin', op: c, l: args[0], r: args[1] }
      }
      return r
    }
  }
}

// ---------------------------------------------------------------- tipos dos termos
function tipoDe(h: H, env: Map<string, Tipo>, tipos: (c: string) => Tipo | undefined): Tipo {
  switch (h.k) {
    case 'var': {
      const t = env.get(h.v)
      if (!t) throw new Error(`variável ${h.v} sem tipo`)
      return t
    }
    case 'const': {
      if (h.c === '$true' || h.c === '$false') return O
      if (h.c === '~') return fn(O, O)
      if (['&', '|', '=>', '<=', '<=>', '<~>', '~|', '~&'].includes(h.c)) return fn(O, fn(O, O))
      if (h.c === '=' || h.c === '!=' || h.c === '!!' || h.c === '??') throw new Error(`${h.c} sem os argumentos não é lido`)
      const t = tipos(h.c)
      if (!t) throw new Error(`${h.c} não tem declaração de tipo`)
      return t
    }
    case 'app': {
      const tf = tipoDe(h.f, env, tipos)
      if (tf.k !== 'fn') throw new Error('aplicação de algo que não é função')
      return tf.r
    }
    case 'lam':
      return fn(h.t, tipoDe(h.b, new Map(env).set(h.v, h.t), tipos))
    default:
      return O
  }
}

// ---------------------------------------------------------------- tradução para primeira ordem
/** nome do tipo na primeira ordem: $o como objeto é $bool; função é (a>b) */
const nomeTipo = (t: Tipo): string => (t.k === 'base' ? (t.n === '$o' ? '$bool' : t.n) : `(${nomeTipo(t.a)}>${nomeTipo(t.r)})`)
/** argumentos e resultado de um símbolo (descurrificado até o resultado ser de base) */
function assinatura(t: Tipo): { args: Tipo[]; resultado: Tipo } {
  const args: Tipo[] = []
  while (t.k === 'fn') {
    args.push(t.a)
    t = t.r
  }
  return { args, resultado: t }
}

export interface DeclaracaoThf {
  nome: string
  papel: string
  texto: string
}

/**
 * Traduz as declarações thf(...) de um arquivo. Devolve fórmulas e
 * declarações no formato do TFF (para o tptp.ts terminar) e os avisos.
 */
export function traduzirThf(decls: DeclaracaoThf[]): { formulas: FormulaTptp[]; declaracoes: DeclaracaoTptp[]; avisos: string[] } {
  const avisos: string[] = []
  const tipos = new Map<string, Tipo>()
  const tiposNovos: DeclaracaoTptp[] = []
  const lidas: { nome: string; papel: string; h: H; original: string }[] = []
  for (const d of decls) {
    try {
      const r = new Leitor(tokens(d.texto))
      if (d.papel === 'type') {
        let parenteses = 0
        while (r.ver('(')) {
          r.pegar()
          parenteses++
        }
        const s = r.pegar()
        if (s.t === 'var' || s.t === 'sim') throw new Error(`esperava o nome de um símbolo, veio “${s.v}”`)
        r.pegar(':')
        if (r.ver('!>')) throw new Error('tipos polimórficos (TH1) não são lidos')
        const t = r.tipo()
        while (parenteses-- > 0) r.pegar(')')
        if (t.k === 'base' && t.n === '$tType') {
          // tipo novo (também um construtor de tipos: $tType > $tType não é TH0)
          tiposNovos.push({ nome: d.nome, simbolo: nomeLido(s), tipoNovo: true, args: [], resultado: '$tType', original: d.texto })
        } else tipos.set(nomeLido(s), t)
        continue
      }
      lidas.push({ nome: d.nome, papel: d.papel, h: r.formula(), original: d.texto })
    } catch (e) {
      avisos.push(`${d.nome}: ${(e as Error).message}`)
    }
  }
  const tipoDaConst = (c: string) => tipos.get(c)

  // 1. definições "c = t" (c não aparece em t): abertas em todas as outras fórmulas
  const definicoes = new Map<string, H>()
  for (const x of lidas)
    if (x.papel === 'definition' && x.h.k === 'igual' && !x.h.neg && x.h.l.k === 'const' && tipos.has(x.h.l.c) && !usaConst(x.h.r, x.h.l.c)) definicoes.set(x.h.l.c, x.h.r)
  const abrindo = new Set<string>()
  const abertas = new Map<string, H>()
  const abrir = (h: H): H => {
    switch (h.k) {
      case 'const': {
        const d = definicoes.get(h.c)
        if (!d || abrindo.has(h.c)) return h
        if (!abertas.has(h.c)) {
          abrindo.add(h.c)
          abertas.set(h.c, abrir(d))
          abrindo.delete(h.c)
        }
        return abertas.get(h.c)!
      }
      case 'var':
        return h
      case 'app':
        return { k: 'app', f: abrir(h.f), a: abrir(h.a) }
      case 'lam':
      case 'quant':
        return { ...h, b: abrir(h.b) }
      case 'nao':
        return { k: 'nao', f: abrir(h.f) }
      case 'bin':
      case 'igual':
        return { ...h, l: abrir(h.l), r: abrir(h.r) }
    }
  }
  const normais: { nome: string; papel: string; h: H; original: string }[] = []
  for (const x of lidas) {
    if (x.papel === 'definition' && x.h.k === 'igual' && x.h.l.k === 'const' && definicoes.has(x.h.l.c)) continue
    try {
      normais.push({ ...x, h: normalizar(abrir(x.h), tipoDaConst) })
    } catch (e) {
      avisos.push(`${x.nome}: ${(e as Error).message}`)
    }
  }

  // 2. como cada constante aparece: aplicada a todos os argumentos (primeira ordem) ou como valor
  const comoValor = new Set<string>()
  const aridade = (c: string) => {
    const t = tipos.get(c)
    return t ? assinatura(t).args.length : 0
  }
  const olhar = (h: H, posicaoDeTermo: boolean) => {
    const { cabeca, args } = espinha(h)
    if (h.k === 'app' || h.k === 'const') {
      if (cabeca.k === 'const' && tipos.has(cabeca.c)) {
        const t = tipos.get(cabeca.c)!
        const cheio = args.length === aridade(cabeca.c)
        // como valor: com menos argumentos, ou um valor lógico usado como objeto
        if (!cheio || (posicaoDeTermo && ehO(assinatura(t).resultado))) comoValor.add(cabeca.c)
      } else if (cabeca.k !== 'const') olhar(cabeca, true)
      for (const a of args) olhar(a, true)
      return
    }
    switch (h.k) {
      case 'lam':
      case 'quant':
        olhar(h.b, h.k === 'lam')
        break
      case 'nao':
        olhar(h.f, false)
        break
      case 'bin':
        olhar(h.l, false)
        olhar(h.r, false)
        break
      case 'igual':
        olhar(h.l, true)
        olhar(h.r, true)
        break
    }
  }
  for (const x of normais) olhar(x.h, false)

  // 3. tradução
  const saidaDecl = new Map<string, DeclaracaoTptp>()
  const declarar = (simbolo: string, args: string[], resultado: string, nome: string, original: string) => {
    if (!saidaDecl.has(simbolo)) saidaDecl.set(simbolo, { nome, simbolo, tipoNovo: false, args, resultado, original })
  }
  const extras: FormulaTptp[] = []
  const tiposFuncao = new Map<string, Tipo>()
  let usaBool = false
  const nt = (t: Tipo) => {
    if (t.k === 'fn') {
      tiposFuncao.set(nomeTipo(t), t)
      nt(t.a)
      nt(t.r)
    } else if (ehO(t)) usaBool = true
    return nomeTipo(t)
  }
  const VALE = '$ho:vale'
  const VERDADEIRO = '$ho:verdadeiro'
  const FALSO = '$ho:falso'
  const ap = (t: Tipo) => {
    const s = `$ho:ap:${nt(t)}`
    if (t.k !== 'fn') throw new Error('ap de algo que não é função')
    declarar(s, [nt(t), nt(t.a)], nt(t.r), `ap_${nomeTipo(t)}`, `% aplicação de uma função do tipo ${nomeTipo(t)}`)
    return s
  }
  const objeto = (c: string) => {
    const s = `$ho:obj:${c}`
    declarar(s, [], nt(tipos.get(c)!), `${c}_valor`, `% ${c} usado como valor`)
    return s
  }
  for (const c of comoValor) objeto(c)
  const vars = (n: number) => Array.from({ length: n }, (_, i) => `X${i + 1}`)
  const varT = (v: string): T => ({ k: 'var', v })

  /** f @ a1 @ a2 … por ap(ap(f, a1), a2) */
  const aplicar = (f: T, tf: Tipo, args: T[]): { t: T; tipo: Tipo } => {
    let t = f
    for (const a of args) {
      if (tf.k !== 'fn') throw new Error('argumentos demais')
      t = { k: 'fn', f: ap(tf), args: [t, a] }
      tf = tf.r
    }
    return { t, tipo: tf }
  }
  /** um valor lógico (objeto do tipo $bool) visto como fórmula */
  const vale = (t: T): F => {
    usaBool = true
    declarar(VALE, ['$bool'], '$o', 'vale', '% vale(b): o valor lógico b é verdadeiro')
    return { k: 'atomo', p: VALE, args: [t] }
  }

  // os lambdas e as fórmulas usadas como objeto viram funções novas (com a definição)
  const levantados = new Map<string, T>()
  let nLevantados = 0
  const levantar = (h: H, env: Map<string, Tipo>): T => {
    const fv = [...livres(h)].sort()
    const chave = `${JSON.stringify(h)}|${fv.map((v) => nomeTipo(env.get(v)!)).join(',')}`
    const ja = levantados.get(chave)
    if (ja) return ja.k === 'fn' ? { ...ja, args: fv.map(varT) } : ja
    const t = tipoDe(h, env, tipoDaConst)
    const s = `$ho:lam:${++nLevantados}`
    declarar(s, fv.map((v) => nt(env.get(v)!)), nt(t), `lambda_${nLevantados}`, `% lambda ou fórmula usada como objeto`)
    const termoNovo: T = { k: 'fn', f: s, args: fv.map(varT) }
    levantados.set(chave, termoNovo)
    // a definição: ∀livres ∀x… (ap(…(s(livres), x1)…) = corpo)
    let corpo = h
    const xs: { v: string; t: Tipo }[] = []
    while (corpo.k === 'lam') {
      xs.push({ v: corpo.v, t: corpo.t })
      corpo = corpo.b
    }
    const env2 = new Map(env)
    for (const x of xs) env2.set(x.v, x.t)
    const { t: cabeca, tipo: tr } = aplicar(termoNovo, t, xs.map((x) => varT(x.v)))
    const def: F = ehO(tr) ? { k: 'bin', op: '<=>', l: vale(cabeca), r: formula(corpo, env2) } : { k: 'igual', neg: false, l: cabeca, r: termo(corpo, env2) }
    const todas = [...fv.map((v) => ({ v, t: env.get(v)! })), ...xs]
    extras.push({
      nome: `lambda_${nLevantados}`,
      papel: 'definition',
      linguagem: 'thf',
      formula: todas.length ? { k: 'quant', q: '!', vars: todas.map((x) => x.v), tipos: todas.map((x) => nt(x.t)), f: def } : def,
      original: `% ${mostrar(h)}`,
    })
    return { k: 'fn', f: s, args: fv.map(varT) }
  }

  const termo = (h: H, env: Map<string, Tipo>): T => {
    const t = tipoDe(h, env, tipoDaConst)
    if (h.k === 'var') return varT(h.v)
    if (h.k === 'const') {
      if (h.c === '$true' || h.c === '$false') {
        usaBool = true
        declarar(VERDADEIRO, [], '$bool', 'verdadeiro', '% o valor lógico verdadeiro')
        declarar(FALSO, [], '$bool', 'falso', '% o valor lógico falso')
        return { k: 'fn', f: h.c === '$true' ? VERDADEIRO : FALSO, args: [] }
      }
      if (CONECTIVOS.has(h.c)) return levantar(etaConectivo(h.c), env)
      if (comoValor.has(h.c)) return { k: 'fn', f: objeto(h.c), args: [] }
      declarar(h.c, [], nt(t), h.c, `% ${h.c}: ${nomeTipo(t)}`)
      return { k: 'fn', f: h.c, args: [] }
    }
    if (h.k === 'app') {
      const { cabeca, args } = espinha(h)
      if (cabeca.k === 'const' && tipos.has(cabeca.c)) {
        const s = assinatura(tipos.get(cabeca.c)!)
        if (args.length === s.args.length && !ehO(s.resultado)) {
          declarar(cabeca.c, s.args.map(nt), nt(s.resultado), cabeca.c, `% ${cabeca.c}: ${nomeTipo(tipos.get(cabeca.c)!)}`)
          return { k: 'fn', f: cabeca.c, args: args.map((a) => termo(a, env)) }
        }
      }
      if (cabeca.k === 'var' || (cabeca.k === 'const' && tipos.has(cabeca.c)))
        return aplicar(termo(cabeca, env), tipoDe(cabeca, env, tipoDaConst), args.map((a) => termo(a, env))).t
    }
    // lambda, fórmula usada como objeto, conectivo aplicado em parte…
    void t
    return levantar(h, env)
  }

  const formula = (h: H, env: Map<string, Tipo>): F => {
    switch (h.k) {
      case 'const':
        if (h.c === '$true' || h.c === '$false') return { k: 'verdade', v: h.c === '$true' }
        break
      case 'nao':
        return { k: 'nao', f: formula(h.f, env) }
      case 'bin':
        return { k: 'bin', op: h.op, l: formula(h.l, env), r: formula(h.r, env) }
      case 'quant':
        return { k: 'quant', q: h.q, vars: [h.v], tipos: [nt(h.t)], f: formula(h.b, new Map(env).set(h.v, h.t)) }
      case 'igual': {
        const t = tipoDe(h.l, env, tipoDaConst)
        // igualdade de valores lógicos é equivalência
        if (ehO(t)) {
          const e: F = { k: 'bin', op: '<=>', l: formula(h.l, env), r: formula(h.r, env) }
          return h.neg ? { k: 'nao', f: e } : e
        }
        nt(t)
        return { k: 'igual', neg: h.neg, l: termo(h.l, env), r: termo(h.r, env) }
      }
      case 'var':
        return vale(varT(h.v))
      case 'lam':
        throw new Error('lambda onde devia haver uma fórmula')
    }
    // constante ou aplicação do tipo $o
    const { cabeca, args } = espinha(h)
    if (cabeca.k === 'const' && tipos.has(cabeca.c)) {
      const s = assinatura(tipos.get(cabeca.c)!)
      if (args.length === s.args.length) {
        declarar(cabeca.c, s.args.map(nt), '$o', cabeca.c, `% ${cabeca.c}: ${nomeTipo(tipos.get(cabeca.c)!)}`)
        return { k: 'atomo', p: cabeca.c, args: args.map((a) => termo(a, env)) }
      }
    }
    return vale(termo(h, env))
  }

  const formulas: FormulaTptp[] = []
  for (const x of normais) {
    try {
      formulas.push({ nome: x.nome, papel: x.papel, linguagem: 'thf', formula: formula(x.h, new Map()), original: x.original })
    } catch (e) {
      avisos.push(`${x.nome}: ${(e as Error).message}`)
    }
  }

  // 4. as leis que a ordem superior dava de graça
  // a constante usada como valor é a própria função: ap(…ap(c_valor, x1)…, xn) = c(x1, …, xn)
  for (const c of comoValor) {
    const t = tipos.get(c)!
    const s = assinatura(t)
    const xs = vars(s.args.length)
    const { t: cabeca } = aplicar({ k: 'fn', f: objeto(c), args: [] }, t, xs.map(varT))
    declarar(c, s.args.map(nt), ehO(s.resultado) ? '$o' : nt(s.resultado), c, `% ${c}: ${nomeTipo(t)}`)
    const direto: T = { k: 'fn', f: c, args: xs.map(varT) }
    const def: F = ehO(s.resultado)
      ? { k: 'bin', op: '<=>', l: vale(cabeca), r: xs.length ? { k: 'atomo', p: c, args: xs.map(varT) } : { k: 'atomo', p: c, args: [] } }
      : { k: 'igual', neg: false, l: cabeca, r: direto }
    extras.push({
      nome: `${c}_valor`,
      papel: 'definition',
      linguagem: 'thf',
      formula: xs.length ? { k: 'quant', q: '!', vars: xs, tipos: s.args.map(nt), f: def } : def,
      original: `% ${c} usado como valor é a própria função`,
    })
  }
  // extensionalidade: funções iguais em todos os pontos são iguais
  for (const [nome, t] of [...tiposFuncao]) {
    if (t.k !== 'fn') continue
    const a = ap(t)
    const app = (f: string): T => ({ k: 'fn', f: a, args: [varT(f), varT('X')] })
    extras.push({
      nome: `extensionalidade_${nome}`,
      papel: 'axiom',
      linguagem: 'thf',
      formula: {
        k: 'quant',
        q: '!',
        vars: ['F', 'G'],
        tipos: [nome, nome],
        f: { k: 'bin', op: '=>', l: { k: 'quant', q: '!', vars: ['X'], tipos: [nt(t.a)], f: { k: 'igual', neg: false, l: app('F'), r: app('G') } }, r: { k: 'igual', neg: false, l: varT('F'), r: varT('G') } },
      },
      original: `% extensionalidade das funções do tipo ${nome}`,
    })
  }
  // valores lógicos: só dois, verdadeiro e falso
  if (usaBool) {
    declarar(VALE, ['$bool'], '$o', 'vale', '% vale(b): o valor lógico b é verdadeiro')
    declarar(VERDADEIRO, [], '$bool', 'verdadeiro', '% o valor lógico verdadeiro')
    declarar(FALSO, [], '$bool', 'falso', '% o valor lógico falso')
    const v: T = { k: 'fn', f: VERDADEIRO, args: [] }
    const f: T = { k: 'fn', f: FALSO, args: [] }
    extras.push(
      { nome: 'verdadeiro_vale', papel: 'axiom', linguagem: 'thf', formula: vale(v), original: '% verdadeiro vale' },
      { nome: 'falso_nao_vale', papel: 'axiom', linguagem: 'thf', formula: { k: 'nao', f: vale(f) }, original: '% falso não vale' },
      {
        nome: 'so_dois_valores',
        papel: 'axiom',
        linguagem: 'thf',
        formula: { k: 'quant', q: '!', vars: ['B'], tipos: ['$bool'], f: { k: 'bin', op: '|', l: { k: 'igual', neg: false, l: varT('B'), r: v }, r: { k: 'igual', neg: false, l: varT('B'), r: f } } },
        original: '% só há dois valores lógicos',
      },
    )
  }
  return { formulas: [...formulas, ...extras], declaracoes: [...tiposNovos, ...saidaDecl.values()], avisos }
}

/** (~) ⟶ ^[X: $o]: ~X; (&) ⟶ ^[X: $o, Y: $o]: X & Y */
function etaConectivo(c: string): H {
  const x: H = { k: 'var', v: 'Xc1' }
  const y: H = { k: 'var', v: 'Xc2' }
  if (c === '~') return { k: 'lam', v: 'Xc1', t: O, b: { k: 'nao', f: x } }
  if (c === '=' || c === '!=' || c === '!!' || c === '??') throw new Error(`${c} sem os argumentos não é lido`)
  return { k: 'lam', v: 'Xc1', t: O, b: { k: 'lam', v: 'Xc2', t: O, b: { k: 'bin', op: c, l: x, r: y } } }
}

function usaConst(h: H, c: string): boolean {
  switch (h.k) {
    case 'const':
      return h.c === c
    case 'var':
      return false
    case 'app':
      return usaConst(h.f, c) || usaConst(h.a, c)
    case 'lam':
    case 'quant':
      return usaConst(h.b, c)
    case 'nao':
      return usaConst(h.f, c)
    case 'bin':
    case 'igual':
      return usaConst(h.l, c) || usaConst(h.r, c)
  }
}

function mostrar(h: H): string {
  switch (h.k) {
    case 'var':
      return h.v
    case 'const':
      return h.c
    case 'app':
      return `(${mostrar(h.f)} @ ${mostrar(h.a)})`
    case 'lam':
      return `(^[${h.v}]: ${mostrar(h.b)})`
    case 'quant':
      return `(${h.q}[${h.v}]: ${mostrar(h.b)})`
    case 'nao':
      return `~ ${mostrar(h.f)}`
    case 'bin':
      return `(${mostrar(h.l)} ${h.op} ${mostrar(h.r)})`
    case 'igual':
      return `(${mostrar(h.l)} ${h.neg ? '!=' : '='} ${mostrar(h.r)})`
  }
}
