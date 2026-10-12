import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import { importarTptp } from '../src/dados/tptp'
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
  const segueN = async (premissas: string[], phi: string, tempoMs = 8_000) => {
    const [alvo] = analisar([phi], D, true)
    return checarZ3(api, [...pf(premissas), nao(alvo.expandida)], tempoMs, nomesNumericos(D))
  }

  it('contas e comparações com constantes', async () => {
    expect(await segueN(['x + y = 10', 'x − y = 2'], 'x = 6')).toBe('unsat')
    expect(await segueN(['x + y = 10'], 'x = 6')).toBe('sat')
    expect(await segueN(['m > 0', 'm · (v − 3) = J'], 'v − 3 = J / m')).toBe('unsat')
    expect(await segueN(['x > 2'], 'x^2 > 4')).toBe('unsat')
  }, 60_000)

  it('quantificadores sobre ℝ', async () => {
    expect(await segueN([], '∀t∈ℝ ∀a∈ℝ ((a > 0 ∧ t > 2 / a) ⟹ t < 0.5 · a · t^2)')).toBe('unsat')
    expect(await segueN([], '∀s∈ℝ ((s > 0 ∧ 3 · s^2 = 1) ⟹ ∀e∈ℝ ((0 ≤ e ∧ e ≤ 1) ⟹ e · (1 − e^2) ≤ s · (1 − s^2)))')).toBe('unsat')
  }, 60_000)

  it('funções numéricas: h decrescente e positiva ⟹ 1/h crescente', async () => {
    const dec = ['∀a∈ℝ ∀b∈ℝ (a < b ⟹ h(b) < h(a))', '∀a∈ℝ h(a) > 0']
    expect(await segueN(dec, '∀a∈ℝ ∀b∈ℝ (a < b ⟹ 1 / h(a) < 1 / h(b))')).toBe('unsat')
  }, 60_000)

  it('sem h > 0 não segue: o Z3 não acusa contradição', async () => {
    // h pode trocar de sinal. O Z3 não acha o contraexemplo e só para pelo tempo
    // limite ("não sei"): 2 s bastam para conferir que ele não diz "unsat".
    const dec = ['∀a∈ℝ ∀b∈ℝ (a < b ⟹ h(b) < h(a))']
    expect(await segueN(dec, '∀a∈ℝ ∀b∈ℝ (a < b ⟹ 1 / h(a) < 1 / h(b))', 2_000)).not.toBe('unsat')
  }, 60_000)

  it('números e objetos juntos', async () => {
    const DM = [...D, { id: 'P', termo: 'P', simbolo: 'P', tipo: 'predicado' as const, aridade: 1, definicao: '' }, { id: 'c', termo: 'c', simbolo: 'c', tipo: 'constante' as const, aridade: 0, definicao: '' }]
    const fs = analisar(['P(c) ⟹ x > 1', 'P(c)'], DM, true).map((p) => p.expandida)
    const [alvo] = analisar(['x > 0'], DM, true)
    expect(await checarZ3(api, [...fs, nao(alvo.expandida)], 20_000, nomesNumericos(DM))).toBe('unsat')
  }, 60_000)

  it('inteiros (ℤ): só os números inteiros', async () => {
    // 2x = 3 tem solução real, não inteira
    expect(await segueN([], '¬∃n∈ℤ (2 · n = 3)')).toBe('unsat')
    expect(await segueN([], '¬∃r∈ℝ (2 · r = 3)')).toBe('sat')
    // entre 0 e 1 não há inteiro; e n < 1 ⟹ n ≤ 0 só vale nos inteiros
    expect(await segueN([], '∀n∈ℤ (n < 1 ⟹ n ≤ 0)')).toBe('unsat')
    expect(await segueN([], '∀r∈ℝ (r < 1 ⟹ r ≤ 0)')).toBe('sat')
    expect(validar('∀n∈ℤ (n · n ≥ 0)', D).ok).toBe(true)
    expect(validar('ℤ = ℤ', D).ok).toBe(false)
  }, 60_000)

  it('símbolos que misturam números e objetos (fichas com o tipo de cada argumento)', async () => {
    const DM: EntradaDicionario[] = [
      ...D,
      { id: 't', termo: 'tamanho', simbolo: 'tamanho', tipo: 'funcao', aridade: 1, definicao: '', numerico: true, argumentos: ['obj'] },
      { id: 'p', termo: 'par', simbolo: 'par', tipo: 'predicado', aridade: 1, definicao: '', argumentos: ['num'] },
      { id: 'l', termo: 'l', simbolo: 'l', tipo: 'constante', aridade: 0, definicao: '' },
    ]
    // tamanho(objeto) é número; par(número)
    expect(validar('∀a (tamanho(a) ≥ 0)', DM).ok).toBe(true)
    expect(validar('par(2)', DM).ok).toBe(true)
    expect(validar('par(l)', DM).diags.map((x) => x.codigo)).toContain('E15')
    expect(validar('tamanho(2) = 1', DM).diags.map((x) => x.codigo)).toContain('E15')
    const fs = analisar(['∀a (tamanho(a) ≥ 0)', '∀n∈ℤ (par(n) ⟺ ∃k∈ℤ (n = 2 · k))'], DM, true).map((p) => p.expandida)
    const pergunta = async (phi: string) => checarZ3(api, [...fs, nao(analisar([phi], DM, true)[0].expandida)], 20_000, nomesNumericos(DM))
    expect(await pergunta('par(4)')).toBe('unsat')
    expect(await pergunta('tamanho(l) + 1 > 0')).toBe('unsat')
    // não segue (tamanho(l) pode ser 0): com quantificadores, o Z3 pode só responder "não sei"
    expect(await pergunta('tamanho(l) > 0')).not.toBe('unsat')
  }, 60_000)
})

