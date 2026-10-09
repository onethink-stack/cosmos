import { describe, expect, it } from 'vitest'
import { inserirTexto, processarEntrada } from '../src/ui/edicao'

describe('edição do campo de fórmula', () => {
  it('insere símbolo com espaços só quando faltam', () => {
    expect(inserirTexto('P(x)', 4, 4, ' ∧ ')).toEqual({ texto: 'P(x) ∧ ', cursor: 7 })
    expect(inserirTexto('P(x) ', 5, 5, ' ∧ ')).toEqual({ texto: 'P(x) ∧ ', cursor: 7 })
    expect(inserirTexto('P(x)  Q(x)', 5, 5, ' ∧ ')).toEqual({ texto: 'P(x) ∧ Q(x)', cursor: 6 })
    expect(inserirTexto('', 0, 0, '∀')).toEqual({ texto: '∀', cursor: 1 })
    expect(inserirTexto('(', 1, 1, ' ⟹ ')).toEqual({ texto: '(⟹ ', cursor: 3 })
  })

  it('substitui a seleção', () => {
    expect(inserirTexto('a & b', 2, 3, ' ∧ ')).toEqual({ texto: 'a ∧ b', cursor: 3 })
  })

  it('converte atalho ao digitar, não ao apagar nem durante composição', () => {
    expect(processarEntrada('P ->', 4, 'insertText', false)).toEqual({ texto: 'P ⟹', cursor: 3 })
    expect(processarEntrada('P ->', 4, 'insertText', true)).toBeNull()
    expect(processarEntrada('P ->', 4, 'deleteContentBackward', false)).toBeNull()
    expect(processarEntrada('x \\in', 5, 'insertCompositionText', false)).toEqual({ texto: 'x ∈', cursor: 3 })
  })

  it('ao colar converte tudo, tira quebras de linha e mantém o cursor', () => {
    expect(processarEntrada('a -> b\nc', 6, 'insertFromPaste', false)).toEqual({ texto: 'a ⟹ b c', cursor: 5 })
  })
})

describe('inserção de vários caracteres de uma vez (teclado do celular)', () => {
  it('converte todos os atalhos antes do cursor', () => {
    expect(processarEntrada('\\E i (f_i = A)', 14, 'insertText', false)).toEqual({ texto: '∃ i (fᵢ = A)', cursor: 12 })
    expect(processarEntrada('x \\in A -> y', 12, 'insertText', false)).toEqual({ texto: 'x ∈ A ⟹ y', cursor: 9 })
  })
  it('não mexe no texto depois do cursor ao digitar', () => {
    expect(processarEntrada('a & b', 3, 'insertText', false)).toEqual({ texto: 'a ∧ b', cursor: 3 })
  })
})
