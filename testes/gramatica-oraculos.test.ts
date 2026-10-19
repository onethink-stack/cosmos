// A gramática conferida por oráculos que não usam o leitor do Caderno: árvores
// sorteadas aqui, num formato próprio, escritas em texto por dois impressores
// feitos a partir da especificação (um com todos os parênteses, outro só com os
// necessários pela precedência e pelo escopo). O leitor tem de montar a árvore
// sorteada. Mais: transformações que não mudam a árvore, todos os textos curtos
// de um alfabeto pequeno, os limites de aninhamento e profundidade, o escopo dos
// quantificadores aninhados conferido só pelo texto, a expansão contra um
// oráculo próprio (árvore e sentido em mundos finitos) e a prioridade dos
// diagnósticos com falhas de várias etapas no mesmo texto.
import { describe, expect, it } from 'vitest'
import type { Formula, Termo } from '../src/logica/ast'
import { expandir } from '../src/logica/acucar'
import { imprimir } from '../src/logica/impressao'
import { PROFUNDIDADE_MAXIMA } from '../src/logica/parser'
import { formasDoEscopo, validar } from '../src/logica/validador'

/** Árvore do Caderno em S-expressão, o formato dos exemplos normativos. */
const st = (x: Termo): string => {
  switch (x.k) {
    case 'nome':
      return x.nome
    case 'num':
      return x.valor
    case 'vazio':
      return '∅'
    case 'reais':
      return 'ℝ'
    case 'inteiros':
      return 'ℤ'
    case 'app':
      return x.subscrito ? `(_ ${x.fn} ${x.args.map(st).join(' ')})` : `(${x.fn} ${x.args.map(st).join(' ')})`
    case 'inter':
      return `(⋂ ${st(x.l)} ${st(x.r)})`
    case 'uniao':
      return `(⋃ ${st(x.l)} ${st(x.r)})`
    case 'arit':
      return `(${x.op} ${st(x.l)} ${st(x.r)})`
    case 'neg':
      return `(− ${st(x.t)})`
  }
}
const OP = { and: '∧', or: '∨', imp: '⟹', iff: '⟺' } as const
const sx = (x: Formula): string => {
  switch (x.k) {
    case 'pred':
      return x.args.length ? `(${x.nome} ${x.args.map(st).join(' ')})` : x.nome
    case 'rel':
      return `(${x.op} ${st(x.l)} ${st(x.r)})`
    case 'not':
      return `(¬ ${sx(x.f)})`
    case 'nec':
      return `(□ ${sx(x.f)})`
    case 'pos':
      return `(◇ ${sx(x.f)})`
    case 'crenca':
      return `(B "${x.agente}" ${sx(x.f)})`
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return `(${OP[x.k]} ${sx(x.l)} ${sx(x.r)})`
    case 'forall':
    case 'exists':
      return `(${x.k === 'forall' ? '∀' : '∃'} ${x.v}${x.dom ? ` ∈ ${st(x.dom)}` : ''} ${sx(x.corpo)})`
    case 'const':
      return x.valor ? '⊤' : '⊥'
  }
}
const ler = (texto: string) => {
  const v = validar(texto, [])
  return { ...v, arvore: v.ast ? sx(v.ast) : null, erros: v.diags.filter((d) => d.nivel === 'erro').map((d) => d.codigo) }
}

// ---- árvores sorteadas, num formato só deste teste
type A =
  | { k: 'P'; nome: 'P' | 'Q' | 'R'; args: string[] }
  | { k: 'eq'; l: string; r: string }
  | { k: 'not' | 'nec'; a: A }
  | { k: 'B'; ag: string; a: A }
  | { k: 'and' | 'or' | 'imp' | 'iff'; l: A; r: A }
  | { k: 'all' | 'ex'; v: string; dom?: string; a: A }

/**
 * Sorteio determinístico (mulberry32): a mesma semente dá sempre os mesmos casos.
 * Contas inteiras de 32 bits; o gerador linear antigo, em ponto flutuante, perdia os
 * bits de baixo e repetia tudo depois de 10.466 sorteios (220 com a semente 9).
 */
