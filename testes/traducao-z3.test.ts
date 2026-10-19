// A tradução para o Z3 (versão t1) conferida contra o pacote de conformidade:
// cada exemplo de especificacao/traducao-z3-t1-exemplos.json dá o mesmo veredito no
// Z3 e o mesmo resultado no motor finito, e os dois motores nunca se contradizem.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import { analisar, buscarModelo, nomesNumericos, OPCOES_PADRAO } from '../src/motor/motor'
import { checarZ3, VERSAO_TRADUCAO_Z3 } from '../src/motor/z3'
import textoExemplos from '../especificacao/traducao-z3-t1-exemplos.json?raw'

interface Exemplo {
  id: string
  regra: string
  formulas: string[]
  fichas: Omit<EntradaDicionario, 'id' | 'termo' | 'definicao'>[]
  z3: 'sat' | 'unsat' | 'unknown'
  motorFinito: { status: 'modelo'; objetos: number; mundos: number } | { status: 'sem-modelo'; ateObjetos: number; ateMundos: number } | null
}
const PACOTE: { traducao: string; z3: string; exemplos: Exemplo[] } = JSON.parse(textoExemplos)

describe('tradução para o Z3: cada exemplo do pacote dá o veredito que o arquivo diz', { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any
  beforeAll(async () => {
    api = await init()
  }, 60_000)
  afterAll(async () => {
    await killThreads(api.em)
  })

  it('a versão do Z3 é a registrada no pacote: trocar de versão é uma decisão, não um acaso', () => {
    expect(api.Z3.get_full_version()).toBe(`Z3 ${PACOTE.z3}`)
  })

  it('versão t1, 42 exemplos, e os dois motores nunca se contradizem', () => {
    expect(PACOTE.traducao).toBe(VERSAO_TRADUCAO_Z3)
    expect(PACOTE.exemplos).toHaveLength(42)
    for (const e of PACOTE.exemplos) {
      if (e.z3 === 'unsat') expect(e.motorFinito?.status, e.id).not.toBe('modelo')
      if (e.z3 === 'sat') expect(e.motorFinito?.status, e.id).not.toBe('sem-modelo')
      // onde o Z3 não decide, o motor finito acha o modelo
      if (e.z3 === 'unknown') expect(e.motorFinito?.status, e.id).toBe('modelo')
    }
  })

  for (const e of PACOTE.exemplos)
    it(`${e.id} ${e.regra}`, async () => {
      const dic: EntradaDicionario[] = e.fichas.map((x) => ({ id: x.simbolo, termo: x.simbolo, definicao: '', ...x }))
      const prontas = analisar(e.formulas, dic, true)
      expect(prontas).toHaveLength(e.formulas.length)
      const formulas = prontas.map((p) => p.expandida)
      // o unknown leva o prazo inteiro: só os vereditos decididos são refeitos aqui
      if (e.z3 !== 'unknown') expect(await checarZ3(api, formulas, 10_000, nomesNumericos(dic))).toBe(e.z3)
      if (e.motorFinito) {
        const b = buscarModelo(formulas, OPCOES_PADRAO)
        expect(b.status).toBe(e.motorFinito.status)
        if (b.status === 'modelo' && e.motorFinito.status === 'modelo') expect([b.n, b.modelo.mundos]).toEqual([e.motorFinito.objetos, e.motorFinito.mundos])
      }
    })
})
