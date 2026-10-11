import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { corrigirNotasDasBibliotecas, parentesesNoEscopo } from '../src/dados/correcoes'
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
