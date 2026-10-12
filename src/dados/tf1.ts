// TFF polimórfico (TF1) ⟶ TFF monomórfico (TF0), que o tradutor do TPTP
// (tptp.ts) termina como os outros.
//
// Monomorfização: cada axioma com variável de tipo (![A: $tType]) entra uma
// vez para cada tipo concreto que aparece no problema; na conjectura, a
// variável de tipo vira um tipo novo, sem nada de especial (provar para ele é
// provar para qualquer tipo); e cada símbolo polimórfico usado com tipos
// concretos vira um símbolo só seu: cons(nat, X, L) ⟶ cons<nat>(X, L).
//
// "Segue" no resultado vale no original (as instâncias são consequências dos
// axiomas). O contrário não: as instâncias que ficaram de fora poderiam
// fechar a prova — o app marca esses problemas.

import type { DeclaracaoTptp, FormulaTptp, FTptp as F, TTptp as T } from './tptp'

/** um tipo: variável (A) ou construtor aplicado (list(A), $i, nat) */
type Tipo = { k: 'var'; v: string } | { k: 'c'; c: string; args: Tipo[] }

/** a declaração de um símbolo do TF1 (os tipos como texto canônico: "list(A)") */
export interface DeclaracaoTf1 {
  nome: string
  simbolo: string
  /** variáveis de tipo de !>[A: $tType, …] */
  variaveis: string[]
  args: string[]
  resultado: string
  /** construtor de tipos (list: $tType > $tType): quantos argumentos */
  construtor?: number
  /** tipo novo sem argumentos (nat: $tType) */
  tipoNovo?: boolean
  original: string
}

