import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { assinaturaNotas, conselheiro, julgarNosMundos, sugerirNotas, valeNoMundo, type ProvaGuardada } from '../src/dados/conselheiro'
import { selecaoSine } from '../src/motor/conselho'
import { semModeloNoZ3 } from '../src/dados/resposta'
import type { EntradaDicionario } from '../src/dados/tipos'
import type { Formula } from '../src/logica/ast'
import { analisar, type Grupo, type GrupoPronto, type Modelo } from '../src/motor/motor'
import type { RespostaComNucleo } from '../src/motor/z3'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({ id: simbolo, termo: simbolo, simbolo, tipo, aridade, definicao: '' })
const dic = [ficha('Socrates', 'constante'), ficha('Zeus', 'constante'), ficha('Homem', 'predicado', 1), ficha('Mortal', 'predicado', 1), ficha('Deus', 'predicado', 1), ficha('Sabio', 'predicado', 1)]
const f = (t: string): Formula => analisar([t], dic)[0].expandida

const grupos: Grupo[] = [
  { id: 'L1', rotulo: 'L1', formulas: ['∀x (Homem(x) ⟹ Mortal(x))'] },
  { id: 'L2', rotulo: 'L2', formulas: ['∀x (Deus(x) ⟹ ¬Mortal(x))'] },
  { id: 'F1', rotulo: 'F1', formulas: ['Homem(Socrates)'] },
  { id: 'F2', rotulo: 'F2', formulas: ['Deus(Zeus)'] },
]
const notas = grupos.flatMap((g) => g.formulas.map(f))

/** Sócrates = d1 (homem, mortal), Zeus = d2 (deus); `sabio`: quem é sábio */
const mundo = (sabio: number[] = []): Modelo => ({
  n: 2,
  mundos: 1,
  constantes: [
    { nome: 'Socrates', valor: 0 },
    { nome: 'Zeus', valor: 1 },
  ],
  funcoes: [],
  predicados: [
    { nome: 'Homem', aridade: 1, verdadeiros: [{ args: [0], w: 0 }] },
    { nome: 'Mortal', aridade: 1, verdadeiros: [{ args: [0], w: 0 }] },
    { nome: 'Deus', aridade: 1, verdadeiros: [{ args: [1], w: 0 }] },
    { nome: 'Sabio', aridade: 1, verdadeiros: sabio.map((d) => ({ args: [d], w: 0 })) },
  ],
  pertence: [],
  acessos: [],
})

describe('cenários guardados: só o que é um cenário real das notas', () => {
  it('uma pergunta falsa num cenário das notas não segue; verdadeira noutro, as notas não decidem', () => {
    for (const n of notas) expect(valeNoMundo(n, mundo())).toBe(true)
    expect(julgarNosMundos([mundo()], f('Sabio(Socrates)'))).toMatchObject({ vale: false })
    expect(julgarNosMundos([mundo()], f('Sabio(Socrates)')).falha).not.toBeNull()
    expect(julgarNosMundos([mundo(), mundo([0])], f('Sabio(Socrates)'))).toMatchObject({ vale: true })
    // o que segue das notas é verdadeiro em todo cenário delas
    expect(julgarNosMundos([mundo(), mundo([0])], f('Mortal(Socrates)'))).toEqual({ falha: null, vale: true })
  })

  it('um cenário em que as notas de agora não valem é deixado de lado', async () => {
    await conselheiro.carregar()
    await conselheiro.esquecer()
    conselheiro.guardarMundo('geral', mundo(), assinaturaNotas(grupos))
    expect(conselheiro.mundosValidos('geral', assinaturaNotas(grupos), notas)).toHaveLength(1)
    // nota nova: "Zeus é homem" — o cenário guardado não a satisfaz
    const novas = [...grupos, { id: 'F3', rotulo: 'F3', formulas: ['Homem(Zeus)'] }]
    expect(conselheiro.mundosValidos('geral', assinaturaNotas(novas), novas.flatMap((g) => g.formulas.map(f)))).toHaveLength(0)
    // outro conjunto (uma visão) não usa os cenários deste
    expect(conselheiro.mundosValidos('visao:Ana', assinaturaNotas(grupos), notas)).toHaveLength(0)
  })

  it('crença de quem o cenário não conhece, ou ∅ que ele não tem: não julga', () => {
    const d = [...dic, ficha('A', 'constante')]
    expect(valeNoMundo(analisar(['B[Ana] (Homem(Socrates))'], d)[0].expandida, mundo())).toBeNull()
    expect(valeNoMundo(analisar(['A = ∅'], d)[0].expandida, mundo())).toBeNull()
  })
})

