// Exemplos normativos da gramática do Caderno (versão semântica m2). Cada linha diz
// como um texto é lido: a árvore, escrita entre parênteses, e os avisos (?) e erros.
// Mudar uma linha daqui é mudar o sentido de fórmulas: só com uma nova versão semântica.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import type { Formula, Termo } from '../src/logica/ast'
import { expandir } from '../src/logica/acucar'
import { canonica } from '../src/logica/canonica'
import { imprimir } from '../src/logica/impressao'
import { definirAvisoDeEscopo, validar } from '../src/logica/validador'
import { nao, OPCOES_PADRAO, perguntar, prepararFormulas, type Grupo } from '../src/motor/motor'
import { checarZ3 } from '../src/motor/z3'

/** A árvore entre parênteses: (conectivo filhos…); termos e fórmulas no mesmo formato. */
const t = (x: Termo): string => {
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
      return x.subscrito ? `(_ ${x.fn} ${x.args.map(t).join(' ')})` : `(${x.fn} ${x.args.map(t).join(' ')})`
    case 'inter':
      return `(⋂ ${t(x.l)} ${t(x.r)})`
    case 'uniao':
      return `(⋃ ${t(x.l)} ${t(x.r)})`
    case 'arit':
      return `(${x.op} ${t(x.l)} ${t(x.r)})`
    case 'neg':
      return `(− ${t(x.t)})`
  }
}
const OP = { and: '∧', or: '∨', imp: '⟹', iff: '⟺' } as const
const f = (x: Formula): string => {
  switch (x.k) {
    case 'pred':
      return x.args.length ? `(${x.nome} ${x.args.map(t).join(' ')})` : x.nome
    case 'rel':
      return `(${x.op} ${t(x.l)} ${t(x.r)})`
    case 'not':
      return `(¬ ${f(x.f)})`
    case 'nec':
      return `(□ ${f(x.f)})`
    case 'pos':
      return `(◇ ${f(x.f)})`
    case 'crenca':
      return `(B "${x.agente}" ${f(x.f)})`
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return `(${OP[x.k]} ${f(x.l)} ${f(x.r)})`
    case 'forall':
    case 'exists':
      return `(${x.k === 'forall' ? '∀' : '∃'} ${x.v}${x.dom ? ` ∈ ${t(x.dom)}` : ''} ${f(x.corpo)})`
    case 'const':
      return x.valor ? '⊤' : '⊥'
  }
}

const PROP: EntradaDicionario[] = ['A', 'B', 'C'].map((s) => ({ id: s, termo: s, simbolo: s, tipo: 'predicado', aridade: 0, definicao: '' }))
const codigos = (texto: string) =>
  validar(texto, [])
    .diags.map((d) => `${d.codigo}${d.nivel === 'aviso' ? '?' : ''}`)
    .join(',')

