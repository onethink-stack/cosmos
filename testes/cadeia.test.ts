import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { blocosIndependentes, estadoEfetivo, prazosAuxiliares, reacaoEmCadeia, type AjudaZ3, type RelatorioCadeia } from '../src/motor/cadeia'
import { bancoNaMemoria, definirBanco } from '../src/motor/bancoProvas'
import { comTeto, definirPool, PoolLocal, semParalelo } from '../src/motor/paralelo'
import { analisar, buscarModelo, OPCOES_PADRAO, perguntar, type Modelo } from '../src/motor/motor'

const op = { ...OPCOES_PADRAO, N: 5 }
const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({
  id: simbolo,
  simbolo,
  tipo,
  aridade,
  termo: simbolo,
  definicao: '',
})
const dic = ['P', 'Q', 'R', 'S'].map((p) => ficha(p, 'predicado', 1)).concat([ficha('c', 'constante')])
const g = (id: string, ...formulas: string[]) => ({ id, rotulo: id, formulas })
const t = (id: string, formula: string) => ({ id: `${id}:0`, notaId: id, rotulo: id, formula })

async function rodar(grupos: ReturnType<typeof g>[], teoremas: ReturnType<typeof t>[], inativas: ReturnType<typeof g>[] = []) {
  let ultimo: RelatorioCadeia[] = []
  const etapas: string[] = []
  await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas }, dic, op, (r) => {
    ultimo = r
    etapas.push(r[0].etapa)
  })
  return { rel: ultimo[0], etapas }
}

describe('reação em cadeia', () => {
  const leis = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', '∀x (Q(x) ⟹ R(x))'), g('L3', 'P(c)'), g('L4', '∀x (P(x) ⟹ R(x))')]

  it('bate as leis umas com as outras: independentes e redundantes', async () => {
    const { rel } = await rodar(leis, [])
    expect(rel.consistencia?.tipo).toBe('consistente')
    const L4 = rel.leis.find((l) => l.id === 'L4')!
    expect(L4).toMatchObject({ tipo: 'decorre', notas: ['L1', 'L2'] })
    expect(rel.leis.find((l) => l.id === 'L3')!.tipo).toBe('independente')
  })

  it('monta a cadeia de teoremas, geração por geração', async () => {
    const { rel, etapas } = await rodar(leis.slice(0, 3), [t('T2', 'R(c)'), t('T1', 'Q(c)')])
    const T1 = rel.teoremas.find((x) => x.id === 'T1:0')!
    const T2 = rel.teoremas.find((x) => x.id === 'T2:0')!
    expect(T1).toMatchObject({ geracao: 1 })
    // R(c) sai de Q(c) (o teorema anterior) e L2
    expect(T2).toMatchObject({ geracao: 2, apoio: ['L2', 'T1:0'] })
    expect(etapas.at(-1)).toBe('fim')
  })

  it('sugere a lei que fecha vários teoremas de uma vez', async () => {
    const { rel } = await rodar([g('L1', 'P(c)')], [t('T1', 'S(c)'), t('T2', '∃x S(x)')], [g('desligada', '∀y (P(y) ⟹ S(y))')])
    expect(rel.teoremas.every((x) => x.resultado.tipo === 'nao-segue')).toBe(true)
    const s = rel.sugestoes[0]
    expect(s.lei.notaId).toBe('desligada')
    expect(s.fecha.sort()).toEqual(['T1:0', 'T2:0'])
  })

  it('acusa teoremas incompatíveis entre si', async () => {
    const { rel } = await rodar([g('L1', 'P(c)')], [t('T1', 'S(c)'), t('T2', '¬S(c)')])
    expect(rel.conflitoTeoremas?.sort()).toEqual(['T1:0', 'T2:0'])
  })

  it('para nas leis contraditórias', async () => {
    const { rel } = await rodar([g('L1', 'P(c)'), g('L2', '¬P(c)')], [t('T1', 'Q(c)')])
    expect(rel.consistencia?.tipo).toBe('sem-modelo')
    expect(rel.teoremas).toEqual([])
  })
})

