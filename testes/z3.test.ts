import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import { nao, prepararFormulas } from '../src/motor/motor'
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
