import { describe, expect, it } from 'vitest'
import { alvoSaneado } from '../src/dados/cacadaArquivo'
import { TREINOS } from '../src/dados/cacadaTreinos'
import { examinarPromessa } from '../src/motor/cacada'
import { canonica } from '../src/logica/canonica'
import { ANINHAMENTO_MAXIMO, PROFUNDIDADE_MAXIMA, profundidade } from '../src/logica/parser'
import { validar } from '../src/logica/validador'
import { Avaliador } from '../src/motor/avaliar'
import { PREFIXO_CHAVE_Z3 } from '../src/motor/bancoProvas'
import { OPCOES_PADRAO, perguntar, prepararFormulas, verificar, type Grupo, type Modelo } from '../src/motor/motor'
import { falhasQuadro } from '../src/motor/quadro'
import { VERSAO_TRADUCAO_Z3 } from '../src/motor/z3'

const grupos = (xs: string[]): Grupo[] => xs.map((f, i) => ({ id: `g${i}`, rotulo: `g${i}`, formulas: [f] }))
const recusa = (texto: string, trecho: RegExp) => {
  const v = validar(texto, [])
  expect(v.ok).toBe(false)
  expect(v.ast).toBeNull()
  expect(v.diags.map((d) => d.msg).join(' ')).toMatch(trecho)
}

describe('limites do parser: erro controlado em vez de estourar a pilha', () => {
  it('parênteses, quantificadores, negações e sinais aninhados demais', () => {
    const n = ANINHAMENTO_MAXIMO
    recusa('('.repeat(n) + 'P(a)' + ')'.repeat(n), /aninhada demais/)
    recusa(Array.from({ length: n }, (_, i) => `∀x${i} `).join('') + 'P(a)', /aninhada demais/)
    recusa('¬'.repeat(n + 1) + 'P(a)', /aninhada demais/)
    recusa('−'.repeat(n + 1) + 'a = b', /aninhada demais/)
    recusa('□'.repeat(n + 1) + 'P(a)', /aninhada demais/)
  })

  it('o erro de limite não é engolido quando o parêntese é tentado como termo', () => {
    const n = ANINHAMENTO_MAXIMO
    recusa('('.repeat(n) + 'a' + ')'.repeat(n) + ' = b', /aninhada demais/)
  })

  it('o que está dentro do limite continua valendo', () => {
    const n = ANINHAMENTO_MAXIMO / 4
    expect(validar('('.repeat(n) + 'P(a)' + ')'.repeat(n), []).ok).toBe(true)
    expect(validar('¬'.repeat(n) + 'P(a)', []).ok).toBe(true)
    expect(validar('('.repeat(n) + 'a' + ')'.repeat(n) + ' = b', []).ok).toBe(true)
  })

  it('cadeia longa: recusada acima do máximo, aceita e usada pelo motor abaixo dele', () => {
    const cadeia = (n: number) => Array.from({ length: n }, (_, i) => `P${i}(a)`).join(' ∧ ')
    recusa(cadeia(PROFUNDIDADE_MAXIMA + 500), /grande demais/)
    const t = cadeia(PROFUNDIDADE_MAXIMA - 500)
    const v = validar(t, [])
    expect(v.ok).toBe(true)
    // n termos: n − 1 conjunções em fila, mais o predicado e o seu argumento
    expect(profundidade(v.ast!)).toBe(PROFUNDIDADE_MAXIMA - 500 + 1)
    expect(canonica(v.ast!).length).toBeGreaterThan(0)
    expect(perguntar(grupos([t]), 'P0(a)', [], OPCOES_PADRAO).tipo).toBe('segue')
  }, 60_000)

  it('profundidade conta termos, quantificadores e operadores', () => {
    expect(profundidade(validar('P(a)', []).ast!)).toBe(2)
    expect(profundidade(validar('∀x (P(x) ∧ Q(f(x)))', []).ast!)).toBe(5)
  })
})

describe('respostas guardadas do Z3 dependem da versão da tradução', () => {
  it('a chave começa pelo formato e pela versão', () => {
    expect(PREFIXO_CHAVE_Z3).toBe(`h2:${VERSAO_TRADUCAO_Z3}|`)
    // as antigas, sem versão ('h1:…'), ficam abaixo do prefixo e são apagadas ao abrir
    expect('h1:qualquer' < PREFIXO_CHAVE_Z3).toBe(true)
  })
})