describe('notas sugeridas', () => {
  const disponiveis = [
    { id: 'L1', simbolos: ['Homem', 'Mortal'] },
    { id: 'L2', simbolos: ['Deus', 'Mortal'] },
    { id: 'F1', simbolos: ['Homem', 'Socrates'] },
    { id: 'F2', simbolos: ['Deus', 'Zeus'] },
    { id: 'X', simbolos: ['Planeta', 'Terra'] },
  ]
  it('primeiro as que provaram perguntas parecidas, depois as que falam dos mesmos nomes', () => {
    const provas: ProvaGuardada[] = [{ id: 'p', contexto: 'geral', simbolos: ['Mortal', 'Socrates'], notas: ['L1', 'F1'], quando: 0 }]
    const s = sugerirNotas(provas, ['Mortal', 'Socrates'], disponiveis)
    expect(s.slice(0, 2).sort()).toEqual(['F1', 'L1'])
    expect(s).not.toContain('X')
    // sem histórico: as que os nomes raros puxam, camada por camada (Zeus → F2 → Deus → L2 → Mortal → L1);
    // F1 não vem por "Homem": em F1 o nome raro é Sócrates
    expect(sugerirNotas([], ['Zeus'], disponiveis)).toEqual(['F2', 'L2', 'L1'])
    // provas de outro conjunto não vão para a sugestão
    conselheiro.guardarProva('visao:Ana', ['Mortal', 'Socrates'], ['L2'])
    expect(conselheiro.conselhoPara('geral').provas.some((p) => p.notas.includes('L2'))).toBe(false)
  })
})

describe('escolher as leis pela pergunta (SInE)', () => {
  it('um nome que está em quase tudo não puxa tudo; os raros puxam, camada por camada', () => {
    // 200 notas sobre conjuntos (todas com ∈) e uma cadeia A → B → C
    const ruido = Array.from({ length: 200 }, (_, i) => ({ id: `N${i}`, simbolos: ['∈', `S${i}`] }))
    const cadeia = [
      { id: 'A', simbolos: ['∈', 'p', 'q'] },
      { id: 'B', simbolos: ['q', 'r'] },
      { id: 'C', simbolos: ['r', 's'] },
      { id: 'E', simbolos: ['s', 'v'] },
      // F só é puxada pelo nome mais raro dela (w), não por r
      { id: 'F', simbolos: ['r', 'w'] },
    ]
    const sel = selecaoSine([...ruido, ...cadeia], ['p', '∈'])
    expect(sel.get('A')).toBe(1)
    expect(sel.get('B')).toBe(2)
    expect(sel.get('C')).toBe(3)
    expect(sel.has('F')).toBe(false)
    // nenhuma das 200 entrou só por ter ∈
    expect([...sel.keys()].filter((id) => id.startsWith('N'))).toEqual([])
  })
})

describe('conselheiro maluco: as sugestões só mudam o tempo, nunca a resposta', () => {
  const prontos: GrupoPronto[] = [...grupos, { id: 'X', rotulo: 'X', formulas: ['Sabio(Zeus)'] }].map((g) => ({ g, itens: analisar(g.formulas, dic) }))
  const ids = prontos.map((x) => x.g.id)
  /** um juiz de mentira: "sem modelo" só quando as notas necessárias estão todas; com as outras, há modelo */
  const juiz =
    (necessarias: string[] | null) =>
    async (fs: Formula[], _d: EntradaDicionario[], _t: number, gr: (number | null)[]): Promise<RespostaComNucleo> => {
      // as fórmulas vêm na ordem dos grupos dados; o índice do grupo aponta para eles
      const presentes = new Set(gr.filter((g): g is number => g !== null))
      const dadas = prontos.filter((x) => fs.some((y) => x.itens.some((i) => i.expandida === y)))
      if (necessarias && necessarias.every((n) => dadas.some((d) => d.g.id === n)))
        return { resultado: 'unsat', nucleo: necessarias.map((n) => dadas.findIndex((d) => d.g.id === n)).filter((i) => presentes.has(i)) }
      return { resultado: 'sat', nucleo: null }
    }
  const alvo = f('Mortal(Socrates)')
  const aleatorias = () => ids.filter(() => Math.random() < 0.5)

  it('com ou sem sugestões (até absurdas), a mesma resposta', async () => {
    for (const necessarias of [['L1', 'F1'], null]) {
      const sem = await semModeloNoZ3(prontos, alvo, alvo, dic, 1000, [], undefined, juiz(necessarias))
      for (let i = 0; i < 30; i++) {
        const com = await semModeloNoZ3(prontos, alvo, alvo, dic, 1000, aleatorias(), undefined, juiz(necessarias))
        expect(com?.resultado).toBe(sem?.resultado)
        if (com?.resultado === 'unsat') expect([...com.notas].sort()).toEqual(['F1', 'L1'])
      }
    }
  })

  it('um cenário com notas a menos não vale: só o de todas', async () => {
    const etapas: string[] = []
    // nada prova; com as sugeridas há "modelo" — mas a resposta só sai do conjunto inteiro
    const r = await semModeloNoZ3(prontos, alvo, alvo, dic, 1000, ['F2'], (e, _u, _t, res) => etapas.push(`${e}:${res}`), juiz(null))
    expect(r).toEqual({ resultado: 'sat', notas: [] })
    expect(etapas.at(-1)).toBe('todas:sat')
    expect(etapas[0]).toBe('sugeridas:sat')
  })

  it('provado só com as sugeridas: diz quantas entraram', async () => {
    const r = await semModeloNoZ3(prontos, alvo, alvo, dic, 1000, ['L1', 'F1'], undefined, juiz(['L1', 'F1']))
    expect(r).toMatchObject({ resultado: 'unsat', recorte: { etapa: 'sugeridas', usadas: 2, total: 5 } })
  })
})
