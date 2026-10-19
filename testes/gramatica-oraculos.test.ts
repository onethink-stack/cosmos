// A gramática conferida por oráculos que não usam o leitor do Caderno: árvores
// sorteadas aqui, num formato próprio, escritas em texto por dois impressores
// feitos a partir da especificação (um com todos os parênteses, outro só com os
// necessários pela precedência e pelo escopo). O leitor tem de montar a árvore
// sorteada. Mais: transformações que não mudam a árvore, todos os textos curtos
// de um alfabeto pequeno e os limites de aninhamento e profundidade.
import { describe, expect, it } from 'vitest'
import type { Formula, Termo } from '../src/logica/ast'
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

const sorteio = (semente: number) => () => {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return semente / 2147483648
}
const um = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
/** aridade fixa por nome, para não cair no E10 */
const ARIDADE = { P: 1, Q: 2, R: 1 } as const
const NOMES = ['a', 'b', 'x', 'y'] as const

function sortear(r: () => number, prof: number): A {
  switch (prof <= 0 ? 0 : Math.floor(r() * 9)) {
    case 0: {
      if (r() < 0.25) return { k: 'eq', l: um(r, NOMES), r: um(r, NOMES) }
      const nome = um(r, ['P', 'Q', 'R'] as const)
      return { k: 'P', nome, args: Array.from({ length: ARIDADE[nome] }, () => um(r, NOMES)) }
    }
    case 1:
      return { k: 'not', a: sortear(r, prof - 1) }
    case 2:
      return { k: 'nec', a: sortear(r, prof - 1) }
    case 3:
      return { k: 'B', ag: um(r, ['Ana', 'Igreja Católica']), a: sortear(r, prof - 1) }
    case 4:
    case 5:
    case 6:
    case 7:
      return { k: um(r, ['and', 'or', 'imp', 'iff'] as const), l: sortear(r, prof - 1), r: sortear(r, prof - 1) }
    default:
      return { k: um(r, ['all', 'ex'] as const), v: um(r, ['x', 'y']), ...(r() < 0.3 ? { dom: 'S' } : {}), a: sortear(r, prof - 1) }
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