const sorteio = (semente: number) => () => {
  semente = (semente + 0x6d2b79f5) | 0
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const um = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
/** aridade fixa por nome, para não cair no E10 */
const ARIDADE = { P: 1, Q: 2, R: 1 } as const
const NOMES = ['a', 'b', 'x', 'y'] as const

/** `pq`: chance de um quantificador em cada nó de dentro (sem ela, 1 em 9) */
function sortear(r: () => number, prof: number, pq?: number): A {
  const caso = prof <= 0 ? 0 : pq === undefined ? Math.floor(r() * 9) : r() < pq ? 8 : Math.floor(r() * 8)
  switch (caso) {
    case 0: {
      if (r() < 0.25) return { k: 'eq', l: um(r, NOMES), r: um(r, NOMES) }
      const nome = um(r, ['P', 'Q', 'R'] as const)
      return { k: 'P', nome, args: Array.from({ length: ARIDADE[nome] }, () => um(r, NOMES)) }
    }
    case 1:
      return { k: 'not', a: sortear(r, prof - 1, pq) }
    case 2:
      return { k: 'nec', a: sortear(r, prof - 1, pq) }
    case 3:
      return { k: 'B', ag: um(r, ['Ana', 'Igreja Católica']), a: sortear(r, prof - 1, pq) }
    case 4:
    case 5:
    case 6:
    case 7:
      return { k: um(r, ['and', 'or', 'imp', 'iff'] as const), l: sortear(r, prof - 1, pq), r: sortear(r, prof - 1, pq) }
    default:
      return { k: um(r, ['all', 'ex'] as const), v: um(r, ['x', 'y']), ...(r() < 0.3 ? { dom: 'S' } : {}), a: sortear(r, prof - 1, pq) }
  }
}

/** a árvore sorteada no formato dos exemplos normativos */
function esperada(a: A): string {
  switch (a.k) {
    case 'P':
      return `(${a.nome} ${a.args.join(' ')})`
    case 'eq':
      return `(= ${a.l} ${a.r})`
    case 'not':
      return `(¬ ${esperada(a.a)})`
    case 'nec':
      return `(□ ${esperada(a.a)})`
    case 'B':
      return `(B "${a.ag}" ${esperada(a.a)})`
    case 'all':
    case 'ex':
      return `(${a.k === 'all' ? '∀' : '∃'} ${a.v}${a.dom ? ` ∈ ${a.dom}` : ''} ${esperada(a.a)})`
    default:
      return `(${OP[a.k]} ${esperada(a.l)} ${esperada(a.r)})`
  }
}

const atomo = (a: Extract<A, { k: 'P' | 'eq' }>) => (a.k === 'P' ? `${a.nome}(${a.args.join(', ')})` : `${a.l} = ${a.r}`)
const prefixoQ = (a: Extract<A, { k: 'all' | 'ex' }>) => `${a.k === 'all' ? '∀' : '∃'}${a.v}${a.dom ? `∈${a.dom}` : ''}`

/** Impressor 1: todos os parênteses. */
function cheio(a: A): string {
  switch (a.k) {
    case 'P':
    case 'eq':
      return atomo(a)
    case 'not':
      return `(¬${cheio(a.a)})`
    case 'nec':
      return `(□${cheio(a.a)})`
    case 'B':
      return `(B[${a.ag}] ${cheio(a.a)})`
    case 'all':
    case 'ex':
      return `(${prefixoQ(a)} (${cheio(a.a)}))`
    default:
      return `(${cheio(a.l)} ${OP[a.k]} ${cheio(a.r)})`
  }
}

/**
 * Impressor 2: só os parênteses que a especificação exige. Precedência
 * ⟺ < ⟹ < ∨ < ∧ < prefixos; ∧, ∨ e ⟺ associam à esquerda, ⟹ à direita; um
 * quantificador seguido de mais texto no mesmo grupo precisa de parênteses,
 * porque o corpo dele iria até o fim.
 */
const PREC = { iff: 1, imp: 2, or: 3, and: 4 } as const
function minimo(a: A, min = 0, seguido = false): string {
  switch (a.k) {
    case 'P':
    case 'eq':
      return atomo(a)
    case 'not':
      return `¬${minimo(a.a, 5, seguido)}`
    case 'nec':
      return `□${minimo(a.a, 5, seguido)}`
    case 'B':
      return `B[${a.ag}] ${minimo(a.a, 5, seguido)}`
    case 'all':
    case 'ex': {
      const s = `${prefixoQ(a)} ${minimo(a.a, 0, false)}`
      return seguido ? `(${s})` : s
    }
    default: {
      const p = PREC[a.k]
      const precisa = p < min
      const s = `${minimo(a.l, a.k === 'imp' ? p + 1 : p, true)} ${OP[a.k]} ${minimo(a.r, a.k === 'imp' ? p : p + 1, precisa ? false : seguido)}`
      return precisa ? `(${s})` : s
    }
  }
}

/** Árvore do Caderno → formato deste teste (para o impressor 2 nos textos enumerados). */
function deCaderno(f: Formula): A | null {
  const so = (g: Formula) => deCaderno(g)
  switch (f.k) {
    case 'pred':
      return f.args.every((t) => t.k === 'nome') && f.args.length ? { k: 'P', nome: f.nome as 'P', args: f.args.map((t) => (t as { nome: string }).nome) } : null
    case 'not':
    case 'nec': {
      const a = so(f.f)
      return a && { k: f.k, a }
    }
    case 'and':
    case 'or':
    case 'imp':
    case 'iff': {
      const l = so(f.l)
      const r = so(f.r)
      return l && r && { k: f.k, l, r }
    }
    case 'forall':
    case 'exists': {
      const a = so(f.corpo)
      return a && !f.dom ? { k: f.k === 'forall' ? 'all' : 'ex', v: f.v, a } : null
    }
    default:
      return null
  }
}

describe('oráculos independentes: árvores sorteadas, escritas pelos dois impressores', { timeout: 120_000 }, () => {
  const r = sorteio(2026)
  const arvores = Array.from({ length: 2000 }, () => sortear(r, 4))

  it('as árvores sorteadas são de fato variadas (árvores pequenas se repetem)', () => {
    expect(new Set(arvores.map(esperada)).size).toBeGreaterThan(1700)
  })

  it('com todos os parênteses, o leitor monta a árvore sorteada', () => {
    for (const a of arvores) {
      const texto = cheio(a)
      const v = ler(texto)
      expect(v.erros, texto).toEqual([])
      expect(v.arvore, texto).toBe(esperada(a))
    }
  })

  it('só com os parênteses necessários, também', () => {
    for (const a of arvores) {
      const texto = minimo(a)
      const v = ler(texto)
      expect(v.erros, texto).toEqual([])
      expect(v.arvore, texto).toBe(esperada(a))
    }
  })

  it('transformações que não mudam a árvore: parênteses em volta, grafias ASCII, espaços', () => {
    const ASCII: [string, string][] = [
      ['∧', '&'],
      ['∨', '|'],
      ['⟹', '->'],
      ['⟺', '<->'],
      ['¬', '~'],
      ['□', '[]'],
    ]
    for (const a of arvores) {
      const texto = minimo(a)
      const alvo = esperada(a)
      expect(ler(`(${texto})`).arvore, texto).toBe(alvo)
      expect(ler(ASCII.reduce((s, [de, para]) => s.split(de).join(para), texto)).arvore, texto).toBe(alvo)
      expect(ler(texto.replace(/ ([∧∨⟹⟺]) /g, '$1')).arvore, texto).toBe(alvo)
      expect(ler(texto.split(' ').join('  ')).arvore, texto).toBe(alvo)
    }
  })

  it('E16: as duas formas da mensagem, com a fórmula inteira, são as fórmulas certas', () => {
    let vistos = 0
    for (const a of arvores) {
      const raiz = validar(minimo(a), []).ast!
      const quantificadores: Formula[] = []
      const andar = (g: Formula) => {
        if ((g.k === 'forall' || g.k === 'exists') && g.corpoAberto) quantificadores.push(g)
        if (g.k === 'not' || g.k === 'nec' || g.k === 'pos' || g.k === 'crenca') andar(g.f)
        else if (g.k === 'and' || g.k === 'or' || g.k === 'imp' || g.k === 'iff') (andar(g.l), andar(g.r))
        else if (g.k === 'forall' || g.k === 'exists') andar(g.corpo)
      }
      andar(raiz)
      for (const q of quantificadores) {
        if (q.k !== 'forall' && q.k !== 'exists') continue
        const formas = formasDoEscopo(raiz, q)!
        // a mesma fórmula, sem E16
        const mesma = validar(formas.mesma, [])
        expect(sx(mesma.ast!), formas.mesma).toBe(sx(raiz))
        expect(mesma.diags.map((d) => d.codigo), formas.mesma).not.toContain('E16')
        // a outra: o quantificador só na primeira parte do corpo, o resto igual
        const corpo = q.corpo as { k: 'and' | 'or' | 'imp' | 'iff'; l: Formula; r: Formula }
        const trocar = (g: Formula): Formula => {
          if (g === q) return { k: corpo.k, l: { ...q, corpo: corpo.l }, r: corpo.r, pos: 0, end: 0 }
          if (g.k === 'not' || g.k === 'nec' || g.k === 'pos' || g.k === 'crenca') return { ...g, f: trocar(g.f) }
          if (g.k === 'and' || g.k === 'or' || g.k === 'imp' || g.k === 'iff') return { ...g, l: trocar(g.l), r: trocar(g.r) }
          if (g.k === 'forall' || g.k === 'exists') return { ...g, corpo: trocar(g.corpo) }
          return g
        }
        expect(sx(validar(formas.outra, []).ast!), formas.outra).toBe(sx(trocar(raiz)))
        vistos++
      }
    }
    expect(vistos).toBeGreaterThan(200)
  })
})

describe('todos os textos de até 5 peças de um alfabeto pequeno', () => {
  it('nunca quebram; aceitos, imprimir e o impressor 2 leem de volta a mesma árvore', () => {
    const PECAS = ['P(a)', 'Q(b)', '¬', '∧', '∨', '⟹', '⟺', '(', ')', '∀x', 'P(x)']
    let textos = 0
    let aceitos = 0
    const visitar = (pecas: string[]) => {
      if (pecas.length) {
        textos++
        const texto = pecas.join(' ')
        const v = validar(texto, [])
        expect(v.ok ? !!v.ast : v.diags.length > 0, texto).toBe(true)
        if (v.ok && v.ast) {
          aceitos++
          conferirEscopo(texto, v.ast)
          const alvo = sx(v.ast)
          expect(ler(imprimir(v.ast)).arvore, texto).toBe(alvo)
          const a = deCaderno(v.ast)
          if (a) expect(ler(minimo(a)).arvore, texto).toBe(alvo)
        }
      }
      if (pecas.length < 5) for (const p of PECAS) visitar([...pecas, p])
    }
    visitar([])
    expect(textos).toBe(11 + 11 ** 2 + 11 ** 3 + 11 ** 4 + 11 ** 5)
    expect(aceitos).toBeGreaterThan(1000)
  }, 300_000)
})

describe('limites: o que tem de ser aceito e o que tem de ser recusado', () => {
  const N = 200
  const aceito = (texto: string) => expect(validar(texto, []).ok, texto.slice(0, 40)).toBe(true)

  it(`aninhamento até ${N} níveis é aceito, em cada construção e misturado`, () => {
    aceito('('.repeat(N) + 'P(a)' + ')'.repeat(N))
    aceito('¬'.repeat(N) + 'P(a)')
    aceito('□'.repeat(N) + 'P(a)')
    aceito('B[Ana] '.repeat(N) + 'P(a)')
    aceito(Array.from({ length: N }, (_, i) => `∀x${i} `).join('') + 'P(a)')
    aceito('−'.repeat(N) + 'a = b')
    aceito('f('.repeat(N) + 'a' + ')'.repeat(N) + ' = b')
    aceito('(¬'.repeat(N / 2) + 'P(a)' + ')'.repeat(N / 2))
  })

  it(`profundidade da árvore: ${PROFUNDIDADE_MAXIMA} é aceita, ${PROFUNDIDADE_MAXIMA + 1} é recusada`, () => {
    // n termos em ∧: n − 1 conjunções em fila, mais o predicado e o argumento = n + 1 níveis
    const cadeia = (n: number) => Array.from({ length: n }, (_, i) => `P${i}(a)`).join(' ∧ ')
    aceito(cadeia(PROFUNDIDADE_MAXIMA - 1))
    const v = validar(cadeia(PROFUNDIDADE_MAXIMA), [])
    expect(v.ok).toBe(false)
    expect(v.diags[0].codigo).toBe('E0')
  }, 60_000)
})

// ---- escopo conferido só pelo texto (seção 2.2): os átomos do corpo de cada
// quantificador são os que estão entre o ∀ ou ∃ e o ")" do grupo em volta dele, ou o fim

/** Onde termina, pelo texto, o corpo do quantificador cujo símbolo está na posição p. */
function fimDoEscopo(texto: string, p: number): number {
  const abertos: number[] = []
  for (let i = 0; i < p; i++) {
    if (texto[i] === '(') abertos.push(i)
    else if (texto[i] === ')') abertos.pop()
  }
  if (!abertos.length) return texto.length
  let nivel = 1
  for (let i = p; i < texto.length; i++) {
    if (texto[i] === '(') nivel++
    else if (texto[i] === ')' && --nivel === 0) return i
  }
  return texto.length
}

/** Confere cada quantificador da árvore contra o texto; devolve quantos conferiu. */
function conferirEscopo(texto: string, raiz: Formula): number {
  const todos: number[] = []
  const quantificadores: { simbolo: number; atomos: number[] }[] = []
  const andar = (g: Formula, abertos: number[][]): void => {
    switch (g.k) {
      case 'pred':
      case 'rel':
      case 'const':
        todos.push(g.pos)
        for (const a of abertos) a.push(g.pos)
        return
      case 'not':
      case 'nec':
      case 'pos':
      case 'crenca':
        andar(g.f, abertos)
        return
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        andar(g.l, abertos)
        andar(g.r, abertos)
        return
      case 'forall':
      case 'exists': {
        // o trecho do nó pode começar num "(" em volta; o símbolo é o último ∀ ou ∃ antes da variável
        const q = { simbolo: texto.lastIndexOf(g.k === 'forall' ? '∀' : '∃', g.vPos), atomos: [] as number[] }
        quantificadores.push(q)
        andar(g.corpo, [...abertos, q.atomos])
      }
    }
  }
  andar(raiz, [])
  for (const q of quantificadores) {
    const fim = fimDoEscopo(texto, q.simbolo)
    expect(q.atomos, `${texto} — quantificador na posição ${q.simbolo}`).toEqual(todos.filter((p) => p > q.simbolo && p < fim))
  }
  return quantificadores.length
}

describe('quantificadores aninhados: a regra de consumo conferida pelo texto', { timeout: 120_000 }, () => {
  it('nas 2.000 árvores sorteadas, nos dois impressores', () => {
    const r = sorteio(2026)
    let vistos = 0
    for (let i = 0; i < 2000; i++) {
      const a = sortear(r, 4)
      for (const texto of [cheio(a), minimo(a)]) vistos += conferirEscopo(texto, validar(texto, []).ast!)
    }
    expect(vistos).toBeGreaterThan(1000)
  })

  it('1.000 árvores com metade dos nós quantificadores: o leitor monta a árvore e cada escopo bate com o texto', () => {
    const r = sorteio(9)
    let aninhados = 0
    const distintas = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const a = sortear(r, 6, 0.5)
      distintas.add(esperada(a))
      for (const texto of [cheio(a), minimo(a)]) {
        const v = ler(texto)
        expect(v.erros, texto).toEqual([])
        expect(v.arvore, texto).toBe(esperada(a))
        if (conferirEscopo(texto, v.ast!) > 1) aninhados++
      }
    }
    expect(aninhados).toBeGreaterThan(1000)
    expect(distintas.size).toBeGreaterThan(900)
  })
})

