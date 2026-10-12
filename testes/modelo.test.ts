import { describe, expect, it } from 'vitest'
import { mudancasParaOCaderno, notasDoModelo } from '../src/dados/modelo'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'
import { comOTptp, rodarModelo, type RelatorioModelo } from '../src/motor/modelo'
import { OPCOES_PADRAO } from '../src/motor/motor'

const op = { ...OPCOES_PADRAO, N: 4 }
const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({
  id: simbolo,
  simbolo,
  tipo,
  aridade,
  termo: simbolo,
  definicao: '',
})
const dic = ['P', 'Q', 'R', 'S'].map((p) => ficha(p, 'predicado', 1)).concat([ficha('a', 'constante'), ficha('b', 'constante')])

let relogio = 0
const nota = (id: string, compartimento: Nota['compartimento'], formulas: string[], extra: Partial<Nota> = {}): Nota => {
  const quando = new Date(Date.UTC(2026, 0, 1, 0, 0, relogio++)).toISOString()
  return {
    id,
    titulo: id,
    texto: '',
    formulas,
    tags: ['teste'],
    criadaEm: quando,
    atualizadaEm: quando,
    ativa: true,
    compartimento,
    grau: 'F',
    fonte: '',
    data: '',
    titular: '',
    ...extra,
  }
}

async function rodar(notas: Nota[]): Promise<{ final: RelatorioModelo; envios: number }> {
  let final: RelatorioModelo | null = null
  let envios = 0
  await rodarModelo({ notas, orcamentoMs: 60_000 }, dic, op, (r) => ((final = r), envios++), () => {})
  return { final: final!, envios }
}

const classe = (r: RelatorioModelo, id: string) => r.itens.find((i) => i.id === id)?.classe

describe('segundo modelo', () => {
  it('desativa a nota mais fraca de uma contradição e segue sozinho', async () => {
    const { final } = await rodar([
      nota('L1', 'lei', ['∀x (P(x) ⟹ Q(x))']),
      nota('L2', 'lei', ['P(a)']),
      nota('L3', 'lei', ['¬Q(a)'], { grau: 'M' }),
      nota('T1', 'teorema', ['Q(a)']),
    ])
    expect(final.situacao).toBe('pronto')
    expect(classe(final, 'L3')).toBe('desativada')
    expect(final.notas.find((n) => n.id === 'L3')!.ativa).toBe(false)
    expect(classe(final, 'T1:0')).toBe('provado')
    const ev = final.eventos.find((e) => e.tipo === 'desativou')!
    expect(ev.detalhe).toContain('grau M')
  })

  it('refuta o teorema que as leis contradizem', async () => {
    const { final } = await rodar([nota('L1', 'lei', ['P(a)']), nota('T1', 'teorema', ['¬P(a)'])])
    expect(classe(final, 'T1:0')).toBe('refutado')
    expect(final.eventos.some((e) => e.tipo === 'refutou')).toBe(true)
  })

  it('ativa a nota desativada que fecha teoremas, sem pedir aprovação', async () => {
    const { final } = await rodar([
      nota('L1', 'lei', ['P(a)']),
      nota('desligada', 'lei', ['∀y (P(y) ⟹ S(y))'], { ativa: false }),
      nota('T1', 'teorema', ['S(a)']),
      nota('T2', 'teorema', ['∃x S(x)']),
    ])
    expect(classe(final, 'desligada')).toBe('ativada')
    expect(classe(final, 'T1:0')).toBe('provado')
    expect(classe(final, 'T2:0')).toBe('provado')
    expect(final.eventos.filter((e) => e.tipo === 'provou').length).toBe(2)
    // levar para o caderno: ativar a nota
    const ms = mudancasParaOCaderno(final, [nota('desligada', 'lei', ['∀y (P(y) ⟹ S(y))'], { ativa: false })])
    expect(ms).toMatchObject([{ tipo: 'ativar' }])
  })

  it('não adota lei que refutaria outro teorema aberto: as teses em conflito ficam', async () => {
    const { final } = await rodar([nota('L1', 'lei', ['P(a)']), nota('T1', 'teorema', ['S(a)']), nota('T2', 'teorema', ['¬S(a)'])])
    expect(classe(final, 'T1:0')).toBe('conflito')
    expect(classe(final, 'T2:0')).toBe('conflito')
    expect(final.notas.filter((n) => n.id.startsWith('modelo-'))).toEqual([])
  })

  it('adota uma lei nova (grau D) e o grau passa para o que segue dela', async () => {
    const { final } = await rodar([nota('L1', 'lei', ['P(a)']), nota('T1', 'teorema', ['Q(a)'])])
    const adotada = final.itens.find((i) => i.classe === 'adotada')
    expect(adotada).toBeTruthy()
    const lei = final.notas.find((n) => n.id === adotada!.notaId)!
    expect(lei).toMatchObject({ grau: 'D', ativa: true, compartimento: 'lei' })
    expect(classe(final, 'T1:0')).toBe('provado')
    expect(final.itens.find((i) => i.id === 'T1:0')!.apoio).toContain(lei.id)
    const ms = mudancasParaOCaderno(final, [])
    expect(ms.some((m) => m.tipo === 'criar' && m.nota.id === lei.id)).toBe(true)
  })

  it('entre leis que fecham o mesmo, adota a mais fraca; o apoio fica com as notas mais fortes', async () => {
    const { final } = await rodar([
      nota('L1', 'lei', ['∀x (P(x) ⟹ Q(x))']),
      nota('L2', 'fato', ['P(a)']),
      nota('T1', 'teorema', ['Q(a)']),
      nota('T5', 'teorema', ['Q(b)']),
    ])
    const lei = final.notas.find((n) => n.id.startsWith('modelo-'))!
    // "tudo tem P" implica "tudo tem Q" (com L1): a mais fraca basta
    expect(lei.formulas).toEqual(['∀x Q(x)'])
    // Q(a) vem das notas estabelecidas, não da lei adotada
    expect(final.itens.find((i) => i.id === 'T1:0')!.apoio!.sort()).toEqual(['L1', 'L2'])
  })

  it('classifica as desativadas pelo usuário: cabem ou não cabem', async () => {
    const { final } = await rodar([
      nota('L1', 'lei', ['P(a)']),
      nota('cabe', 'lei', ['Q(b)'], { ativa: false }),
      nota('nao-cabe', 'lei', ['¬P(a)'], { ativa: false }),
    ])
    expect(classe(final, 'cabe')).toBe('compativel')
    expect(classe(final, 'nao-cabe')).toBe('incompativel')
  })
})