describe('conjunto grande demais para o motor finito', () => {
  // "pesada" precisa de 3 objetos (a, b, d distintos) e passa do limite com 3; não tem nome em comum com L1 e L2
  const dicP = [...dic, ficha('H', 'predicado', 3), ficha('a', 'constante'), ficha('b', 'constante'), ficha('d', 'constante')]
  const pesada = g('pesada', 'a ≠ b', 'b ≠ d', 'a ≠ d', 'H(a, b, d)', '∀x ∀y ∀z ∀w (H(x, y, z) ∧ H(y, z, w) ⟹ H(x, z, w))')
  const leves = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)')]
  const opP = { ...op, limite: 300 }
  const respostas = (sem: number[], com: number[]) => () => ({ semModelo: new Set(sem), comModelo: new Set(com), nucleos: new Map<number, number[]>(), fim: Promise.resolve({}) })
  const rodarP = async (grupos: ReturnType<typeof g>[], teoremas: ReturnType<typeof t>[], ajudaZ3?: AjudaZ3) => {
    let ultimo: RelatorioCadeia[] = []
    await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas: [] }, dicP, opP, (r) => (ultimo = r), undefined, ajudaZ3)
    return ultimo[0]
  }

  it('separa as notas sem nome em comum com as outras: a rodada segue com o resto, e o Z3 confere o que ficou à parte', async () => {
    const rel = await rodarP([...leves, pesada], [t('T1', 'Q(c)'), t('T2', 'H(b, d, a)')], respostas([1], [0]))
    expect(rel.consistencia?.tipo).toBe('consistente')
    expect(rel.aParte).toMatchObject({ n: 3, notas: ['pesada'], teoremas: ['T2:0'], z3: 'consistente' })
    expect(rel.aParte!.pesos[0]).toMatchObject({ id: 'pesada' })
    expect(rel.teoremas.find((x) => x.id === 'T1:0')!.resultado).toMatchObject({ tipo: 'segue', notas: ['L1', 'L2'] })
    // o Z3 provou o que ficou de fora, para qualquer número de objetos
    expect(rel.teoremas.find((x) => x.id === 'T2:0')).toMatchObject({ z3: 'segue', resultado: { tipo: 'segue' } })
  })

  it('sem Z3, o que ficou à parte espera (e a tela pede para ligar o Z3)', async () => {
    const rel = await rodarP([...leves, pesada], [t('T1', 'Q(c)'), t('T2', 'H(b, d, a)')])
    expect(rel.aParte!.z3).toBe('desligado')
    expect(rel.teoremas.find((x) => x.id === 'T2:0')!.resultado.tipo).toBe('grande-demais')
    expect(rel.teoremas.find((x) => x.id === 'T1:0')!.resultado.tipo).toBe('segue')
  })

  it('tudo ligado: nada dá para separar; fica tudo para o Z3, que pode achar a contradição', async () => {
    const rel = await rodarP([pesada], [t('T2', 'H(b, d, a)')], respostas([0], []))
    expect(rel.consistencia).toMatchObject({ tipo: 'grande-demais', n: 3 })
    expect(rel.aParte).toMatchObject({ notas: ['pesada'], teoremas: ['T2:0'], z3: 'contraditorio' })
  })

  it('blocos: ∈ e os operadores modais ligam as notas; nomes diferentes, não', () => {
    const dicB = [...dicP, ficha('A', 'constante'), ficha('B', 'constante')]
    const pr = (id: string, f: string) => ({ g: g(id, f), itens: analisar([f], dicB) })
    const blocos = blocosIndependentes([pr('1', 'P(c)'), pr('2', 'Q(a)'), pr('3', 'c ∈ A'), pr('4', 'a ∈ B'), pr('5', 'R(b)')])
    expect(blocos.map((b) => b.map((x) => x.g.id))).toEqual([['1', '2', '3', '4'], ['5']])
  })
})

describe('memória dividida entre os núcleos', () => {
  it('cada trabalho em paralelo fica no teto do pool', () => {
    const t = { tipo: 'faixa' as const, formulas: [], ns: [1], ks: [1], limite: 2_000_000 }
    expect(comTeto(t, 500_000)).toMatchObject({ limite: 500_000 })
    expect(comTeto({ ...t, limite: 100 }, 500_000)).toMatchObject({ limite: 100 })
    const p = { tipo: 'perguntar' as const, grupos: [], formula: 'P(c)', dicionario: [], op }
    expect(comTeto(p, 1000)).toMatchObject({ op: { limite: 1000, N: 5 } })
    expect(comTeto(p)).toBe(p)
  })

  it('o teorema que não coube na parte de um núcleo é refeito sozinho, com o limite inteiro', async () => {
    // a rotação aplicada duas vezes: segue, mas a busca do contraexemplo passa de 300 com poucos objetos
    const dicR = [...dic, ficha('R', 'predicado', 3)]
    const grupos = [g('L1', '∀x ∀y ∀z (R(x, y, z) ⟹ R(y, z, x))')]
    const teoremas = [t('T1', '∀x ∀y ∀z (R(x, y, z) ⟹ R(z, x, y))')]
    definirPool(new PoolLocal(300))
    try {
      let ultimo: RelatorioCadeia[] = []
      await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas: [] }, dicR, op, (r) => (ultimo = r))
      expect(ultimo[0].teoremas[0].resultado).toMatchObject({ tipo: 'segue', N: 5 })
      // com o teto, o mesmo teorema não decide
      expect(perguntar(grupos, teoremas[0].formula, dicR, { ...op, limite: 300 }).tipo).toBe('grande-demais')
    } finally {
      semParalelo()
    }
  })
})

