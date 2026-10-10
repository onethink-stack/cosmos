import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { reacaoEmCadeia, type RelatorioCadeia } from '../src/motor/cadeia'
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

function rodar(grupos: ReturnType<typeof g>[], teoremas: ReturnType<typeof t>[], inativas: ReturnType<typeof g>[] = []) {
  let ultimo: RelatorioCadeia[] = []
  const etapas: string[] = []
  reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas }, dic, op, (r) => {
    ultimo = r
    etapas.push(r[0].etapa)
  })
  return { rel: ultimo[0], etapas }
}

describe('reação em cadeia', () => {
  const leis = [g('L1', '∀x (P(x) ⟹ Q(x))'), g('L2', '∀x (Q(x) ⟹ R(x))'), g('L3', 'P(c)'), g('L4', '∀x (P(x) ⟹ R(x))')]

  it('bate as leis umas com as outras: independentes e redundantes', () => {
    const { rel } = rodar(leis, [])
    expect(rel.consistencia?.tipo).toBe('consistente')
    const L4 = rel.leis.find((l) => l.id === 'L4')!
    expect(L4).toMatchObject({ tipo: 'decorre', notas: ['L1', 'L2'] })
    expect(rel.leis.find((l) => l.id === 'L3')!.tipo).toBe('independente')
  })

  it('monta a cadeia de teoremas, geração por geração', () => {
    const { rel, etapas } = rodar(leis.slice(0, 3), [t('T2', 'R(c)'), t('T1', 'Q(c)')])
    const T1 = rel.teoremas.find((x) => x.id === 'T1:0')!
    const T2 = rel.teoremas.find((x) => x.id === 'T2:0')!
    expect(T1).toMatchObject({ geracao: 1 })
    // R(c) sai de Q(c) (o teorema anterior) e L2
    expect(T2).toMatchObject({ geracao: 2, apoio: ['L2', 'T1:0'] })
    expect(etapas.at(-1)).toBe('fim')
  })

  it('sugere a lei que fecha vários teoremas de uma vez', () => {
    const { rel } = rodar([g('L1', 'P(c)')], [t('T1', 'S(c)'), t('T2', '∃x S(x)')], [g('desligada', '∀y (P(y) ⟹ S(y))')])
    expect(rel.teoremas.every((x) => x.resultado.tipo === 'nao-segue')).toBe(true)
    const s = rel.sugestoes[0]
    expect(s.lei.notaId).toBe('desligada')
    expect(s.fecha.sort()).toEqual(['T1:0', 'T2:0'])
  })

  it('acusa teoremas incompatíveis entre si', () => {
    const { rel } = rodar([g('L1', 'P(c)')], [t('T1', 'S(c)'), t('T2', '¬S(c)')])
    expect(rel.conflitoTeoremas?.sort()).toEqual(['T1:0', 'T2:0'])
  })

  it('para nas leis contraditórias', () => {
    const { rel } = rodar([g('L1', 'P(c)'), g('L2', '¬P(c)')], [t('T1', 'Q(c)')])
    expect(rel.consistencia?.tipo).toBe('sem-modelo')
    expect(rel.teoremas).toEqual([])
  })
})
