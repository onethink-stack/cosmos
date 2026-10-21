// Os modelos exatos (modelo-exato-t1-v1, especificacao/modelos-exatos-t1.md): as contas exatas (racionais, Sturm e
// Q(α)), a conferência do Caderno, que tem de recusar cada certificado estragado e os contraexemplos da rodada 31
// (testemunha debaixo de ¬, ∅ fora dos objetos, polinômio redutível), e o emissor, que tira o modelo do Z3.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import { Corpo, doInteiro, irredutivel, isolarRaiz, lerRacional, racional, raizesEntre, escrever } from '../src/motor/exato'
import { falhasDoModeloExato, FORMATO_EXATO } from '../src/motor/modeloExato'
import { analisar, nomesNumericos } from '../src/motor/motor'
import { modeloExatoPeloZ3 } from '../src/motor/z3Modelo'
import textoExemplos from '../especificacao/traducao-z3-t1-exemplos.json?raw'

const r = (n: number, d = 1) => racional(BigInt(n), BigInt(d))
const fichas = (fs: { simbolo: string; tipo: string; aridade: number; numerico?: boolean; argumentos?: string[] }[]): EntradaDicionario[] =>
  fs.map((x) => ({ id: x.simbolo, termo: x.simbolo, definicao: '', ...x }) as EntradaDicionario)
const expandir = (textos: string[], dic: EntradaDicionario[] = []) => {
  const prontas = analisar(textos, dic, true)
  expect(prontas).toHaveLength(textos.length)
  return prontas.map((x) => x.expandida)
}
const vazio = (extra: Record<string, unknown> = {}) => ({
  formato: FORMATO_EXATO,
  objetos: ['o0'],
  mundos: ['w0'],
  mundoReal: 'w0',
  constantesObjeto: {},
  constantesReais: {},
  funcoesObjeto: {},
  funcoesReais: {},
  predicados: {},
  pertence: [],
  acessos: {},
  testemunhas: [],
  ...extra,
})
const RAIZ_DE_2 = { polinomio: [-2, 0, 1], intervaloAberto: ['1', '3/2'] }
const N = fichas([{ simbolo: 'n', tipo: 'constante', aridade: 0, numerico: true }])

describe('contas exatas', () => {
  it('lê os racionais só nas três escritas do formato', () => {
    expect(escrever(lerRacional('-3/2')!)).toBe('-3/2')
    expect(escrever(lerRacional('0.50')!)).toBe('1/2')
    expect(escrever(lerRacional('4/2')!)).toBe('2')
    for (const s of ['1/0', '1e3', ' 1', '+1', '1.', '.5', 'alpha', '']) expect(lerRacional(s), s).toBeNull()
  })

  it('conta as raízes por Sturm e isola cada uma', () => {
    const p = doInteiro([-2n, 0n, 1n])
    expect(raizesEntre(p, r(-2), r(2))).toBe(2)
    expect(raizesEntre(p, r(1), r(3, 2))).toBe(1)
    expect(raizesEntre(p, r(2), r(3))).toBe(0)
    expect(isolarRaiz(p, 1)!.map(escrever)).toEqual(['-3/2', '-1'])
    expect(isolarRaiz(p, 2)!.map(escrever)).toEqual(['1', '3/2'])
    expect(isolarRaiz(p, 3)).toBeNull()
    // raiz racional: o meio que cai nela é empurrado para o lado
    expect(raizesEntre(doInteiro([0n, 1n]), ...(isolarRaiz(doInteiro([0n, 1n]), 1) as [never, never]))).toBe(1)
  })

  it('decide a irredutibilidade até o grau 3', () => {
    expect(irredutivel([-2n, 0n, 1n])).toBe(true)
    expect(irredutivel([-1n, 0n, 1n])).toBe(false)
    expect(irredutivel([-2n, 0n, 0n, 1n])).toBe(true)
    expect(irredutivel([-8n, 0n, 0n, 1n])).toBe(false)
    expect(irredutivel([1n, 0n, 0n, 0n, 1n])).toBeNull()
  })

  it('faz as contas em Q(√2) sem arredondar', () => {
    const K = new Corpo(doInteiro([-2n, 0n, 1n]), [r(1), r(3, 2)])
    const a = K.alfa()
    expect(K.iguais(K.produto(a, a), K.constante(r(2)))).toBe(true)
    expect(K.comparar(a, K.constante(r(7, 5)))).toBe(1)
    expect(K.comparar(a, K.constante(r(71, 50)))).toBe(-1)
    expect(K.iguais(K.inverso(a), K.produto(a, K.constante(r(1, 2))))).toBe(true)
    expect(K.ehInteiro(a)).toBe(false)
    expect(K.ehInteiro(K.produto(a, a))).toBe(true)
  })
})