describe('prazo de cada checagem principal', () => {
  it('um teorema que não decide no prazo da rodada: a rodada termina, e ele continua com mais tempo até decidir', async () => {
    definirBanco(bancoNaMemoria())
    try {
      const grupos = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)')]
      // a consistência já está no banco de provas; o teorema teria de ser conferido de novo
      buscarModelo(
        grupos.flatMap((x) => analisar(x.formulas, dic).map((i) => i.expandida)),
        op,
      )
      const relatorios: RelatorioCadeia[][] = []
      // na rodada, o prazo de cada checagem já vencido; depois, um minuto para continuar
      const lim = { N: 5, K: 1, limite: 1_000_000, tempoChecagemMs: -1, orcamentoMs: 60_000 }
      await reacaoEmCadeia(
        { contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas: [t('T1', 'Q(c)'), t('T2', 'R(c)')] }], inativas: [], aprimorar: lim },
        dic,
        op,
        (r) => relatorios.push(r),
      )
      // a rodada fechou com T1 sem decisão, e ele foi continuado; T2 nem precisou de busca:
      // no cenário da consistência (R falso) as notas valem e ele falha — não segue
      const fimDaRodada = relatorios.find((r) => r[0].etapa === 'fim')![0]
      expect(fimDaRodada.consistencia?.tipo).toBe('consistente')
      expect(fimDaRodada.teoremas.map((x) => x.resultado.tipo)).toEqual(['tempo', 'nao-segue'])
      expect(relatorios.some((r) => r[0].continuando?.length === 1)).toBe(true)
      // no fim, cada um com a resposta certa
      const ultimo = relatorios.at(-1)![0]
      expect(ultimo.continuando).toBeUndefined()
      expect(ultimo.teoremas.find((x) => x.id === 'T1:0')!.resultado.tipo).toBe('segue')
      expect(ultimo.teoremas.find((x) => x.id === 'T2:0')!.resultado.tipo).toBe('nao-segue')
    } finally {
      definirBanco(null)
    }
  })

  it('modo de horas: o que ficou pendente continua com o tempo escolhido (mesmo sem aprimorar), e o Z3 recebe o prazo', async () => {
    definirBanco(bancoNaMemoria())
    try {
      const grupos = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)')]
      buscarModelo(
        grupos.flatMap((x) => analisar(x.formulas, dic).map((i) => i.expandida)),
        op,
      )
      const relatorios: RelatorioCadeia[][] = []
      const pedidosZ3: (number | undefined)[] = []
      // o aparelho não daria tempo nenhum (prazo vencido e sem aprimoramento); a paciência dá um minuto
      const limites = { N: 5, K: 1, limite: 1_000_000, tempoChecagemMs: -1, orcamentoMs: 0 }
      const inicio = Date.now()
      await reacaoEmCadeia(
        { contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas: [t('T1', 'Q(c)'), t('T2', 'R(c)')] }], inativas: [], limites, paciencia: 60_000 },
        dic,
        op,
        (r) => relatorios.push(r),
        undefined,
        (_conjuntos, ate) => (pedidosZ3.push(ate), { semModelo: new Set<number>(), comModelo: new Set<number>(), nucleos: new Map<number, number[]>(), fim: Promise.resolve({}) }),
      )
      const ultimo = relatorios.at(-1)![0]
      expect(ultimo.teoremas.find((x) => x.id === 'T1:0')!.resultado.tipo).toBe('segue')
      expect(ultimo.teoremas.find((x) => x.id === 'T2:0')!.resultado.tipo).toBe('nao-segue')
      // o Z3 foi chamado com o prazo do modo de horas (uns 60 s à frente)
      expect(pedidosZ3).toHaveLength(1)
      expect(pedidosZ3[0]! - inicio).toBeGreaterThan(50_000)
    } finally {
      definirBanco(null)
    }
  })

  it('sem tempo, a pergunta nunca responde "segue" nem "não segue"', () => {
    const grupos = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)')]
    expect(perguntar(grupos, 'Q(c)', dic, op).tipo).toBe('segue')
    expect(perguntar(grupos, 'Q(c)', dic, { ...op, prazo: Date.now() - 1 }).tipo).toBe('tempo')
  })
})