describe('quadro KD45 de modelos vindos de fora', () => {
  const modelo = (mundos: number, pares: [number, number][], agente = 'Ana'): Modelo => ({
    n: 1,
    mundos,
    constantes: [{ nome: 'a', valor: 0 }],
    funcoes: [],
    predicados: [{ nome: 'P', aridade: 1, verdadeiros: [] }],
    pertence: [],
    acessos: [{ agente, pares }],
  })
  const props = (m: Modelo, agentes?: string[]) => falhasQuadro(m, agentes).map((f) => f.propriedade).sort()

  it('os modelos que o motor constrói passam', () => {
    for (const fs of [['B[Ana] P(a)', '¬P(a)'], ['B[Ana] P(a)', '¬B[Bia] P(a)'], ['B[x] ◇P(a)', 'B[y] □¬Q(b)']]) {
      const r = verificar(grupos(fs), [], OPCOES_PADRAO)
      expect(r.tipo).toBe('consistente')
      if (r.tipo === 'consistente') expect(falhasQuadro(r.modelo)).toEqual([])
    }
  })

  it('cada propriedade é acusada sozinha', () => {
    // mundo 0 sem acesso; transitiva e euclidiana valem
    expect(props(modelo(2, [[1, 1]]))).toEqual(['serial'])
    // 0→1, 1→2 sem 0→2; serial e euclidiana valem
    expect(props(modelo(3, [[0, 1], [1, 1], [1, 2], [2, 1], [2, 2]]))).toEqual(['transitiva'])
    // 0→0 e 0→1 sem 1→0; serial e transitiva valem
    expect(props(modelo(2, [[0, 0], [0, 1], [1, 1]]))).toEqual(['euclidiana'])
  })

  it('várias falhas juntas, par fora do modelo e agente sem relação', () => {
    expect(props(modelo(3, [[0, 1], [1, 2]]))).toEqual(['euclidiana', 'serial', 'transitiva'])
    expect(props(modelo(2, [[0, 0], [1, 1], [0, 5]]))).toEqual(['mundos'])
    expect(props(modelo(2, [[0, 0], [1, 1]]), ['Bia'])).toEqual(['serial'])
    expect(props({ ...modelo(1, []), mundos: 0 })).toEqual(['mundos'])
  })

  it('todas as relações de 1 a 4 mundos: o resultado bate com a definição calculada de outro jeito', () => {
    for (let K = 1; K <= 4; K++) {
      let kd45 = 0
      for (let bits = 0; bits < 2 ** (K * K); bits++) {
        const R = (w: number, v: number) => ((bits >> (w * K + v)) & 1) === 1
        const W = [...Array(K).keys()]
        const pares: [number, number][] = []
        for (const w of W) for (const v of W) if (R(w, v)) pares.push([w, v])
        // definição pela matriz: R∘R ⊆ R (transitiva) e Rᵀ∘R ⊆ R (euclidiana)
        const esperado: string[] = []
        if (!W.every((w) => W.some((v) => R(w, v)))) esperado.push('serial')
        if (!W.every((w) => W.every((u) => !W.some((v) => R(w, v) && R(v, u)) || R(w, u)))) esperado.push('transitiva')
        if (!W.every((v) => W.every((u) => !W.some((w) => R(w, v) && R(w, u)) || R(v, u)))) esperado.push('euclidiana')
        expect(props(modelo(K, pares)), `K=${K} pares=${JSON.stringify(pares)}`).toEqual(esperado.sort())
        if (!esperado.length) kd45++
      }
      // contagem independente: escolhe os j mundos que formam grupos (cada um vê o próprio
      // grupo inteiro), reparte-os em k grupos (Stirling) e cada mundo de fora aponta um grupo:
      // Σ C(K,j)·S(j,k)·k^(K−j) = 1, 4, 17, 89
      expect(kd45).toBe([1, 4, 17, 89].at(K - 1))
    }
  })

  it('dados malformados vindos de fora viram falha de mundos, nunca exceção', () => {
    const bruto = (pares: unknown): Modelo => ({ ...modelo(2, []), acessos: [{ agente: 'Ana', pares: pares as [number, number][] }] })
    for (const ruim of [[[0, -1]], [[0, 1.5]], [[0, Number.NaN]], [['0', 1]], [[0]], ['x'], [null]]) expect(props(bruto(ruim))).toContain('mundos')
    expect(props(bruto([[0, 0], [0, 0], [1, 1]]))).toEqual([])
    expect(props({ ...modelo(2, []), acessos: undefined as unknown as Modelo['acessos'] })).toEqual([])
  })

  it('sem a conferência, o avaliador aceitaria uma crença contraditória', () => {
    const m = modelo(2, [])
    expect(new Avaliador(m).avaliar(validar('B[Ana] (P(a) ∧ ¬P(a))', []).ast!)).toBe(true)
    expect(props(m)).toEqual(['serial'])
  })

  it('achado importado com quadro inválido fica de fora; o válido entra', () => {
    const achado = (id: string, m: Modelo) => ({
      id,
      promessaId: 'p',
      quando: 0,
      promessa: 'Q(a)',
      regras: [],
      mundo: { n: 1, modelo: m, passos: { formula: 'Q(a)', valor: false, motivo: '', filhos: [] } },
      estado: 'pista',
      anotacao: '',
      poc: '',
    })
    const a = alvoSaneado({
      id: 'a',
      nome: 'a',
      regras: [],
      promessas: [],
      achados: [achado('ruim', modelo(2, [])), achado('bom', modelo(2, [[0, 1], [1, 1]]))],
    })!
    expect(a.achados.map((x) => x.id)).toEqual(['bom'])
  })
})