/** "list(A)" ⟶ tipo */
export function lerTipo(s: string): Tipo {
  let i = 0
  const ler = (): Tipo => {
    const m = /^(\$?[A-Za-z0-9_'$]+)/.exec(s.slice(i))
    if (!m) throw new Error(`tipo ilegível: ${s}`)
    i += m[1].length
    const nome = m[1]
    if (s[i] !== '(') return /^[A-Z]/.test(nome) ? { k: 'var', v: nome } : { k: 'c', c: nome, args: [] }
    i++
    const args: Tipo[] = []
    for (;;) {
      args.push(ler())
      if (s[i] === ',') i++
      else break
    }
    if (s[i] !== ')') throw new Error(`tipo ilegível: ${s}`)
    i++
    return { k: 'c', c: nome, args }
  }
  const t = ler()
  if (i !== s.length) throw new Error(`tipo ilegível: ${s}`)
  return t
}
export const mostrarTipo = (t: Tipo): string => (t.k === 'var' ? t.v : t.args.length ? `${t.c}(${t.args.map(mostrarTipo).join(',')})` : t.c)
const substTipo = (t: Tipo, s: Map<string, Tipo>): Tipo => (t.k === 'var' ? (s.get(t.v) ?? t) : { k: 'c', c: t.c, args: t.args.map((a) => substTipo(a, s)) })
const ehChao = (t: Tipo): boolean => t.k === 'c' && t.args.every(ehChao)
const profundidade = (t: Tipo): number => (t.k === 'var' ? 0 : 1 + Math.max(0, ...t.args.map(profundidade)))
/** um termo do leitor (fn/var) lido como tipo: list(A) */
const tipoDoTermo = (t: T): Tipo => (t.k === 'var' ? { k: 'var', v: t.v } : t.k === 'fn' ? { k: 'c', c: t.f, args: t.args.map(tipoDoTermo) } : { k: 'c', c: t.v, args: [] })

const LIMITE_INSTANCIAS = 3000

export function monomorfizar(formulas: FormulaTptp[], decls: DeclaracaoTf1[]): { formulas: FormulaTptp[]; declaracoes: DeclaracaoTptp[]; avisos: string[] } {
  const avisos: string[] = []
  const simbolos = new Map(decls.filter((d) => !d.construtor && !d.tipoNovo).map((d) => [d.simbolo, d]))
  const nTipos = (s: string) => simbolos.get(s)?.variaveis.length ?? 0
  const chaos = new Map<string, Tipo>()
  const anotarChao = (t: Tipo) => {
    if (ehChao(t) && profundidade(t) <= 3) chaos.set(mostrarTipo(t), t)
  }
  anotarChao({ k: 'c', c: '$i', args: [] })
  for (const d of decls)
    if (!d.construtor && !d.tipoNovo && !d.variaveis.length) for (const t of [...d.args, d.resultado]) if (t !== '$o') anotarChao(lerTipo(t))
  for (const d of decls) if (d.tipoNovo) anotarChao({ k: 'c', c: d.simbolo, args: [] })

  // as variáveis de tipo de cada fórmula (![A: $tType] em qualquer lugar: valem para a fórmula toda)
  const variaveisDeTipo = (f: F, out: Set<string>) => {
    if (f.k === 'quant') {
      f.tipos?.forEach((t, i) => t === '$tType' && out.add(f.vars[i]))
      variaveisDeTipo(f.f, out)
    } else if (f.k === 'nao') variaveisDeTipo(f.f, out)
    else if (f.k === 'bin') {
      variaveisDeTipo(f.l, out)
      variaveisDeTipo(f.r, out)
    }
    return out
  }
  // os tipos concretos que já aparecem nas fórmulas (nos quantificadores e nos argumentos de tipo)
  const verTermo = (t: T) => {
    if (t.k !== 'fn') return
    const k = nTipos(t.f)
    t.args.forEach((a, i) => (i < k ? anotarChao(tipoDoTermo(a)) : verTermo(a)))
  }
  const verFormula = (f: F) => {
    switch (f.k) {
      case 'atomo': {
        const k = nTipos(f.p)
        f.args.forEach((a, i) => (i < k ? anotarChao(tipoDoTermo(a)) : verTermo(a)))
        break
      }
      case 'igual':
        verTermo(f.l)
        verTermo(f.r)
        break
      case 'nao':
        verFormula(f.f)
        break
      case 'bin':
        verFormula(f.l)
        verFormula(f.r)
        break
      case 'quant':
        f.tipos?.forEach((t) => t !== '$tType' && anotarChao(lerTipo(t)))
        verFormula(f.f)
        break
    }
  }
  // a conjectura: cada variável de tipo vira um tipo novo (provar para ele é provar para qualquer um)
  const skolem = new Map<FormulaTptp, Map<string, Tipo>>()
  for (const x of formulas) {
    verFormula(x.formula)
    if (x.papel !== 'conjecture') continue
    const s = new Map<string, Tipo>()
    for (const v of variaveisDeTipo(x.formula, new Set())) {
      const t: Tipo = { k: 'c', c: `tipo_${v}`, args: [] }
      s.set(v, t)
      anotarChao(t)
    }
    skolem.set(x, s)
  }
  const tiposChao = [...chaos.values()].filter((t) => !(t.k === 'c' && t.c === '$o'))

  // instâncias de um símbolo polimórfico: cons<nat>
  const saidaDecl = new Map<string, DeclaracaoTptp>()
  const instancia = (s: string, tipos: Tipo[]): string => {
    const d = simbolos.get(s)
    if (!d) return s
    if (!d.variaveis.length) {
      if (!saidaDecl.has(s)) saidaDecl.set(s, { nome: d.nome, simbolo: s, tipoNovo: false, args: d.args, resultado: d.resultado, original: d.original })
      return s
    }
    const chave = `${s}<${tipos.map(mostrarTipo).join(',')}>`
    if (!saidaDecl.has(chave)) {
      const m = new Map(d.variaveis.map((v, i) => [v, tipos[i]]))
      const sub = (t: string) => (t === '$o' ? t : mostrarTipo(substTipo(lerTipo(t), m)))
      saidaDecl.set(chave, { nome: `${d.nome}_${tipos.map(mostrarTipo).join('_')}`, simbolo: chave, tipoNovo: false, args: d.args.map(sub), resultado: sub(d.resultado), original: d.original })
    }
    return chave
  }
  const reescreverT = (t: T, m: Map<string, Tipo>): T => {
    if (t.k !== 'fn') return t
    const k = nTipos(t.f)
    const tipos = t.args.slice(0, k).map((a) => substTipo(tipoDoTermo(a), m))
    if (tipos.some((x) => !ehChao(x))) throw new Error(`${t.f} com tipo não resolvido`)
    return { k: 'fn', f: instancia(t.f, tipos), args: t.args.slice(k).map((a) => reescreverT(a, m)) }
  }
  const reescreverF = (f: F, m: Map<string, Tipo>): F => {
    switch (f.k) {
      case 'atomo': {
        const k = nTipos(f.p)
        const tipos = f.args.slice(0, k).map((a) => substTipo(tipoDoTermo(a), m))
        if (tipos.some((x) => !ehChao(x))) throw new Error(`${f.p} com tipo não resolvido`)
        return { k: 'atomo', p: instancia(f.p, tipos), args: f.args.slice(k).map((a) => reescreverT(a, m)) }
      }
      case 'igual':
        return { ...f, l: reescreverT(f.l, m), r: reescreverT(f.r, m) }
      case 'verdade':
        return f
      case 'nao':
        return { k: 'nao', f: reescreverF(f.f, m) }
      case 'bin':
        return { ...f, l: reescreverF(f.l, m), r: reescreverF(f.r, m) }
      case 'quant': {
        // os quantificadores de tipo somem; os outros ganham o tipo concreto
        const fica = f.vars.map((_, i) => f.tipos?.[i] !== '$tType')
        const vars = f.vars.filter((_, i) => fica[i])
        const corpo = reescreverF(f.f, m)
        if (!vars.length) return corpo
        const tipos = f.tipos?.filter((_, i) => fica[i]).map((t) => {
          const x = substTipo(lerTipo(t), m)
          if (!ehChao(x)) throw new Error('variável com tipo não resolvido')
          return mostrarTipo(x)
        })
        return { k: 'quant', q: f.q, vars, f: corpo, ...(tipos ? { tipos } : {}) }
      }
    }
  }

  const saida: FormulaTptp[] = []
  let total = 0
  for (const x of formulas) {
    try {
      const vs = [...variaveisDeTipo(x.formula, new Set())]
      const fixas = skolem.get(x)
      // as combinações de tipos concretos para as variáveis de tipo (a conjectura usa os tipos novos)
      let combinacoes: Map<string, Tipo>[] = [fixas ?? new Map()]
      if (!fixas)
        for (const v of vs) {
          combinacoes = combinacoes.flatMap((m) => tiposChao.map((t) => new Map(m).set(v, t)))
          if (combinacoes.length > 400) throw new Error('polimórfico demais: instâncias demais')
        }
      for (const [i, m] of combinacoes.entries()) {
        let f: F
        try {
          f = reescreverF(x.formula, m)
        } catch {
          continue // instância que pede um tipo que não há
        }
        if (++total > LIMITE_INSTANCIAS) throw new Error('polimórfico demais: instâncias demais para o caderno')
        saida.push({ ...x, nome: combinacoes.length > 1 ? `${x.nome}_${i + 1}` : x.nome, formula: f })
      }
    } catch (e) {
      avisos.push(`${x.nome}: ${(e as Error).message}`)
      if (/instâncias demais para o caderno/.test((e as Error).message)) break
    }
  }
  // os tipos concretos (menos $i, $o e os números) viram tipos do TF0
  const tiposNovos: DeclaracaoTptp[] = tiposChao
    .map(mostrarTipo)
    .filter((t) => !['$i', '$o', '$int', '$rat', '$real'].includes(t))
    .map((t) => ({ nome: `tipo_${t}`, simbolo: t, tipoNovo: true, args: [], resultado: '$tType', original: `% o tipo ${t}` }))
  return { formulas: saida, declaracoes: [...tiposNovos, ...saidaDecl.values()], avisos }
}