describe('prazos das etapas auxiliares', () => {
  it('cada etapa leva de 1 a 5 minutos (um quarto do orçamento), cada checagem até 30 s, e a memória do worker', () => {
    const celular = { N: 8, K: 3, limite: 500_000, tempoChecagemMs: 15_000, orcamentoMs: 2 * 60_000 }
    expect(prazosAuxiliares(celular, OPCOES_PADRAO)).toEqual({ totalMs: 60_000, checagemMs: 15_000, limite: 500_000 })
    const pc = { N: 18, K: 6, limite: 1_000_000, tempoChecagemMs: 5 * 60_000, orcamentoMs: 60 * 60_000 }
    expect(prazosAuxiliares(pc, { ...OPCOES_PADRAO, limite: 5_000_000 })).toEqual({ totalMs: 5 * 60_000, checagemMs: 30_000, limite: 1_000_000 })
  })
})

describe('aprimoramento automático', () => {
  const lim = { N: 6, K: 1, limite: 1_000_000, tempoChecagemMs: 20_000, orcamentoMs: 120_000 }
  const rodarAprimorando = async (grupos: ReturnType<typeof g>[], teoremas: ReturnType<typeof t>[], N: number) => {
    let ultimo: RelatorioCadeia[] = []
    await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas: [], aprimorar: lim }, dic, { ...op, N }, (r) => (ultimo = r))
    return ultimo[0]
  }

  it('aprofunda as conclusões até o limite quando todas continuam valendo', async () => {
    const rel = await rodarAprimorando([g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)')], [t('T1', 'Q(c)')], 3)
    expect(rel.teoremas[0].resultado.tipo).toBe('segue')
    expect(rel.N).toBe(6)
    expect(rel.aprimoramento).toMatchObject({ situacao: 'feito', de: { N: 3 } })
    expect(rel.aprimoramento!.virada).toBeUndefined()
  })

  it('acha a conclusão que cai num cenário maior', async () => {
    // "há no máximo 4 objetos": vale em todo cenário até 4, falha com 5
    const ate4 = '∀x ∀y ∀z ∀w ∀v (x = y ∨ x = z ∨ x = w ∨ x = v ∨ y = z ∨ y = w ∨ y = v ∨ z = w ∨ z = v ∨ w = v)'
    const rel = await rodarAprimorando([g('L1', 'P(c)')], [t('T1', ate4)], 4)
    expect(rel.teoremas[0].resultado.tipo).toBe('segue')
    expect(rel.aprimoramento!.virada).toMatchObject({ N: 5 })
    expect(rel.N).toBe(4)
  })

  it('uma consequência que cai num cenário maior só sai da lista (a rodada não é refeita)', async () => {
    // com 1 objeto, "existe algo com P" obriga P(c); com 2 já não
    const rel = await rodarAprimorando([g('L1', '∃x P(x)'), g('L2', 'Q(c)')], [], 1)
    expect(rel.aprimoramento!.virada).toBeUndefined()
    expect(rel.aprimoramento!.sairam!.some((x) => x.includes('P(c)'))).toBe(true)
    expect(rel.consequencias!.some((q) => q.formula === 'P(c)')).toBe(false)
    expect(rel.aprimoramento!.parouPor).not.toContain('Z3')
  })
})

describe('as notas de onde um teorema segue (o núcleo, não todas)', () => {
  it('com dezenas de notas sem relação, a lista sai só com as necessárias, e rápido', () => {
    const dicN = [...dic, ...Array.from({ length: 60 }, (_, i) => ficha(`X${i}`, 'predicado', 1)), ficha('d', 'constante')]
    const outras = Array.from({ length: 60 }, (_, i) => g(`O${i}`, `∀x (X${i}(x) ⟹ X${(i + 1) % 60}(x))`, `X${i}(d)`))
    const grupos = [...outras.slice(0, 30), g('L1', '∀x (P(x) ⟹ Q(x))'), ...outras.slice(30), g('L2', 'P(c)')]
    const ini = Date.now()
    const r = perguntar(grupos, 'Q(c)', dicN, { ...op, prazo: Date.now() + 60_000 })
    expect(r).toMatchObject({ tipo: 'segue', notas: ['L1', 'L2'] })
    expect(Date.now() - ini).toBeLessThan(20_000)
  }, 60_000)
})

