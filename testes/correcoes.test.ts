import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { corrigirConclusoes, corrigirNotasDasBibliotecas, parentesesNoEscopo } from '../src/dados/correcoes'
import { salvarDeduzida } from '../src/dados/deduzida'
import { estado, notaVazia } from '../src/dados/estado'
import { validar } from '../src/logica/validador'

const E14 = (f: string) => validar(f).diags.some((d) => d.codigo === 'E14')

describe('parênteses no escopo do quantificador', () => {
  it('conserta as duas fórmulas antigas da biblioteca de teorias', () => {
    expect(parentesesNoEscopo('∀x ∀y (∃z (Equiv(x, z) ∧ Equiv(y, z)) ⟹ Equiv(x, y))')).toBe('∀x ∀y ((∃z (Equiv(x, z) ∧ Equiv(y, z))) ⟹ Equiv(x, y))')
    expect(parentesesNoEscopo('∀e (∀x (op(e, x) = x) ⟹ e = neutro)')).toBe('∀e ((∀x (op(e, x) = x)) ⟹ e = neutro)')
  })

  it('conserta o que o tradutor do TPTP escrevia (o p1 do COM003+1)', () => {
    const antes =
      '(∃x ((algorithm(x) ∧ ∀y ((program(y) ⟹ ∀z (decides(x, y, z)))))) ⟹ ∃w ((program(w) ∧ ∀y ((program(y) ⟹ ∀z (decides(w, y, z)))))))'
    expect(E14(antes)).toBe(true)
    const depois = parentesesNoEscopo(antes)
    expect(depois).toBe(
      '((∃x ((algorithm(x) ∧ ∀y ((program(y) ⟹ ∀z (decides(x, y, z))))))) ⟹ ∃w ((program(w) ∧ ∀y ((program(y) ⟹ ∀z (decides(w, y, z)))))))',
    )
    expect(E14(depois)).toBe(false)
  })

  it('não mexe no que já está certo', () => {
    for (const f of ['∀x (P(x) ⟹ Q(x))', '((∃x (P(x))) ⟹ Q(c))', '∀x ∀y (R(x, y) ⟹ ∃z (R(y, z)))', '¬(∃x (P(x)))'])
      expect(parentesesNoEscopo(f)).toBe(f)
  })
})

describe('correção das notas antigas ao abrir o app', () => {
  it('conserta as notas das bibliotecas e deixa as do usuário como estão', async () => {
    await estado.carregar()
    const antiga = '∀x ∀y (∃z (Equiv(x, z) ∧ Equiv(y, z)) ⟹ Equiv(x, y))'
    await estado.salvarNota({ ...notaVazia('lei'), id: 'da-teoria', formulas: [antiga], tags: ['teoria-equivalencia', 'teoria'] })
    await estado.salvarNota({ ...notaVazia('lei'), id: 'do-usuario', formulas: [antiga], tags: ['minhas'] })
    expect(await corrigirNotasDasBibliotecas()).toBe(1)
    expect(estado.nota('da-teoria')!.formulas[0]).toBe('∀x ∀y ((∃z (Equiv(x, z) ∧ Equiv(y, z))) ⟹ Equiv(x, y))')
    expect(estado.nota('do-usuario')!.formulas[0]).toBe(antiga)
    // de novo: nada mais a consertar
    expect(await corrigirNotasDasBibliotecas()).toBe(0)
  })
})