describe('a conferência do modelo exato', () => {
  it('aceita o modelo certo e recusa a fórmula negada', () => {
    const fs = expandir(['n · n = 2'], N)
    const m = vazio({ algebrico: RAIZ_DE_2, constantesReais: { n: 'alpha' } })
    expect(falhasDoModeloExato(m, fs, nomesNumericos(N))).toEqual([])
    expect(falhasDoModeloExato(m, expandir(['¬(n · n = 2)'], N), nomesNumericos(N))).toEqual(['a fórmula 1 é falsa no mundo real'])
    expect(falhasDoModeloExato({ ...m, constantesReais: { n: { coeficientes: ['0', '1'] } } }, fs, nomesNumericos(N))).toEqual([])
    expect(falhasDoModeloExato({ ...m, constantesReais: { n: '7/5' } }, fs, nomesNumericos(N))).toEqual(['a fórmula 1 é falsa no mundo real'])
  })

  it('recusa a testemunha debaixo de ¬ (o contraexemplo de polaridade da rodada 31)', () => {
    const m = vazio({ testemunhas: [{ formula: 0, variavel: 'x', valor: '0' }] })
    const falhas = falhasDoModeloExato(m, expandir(['¬∃x∈ℝ x = 1']), new Set())
    expect(falhas).toHaveLength(1)
    expect(falhas[0]).toMatch(/debaixo de ¬/)
    // e também à esquerda de ⟹, dentro de ⟺ e um ∀ sobre ℝ, em qualquer lugar
    for (const f of ['(∃x∈ℝ x = 1) ⟹ (1 = 2)', '(∃x∈ℝ x = 1) ⟺ (1 = 2)', '∀x∈ℝ x = x'])
      expect(falhasDoModeloExato(m, expandir([f]), new Set()), f).not.toEqual([])
  })

  it('trata ∅ como um objeto: ∀x (x ≠ ∅) é falsa (o contraexemplo do ∅ da rodada 31)', () => {
    const fs = expandir(['∀x (x ≠ ∅)'])
    expect(falhasDoModeloExato(vazio({ constantesObjeto: { '∅': 'o0' } }), fs, new Set())).toEqual(['a fórmula 1 é falsa no mundo real'])
    expect(falhasDoModeloExato(vazio(), fs, new Set())).toEqual(['sem o objeto de ∅'])
  })

  it('recusa α mal dado: polinômio redutível (o contraexemplo de python -O), intervalo com duas raízes, índice errado', () => {
    const fs = expandir(['¬(n = 1)'], N)
    const com = (algebrico: unknown) => falhasDoModeloExato(vazio({ algebrico, constantesReais: { n: 'alpha' } }), fs, nomesNumericos(N))
    expect(com({ polinomio: [-1, 0, 1], intervaloAberto: ['1/2', '3/2'] })).toEqual(['o polinômio de α não é irredutível'])
    expect(com({ polinomio: [-2, 0, 1], intervaloAberto: ['-2', '2'] })[0]).toMatch(/tem 2 raízes/)
    expect(com({ polinomio: [-2, 0, 1], intervaloAberto: ['1', '3/2'], indiceDaRaiz: 1 })[0]).toMatch(/índice da raiz de α é 2/)
    expect(com({ polinomio: [-4, 0, 2], intervaloAberto: ['1', '3/2'] })).toEqual(['o polinômio de α não é primitivo'])
    expect(com({ polinomio: [2, 0, -1], intervaloAberto: ['1', '3/2'] })).toEqual(['o polinômio de α tem de ter o coeficiente líder positivo'])
    expect(com({ polinomio: [1, 0, 0, 0, 1], intervaloAberto: ['1', '3/2'] })[0]).toMatch(/grau acima de 3/)
  })

  it('recusa a forma errada: campo desconhecido, testemunha a mais ou a menos, ℤ não inteiro, exceção sem mundo ou repetida', () => {
    const naoTem = expandir(['∃x∈ℝ x · x = 4'])
    const ok = vazio({ testemunhas: [{ formula: 0, variavel: 'x', valor: '-2' }] })
    expect(falhasDoModeloExato(ok, naoTem, new Set())).toEqual([])
    expect(falhasDoModeloExato({ ...ok, testemunhasExistenciais: { x: '2' } }, naoTem, new Set())).toEqual(['campo desconhecido: testemunhasExistenciais'])
    expect(falhasDoModeloExato({ ...ok, testemunhas: [] }, naoTem, new Set())).toEqual(['sem a testemunha de x na fórmula 1'])
    expect(falhasDoModeloExato({ ...ok, testemunhas: [...ok.testemunhas, { formula: 0, variavel: 'y', valor: '1' }] }, naoTem, new Set())[0]).toMatch(/nenhum ∃/)
    expect(falhasDoModeloExato(vazio({ testemunhas: [{ formula: 0, variavel: 'x', valor: '1/2' }] }), expandir(['∃x∈ℤ x + x = 1']), new Set())[0]).toMatch(/não é inteira/)
    const Q = fichas([{ simbolo: 'Q', tipo: 'predicado', aridade: 1, argumentos: ['num'] }])
    const fs = expandir(['Q(1)', '◇¬Q(1)'], Q)
    const doisMundos = (excecoes: unknown[]) => vazio({ mundos: ['w0', 'w1'], predicados: { 'Q/1': { padrao: true, excecoes } } })
    expect(falhasDoModeloExato(doisMundos([{ mundo: 'w1', argumentos: ['1'], valor: false }]), fs, new Set())).toEqual([])
    expect(falhasDoModeloExato(doisMundos([{ argumentos: ['1'], valor: false }]), fs, new Set())).toEqual(['o predicado Q/1: exceção sem o mundo'])
    expect(
      falhasDoModeloExato(doisMundos([{ mundo: 'w1', argumentos: ['1'], valor: false }, { mundo: 'w1', argumentos: ['2/2'], valor: true }]), fs, new Set()),
    ).toEqual(['o predicado Q/1: duas exceções para os mesmos argumentos'])
  })

  it('divide por zero com D0, que só depende do numerador', () => {
    const fs = expandir(['n / 0 = 5'], N)
    expect(falhasDoModeloExato(vazio({ constantesReais: { n: '3' }, divZero: { padrao: '5' } }), fs, nomesNumericos(N))).toEqual([])
    expect(falhasDoModeloExato(vazio({ constantesReais: { n: '3' }, divZero: { padrao: '0', excecoes: [{ numerador: '3', valor: '5' }] } }), fs, nomesNumericos(N))).toEqual([])
    expect(falhasDoModeloExato(vazio({ constantesReais: { n: '3' }, divZero: { padrao: '0' } }), fs, nomesNumericos(N))).toEqual(['a fórmula 1 é falsa no mundo real'])
    expect(falhasDoModeloExato(vazio({ constantesReais: { n: '3' } }), fs, nomesNumericos(N))).toEqual(['sem divZero, e há divisão nas fórmulas'])
  })
})

