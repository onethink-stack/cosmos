import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { lerEmPortugues } from '../src/logica/leitura'
import { traduzirPortugues } from '../src/logica/portugues'
import { validar } from '../src/logica/validador'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0, termo = simbolo): EntradaDicionario => ({
  id: simbolo,
  termo,
  simbolo,
  tipo,
  aridade,
  definicao: '',
})
const dic = [
  ficha('Socrates', 'constante', 0, 'Sócrates'),
  ficha('Platao', 'constante', 0, 'Platão'),
  ficha('Homem', 'predicado', 1, 'homem'),
  ficha('Mortal', 'predicado', 1, 'mortal'),
  ficha('Sabio', 'predicado', 1, 'sábio'),
  ficha('Deus', 'predicado', 1, 'deus'),
  ficha('Ama', 'predicado', 2, 'amar'),
  ficha('Pai', 'funcao', 1, 'pai'),
  ficha('Chove', 'predicado', 0, 'chove'),
  ficha('Molha', 'predicado', 0, 'molha'),
  ficha('A', 'constante', 0, 'conjunto A'),
  ficha('K', 'constante', 0, 'conjunto K'),
]

const formula = (texto: string) => {
  const r = traduzirPortugues(texto, dic)
  if (!r.ok) throw new Error(r.erro)
  return r.formula
}

describe('tradutor de português simples', () => {
  it('frases simples, com plural, gênero e sem acento', () => {
    expect(formula('Sócrates é mortal?')).toBe('Mortal(Socrates)')
    expect(formula('socrates e mortal')).toBe('Mortal(Socrates)')
    expect(formula('Sócrates não é um deus?')).toBe('¬Deus(Socrates)')
    expect(formula('Todo homem é mortal?')).toBe('∀x (Homem(x) ⟹ Mortal(x))')
    expect(formula('Todos os homens são mortais?')).toBe('∀x (Homem(x) ⟹ Mortal(x))')
    expect(formula('Algum homem é sábio?')).toBe('∃x (Homem(x) ∧ Sabio(x))')
    expect(formula('Nenhum deus é mortal?')).toBe('∀x (Deus(x) ⟹ ¬Mortal(x))')
    expect(formula('Existe algum deus?')).toBe('∃x Deus(x)')
    expect(formula('Não existe deus?')).toBe('¬(∃x Deus(x))')
  })

  it('relações, funções, conjuntos e conectivos', () => {
    expect(formula('Sócrates ama Platão?')).toBe('Ama(Socrates, Platao)')
    expect(formula('Todo homem ama algum deus')).toBe('∀x (Homem(x) ⟹ (∃y (Deus(y) ∧ Ama(x, y))))')
    expect(formula('Sócrates é o pai de Platão?')).toBe('Socrates = Pai(Platao)')
    expect(formula('Sócrates é diferente de Platão')).toBe('Socrates ≠ Platao')
    expect(formula('A está contido em K?')).toBe('A ⊆ K')
    expect(formula('O vazio está contido em tudo?')).toBe('∀x (∅ ⊆ x)')
    expect(formula('Se chove, então molha')).toBe('Chove ⟹ Molha')
    expect(formula('Sócrates é homem e Platão é sábio')).toBe('Homem(Socrates) ∧ Sabio(Platao)')
    expect(formula('É verdade que Sócrates é mortal ou Platão é mortal?')).toBe('Mortal(Socrates) ∨ Mortal(Platao)')
    expect(formula('Não é verdade que Sócrates é sábio')).toBe('¬Sabio(Socrates)')
    expect(formula('Todo homem que ama Platão é sábio?')).toBe('∀x (Homem(x) ∧ Ama(x, Platao) ⟹ Sabio(x))')
  })

  it('uma fórmula escrita direto passa como está', () => {
    expect(formula('∀x (Homem(x) ⟹ Mortal(x))')).toBe('∀x (Homem(x) ⟹ Mortal(x))')
  })

  it('perguntas de "quem" deixam uma variável livre', () => {
    const r = traduzirPortugues('Quem é mortal?', dic)
    expect(r).toEqual({ ok: true, tipo: 'quem', formula: 'Mortal(x)', variavel: 'x' })
    const q = traduzirPortugues('Quais homens são sábios?', dic)
    expect(q).toMatchObject({ ok: true, tipo: 'quem', formula: 'Homem(x) ∧ Sabio(x)' })
  })

  it('o que não conhece, diz quais palavras faltam', () => {
    const r = traduzirPortugues('Sócrates é filósofo?', dic)
    expect(r).toMatchObject({ ok: false, desconhecidas: ['filósofo'] })
  })

  it('toda fórmula montada é válida', () => {
    for (const t of ['Todo homem ama algum deus', 'Nenhum homem que ama Platão é deus', 'Se Sócrates é homem, Sócrates é mortal']) {
      const f = formula(t)
      expect(validar(f, dic, { exigirFichas: true }).ok, f).toBe(true)
    }
  })
})

describe('leitura em português', () => {
  const ler = (f: string) => lerEmPortugues(validar(f, dic).ast!, dic)
  it('lê com os nomes do dicionário', () => {
    expect(ler('∀x (Homem(x) ⟹ Mortal(x))')).toBe('todo homem é mortal')
    expect(ler('∀x (Deus(x) ⟹ ¬Mortal(x))')).toBe('nenhum deus é mortal')
    expect(ler('∃x (Homem(x) ∧ Sabio(x))')).toBe('algum homem é sábio')
    expect(ler('¬Mortal(Socrates)')).toBe('Sócrates não é mortal')
    expect(ler('Chove ⟹ Molha')).toBe('se chove, então molha')
    expect(ler('Socrates = Pai(Platao)')).toBe('Sócrates é igual a pai de Platão')
    expect(ler('∀x (∅ ⊆ x)')).toBe('para todo x, o vazio está contido em x')
    expect(ler('Ama(Socrates, Platao)')).toBe('“amar” vale para Sócrates, Platão')
  })
})