describe('o conselheiro dentro da rodada: cenários conhecidos', () => {
  /** um cenário de 1 objeto (c) com os predicados verdadeiros dados */
  const cenario = (...verdadeiros: string[]): Modelo => ({
    n: 1,
    mundos: 1,
    constantes: [{ nome: 'c', valor: 0 }],
    funcoes: [],
    predicados: verdadeiros.map((nome) => ({ nome, aridade: 1, verdadeiros: [{ args: [0], w: 0 }] })),
    pertence: [],
    acessos: [],
  })
  const rodarComConselho = async (grupos: ReturnType<typeof g>[], teoremas: ReturnType<typeof t>[], mundos: Modelo[]) => {
    let ultimo: RelatorioCadeia[] = []
    await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas, conselho: { mundos, provas: [] } }], inativas: [] }, dic, op, (r) => (ultimo = r))
    return ultimo[0]
  }

  it('um cenário das notas em que o teorema falha e outro em que vale: decidido sem procurar', async () => {
    const rel = await rodarComConselho([g('L1', 'P(c)')], [t('T1', 'Q(c)')], [cenario('P'), cenario('P', 'Q')])
    expect(rel.teoremas[0].resultado.tipo).toBe('nao-segue')
    expect(rel.conselho?.porCenario).toBe(1)
  })

  it('um cenário em que as notas de agora NÃO valem nunca é usado (o teorema que segue continua seguindo)', async () => {
    // P(c) falso: não é cenário das notas; se fosse usado, "P(c)" pareceria não seguir
    const rel = await rodarComConselho([g('L1', '∀x (Q(x) ⟹ P(x))'), g('L2', 'Q(c)')], [t('T1', 'P(c)')], [cenario('Q'), cenario()])
    expect(rel.teoremas[0].resultado.tipo).toBe('segue')
    expect(rel.conselho?.porCenario).toBe(0)
  })

  it('o que um teorema acha serve aos seguintes da mesma rodada', async () => {
    semParalelo()
    const rel = await rodarComConselho([g('L1', 'P(c)')], [t('T1', 'Q(c)'), t('T2', '∃x Q(x)')], [])
    expect(rel.teoremas.map((x) => x.resultado.tipo)).toEqual(['nao-segue', 'nao-segue'])
    // T1 acha o cenário em que Q vale; com o da consistência (Q falso), T2 sai sem procurar
    expect(rel.conselho?.porCenario).toBe(1)
    // o cenário "a favor" não fica no relatório (só serve à rodada)
    expect(rel.teoremas.some((x) => 'aFavor' in x.resultado)).toBe(false)
  })
})