describe('problemas do TPTP no segundo modelo', () => {
  const doProblema = (sabe?: string) => ({ tags: ['tptp-problema-x', 'tptp', ...(sabe ? [`tptp-sabe-${sabe}`] : [])] })

  it('não inventa lei para fechar uma conjectura do TPTP, e diz o que se sabe dela', async () => {
    const { final } = await rodar([nota('L1', 'lei', ['P(a)'], doProblema()), nota('T1', 'teorema', ['Q(a)'], doProblema('nao-segue'))])
    expect(final.notas.filter((n) => n.id.startsWith('modelo-'))).toEqual([])
    const it = final.itens.find((i) => i.id === 'T1:0')!
    expect(it.classe).toBe('tese')
    expect(it.tptp).toEqual({ texto: 'o TPTP confirma: não segue', discorda: false })
  })

  it('teorema conhecido: confirma o que o motor provou, e avisa quando o motor discorda', async () => {
    const { final } = await rodar([
      nota('L1', 'lei', ['∀x (P(x) ⟹ Q(x))'], doProblema()),
      nota('L2', 'lei', ['P(a)'], doProblema()),
      nota('T1', 'teorema', ['Q(a)'], doProblema('segue')),
      // conjectura que o "TPTP" diz seguir, mas não segue destas leis: tradução ou motor errado
      nota('T2', 'teorema', ['R(a)'], doProblema('segue')),
    ])
    const t1 = final.itens.find((i) => i.id === 'T1:0')!
    expect(t1.classe).toBe('provado')
    expect(t1.tptp!.texto).toContain('o TPTP confirma')
    const t2 = final.itens.find((i) => i.id === 'T2:0')!
    expect(t2.classe).toBe('tese')
    expect(t2.tptp!.discorda).toBe(true)
  })

  it('o que o motor não decide e o TPTP provou passa a provado, se os axiomas do problema estão todos ativos', () => {
    const item = { id: 'T1:0', notaId: 'T1', chave: 'geral', titulo: 'T1', formula: 'Q(a)', classe: 'incerto' as const, explicacao: 'grande demais ou com erro' }
    const notas = [nota('L1', 'lei', ['P(a)'], doProblema()), nota('T1', 'teorema', ['Q(a)'], doProblema('segue'))]
    expect(comOTptp([item], notas)[0].classe).toBe('provado')
    // sem um axioma do problema, a prova dos provadores não vale mais
    const semAxioma = comOTptp([item], [{ ...notas[0], ativa: false }, notas[1]])[0]
    expect(semAxioma.classe).toBe('incerto')
    expect(semAxioma.tptp!.texto).toContain('sem o axioma desativado')
  })

  it('problema grande com axiomas escolhidos: cenário onde falha não é discordância, e o TPTP não vira prova', async () => {
    const escolhidos = (sabe: string) => ({ tags: [...doProblema(sabe).tags, 'tptp-axiomas-escolhidos'] })
    const { final } = await rodar([
      nota('L1', 'lei', ['∀x (P(x) ⟹ Q(x))'], doProblema()),
      nota('L2', 'lei', ['P(a)'], doProblema()),
      nota('T1', 'teorema', ['Q(a)'], escolhidos('segue')),
      // com todos os axiomas seguiria; com os escolhidos, não: falta um que ficou de fora
      nota('T2', 'teorema', ['R(a)'], escolhidos('segue')),
    ])
    expect(final.itens.find((i) => i.id === 'T1:0')!.tptp!.texto).toContain('o TPTP confirma')
    const t2 = final.itens.find((i) => i.id === 'T2:0')!
    expect(t2.classe).toBe('tese')
    expect(t2.tptp).toMatchObject({ discorda: false })
    expect(t2.tptp!.texto).toContain('falta algum que ficou de fora')
    // o que o motor não decide continua sem decisão: a prova dos provadores usou axiomas que não vieram
    const item = { id: 'T1:0', notaId: 'T1', chave: 'geral', titulo: 'T1', formula: 'Q(a)', classe: 'incerto' as const, explicacao: 'não decidiu' }
    const r = comOTptp([item], [nota('L1', 'lei', ['P(a)'], doProblema()), nota('T1', 'teorema', ['Q(a)'], escolhidos('segue'))])[0]
    expect(r.classe).toBe('incerto')
    expect(r.tptp!.texto).toContain('só os escolhidos')
  })

  it('problema com números: o cenário do motor finito (sem as leis com números) não é discordância', async () => {
    const comNumeros = { tags: [...doProblema('segue').tags, 'tptp-com-numeros'] }
    const { final } = await rodar([nota('L1', 'lei', ['P(a)'], doProblema()), nota('T1', 'teorema', ['Q(a)'], comNumeros)])
    const t1 = final.itens.find((i) => i.id === 'T1:0')!
    expect(t1.classe).toBe('tese')
    expect(t1.tptp).toMatchObject({ discorda: false })
    expect(t1.tptp!.texto).toContain('quem decide é o Z3')
  })

  it('ordem superior ou polimórfico traduzido: o cenário da tradução não é discordância, e o TPTP não vira prova', async () => {
    const aprox = { tags: [...doProblema('segue').tags, 'tptp-traducao-aproximada'] }
    const { final } = await rodar([nota('L1', 'lei', ['P(a)'], doProblema()), nota('T1', 'teorema', ['Q(a)'], aprox)])
    const t1 = final.itens.find((i) => i.id === 'T1:0')!
    expect(t1.tptp).toMatchObject({ discorda: false })
    expect(t1.tptp!.texto).toContain('pode não valer lá')
    const item = { id: 'T1:0', notaId: 'T1', chave: 'geral', titulo: 'T1', formula: 'Q(a)', classe: 'incerto' as const, explicacao: 'não decidiu' }
    expect(comOTptp([item], [nota('L1', 'lei', ['P(a)'], doProblema()), nota('T1', 'teorema', ['Q(a)'], aprox)])[0].classe).toBe('incerto')
  })
})

