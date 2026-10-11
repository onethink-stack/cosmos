import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { prazosAuxiliares, reacaoEmCadeia, type RelatorioCadeia } from '../src/motor/cadeia'
import { OPCOES_PADRAO } from '../src/motor/motor'

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