// ---- TPTP com aritmética: a tradução, conferida pelo Z3 (a mesma instância: o Z3 ocupa muita memória) ----

const comId = (fs: EntradaDicionario[]) => fs.map((f) => ({ ...f, id: f.simbolo }))

/** traduz e pergunta ao Z3 se a conjectura segue (unsat = segue) */
async function pelo(texto: string, semAs: string[] = []) {
  const r = importarTptp(texto, 'ari.p', 'tptp', [])
  expect(r.avisos).toEqual([])
  const dic = comId(r.fichas)
  for (const n of r.notas) for (const f of n.formulas) expect(validar(f, dic).ok, f).toBe(true)
  const leis = r.notas.filter((n) => n.compartimento === 'lei' && !semAs.some((s) => n.titulo.startsWith(s))).flatMap((n) => n.formulas)
  const conj = r.notas.find((n) => n.compartimento === 'teorema')!.formulas[0]
  const z3 = await checarZ3(api, [...analisar(leis, dic, true).map((x) => x.expandida), nao(analisar([conj], dic, true)[0].expandida)], 20_000, nomesNumericos(dic))
  return { r, z3 }
}

describe('TPTP com aritmética (TFF)', () => {
  const INTEIROS = `tff(n_type, type, n: $int).
tff(f_type, type, f: $int > $int).
tff(ax1, axiom, ![X: $int]: f(X) = $sum(X, 1)).
tff(ax2, axiom, $less(n, 3) & $greater(n, 1)).
tff(conj, conjecture, f(n) = 3).`

  it('$int vira ℤ, as contas viram contas, e o Z3 confere', async () => {
    const { r, z3 } = await pelo(INTEIROS)
    expect(r.notas.find((x) => x.titulo === 'ax1 (axiom)')!.formulas[0]).toBe('∀x∈ℤ (f(x) = (x + 1))')
    expect(r.notas.find((x) => x.titulo === 'ax2 (axiom)')!.formulas[0]).toBe('(n < 3 ∧ n > 1)')
    expect(r.fichas.find((x) => x.simbolo === 'f')).toMatchObject({ tipo: 'funcao', numerico: true })
    expect(r.fichas.find((x) => x.simbolo === 'f')!.argumentos).toBeUndefined()
    expect(z3).toBe('unsat')
  }, 60_000)

  it('quem devolve $int é inteiro: sem essa lei, n poderia ser 2,5', async () => {
    const { r, z3 } = await pelo(INTEIROS, ['n_type'])
    expect(r.notas.find((x) => x.titulo === 'n_type_inteiro (type)')!.formulas[0]).toBe('∃n1∈ℤ (n = n1)')
    // sem ela já não segue (o Z3 não prova; com os quantificadores, pode só dizer "não sei")
    expect(z3).not.toBe('unsat')
  }, 60_000)

  it('símbolos que misturam objetos e números ganham o tipo de cada argumento', async () => {
    const { r, z3 } = await pelo(`tff(lista_type, type, lista: $tType).
tff(tam_type, type, tam: lista > $int).
tff(par_type, type, par: $int > $o).
tff(vazia_type, type, vazia: lista).
tff(a1, axiom, ![L: lista]: $greatereq(tam(L), 0)).
tff(a2, axiom, tam(vazia) = 0).
tff(a3, axiom, par(0)).
tff(c, conjecture, ?[L: lista]: ($lesseq(tam(L), 0) & par(tam(L)))).`)
    expect(r.fichas.find((x) => x.simbolo === 'tam')).toMatchObject({ numerico: true, argumentos: ['obj'] })
    expect(r.fichas.find((x) => x.simbolo === 'par')).toMatchObject({ tipo: 'predicado', argumentos: ['num'] })
    expect(z3).toBe('unsat')
  }, 60_000)

  it('números do TPTP: negativos, frações e notação científica', () => {
    const r = importarTptp('tff(x, type, x: $real).\ntff(a, axiom, $less(x, $sum(-3, $sum(1/2, 2.5E1)))).\ntff(b, axiom, $greater(x, 1.25E-2)).', 'n.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    expect(r.notas.map((n) => n.formulas[0])).toEqual(['x < ((−3) + ((1 / 2) + 25))', 'x > 0.0125'])
  })

  it('$distinct: dois a dois diferentes', () => {
    const r = importarTptp('fof(a, axiom, $distinct(a, b, c)).', 'd.p', 'tptp', [])
    expect(r.notas[0].formulas[0]).toBe('(a ≠ b ∧ a ≠ c ∧ b ≠ c)')
  })

  it('racionais viram reais; multiplicar racionais desconhecidos não é lido (ℚ ≠ ℝ aí)', () => {
    const linear = importarTptp('tff(q, type, q: $rat).\ntff(a, axiom, $less($product(2, q), 1/3)).', 'q.p', 'tptp', [])
    expect(linear.avisos).toEqual([])
    expect(linear.notas[0].formulas[0]).toBe('(2 · q) < (1 / 3)')
    const produto = importarTptp('tff(q, type, q: $rat).\ntff(a, axiom, $product(q, q) = 2).', 'q.p', 'tptp', [])
    expect(produto.avisos.join()).toContain('ℚ ≠ ℝ')
  })
})