/** [texto, dicionário, árvore (null = recusado), códigos ('?' = aviso)] */
const EXEMPLOS: [string, EntradaDicionario[], string | null, string][] = [
  ["P(a)", [], "(P a)", ""],
  ["P(a, f(b))", [], "(P a (f b))", ""],
  ["x_i = y", [], "(= (_ x i) y)", ""],
  ["xᵢ = y", [], "(= (_ x i) y)", ""],
  ["x' = x''", [], "(= x' x'')", ""],
  ["a ≠ b", [], "(≠ a b)", ""],
  ["a != b", [], "(≠ a b)", ""],
  ["a ∈ A ⋂ B", [], "(∈ a (⋂ A B))", ""],
  ["A ⋂ B ⊆ C", [], "(⊆ (⋂ A B) C)", ""],
  ["(A ⋃ B) ⊆ C", [], "(⊆ (⋃ A B) C)", ""],
  ["x + 2 · y ≤ 3", [], "(≤ (+ x (· 2 y)) 3)", ""],
  ["−x^2 = −4", [], "(= (− (^ x 2)) (− 4))", ""],
  ["2^3^2 = 512", [], "(= (^ 2 (^ 3 2)) 512)", ""],
  ["a ∈ ∅", [], "(∈ a ∅)", ""],
  ["P(a) ∨ Q(a) ∧ R(a)", [], "(∨ (P a) (∧ (Q a) (R a)))", ""],
  ["P(a) ⟹ Q(a) ⟹ R(a)", [], "(⟹ (P a) (⟹ (Q a) (R a)))", ""],
  ["P(a) ⟺ Q(a) ⟺ R(a)", [], "(⟺ (⟺ (P a) (Q a)) (R a))", ""],
  ["¬P(a) ∧ Q(a)", [], "(∧ (¬ (P a)) (Q a))", ""],
  ["~P(a) & Q(a) -> R(a)", [], "(⟹ (∧ (¬ (P a)) (Q a)) (R a))", ""],
  ["∀x P(x) ⟹ Q(b)", [], "(∀ x (⟹ (P x) (Q b)))", "E16?"],
  ["(∀x P(x)) ⟹ Q(b)", [], "(⟹ (∀ x (P x)) (Q b))", ""],
  ["∀x (P(x)) ⟹ Q(b)", [], "(∀ x (⟹ (P x) (Q b)))", "E14?"],
  ["∀x (P(x) ⟹ Q(b))", [], "(∀ x (⟹ (P x) (Q b)))", ""],
  ["¬∀x P(x) ∨ Q(b)", [], "(¬ (∀ x (∨ (P x) (Q b))))", "E16?"],
  ["P(a) ∧ ∀x P(x) ⟹ Q(b)", [], "(∧ (P a) (∀ x (⟹ (P x) (Q b))))", "E16?"],
  ["∀x∈S P(x)", [], "(∀ x ∈ S (P x))", ""],
  ["∃x∈ℝ x · x = 2", [], "(∃ x ∈ ℝ (= (· x x) 2))", ""],
  ["∀x ∃y R(x, y)", [], "(∀ x (∃ y (R x y)))", ""],
  ["∀x (P(x) ∧ ∀x Q(x))", [], "(∀ x (∧ (P x) (∀ x (Q x))))", "E5?"],
  ["□P(a) ⟹ ◇P(a)", [], "(⟹ (□ (P a)) (◇ (P a)))", ""],
  ["B[Igreja Católica] P(a) ∧ Q(a)", [], "(∧ (B \"Igreja Católica\" (P a)) (Q a))", ""],
  ["B[x] B[y] P(a)", [], "(B \"x\" (B \"y\" (P a)))", ""],
  ["[]P(a) -> <>P(a)", [], "(⟹ (□ (P a)) (◇ (P a)))", ""],
  ["P(x)", [], "(P x)", ""],
  ["(∀x P(x)) ∧ Q(x)", [], "(∧ (∀ x (P x)) (Q x))", "E6?"],
  ["A ⟹ B", PROP, "(⟹ A B)", ""],
  ["A ⟹ B", [], null, "E2"],
  ["P(a", [], null, "E7"],
  ["P(a) ∧", [], null, "E1"],
  ["P(a) Q(a)", [], null, "E3"],
  ["¬a", [], null, "E2"],
  ["∀x", [], null, "E1"],
  ["a = b = c", [], null, "E0"],
  ["f() = a", [], null, "E0"],
  ["P(a) $ Q(a)", [], null, "E8"],
  ["ℝ = a", [], null, "E0"],
  ["B[] P(a)", [], null, "E0"],
  ["(A ⋂ B) = C", [], "(= (⋂ A B) C)", "E11"],
  ["a ≠ a", [], "(≠ a a)", "E9"],
  ["P (a)", [], null, "E2"],
  ['ação = b'.normalize('NFD'), [], null, "E8,E8"], // o mesmo nome em NFD: recusado, não vira outro objeto
  ["∀x P(x) ∧ Q(x)", [], "(∀ x (∧ (P x) (Q x)))", "E16?"],
  ["∃x (P(x) ∧ Q(x))", [], "(∃ x (∧ (P x) (Q x)))", ""],
  ["∀x ∃y R(x, y) ∧ Q(b)", [], "(∀ x (∃ y (∧ (R x y) (Q b))))", "E16?"],
  ["∀x∈S P(x) ⟹ Q(x)", [], "(∀ x ∈ S (⟹ (P x) (Q x)))", "E16?"],
  ["∀x P(x) ⟹ Q(b) ⟺ R(b)", [], "(∀ x (⟺ (⟹ (P x) (Q b)) (R b)))", "E16?"],
  ["x² = 4", [], "(= x² 4)", "E17?"],
  ["x^2 = 4", [], "(= (^ x 2) 4)", ""],
  ["x2 = 4", [], "(= x2 4)", ""],
  ["xⁿ = y", [], "(= xⁿ y)", "E17?"],
  ["²x = 4", [], "(= ²x 4)", "E17?"],
  ["∀x P(x²)", [], "(∀ x (P x²))", "E17?"],
  ["B[Ana²] P(a)", [], "(B \"Ana²\" (P a))", "E17?"],
  ["xᵃ = y", [], "(= xᵃ y)", ""],
  ["x⁺ = y", [], null, "E8"],
  ["٣x = y", [], "(= ٣x y)", ""],
  ["x₁ = y", [], "(= (_ x 1) y)", ""],
  ["x_1 = y", [], "(= (_ x 1) y)", ""],
  ["2x = 4", [], null, "E2"],
  ["B [Ana] P(a)", [], null, "E2"],
  ["f (a) = b", [], null, "E2"],
  ["P(a)∧Q(a)", [], "(∧ (P a) (Q a))", ""],
  ["(P(a) ∧ ∀x P(x)) ⟹ Q(b)", [], "(⟹ (∧ (P a) (∀ x (P x))) (Q b))", ""],
]