// ---- expansão (seção 5) conferida por um oráculo próprio: ⊆, ⋂, ⋃, ∅, ∈, ∉ e
// domínios, com nomes que colidem de propósito com a variável nova (z, z1, z2…)
type Conj = { k: 'n'; n: string } | { k: '∅' } | { k: '⋂' | '⋃'; l: Conj; r: Conj }
type El = { k: 'n'; n: string } | { k: 'f'; fn: string; a: El }
type X =
  | { k: '∈' | '∉'; x: El; s: Conj }
  | { k: '⊆'; l: Conj; r: Conj }
  | { k: 'P'; p: string; x: El }
  | { k: '¬'; a: X }
  | { k: 'B'; ag: string; a: X }
  | { k: '∧' | '∨' | '⟹'; l: X; r: X }
  | { k: '∀' | '∃'; v: string; dom?: Conj; a: X }

/** z, z1 e z2 aparecem como constantes e como variáveis; z3 é predicado; z4 é função; z5 só como titular */
const CONSTANTES = ['a', 'A', 'B', 'z', 'z1', 'z2'] as const
const VARIAVEIS = ['x', 'z', 'z1', 'z2'] as const
const PREDICADOS = ['P', 'z3'] as const
const FUNCOES = ['f', 'z4'] as const
const TITULARES = ['Ana', 'z', 'z5'] as const