describe('achados importados: reconferidos aqui, sem confiar no aparelho de origem', () => {
  const c = TREINOS.find((t) => t.id === 'nomad')!
  const r = examinarPromessa(
    c.regras.map((x) => ({ id: x.id, rotulo: x.titulo, formulas: [x.formula] })),
    c.promessa.formula,
    { ...OPCOES_PADRAO, N: 6 },
  )
  if (r.tipo !== 'fura') throw new Error('o Nomad deveria furar')
  const regras = c.regras.map(({ id, titulo, formula, fonte }) => ({ id, titulo, formula, fonte }))
  const base = (mudar: Record<string, unknown> = {}) => ({
    id: 'x',
    promessaId: 'p',
    quando: 0,
    promessa: c.promessa.formula,
    regras,
    mundo: r.mundo,
    estado: 'pista',
    anotacao: '',
    poc: '',
    ...mudar,
  })
  const importar = (...achados: unknown[]) => alvoSaneado({ id: 'a', nome: 'a', regras: [], promessas: [], achados })!.achados

  it('o achado verdadeiro entra, com a explicação refeita aqui (a que veio de fora é ignorada)', () => {
    const [a] = importar(base({ mundo: { ...r.mundo, passos: { formula: 'forjada', valor: true, motivo: 'forjado', filhos: [] } } }))
    expect(a.mundo.passos).toEqual(r.mundo.passos)
  })

  it('promessa trocada por uma que vale no cenário: fica de fora', () => {
    expect(importar(base({ promessa: 'P(a) ∨ ¬P(a)' }))).toEqual([])
  })

  it('regra que não vale no cenário: fica de fora', () => {
    expect(importar(base({ regras: [...regras, { id: 'r', titulo: '', formula: `¬(${regras[0].formula})`, fonte: '' }] }))).toEqual([])
  })

  it('modelo malformado: fica de fora, sem exceção', () => {
    expect(importar(base({ mundo: { ...r.mundo, modelo: { ...r.mundo.modelo, predicados: 'x' } } }))).toEqual([])
  })
})

describe('as fórmulas de antes não mudam', () => {
  it('chaves e respostas de sempre', () => {
    expect(prepararFormulas(['∀x (P(x) ⟹ Q(x))', 'P(a)'], [])).toHaveLength(2)
    expect(perguntar(grupos(['∀x (P(x) ⟹ Q(x))', 'P(a)']), 'Q(a)', [], OPCOES_PADRAO).tipo).toBe('segue')
  })
})