describe('gramática normativa: cada exemplo é lido sempre do mesmo jeito', () => {
  it('são 73 exemplos', () => expect(EXEMPLOS).toHaveLength(73))
  for (const [texto, dic, arvore, cods] of EXEMPLOS)
    it(texto, () => {
      const v = validar(texto, dic)
      expect(v.ast ? f(v.ast) : null).toBe(arvore)
      expect(v.diags.map((d) => `${d.codigo}${d.nivel === 'aviso' ? '?' : ''}`).join(',')).toBe(cods)
    })
})

describe('E16: aviso de escopo, nunca erro, e dá para desligar', () => {
  afterEach(() => definirAvisoDeEscopo(true))

  it('mostra a leitura do Caderno e a alternativa com parênteses', () => {
    const d = validar('∀x P(x) ⟹ Q(b)', []).diags.find((x) => x.codigo === 'E16')!
    expect(d.nivel).toBe('aviso')
    expect(d.msg).toContain('Lido como ∀x (P(x) ⟹ Q(b))')
    expect(d.msg).toContain('(∀x P(x)) ⟹ Q(b)')
    // a alternativa sugerida é mesmo a outra leitura
    expect(f(validar('(∀x P(x)) ⟹ Q(b)', []).ast!)).toBe('(⟹ (∀ x (P x)) (Q b))')
  })

  it('desligado, some o aviso e a árvore fica igual', () => {
    const antes = validar('∀x P(x) ⟹ Q(b)', [])
    definirAvisoDeEscopo(false)
    const depois = validar('∀x P(x) ⟹ Q(b)', [])
    expect(depois.diags.map((d) => d.codigo)).not.toContain('E16')
    expect(f(depois.ast!)).toBe(f(antes.ast!))
    expect(canonica(expandir(depois.ast!))).toBe(canonica(expandir(antes.ast!)))
  })

  it('com o corpo entre parênteses não há aviso, e a fórmula é a mesma', () => {
    expect(codigos('∀x (P(x) ⟹ Q(b))')).toBe('')
    expect(f(validar('∀x (P(x) ⟹ Q(b))', []).ast!)).toBe(f(validar('∀x P(x) ⟹ Q(b)', []).ast!))
  })

  it('E14 e E16 não se repetem no mesmo quantificador', () => {
    expect(codigos('∀x (P(x)) ⟹ Q(b)')).toBe('E14?')
  })
})

describe('E17: sobrescrito em nome é aviso, e o nome continua sendo outro nome', () => {
  it('sugere a potência com ^ quando o sobrescrito está no fim', () => {
    expect(validar('x² = 4', []).diags[0].msg).toContain('x^2')
    expect(validar('xⁿ = y', []).diags[0].msg).toContain('x^n')
  })

  it('x² não é ligado por ∀x: é uma constante', () => {
    const v = validar('∀x P(x²)', [])
    expect(f(v.ast!)).toBe('(∀ x (P x²))')
    expect(canonica(expandir(v.ast!))).not.toBe(canonica(expandir(validar('∀x P(x)', []).ast!)))
  })
})