function sortearX(r: () => number, prof: number, comCrenca: boolean, escopo: string[] = []): X {
  /** um nome de objeto ou de conjunto; `fora`: a variável cujo domínio está sendo sorteado (não pode, E18) */
  const nome = (fora?: string) => um(r, [...CONSTANTES, ...escopo].filter((n) => n !== fora))
  const el = (): El => (r() < 0.2 ? { k: 'f', fn: um(r, FUNCOES), a: { k: 'n', n: nome() } } : { k: 'n', n: nome() })
  const conj = (p: number, fora?: string): Conj => {
    if (p <= 0 || r() < 0.5) return r() < 0.15 ? { k: '∅' } : { k: 'n', n: nome(fora) }
    return { k: r() < 0.5 ? '⋂' : '⋃', l: conj(p - 1, fora), r: conj(p - 1, fora) }
  }
  const sub = () => sortearX(r, prof - 1, comCrenca, escopo)
  switch (prof <= 0 ? Math.floor(r() * 3) : Math.floor(r() * 9)) {
    case 0:
      return { k: r() < 0.5 ? '∈' : '∉', x: el(), s: conj(2) }
    case 1:
      return { k: '⊆', l: conj(2), r: conj(2) }
    case 2:
      return { k: 'P', p: um(r, PREDICADOS), x: el() }
    case 3:
      return { k: '¬', a: sub() }
    case 4:
      return comCrenca ? { k: 'B', ag: um(r, TITULARES), a: sub() } : { k: '¬', a: sub() }
    case 5:
    case 6:
      return { k: um(r, ['∧', '∨', '⟹'] as const), l: sub(), r: sub() }
    default: {
      const v = um(r, VARIAVEIS)
      const dom = r() < 0.5 ? conj(1, v) : undefined
      return { k: r() < 0.5 ? '∀' : '∃', v, ...(dom ? { dom } : {}), a: sortearX(r, prof - 1, comCrenca, [...escopo, v]) }
    }
  }
}