describe('segundo modelo com aprimoramento', () => {
  it('mostra a classificação provisória antes de terminar de aprofundar', async () => {
    const envios: RelatorioModelo[] = []
    const aprimorar = { N: 6, K: 1, limite: 1_000_000, tempoChecagemMs: 20_000, orcamentoMs: 60_000 }
    await rodarModelo(
      { notas: [nota('L1', 'lei', ['∀x (P(x) ⟹ Q(x))']), nota('L2', 'lei', ['P(a)']), nota('T1', 'teorema', ['Q(a)'])], aprimorar, orcamentoMs: 60_000 },
      dic,
      op,
      (r) => envios.push(r),
      () => {},
    )
    const provisoria = envios.find((r) => r.situacao === 'final' && r.itens.length)
    expect(provisoria?.itens.find((i) => i.id === 'T1:0')?.classe).toBe('provado')
    const final = envios.at(-1)!
    expect(final.situacao).toBe('pronto')
    expect(final.final![0].N).toBe(6)
  })
})

describe('pastas do segundo modelo', () => {
  it('entram só as notas das pastas escolhidas; os teoremas desativados também', async () => {
    const ns = [
      nota('A', 'lei', ['P(a)'], { tags: ['x'] }),
      nota('B', 'lei', ['Q(a)'], { tags: ['y'] }),
      nota('T', 'teorema', ['P(a)'], { tags: ['x'], ativa: false }),
    ]
    expect(notasDoModelo(ns, ['x']).map((n) => n.id)).toEqual(['A', 'T'])
    expect(notasDoModelo(ns, ['x']).find((n) => n.id === 'T')!.ativa).toBe(true)
    expect(notasDoModelo(ns, []).length).toBe(3)
  })
})