describe('o Z3 confere o "segue até N" do motor finito', () => {
  // "s nunca leva dois objetos ao mesmo lugar ⟹ todo objeto é alcançado": vale em todo cenário finito, falha nos naturais (s(x) = x + 1)
  const dicS = [...dic, ficha('s', 'funcao', 1)]
  const injetiva = g('L1', '∀x ∀y (s(x) = s(y) ⟹ x = y)')
  const sobrejetiva = t('T1', '∀y ∃x (s(x) = y)')
  const rodarZ3 = async (grupos: ReturnType<typeof g>[], teoremas: ReturnType<typeof t>[], ajudaZ3: AjudaZ3) => {
    let ultimo: RelatorioCadeia[] = []
    await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas: [] }, dicS, op, (r) => (ultimo = r), undefined, ajudaZ3)
    return ultimo[0]
  }
  const z3Responde = (sem: number[], com: number[], nucleos: [number, number[]][] = []): AjudaZ3 => () => ({
    semModelo: new Set(sem),
    comModelo: new Set(com),
    nucleos: new Map(nucleos),
    fim: Promise.resolve({}),
  })

  it('o motor finito diz "segue" (até N) — e sem o Z3 isso não vira "provado"', async () => {
    const rel = await rodarZ3([injetiva], [sobrejetiva], z3Responde([], []))
    const t1 = rel.teoremas[0]
    expect(t1.resultado.tipo).toBe('segue')
    expect(estadoEfetivo(t1)).toEqual({ tipo: 'segue', provado: false })
  })

  it('segundo modelo (z3Curto): o Z3 faz uma tentativa curta e não insiste minutos; sem isso, insiste até o prazo', async () => {
    const prazos = async (z3Curto: boolean) => {
      const vistos: (number | undefined)[] = []
      const ajudaZ3: AjudaZ3 = (_c, ate) => {
        vistos.push(ate)
        return { semModelo: new Set(), comModelo: new Set(), nucleos: new Map(), fim: Promise.resolve({}) }
      }
      await reacaoEmCadeia(
        { contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos: [injetiva], teoremas: [sobrejetiva] }], inativas: [], z3Curto },
        dicS,
        op,
        () => {},
        undefined,
        ajudaZ3,
      )
      return vistos
    }
    const curto = await prazos(true)
    expect(curto.length).toBeGreaterThan(0)
    expect(curto.every((p) => p === undefined)).toBe(true)
    expect((await prazos(false)).some((p) => p !== undefined)).toBe(true)
  })

  it('o Z3 acha o cenário infinito: deixa de "seguir"', async () => {
    const rel = await rodarZ3([injetiva], [sobrejetiva], z3Responde([], [0]))
    expect(rel.teoremas[0].z3).toBe('nao-segue')
    expect(estadoEfetivo(rel.teoremas[0]).tipo).toBe('nao-segue')
  })

  it('o Z3 prova: fica "provado", e as notas são as do núcleo da prova', async () => {
    const leis = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)'), g('L3', '∀x (R(x) ⟹ S(x))')]
    const rel = await rodarZ3(leis, [t('T1', 'Q(c)')], z3Responde([0], [], [[0, [0, 1]]]))
    expect(rel.teoremas[0]).toMatchObject({ z3: 'segue', resultado: { tipo: 'segue', notas: ['L1', 'L2'] } })
    expect(estadoEfetivo(rel.teoremas[0])).toEqual({ tipo: 'segue', provado: true })
  })

  it('as notas que o conselheiro sugere vão sozinhas ao Z3: provado com elas, o núcleo vale (e as outras nem entram)', async () => {
    const leis = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)'), g('L3', '∀x (R(x) ⟹ S(x))'), g('L4', '∃x S(x)')]
    const pedidos: number[] = []
    // 1º pedido (só as notas do motor finito): o Z3 acha cenário; 2º (as sugeridas): prova, com o núcleo L1 e L2
    const ajudaZ3: AjudaZ3 = (conjuntos) => {
      pedidos.push(conjuntos[0].length)
      const segundo = pedidos.length === 2
      return { semModelo: new Set(segundo ? [0] : []), comModelo: new Set(segundo ? [] : [0]), nucleos: new Map(segundo ? [[0, [0, 1]]] : []), fim: Promise.resolve({}) }
    }
    let ultimo: RelatorioCadeia[] = []
    const conselho = { mundos: [], provas: [{ simbolos: ['Q', 'c'], notas: ['L1', 'L2', 'L3'] }] }
    await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos: leis, teoremas: [t('T1', 'Q(c)')], conselho }], inativas: [] }, dicS, op, (r) => (ultimo = r), undefined, ajudaZ3)
    expect(ultimo[0].teoremas[0]).toMatchObject({ z3: 'segue', resultado: { tipo: 'segue', notas: ['L1', 'L2'] } })
    expect(ultimo[0].conselho?.provadosComSugeridas).toBe(1)
    // S (2 notas) + a negação; depois as 3 sugeridas + a negação; o pedido com todas as notas não foi preciso
    expect(pedidos).toEqual([3, 4])
  })

  it('o que não decidiu a tempo também vai para o Z3 (mesmo sem aprofundamento), e provado vira "segue" com o núcleo', async () => {
    definirBanco(bancoNaMemoria())
    try {
      const grupos = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', 'P(c)')]
      buscarModelo(grupos.flatMap((x) => analisar(x.formulas, dic).map((i) => i.expandida)), op)
      let ultimo: RelatorioCadeia[] = []
      const limites = { N: 5, K: 1, limite: 1_000_000, tempoChecagemMs: -1, orcamentoMs: 0 }
      await reacaoEmCadeia(
        { contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas: [t('T1', 'Q(c)')] }], inativas: [], limites },
        dicS,
        op,
        (r) => (ultimo = r),
        undefined,
        z3Responde([0], [], [[0, [0, 1]]]),
      )
      expect(ultimo[0].teoremas[0]).toMatchObject({ z3: 'segue', resultado: { tipo: 'segue', notas: ['L1', 'L2'] } })
    } finally {
      definirBanco(null)
    }
  })
})