const tEl = (e: El): string => (e.k === 'n' ? e.n : `${e.fn}(${tEl(e.a)})`)
/** só os parênteses que a precedência pede: ⋂ prende mais que ⋃, os dois associam à esquerda */
const tConj = (s: Conj, min = 1): string => {
  if (s.k === 'n') return s.n
  if (s.k === '∅') return '∅'
  const p = s.k === '⋃' ? 1 : 2
  const t = `${tConj(s.l, p)} ${s.k} ${tConj(s.r, p + 1)}`
  return p < min ? `(${t})` : t
}
function textoX(f: X): string {
  switch (f.k) {
    case '∈':
    case '∉':
      return `${tEl(f.x)} ${f.k} ${tConj(f.s)}`
    case '⊆':
      return `${tConj(f.l)} ⊆ ${tConj(f.r)}`
    case 'P':
      return `${f.p}(${tEl(f.x)})`
    case '¬':
      return `¬(${textoX(f.a)})`
    case 'B':
      return `B[${f.ag}] (${textoX(f.a)})`
    case '∀':
    case '∃':
      // entre parênteses, porque o corpo iria até o fim do grupo (seção 2.2)
      return `(${f.k}${f.v}${f.dom ? `∈${tConj(f.dom)}` : ''} (${textoX(f.a)}))`
    default:
      return `(${textoX(f.l)} ${f.k} ${textoX(f.r)})`
  }
}

const sEl = (e: El): string => (e.k === 'n' ? e.n : `(${e.fn} ${sEl(e.a)})`)
const sConj = (s: Conj): string => (s.k === 'n' ? s.n : s.k === '∅' ? '∅' : `(${s.k} ${sConj(s.l)} ${sConj(s.r)})`)
function arvoreX(f: X): string {
  switch (f.k) {
    case '∈':
    case '∉':
      return `(${f.k} ${sEl(f.x)} ${sConj(f.s)})`
    case '⊆':
      return `(⊆ ${sConj(f.l)} ${sConj(f.r)})`
    case 'P':
      return `(${f.p} ${sEl(f.x)})`
    case '¬':
      return `(¬ ${arvoreX(f.a)})`
    case 'B':
      return `(B "${f.ag}" ${arvoreX(f.a)})`
    case '∀':
    case '∃':
      return `(${f.k} ${f.v}${f.dom ? ` ∈ ${sConj(f.dom)}` : ''} ${arvoreX(f.a)})`
    default:
      return `(${f.k} ${arvoreX(f.l)} ${arvoreX(f.r)})`
  }
}

