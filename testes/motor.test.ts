import { describe, expect, it } from 'vitest'
import { notaVazia } from '../src/dados/estado'
import { preparar } from '../src/dados/premissas'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'
import { buscarModelo, OPCOES_PADRAO, prepararFormulas, verificar, type Grupo, type Modelo } from '../src/motor/motor'
import { resolver } from '../src/motor/sat'

// ---------------------------------------------------------------- SAT
describe('SAT solver', () => {
  const satisfaz = (cls: number[][], v: Int8Array) => cls.every((c) => c.some((l) => (l > 0 ? v[l] === 1 : v[-l] === -1)))

  it('casos simples', () => {
    expect(resolver(1, [[1], [-1]]).sat).toBe(false)
    expect(resolver(2, [[1, 2], [-1], [-2, 1]]).sat).toBe(false)
    const r = resolver(3, [[1, 2], [-1, 3], [-3]])
    expect(r.sat).toBe(true)
    if (r.sat) expect(satisfaz([[1, 2], [-1, 3], [-3]], r.valores)).toBe(true)
    expect(resolver(1, [[]]).sat).toBe(false)
  })

  it('casa dos pombos 6→5 é insatisfazível', () => {
    const p = 6
    const h = 5
    const v = (i: number, j: number) => i * h + j + 1
    const cls: number[][] = []
    for (let i = 0; i < p; i++) cls.push(Array.from({ length: h }, (_, j) => v(i, j)))
    for (let j = 0; j < h; j++) for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) cls.push([-v(a, j), -v(b, j)])
    expect(resolver(p * h, cls).sat).toBe(false)
  })

  it('3-SAT aleatório: todo modelo devolvido satisfaz as cláusulas', () => {
    // mulberry32: contas inteiras de 32 bits (o gerador linear em ponto flutuante repetia depois de 10.466 sorteios)
    let semente = 12345
    const rnd = () => {
      semente = (semente + 0x6d2b79f5) | 0
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    let sat = 0
    let unsat = 0
    for (let t = 0; t < 60; t++) {
      const n = 40
      const cls = Array.from({ length: 170 }, () => Array.from({ length: 3 }, () => (1 + Math.floor(rnd() * n)) * (rnd() < 0.5 ? -1 : 1)))
      const r = resolver(n, cls)
      if (r.sat) {
        expect(satisfaz(cls, r.valores)).toBe(true)
        sat++
      } else unsat++
    }
    // perto do limiar 4.26 deve haver dos dois tipos
    expect(sat).toBeGreaterThan(0)
    expect(unsat).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------- motor
const dic = (...xs: [string, EntradaDicionario['tipo'], number?][]): EntradaDicionario[] =>
  xs.map(([s, tipo, aridade = 0]) => ({ id: s, termo: s, simbolo: s, tipo, aridade, definicao: '' }))

const tem = (textos: string[], d: EntradaDicionario[] = []) => buscarModelo(prepararFormulas(textos, d), OPCOES_PADRAO)

describe('igualdade e termos', () => {
  it('nomes diferentes podem denotar o mesmo objeto', () => {
    const r = tem(['a = b', 'P(a)', 'P(b)'])
    expect(r.status).toBe('modelo')
    if (r.status === 'modelo') expect(r.n).toBe(1)
  })

  it('substituição em predicados, funções e ∈', () => {
    expect(tem(['a = b', 'P(a)', '¬P(b)']).status).toBe('sem-modelo')
    expect(tem(['a = b', 'f(a) ≠ f(b)']).status).toBe('sem-modelo')
    expect(tem(['a = b', 'a ∈ c', 'b ∉ c']).status).toBe('sem-modelo')
    expect(tem(['a = b', 'c ∈ a', 'c ∉ b']).status).toBe('sem-modelo')
  })

  it('simetria e transitividade', () => {
    expect(tem(['a = b', 'b ≠ a']).status).toBe('sem-modelo')
    expect(tem(['a = b', 'b = c', 'a ≠ c']).status).toBe('sem-modelo')
    expect(tem(['f(f(a)) = a', 'f(a) = b', 'f(b) ≠ a']).status).toBe('sem-modelo')
  })

  it('o domínio precisa ter o tamanho exigido', () => {
    const r = tem(['a ≠ b', 'b ≠ c', 'a ≠ c'])
    expect(r.status === 'modelo' && r.n).toBe(3)
    expect(tem(['∀x ∀y (x = y)', 'a ≠ b']).status).toBe('sem-modelo')
  })

  it('∅ e subscrito', () => {
    expect(tem(['a ∈ ∅']).status).toBe('sem-modelo')
    expect(tem(['∅ ∈ A', '∀x (x ∈ A ⟹ ∃y (y ∈ x))']).status).toBe('sem-modelo')
    expect(tem(['a = b', 'f_a ≠ f(b)']).status).toBe('sem-modelo')
  })

  it('proposições declaradas', () => {
    const d = dic(['P', 'predicado', 0], ['Q', 'predicado', 0])
    expect(tem(['P ⟹ Q', 'P', '¬Q'], d).status).toBe('sem-modelo')
    expect(tem(['P ∨ Q', '¬P'], d).status).toBe('modelo')
  })

  it('para quando o problema passa do limite', () => {
    // sem modelo em nenhum tamanho: a busca sobe n até o aterramento estourar o limite
    const fs = prepararFormulas(['∀x ∀y ∀z ∀w (R(x, y, z, w) ⟹ R(y, z, w, x))', 'P(a)', '¬P(a)'], [])
    const r = buscarModelo(fs, { N: 8, limite: 500, K: 1 })
    expect(r.status).toBe('grande-demais')
    if (r.status === 'grande-demais') expect(r.n).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------- testes obrigatórios
const AX: [string, string][] = [
  ['Ax1', '∀i∈I (f(i) ⊆ A)'],
  ['Ax2', '∀i∈I (f(i) ≠ A)'],
  ['Ax3', '∃i∈I ∃j∈I (i ≠ j ∧ f(i) ≠ f(j))'],
  ['Ax4', 'A ∉ A'],
  ['Ax5', '∀x (x ∈ A ⟺ ∃i∈I (x ∈ f(i)))'],
  ['Ax6', '∃x ∀i∈I (x ∈ f(i))'],
  ['Ax7', '∀i∈I ∀j∈I (f(i) ∉ f(j))'],
]
const DIC = dic(['A', 'constante'], ['I', 'constante'], ['f', 'funcao', 1])
const grupos: Grupo[] = AX.map(([id, f]) => ({ id, rotulo: id, formulas: [f] }))

/** Avalia uma fórmula no modelo devolvido, de forma independente do motor. */
function confereModelo(m: Modelo, textos: string[]) {
  const c = new Map(m.constantes.map((x) => [x.nome, x.valor]))
  const f = new Map(m.funcoes.find((x) => x.nome === 'f')!.tabela.map((x) => [x.args[0], x.valor]))
  const em = (a: number, b: number) => m.pertence.some(([x, y]) => x === a && y === b)
  const A = c.get('A')!
  const I = c.get('I')!
  const D = [...Array(m.n).keys()]
  const emI = D.filter((i) => em(i, I))
  const checks: Record<string, boolean> = {
    Ax1: emI.every((i) => D.every((z) => !em(z, f.get(i)!) || em(z, A))),
    Ax2: emI.every((i) => f.get(i) !== A),
    Ax3: emI.some((i) => emI.some((j) => i !== j && f.get(i) !== f.get(j))),
    Ax4: !em(A, A),
    Ax5: D.every((x) => em(x, A) === emI.some((i) => em(x, f.get(i)!))),
    Ax6: D.some((x) => emI.every((i) => em(x, f.get(i)!))),
    Ax7: emI.every((i) => emI.every((j) => !em(f.get(i)!, f.get(j)!))),
  }
  return textos.map((t) => checks[t])
}

describe('testes obrigatórios do motor', () => {
  it('T1: Ax1..Ax7 → Consistente, com modelo de até 8 objetos', () => {
    const r = verificar(grupos, DIC, OPCOES_PADRAO)
    expect(r.tipo).toBe('consistente')
    if (r.tipo !== 'consistente') return
    expect(r.n).toBeLessThanOrEqual(8)
    // o modelo devolvido satisfaz de fato os sete axiomas
    expect(confereModelo(r.modelo, AX.map(([id]) => id))).toEqual(Array(7).fill(true))
  })

  it('T2: Ax1..Ax7 + "A ∈ A" → sem modelo; conflito mínimo = {Ax4, nova}', () => {
    const r = verificar([...grupos, { id: 'nova', rotulo: 'nova', formulas: ['A ∈ A'] }], DIC, OPCOES_PADRAO)
    expect(r.tipo).toBe('sem-modelo')
    if (r.tipo === 'sem-modelo') expect(r.conflito.sort()).toEqual(['Ax4', 'nova'])
  })

  it('T8: visão B_x(A ∈ A) junto com Ax4 → motor geral não acusa contradição', () => {
    const nota = (p: Partial<Nota>): Nota => ({ ...notaVazia(), id: p.titulo!, ...p })
    const notas = [
      ...AX.map(([id, f]) => nota({ titulo: id, formulas: [f] })),
      nota({ titulo: 'visão', compartimento: 'visao', titular: 'x', formulas: ['A ∈ A'] }),
    ]
    const p = preparar(notas, DIC)
    expect(p.pronto).toBe(true)
    const gerais: Grupo[] = notas
      .filter((n) => n.compartimento !== 'visao')
      .map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    expect(p.premissas.length).toBe(7)
    expect(verificar(gerais, DIC, OPCOES_PADRAO).tipo).toBe('consistente')
    // e a visão, checada sozinha como conjunto próprio, também é consistente
    const vx = p.visoes.get('x')!
    expect(verificar([{ id: 'v', rotulo: 'v', formulas: vx.map((f) => f.texto) }], DIC, OPCOES_PADRAO).tipo).toBe('consistente')
  })

  it('visão que se contradiz por dentro é detectada no seu próprio conjunto', () => {
    const r = verificar(
      [
        { id: 'v1', rotulo: 'v1', formulas: ['A ∈ A'] },
        { id: 'v2', rotulo: 'v2', formulas: ['A ∉ A'] },
        { id: 'v3', rotulo: 'v3', formulas: ['∃x (x ∈ I)'] },
      ],
      DIC,
      OPCOES_PADRAO,
    )
    expect(r.tipo === 'sem-modelo' && r.conflito.sort()).toEqual(['v1', 'v2'])
  })
})