describe('conclusões antigas: vazamento de visão, "segue até N" como lei, cópias', () => {
  it('conserta só o que o app criou: deduzida vira teorema, cópias saem, lei vinda de visão é desativada, título sem "— desativada"', async () => {
    await estado.carregar()
    for (const n of [...estado.notas]) await estado.apagarNota(n.id)
    const dia = (d: number) => `2026-10-0${d}T00:00:00.000Z`
    // o P3 de Spinoza (teorema da visão) e a mesma fórmula como lei geral, aprovada como sugestão
    await estado.salvarNota({ ...notaVazia('teorema'), id: 'P3', titulo: 'Spinoza P3', titular: 'Spinoza', formulas: ['∀x ∀y (Causa(x, y) ⟹ Comum(x, y))'] })
    await estado.salvarNota({ ...notaVazia('lei'), id: 'vazou', titulo: 'Causa implica Comum', formulas: ['∀x ∀y (Causa(x, y) ⟹ Comum(x, y))'], tags: ['sugerida'] })
    // a mesma lei, escrita pelo usuário: não mexe
    await estado.salvarNota({ ...notaVazia('lei'), id: 'minha', titulo: 'Minha lei', formulas: ['∀x ∀y (Causa(x, y) ⟹ Comum(x, y))'] })
    // 5 cópias da mesma deduzida, conferida só até 8 objetos, salvas como lei
    for (let i = 1; i <= 5; i++)
      await estado.salvarNota({
        ...notaVazia('lei'),
        id: `ded${i}`,
        titulo: 'Deduzida: A ≠ K',
        formulas: [i % 2 ? 'A ≠ K' : '¬(A = K)'],
        tags: ['deduzida'],
        criadaEm: dia(i),
        texto: 'Deduzida em 01/10/2026 a partir de: Def K. Verdadeira em todos os cenários com até 8 objetos em que essas notas valem.',
      })
    await estado.salvarNota({ ...notaVazia('lei'), id: 'ext', titulo: 'Extensionalidade (sugestão da conferência — desativada)', formulas: ['∀x (x = x)'] })

    const r = await corrigirConclusoes()
    expect(r).toEqual({ viraramTeorema: 5, copiasApagadas: 4, vindasDeVisao: 1, titulos: 1 })
    // a mais antiga fica, como teorema; as outras quatro saíram
    expect(estado.nota('ded1')).toMatchObject({ compartimento: 'teorema' })
    expect(['ded2', 'ded3', 'ded4', 'ded5'].map((id) => estado.nota(id))).toEqual([undefined, undefined, undefined, undefined])
    expect(estado.nota('ded1')!.texto).toContain('4 cópias iguais foram apagadas')
    // a lei que vinha da visão de Spinoza ficou desativada, com o motivo; a do usuário, igual
    expect(estado.nota('vazou')).toMatchObject({ ativa: false })
    expect(estado.nota('vazou')!.texto).toContain('da visão de Spinoza')
    expect(estado.nota('minha')).toMatchObject({ ativa: true, compartimento: 'lei' })
    expect(estado.nota('ext')!.titulo).toBe('Extensionalidade (sugestão da conferência)')
    // de novo: não há mais nada a consertar
    expect(await corrigirConclusoes()).toEqual({ viraramTeorema: 0, copiasApagadas: 0, vindasDeVisao: 0, titulos: 0 })
  })

  it('salvar uma conclusão: conferida só até N vira teorema (não premissa); provada vira lei; de novo, não duplica', async () => {
    await estado.carregar()
    for (const n of [...estado.notas]) await estado.apagarNota(n.id)
    const ate = await salvarDeduzida('A ≠ K', 'geral', [], 8)
    expect(ate).toMatchObject({ compartimento: 'teorema' })
    expect(ate.texto).toContain('não entra como premissa')
    expect((await salvarDeduzida('¬(A = K)', 'geral', [], 8)).id).toBe(ate.id)
    const provada = await salvarDeduzida('A ∉ K', 'geral', [], 8, true)
    expect(provada).toMatchObject({ compartimento: 'lei' })
    // numa visão, provada vira crença do mesmo titular
    expect(await salvarDeduzida('A ∉ A', 'visao:Spinoza', [], 8, true)).toMatchObject({ compartimento: 'visao', titular: 'Spinoza' })
    expect(estado.notas.length).toBe(3)
  })
})