/** A árvore expandida pela tabela da seção 5 e pela regra da variável nova, escritas aqui de novo. */
function expandidaX(f: X): { arvore: string; novas: string[] } {
  const U = new Set<string>()
  const nomesEl = (e: El): void => {
    if (e.k === 'n') U.add(e.n)
    else (U.add(e.fn), nomesEl(e.a))
  }
  const nomesConj = (s: Conj): void => {
    if (s.k === 'n') U.add(s.n)
    else if (s.k !== '∅') (nomesConj(s.l), nomesConj(s.r))
  }
  const juntar = (g: X): void => {
    switch (g.k) {
      case '∈':
      case '∉':
        nomesEl(g.x)
        nomesConj(g.s)
        return
      case '⊆':
        nomesConj(g.l)
        nomesConj(g.r)
        return
      case 'P':
        U.add(g.p)
        nomesEl(g.x)
        return
      case '¬':
      case 'B': // o titular não entra em U
        juntar(g.a)
        return
      case '∀':
      case '∃':
        U.add(g.v)
        if (g.dom) nomesConj(g.dom)
        juntar(g.a)
        return
      default:
        juntar(g.l)
        juntar(g.r)
    }
  }
  juntar(f)
  const novas: string[] = []
  const nova = (): string => {
    let n = 'z'
    for (let i = 1; U.has(n); i++) n = `z${i}`
    U.add(n)
    novas.push(n)
    return n
  }
  const em = (x: string, s: Conj): string =>
    s.k === 'n' ? `(∈ ${x} ${s.n})` : s.k === '∅' ? '⊥' : `(${s.k === '⋂' ? '∧' : '∨'} ${em(x, s.l)} ${em(x, s.r)})`
  const ex = (g: X): string => {
    switch (g.k) {
      case '∈':
        return em(sEl(g.x), g.s)
      case '∉':
        return `(¬ ${em(sEl(g.x), g.s)})`
      case '⊆': {
        const z = nova()
        return `(∀ ${z} (⟹ ${em(z, g.l)} ${em(z, g.r)}))`
      }
      case 'P':
        return `(${g.p} ${sEl(g.x)})`
      case '¬':
        return `(¬ ${ex(g.a)})`
      case 'B':
        return `(B "${g.ag}" ${ex(g.a)})`
      case '∀':
      case '∃': {
        const corpo = ex(g.a)
        return g.dom ? `(${g.k} ${g.v} (${g.k === '∀' ? '⟹' : '∧'} ${em(g.v, g.dom)} ${corpo}))` : `(${g.k} ${g.v} ${corpo})`
      }
      default:
        return `(${g.k} ${ex(g.l)} ${ex(g.r)})`
    }
  }
  return { arvore: ex(f), novas }
}

const titularesDe = (f: X): string[] =>
  f.k === 'B' ? [f.ag, ...titularesDe(f.a)] : f.k === '¬' || f.k === '∀' || f.k === '∃' ? titularesDe(f.a) : f.k === '∧' || f.k === '∨' || f.k === '⟹' ? [...titularesDe(f.l), ...titularesDe(f.r)] : []

/** Um mundo finito: objetos 0..n−1, pertinência entre eles, valores dos nomes, predicados e funções. */
interface MundoX {
  n: number
  pertence: boolean[][]
  valor: Map<string, number>
  pred: Map<string, boolean[]>
  func: Map<string, number[]>
}
function sortearMundo(r: () => number): MundoX {
  const n = 1 + Math.floor(r() * 3)
  const D = Array.from({ length: n }, (_, i) => i)
  return {
    n,
    pertence: D.map(() => D.map(() => r() < 0.5)),
    valor: new Map([...CONSTANTES, ...VARIAVEIS].map((s): [string, number] => [s, Math.floor(r() * n)])),
    pred: new Map(PREDICADOS.map((p): [string, boolean[]] => [p, D.map(() => r() < 0.5)])),
    func: new Map(FUNCOES.map((g): [string, number[]] => [g, D.map(() => Math.floor(r() * n))])),
  }
}

/** O sentido direto, sem expansão: ⊆, ⋂, ⋃, ∅ e ∀x∈S lidos como conjuntos do mundo. */
function valeX(f: X, m: MundoX, env: Map<string, number> = new Map()): boolean {
  const D = Array.from({ length: m.n }, (_, i) => i)
  const val = (n: string) => env.get(n) ?? m.valor.get(n)!
  const el = (e: El): number => (e.k === 'n' ? val(e.n) : m.func.get(e.fn)![el(e.a)])
  const em = (d: number, s: Conj): boolean =>
    s.k === 'n' ? m.pertence[d][val(s.n)] : s.k === '∅' ? false : s.k === '⋂' ? em(d, s.l) && em(d, s.r) : em(d, s.l) || em(d, s.r)
  switch (f.k) {
    case '∈':
      return em(el(f.x), f.s)
    case '∉':
      return !em(el(f.x), f.s)
    case '⊆': {
      const { l, r } = f
      return D.every((d) => !em(d, l) || em(d, r))
    }
    case 'P':
      return m.pred.get(f.p)![el(f.x)]
    case '¬':
      return !valeX(f.a, m, env)
    case 'B':
      throw new Error('o teste de sentido não sorteia crenças')
    case '∧':
      return valeX(f.l, m, env) && valeX(f.r, m, env)
    case '∨':
      return valeX(f.l, m, env) || valeX(f.r, m, env)
    case '⟹':
      return !valeX(f.l, m, env) || valeX(f.r, m, env)
    case '∀':
    case '∃': {
      // o domínio é lido fora do quantificador: com env, antes de ligar a variável
      const { v, dom, a } = f
      const noDominio = (d: number) => dom === undefined || em(d, dom)
      const dentro = (d: number) => valeX(a, m, new Map(env).set(v, d))
      return f.k === '∀' ? D.every((d) => !noDominio(d) || dentro(d)) : D.some((d) => noDominio(d) && dentro(d))
    }
  }
}

