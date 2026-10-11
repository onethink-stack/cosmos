import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { criarBackup, lerBackup } from '../src/dados/backup'
import { notaVazia } from '../src/dados/estado'
import { achadosDaCadeia, historico } from '../src/dados/historico'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'
import { reacaoEmCadeia, type RelatorioCadeia } from '../src/motor/cadeia'
import { OPCOES_PADRAO } from '../src/motor/motor'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({ id: simbolo, simbolo, tipo, aridade, termo: simbolo, definicao: '' })
const dic = ['P', 'Q', 'R'].map((p) => ficha(p, 'predicado', 1)).concat([ficha('c', 'constante')])
const nota = (id: string, compartimento: Nota['compartimento'], formula: string): Nota => ({ ...notaVazia(compartimento), id, titulo: id, formulas: [formula] })

async function rodada(notas: Nota[]): Promise<RelatorioCadeia[]> {
  const grupos = notas.filter((n) => n.compartimento !== 'teorema').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
  const teoremas = notas.filter((n) => n.compartimento === 'teorema').map((n) => ({ id: `${n.id}:0`, notaId: n.id, rotulo: n.titulo, formula: n.formulas[0] }))
  let rs: RelatorioCadeia[] = []
  await reacaoEmCadeia({ contextos: [{ chave: 'geral', rotulo: 'Leis e fatos', grupos, teoremas }], inativas: [] }, dic, { ...OPCOES_PADRAO, N: 4 }, (r) => (rs = r))
  return rs
}

describe('histórico do que a reação em cadeia concluiu', () => {
  const notas = [nota('regra', 'lei', '∀x (P(x) ⟹ Q(x))'), nota('fato', 'fato', 'P(c)'), nota('T1', 'teorema', 'Q(c)'), nota('T2', 'teorema', 'R(c)')]

  it('guarda teoremas e descobertas, com as notas de origem; a mesma rodada não conta duas vezes', async () => {
    await historico.apagarTudo()
    const achados = achadosDaCadeia(await rodada(notas), notas)
    historico.registrar(achados, 'rodada-1')
    historico.registrar(achados, 'rodada-1')
    const t1 = historico.achados.find((a) => a.formula === 'Q(c)' && a.tipo === 'teorema')!
    expect(t1).toMatchObject({ resultado: 'segue', titulo: 'T1', vezes: 1, origem: 'cadeia', contexto: 'Leis e fatos' })
    expect(t1.notas.map((n) => n.titulo).sort()).toEqual(['fato', 'regra'])
    expect(historico.achados.find((a) => a.formula === 'R(c)')!.resultado).toBe('nao-segue')
    // outra rodada que chega ao mesmo resultado só conta mais uma vez
    historico.registrar(achados, 'rodada-2')
    expect(historico.achados.find((a) => a.chave === t1.chave)!.vezes).toBe(2)
  })

  it('se o resultado muda, entra um achado novo (a evolução fica)', async () => {
    const depois = [...notas, nota('lei-r', 'lei', '∀x (Q(x) ⟹ R(x))')]
    historico.registrar(achadosDaCadeia(await rodada(depois), depois), 'rodada-3')
    const r = historico.achados.filter((a) => a.formula === 'R(c)' && a.tipo === 'teorema').map((a) => a.resultado)
    expect(r.sort()).toEqual(['nao-segue', 'segue'])
  })

  it('fica guardado no aparelho: volta depois de recarregar', async () => {
    const antes = historico.achados.length
    await new Promise((ok) => setTimeout(ok, 50))
    historico.achados = []
    await historico.carregar()
    expect(historico.achados.length).toBe(antes)
  })

  it('vai junto no backup e volta', () => {
    const b = criarBackup([], [], 6, new Date(), historico.achados)
    const r = lerBackup(JSON.stringify({ ...b, historico: [...b.historico!, { lixo: true }] }))
    if (!r.ok) throw new Error(r.erro)
    expect(r.backup.historico!.length).toBe(historico.achados.length)
    expect(r.avisos.some((a) => a.includes('histórico'))).toBe(true)
  })
})