describe('testes gerados: o leitor nunca quebra, e imprimir e ler de novo dá a mesma árvore', () => {
  // sorteio determinístico: a mesma semente dá sempre as mesmas fórmulas
  const sorteio = (semente: number) => () => {
    semente = (semente * 1103515245 + 12345) % 2147483648
    return semente / 2147483648
  }
  const ATOMOS = ['P(a)', 'Q(x)', 'R(x, y)', 'a = b', 'x ∈ A', 'f(x) = y', 'P(x)', 'Q(b)']
  const gerar = (r: () => number, prof: number): string => {
    const sub = () => gerar(r, prof - 1)
    switch (Math.floor(r() * (prof > 0 ? 10 : 1))) {
      case 0:
        return ATOMOS[Math.floor(r() * ATOMOS.length)]
      case 1:
        return `¬${sub()}`
      case 2:
        return `${sub()} ∧ ${sub()}`
      case 3:
        return `${sub()} ∨ ${sub()}`
      case 4:
        return `${sub()} ⟹ ${sub()}`
      case 5:
        return `${sub()} ⟺ ${sub()}`
      case 6:
        return `∀x ${sub()}`
      case 7:
        return `∃y (${sub()})`
      case 8:
        return `(${sub()})`
      default:
        return r() < 0.5 ? `□${sub()}` : `B[Ana] ${sub()}`
    }
  }

  it('3.000 fórmulas sorteadas: imprimir a árvore e ler de novo dá a mesma árvore', () => {
    const r = sorteio(42)
    let validas = 0
    for (let i = 0; i < 3000; i++) {
      const t = gerar(r, 4)
      const v = validar(t, [])
      if (!v.ok || !v.ast) continue
      validas++
      const impresso = imprimir(v.ast)
      const outra = validar(impresso, [])
      expect(outra.ast ? f(outra.ast) : null, `${t}  →  ${impresso}`).toBe(f(v.ast))
    }
    expect(validas).toBeGreaterThan(1000)
  })

  it('3.000 textos aleatórios com os símbolos da linguagem: sempre árvore ou erro, nunca exceção', () => {
    const r = sorteio(7)
    const PECAS = ['∀x', '∃y', '¬', '∧', '∨', '⟹', '⟺', '(', ')', 'P(a)', 'x', '=', '∈', 'A', ',', 'B[Ana]', '□', '◇', '²', '⋂', '−', '2', 'f(', '[', ']']
    for (let i = 0; i < 3000; i++) {
      const t = Array.from({ length: 1 + Math.floor(r() * 12) }, () => PECAS[Math.floor(r() * PECAS.length)]).join(' ')
      const v = validar(t, [])
      expect(v.ok ? !!v.ast : v.diags.length > 0, t).toBe(true)
    }
  })
})

describe('escopo do quantificador: as duas leituras são fórmulas diferentes em todos os componentes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any
  beforeAll(async () => {
    api = await init()
  }, 60_000)
  afterAll(async () => {
    await killThreads(api.em)
  })

  const caderno = '∀x P(x) ⟹ Q(b)'
  const explicita = '∀x (P(x) ⟹ Q(b))'
  const livros = '(∀x P(x)) ⟹ Q(b)'
  const premissas = ['P(c)', '¬P(d)', '¬Q(b)']
  const grupos = (xs: string[]): Grupo[] => xs.map((x, i) => ({ id: `g${i}`, rotulo: `g${i}`, formulas: [x] }))
  const ast = (x: string) => expandir(validar(x, []).ast!)

  it('a escrita sem parênteses é a mesma fórmula que a explícita', () => {
    expect(f(validar(caderno, []).ast!)).toBe(f(validar(explicita, []).ast!))
    expect(canonica(ast(caderno))).toBe(canonica(ast(explicita)))
    expect(canonica(ast(caderno))).not.toBe(canonica(ast(livros)))
  })

  it('motor finito: com P(c), ¬P(d) e ¬Q(b), a leitura do Caderno é falsa e a dos livros segue', () => {
    expect(perguntar(grupos(premissas), caderno, [], OPCOES_PADRAO).tipo).toBe('contradiz')
    expect(perguntar(grupos(premissas), livros, [], OPCOES_PADRAO).tipo).toBe('segue')
  })

  it('Z3: as mesmas duas respostas, para qualquer tamanho', async () => {
    const base = prepararFormulas(premissas, [])
    expect(await checarZ3(api, [...base, ast(caderno)], 15_000)).toBe('unsat')
    expect(await checarZ3(api, [...base, nao(ast(livros))], 15_000)).toBe('unsat')
  }, 60_000)
})