describe('o emissor: o modelo exato tirado do Z3', { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any
  beforeAll(async () => {
    api = await init()
  }, 60_000)
  afterAll(async () => {
    await killThreads(api.em)
  })

  it('cada sat com números dos exemplos normativos sai com um modelo que a conferência aceita', async () => {
    const exemplos = JSON.parse(textoExemplos).exemplos.filter((e: { z3: string; motorFinito: unknown }) => e.z3 === 'sat' && e.motorFinito === null)
    expect(exemplos.map((e: { id: string }) => e.id)).toEqual(['Z07', 'Z08', 'Z33', 'Z35', 'Z39'])
    for (const e of exemplos) {
      const dic = fichas(e.fichas)
      const fs = expandir(e.formulas, dic)
      const emitido = await modeloExatoPeloZ3(api, fs, nomesNumericos(dic))
      expect('modelo' in emitido ? [] : [emitido.motivo], e.id).toEqual([])
      if ('modelo' in emitido) expect(falhasDoModeloExato(emitido.modelo, fs, nomesNumericos(dic)), e.id).toEqual([])
    }
  })

  it('não emite o que a v1 não confere: ∀ sobre ℝ', async () => {
    const emitido = await modeloExatoPeloZ3(api, expandir(['∀x∈ℝ x · x ≥ 0']), new Set())
    expect('motivo' in emitido && emitido.motivo).toMatch(/∀x∈ℝ/)
  })
})
