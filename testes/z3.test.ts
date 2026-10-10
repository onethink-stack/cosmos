import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import { analisar, nao, nomesNumericos, prepararFormulas } from '../src/motor/motor'
import { checarZ3 } from '../src/motor/z3'
import { validar } from '../src/logica/validador'
import { expandir } from '../src/logica/acucar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any

beforeAll(async () => {
  api = await init()
}, 60_000)

afterAll(async () => {
  await killThreads(api.em)
})

const DIC: EntradaDicionario[] = [
  { id: 'A', termo: 'A', simbolo: 'A', tipo: 'constante', aridade: 0, definicao: '' },
  { id: 'I', termo: 'I', simbolo: 'I', tipo: 'constante', aridade: 0, definicao: '' },
  { id: 'f', termo: 'f', simbolo: 'f', tipo: 'funcao', aridade: 1, definicao: '' },
]
const AX = [
  '∀i∈I (f(i) ⊆ A)',
  '∀i∈I (f(i) ≠ A)',
  '∃i∈I ∃j∈I (i ≠ j ∧ f(i) ≠ f(j))',
  'A ∉ A',
  '∀x (x ∈ A ⟺ ∃i∈I (x ∈ f(i)))',
  '∃x ∀i∈I (x ∈ f(i))',
  '∀i∈I ∀j∈I (f(i) ∉ f(j))',
]
const z3 = (fs: string[], d: EntradaDicionario[] = []) => checarZ3(api, prepararFormulas(fs, d))
/** premissas ⊢ φ ? (premissas ∧ ¬φ sem modelo) */
const segue = (premissas: string[], phi: string, d: EntradaDicionario[] = []) =>
  checarZ3(api, [...prepararFormulas(premissas, d), nao(expandir(validar(phi, d).ast!))])

describe('Z3: mesma semântica do motor finito, sem limite de tamanho', () => {
  it('T1 e T2 com os axiomas', async () => {
    expect(await z3(AX, DIC)).toBe('sat')
    expect(await z3([...AX, 'A ∈ A'], DIC)).toBe('unsat')
    expect(await z3(['A ∉ A', 'A ∈ A'], DIC)).toBe('unsat')
  }, 60_000)

  it('prova consequência: dos axiomas segue ∃x (x ∈ A)', async () => {
    expect(await segue(AX, '∃x (x ∈ A)', DIC)).toBe('unsat')
    expect(await segue(AX, 'A ∈ I', DIC)).toBe('sat')
  }, 60_000)

  it('igualdade e funções', async () => {
    expect(await z3(['a = b', 'P(a)', '¬P(b)'])).toBe('unsat')
    expect(await z3(['a = b', 'f(a) ≠ f(b)'])).toBe('unsat')
    expect(await z3(['a ∈ ∅'])).toBe('unsat')
  }, 60_000)

  it('o que só tem modelo infinito: o Z3 não acusa contradição (responde "não sei")', async () => {
    // s injetiva e nunca volta a z: exige infinitos objetos. O motor finito não acha
    // modelo até N; o Z3 não constrói modelos infinitos, mas também não diz "unsat".
    const infinito = ['∀x (s(x) ≠ z)', '∀x ∀y (s(x) = s(y) ⟹ x = y)']
    expect(await checarZ3(api, prepararFormulas(infinito, []), 3000)).not.toBe('unsat')
  }, 60_000)

  it('lógica modal: □, ◇ e crenças KD45', async () => {
    expect(await segue([], '□P(a) ⟹ P(a)')).toBe('unsat')
    expect(await segue([], '◇P(a) ⟹ □◇P(a)')).toBe('unsat')
    expect(await segue([], '¬(B[x] P(a) ∧ B[x] ¬P(a))')).toBe('unsat')
    expect(await segue([], 'B[x] P(a) ⟹ B[x] B[x] P(a)')).toBe('unsat')
    expect(await segue([], '¬B[x] P(a) ⟹ B[x] ¬B[x] P(a)')).toBe('unsat')
    expect(await segue([], 'B[x] P(a) ⟹ P(a)')).toBe('sat')
    expect(await z3(['A ∉ A', 'B[x] (A ∈ A)'])).toBe('sat')
    expect(await z3(['□(A ∉ A)', 'B[x] (A ∈ A)'])).toBe('unsat')
  }, 60_000)
})

describe('Z3 com números reais', () => {
  const num = (simbolo: string, tipo: EntradaDicionario['tipo'] = 'constante', aridade = 0): EntradaDicionario => ({
    id: simbolo,
    termo: simbolo,
    simbolo,
    tipo,
    aridade,
    definicao: '',
    numerico: true,
  })
  const D = [num('x'), num('y'), num('m'), num('v'), num('J'), num('h', 'funcao', 1)]
  const pf = (fs: string[]) => analisar(fs, D, true).map((p) => p.expandida)
  const segueN = async (premissas: string[], phi: string) => {
    const [alvo] = analisar([phi], D, true)
    return checarZ3(api, [...pf(premissas), nao(alvo.expandida)], 8_000, nomesNumericos(D))
  }

  it('contas e comparações com constantes', async () => {
    expect(await segueN(['x + y = 10', 'x − y = 2'], 'x = 6')).toBe('unsat')
    expect(await segueN(['x + y = 10'], 'x = 6')).toBe('sat')
    expect(await segueN(['m > 0', 'm · (v − 3) = J'], 'v − 3 = J / m')).toBe('unsat')
    expect(await segueN(['x > 2'], 'x^2 > 4')).toBe('unsat')
  }, 60_000)

  it('quantificadores sobre ℝ e funções numéricas', async () => {
    expect(await segueN([], '∀t∈ℝ ∀a∈ℝ ((a > 0 ∧ t > 2 / a) ⟹ t < 0.5 · a · t^2)')).toBe('unsat')
    expect(await segueN([], '∀s∈ℝ ((s > 0 ∧ 3 · s^2 = 1) ⟹ ∀e∈ℝ ((0 ≤ e ∧ e ≤ 1) ⟹ e · (1 − e^2) ≤ s · (1 − s^2)))')).toBe('unsat')
    const dec = ['∀a∈ℝ ∀b∈ℝ (a < b ⟹ h(b) < h(a))', '∀a∈ℝ h(a) > 0']
    expect(await segueN(dec, '∀a∈ℝ ∀b∈ℝ (a < b ⟹ 1 / h(a) < 1 / h(b))')).toBe('unsat')
    // sem h > 0 não segue (h pode trocar de sinal); o Z3 às vezes não acha o contraexemplo a tempo
    expect(await segueN(['∀a∈ℝ ∀b∈ℝ (a < b ⟹ h(b) < h(a))'], '∀a∈ℝ ∀b∈ℝ (a < b ⟹ 1 / h(a) < 1 / h(b))')).not.toBe('unsat')
  }, 60_000)

  it('números e objetos juntos', async () => {
    const DM = [...D, { id: 'P', termo: 'P', simbolo: 'P', tipo: 'predicado' as const, aridade: 1, definicao: '' }, { id: 'c', termo: 'c', simbolo: 'c', tipo: 'constante' as const, aridade: 0, definicao: '' }]
    const fs = analisar(['P(c) ⟹ x > 1', 'P(c)'], DM, true).map((p) => p.expandida)
    const [alvo] = analisar(['x > 0'], DM, true)
    expect(await checarZ3(api, [...fs, nao(alvo.expandida)], 20_000, nomesNumericos(DM))).toBe('unsat')
  }, 60_000)
})