/** Primeira ordem pura, para a árvore expandida do Caderno: predicados, = e ∈, conectivos, ∀ e ∃ sem domínio, ⊤ e ⊥. */
function valeExpandida(f: Formula, m: MundoX, env: Map<string, number> = new Map()): boolean {
  const D = Array.from({ length: m.n }, (_, i) => i)
  const termo = (t: Termo): number => {
    if (t.k === 'nome') return env.get(t.nome) ?? m.valor.get(t.nome)!
    if (t.k === 'app' && t.args.length === 1) return m.func.get(t.fn)![termo(t.args[0])]
    throw new Error(`termo que a expansão não deveria deixar: ${t.k}`)
  }
  switch (f.k) {
    case 'pred':
      return m.pred.get(f.nome)![termo(f.args[0])]
    case 'rel':
      if (f.op === '∈') return m.pertence[termo(f.l)][termo(f.r)]
      if (f.op === '=') return termo(f.l) === termo(f.r)
      throw new Error(`relação que a expansão não deveria deixar: ${f.op}`)
    case 'not':
      return !valeExpandida(f.f, m, env)
    case 'and':
      return valeExpandida(f.l, m, env) && valeExpandida(f.r, m, env)
    case 'or':
      return valeExpandida(f.l, m, env) || valeExpandida(f.r, m, env)
    case 'imp':
      return !valeExpandida(f.l, m, env) || valeExpandida(f.r, m, env)
    case 'iff':
      return valeExpandida(f.l, m, env) === valeExpandida(f.r, m, env)
    case 'forall':
    case 'exists': {
      if (f.dom) throw new Error('domínio que a expansão não deveria deixar')
      const { v, corpo } = f
      const dentro = (d: number) => valeExpandida(corpo, m, new Map(env).set(v, d))
      return f.k === 'forall' ? D.every(dentro) : D.some(dentro)
    }
    case 'const':
      return f.valor
    default:
      throw new Error(`nó que a expansão não deveria deixar: ${f.k}`)
  }
}

describe('expansão conferida por um oráculo próprio: ⊆, ⋂, ⋃, ∅, ∈, ∉ e domínios, com nomes que colidem', { timeout: 120_000 }, () => {
  it('3.000 fórmulas: a árvore e a árvore expandida são as do oráculo, inclusive a variável nova', () => {
    const r = sorteio(11)
    const escolhidas = new Map<string, number>()
    let titularIgual = 0
    const distintos = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      const x = sortearX(r, 4, true)
      const texto = textoX(x)
      distintos.add(texto)
      const v = validar(texto, [])
      expect(v.diags.filter((d) => d.nivel === 'erro').map((d) => d.codigo), texto).toEqual([])
      expect(sx(v.ast!), texto).toBe(arvoreX(x))
      const { arvore, novas } = expandidaX(x)
      expect(sx(expandir(v.ast!)), texto).toBe(arvore)
      for (const n of novas) escolhidas.set(n, (escolhidas.get(n) ?? 0) + 1)
      if (novas.some((n) => titularesDe(x).includes(n))) titularIgual++
    }
    // as colisões acontecem de fato: a variável nova pula z, z1, z2…, e um titular com o mesmo nome não a impede
    for (const n of ['z', 'z1', 'z2', 'z3', 'z4', 'z5']) expect(escolhidas.get(n) ?? 0, n).toBeGreaterThan(5)
    expect(titularIgual).toBeGreaterThan(50)
    expect(distintos.size).toBeGreaterThan(2400)
  })

  it('o sentido não muda: em mundos finitos, a expandida vale exatamente quando a original vale', () => {
    const r = sorteio(12)
    let mundos = 0
    const distintos = new Set<string>()
    for (let i = 0; i < 1500; i++) {
      const x = sortearX(r, 4, false)
      const texto = textoX(x)
      distintos.add(texto)
      const expandida = expandir(validar(texto, []).ast!)
      for (let j = 0; j < 8; j++) {
        const m = sortearMundo(r)
        expect(valeExpandida(expandida, m), `${texto}, num mundo de ${m.n}`).toBe(valeX(x, m))
        mundos++
      }
    }
    expect(mundos).toBe(12_000)
    expect(distintos.size).toBeGreaterThan(1200)
  })

  it('a variável do quantificador no próprio domínio é recusada (E18), em qualquer lugar do domínio', () => {
    for (const q of ['∀', '∃'])
      for (const v of VARIAVEIS)
        for (const dom of [v, `${v} ⋃ A`, `A ⋂ (B ⋃ ${v})`, `f(${v})`, `A_${v}`]) {
          const texto = `${q}${v}∈${dom} P(${v})`
          const d = validar(texto, [])
          expect(d.ok, texto).toBe(false)
          // um índice escrito com _ começa no _ (seção 3.1)
          const onde = dom.startsWith('A_') ? dom.indexOf('_') : dom.indexOf(v)
          expect(d.diags.filter((x) => x.codigo === 'E18').map((x) => x.pos), texto).toEqual([q.length + v.length + 1 + onde])
        }
    // o x do domínio de dentro é o do quantificador de fora: não é o caso do E18
    expect(validar('∀x∈A ∀y∈x P(y)', []).ok).toBe(true)
  })
})

// ---- prioridade dos diagnósticos (diagnosticos-m2.json, campo selecao): falhas de
// várias etapas sorteadas no mesmo texto, com as posições que cada uma tem de dar
describe('prioridade dos diagnósticos: falhas de várias etapas no mesmo texto', { timeout: 120_000 }, () => {
  /** o parêntese do E7 pela regra da seleção, contado só no texto */
  const parenteseE7 = (cps: string[]): number | null => {
    const abertos: number[] = []
    for (let i = 0; i < cps.length; i++) {
      if (cps[i] === '(') abertos.push(i)
      else if (cps[i] === ')') {
        if (!abertos.length) return i
        abertos.pop()
      }
    }
    return abertos.length ? abertos[abertos.length - 1] : null
  }
  /** cada uma começa um E8 em qualquer lugar em que for posta */
  const LEXICAS = ['$', '#', '\\foo', '⁺', '_ ']
  const tamanho = (s: string) => [...s].length

  it('3.000 textos: vale a falha da etapa mais cedo, com as posições certas', () => {
    const r = sorteio(13)
    const distintos = new Set<string>()
    const vistos = { lexico: 0, parenteses: 0, sintaxe: 0, tipos: 0, nenhuma: 0 }
    for (let i = 0; i < 3000; i++) {
      let texto = minimo(sortear(r, 3))
      // nomes e tipos: E9 ou E10 em lugares conhecidos
      const e9: number[] = []
      let e10: number | null = null
      if (r() < 0.4) {
        const caso = Math.floor(r() * 3)
        if (caso === 0) {
          texto = `a ≠ a ∧ (${texto})`
          e9.push(0)
        } else if (caso === 1) {
          e9.push(tamanho(`(${texto}) ∧ `))
          texto = `(${texto}) ∧ b ≠ b`
        } else {
          // P tem aridade 1 nas árvores sorteadas; o P(a) do começo decide o uso
          e10 = tamanho(`P(a) ∧ (${texto}) ∧ `)
          texto = `P(a) ∧ (${texto}) ∧ P(a, b)`
        }
      }
      // sintaxe: uma falha que dá um código conhecido
      let sintaxe: 'E1' | 'E3' | null = null
      if (r() < 0.35) {
        const caso = Math.floor(r() * 3)
        texto = caso === 0 ? `∧ ${texto}` : caso === 1 ? `${texto} ∧` : `${texto} P(a)`
        sintaxe = caso === 2 ? 'E3' : 'E1'
      }
      let cps = [...texto]
      // parênteses: um a mais ou um a menos, então nunca ficam equilibrados
      let parenteses = false
      if (r() < 0.35) {
        parenteses = true
        const existentes = cps.flatMap((c, k) => (c === '(' || c === ')' ? [k] : []))
        if (existentes.length && r() < 0.5) cps.splice(um(r, existentes), 1)
        else cps.splice(Math.floor(r() * (cps.length + 1)), 0, r() < 0.5 ? '(' : ')')
      }
      // léxico: de uma a três, em lugares sorteados; as posições anteriores andam
      let lexicas: number[] = []
      if (r() < 0.35)
        for (let n = 1 + Math.floor(r() * 3); n > 0; n--) {
          const k = Math.floor(r() * (cps.length + 1))
          const peca = [...um(r, LEXICAS)]
          lexicas = lexicas.map((p) => (p >= k ? p + peca.length : p))
          lexicas.push(k)
          cps = [...cps.slice(0, k), ...peca, ...cps.slice(k)]
        }

      texto = cps.join('')
      distintos.add(texto)
      const v = validar(texto, [])
      const ds = v.diags.map((d) => ({ codigo: d.codigo, inicio: tamanho(texto.slice(0, d.pos)) }))
      // a ordem: pelo inicio e, no mesmo inicio, pelo número do código
      expect(ds, texto).toEqual([...ds].sort((a, b) => a.inicio - b.inicio || Number(a.codigo.slice(1)) - Number(b.codigo.slice(1))))
      if (lexicas.length) {
        expect(v.ast, texto).toBeNull()
        expect(ds, texto).toEqual(lexicas.sort((a, b) => a - b).map((inicio) => ({ codigo: 'E8', inicio })))
        vistos.lexico++
      } else if (parenteses) {
        expect(v.ast, texto).toBeNull()
        expect(ds, texto).toEqual([{ codigo: 'E7', inicio: parenteseE7(cps) }])
        vistos.parenteses++
      } else if (sintaxe) {
        expect(v.ast, texto).toBeNull()
        expect(ds.map((d) => d.codigo), texto).toEqual([sintaxe])
        vistos.sintaxe++
      } else if (e9.length || e10 !== null) {
        expect(v.ok, texto).toBe(false)
        expect(v.ast, texto).not.toBeNull()
        expect(ds.filter((d) => d.codigo === 'E9').map((d) => d.inicio), texto).toEqual(e9)
        if (e10 !== null) expect(ds.filter((d) => d.codigo === 'E10').map((d) => d.inicio), texto).toEqual([e10])
        expect(ds.filter((d) => ['E0', 'E1', 'E2', 'E3', 'E7', 'E8'].includes(d.codigo)), texto).toEqual([])
        vistos.tipos++
      } else {
        expect(v.ok, texto).toBe(true)
        vistos.nenhuma++
      }
    }
    for (const [etapa, n] of Object.entries(vistos)) expect(n, etapa).toBeGreaterThan(150)
    expect(distintos.size).toBeGreaterThan(2800)
  })
})
