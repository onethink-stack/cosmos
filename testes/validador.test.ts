import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { expandir } from '../src/logica/acucar'
import { converterNoCursor, converterTudo } from '../src/logica/atalhos'
import { imprimir } from '../src/logica/impressao'
import { validar } from '../src/logica/validador'

const AXIOMAS: Record<string, string> = {
  Ax1: '∀i∈I (f(i) ⊆ A)',
  Ax2: '∀i∈I (f(i) ≠ A)',
  Ax3: '∃i∈I ∃j∈I (i ≠ j ∧ f(i) ≠ f(j))',
  Ax4: 'A ∉ A',
  Ax5: '∀x (x ∈ A ⟺ ∃i∈I (x ∈ f(i)))',
  Ax6: '∃x ∀i∈I (x ∈ f(i))',
  Ax7: '∀i∈I ∀j∈I (f(i) ∉ f(j))',
}

const dic = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({
  id: simbolo,
  termo: simbolo,
  simbolo,
  tipo,
  aridade,
  definicao: '',
})

const codigos = (texto: string, d: EntradaDicionario[] = []) => validar(texto, d).diags.map((x) => x.codigo)

describe('testes obrigatórios', () => {
  it('T3: "a ≠ a" → E9', () => {
    const r = validar('a ≠ a')
    expect(r.diags.map((d) => d.codigo)).toEqual(['E9'])
    expect(r.ok).toBe(false)
  })

  it('T4: A constante no dicionário; "∀A (A ∈ A)" → E4', () => {
    const r = validar('∀A (A ∈ A)', [dic('A', 'constante')])
    expect(r.diags.map((d) => d.codigo)).toContain('E4')
    expect(r.diags.find((d) => d.codigo === 'E4')!.pos).toBe(1)
  })

  it('T5: "¬A" → E2', () => {
    expect(codigos('¬A')).toEqual(['E2'])
  })

  it('T6: "P(x) Q(x)" → E3', () => {
    const r = validar('P(x) Q(x)')
    expect(r.diags.map((d) => d.codigo)).toEqual(['E3'])
    expect(r.diags[0].pos).toBe(5)
  })

  it('T7: "∃a ∀a P(a)" → E5 (aviso)', () => {
    const r = validar('∃a ∀a P(a)')
    expect(r.diags.map((d) => d.codigo)).toEqual(['E5'])
    expect(r.diags[0].nivel).toBe('aviso')
    expect(r.ok).toBe(true)
  })
})

describe('axiomas do usuário', () => {
  for (const [nome, texto] of Object.entries(AXIOMAS)) {
    it(`${nome} é válido sem diagnósticos`, () => {
      const r = validar(texto)
      expect(r.diags).toEqual([])
      expect(r.ast).not.toBeNull()
    })
  }

  it('expande Ax1 e Ax7 corretamente', () => {
    expect(imprimir(expandir(validar(AXIOMAS.Ax1).ast!))).toBe('∀i (i ∈ I ⟹ (∀z (z ∈ f(i) ⟹ z ∈ A)))')
    expect(imprimir(expandir(validar(AXIOMAS.Ax7).ast!))).toBe('∀i (i ∈ I ⟹ (∀j (j ∈ I ⟹ ¬(f(i) ∈ f(j)))))')
  })

  it('reimprime os axiomas como foram escritos', () => {
    expect(imprimir(validar(AXIOMAS.Ax3).ast!)).toBe(AXIOMAS.Ax3)
    expect(imprimir(validar(AXIOMAS.Ax4).ast!)).toBe(AXIOMAS.Ax4)
  })
})

describe('demais erros', () => {
  it('E1: operador sem operando', () => {
    expect(codigos('∧ P(x)')).toEqual(['E1'])
    expect(codigos('P(x) ∧')).toEqual(['E1'])
    expect(codigos('P(x) ∧ ∨ Q(x)')).toEqual(['E1'])
    expect(codigos('x ∈')).toEqual(['E1'])
    expect(codigos('∀x')).toEqual(['E1'])
    expect(codigos('¬')).toEqual(['E1'])
  })

  it('E2: termo usado como fórmula', () => {
    expect(codigos('P(x) ∧ A')).toEqual(['E2'])
    expect(validar('¬A').diags[0].msg).toMatch(/Negação/)
  })

  it('E6: variável usada fora do escopo', () => {
    const r = validar('(∀x P(x)) ∧ Q(x)')
    expect(r.diags.map((d) => d.codigo)).toEqual(['E6'])
    expect(r.diags[0].pos).toBe(14)
  })

  it('E7: parênteses desbalanceados', () => {
    expect(codigos('(P(x) ∧ Q(x)')).toEqual(['E7'])
    expect(codigos('P(x))')).toEqual(['E7'])
    expect(validar('((x ∈ A)').diags[0].pos).toBe(0)
  })

  it('E8: símbolo desconhecido', () => {
    const r = validar('P(x) # Q(x)')
    expect(r.diags.map((d) => d.codigo)).toEqual(['E8'])
    expect(r.diags[0].pos).toBe(5)
    expect(codigos('x \\foo A')).toEqual(['E8'])
  })

  it('E9 também com variáveis ligadas', () => {
    expect(codigos('∀x (x ≠ x)')).toEqual(['E9'])
    expect(codigos('f(a) ≠ f(a)')).toEqual(['E9'])
    expect(codigos('f(a) ≠ f(b)')).toEqual([])
  })

  it('E10: nome com usos incompatíveis', () => {
    expect(codigos('P(x) ∧ x ∈ P')).toEqual(['E10'])
    expect(codigos('f(x) = f(x, y)')).toEqual(['E10'])
    expect(codigos('∀f (f(x) = x)')).toEqual(['E10'])
  })

  it('E11: ⋂ fora de ∈/⊆', () => {
    expect(codigos('A ⋂ B = C')).toEqual(['E11'])
    expect(codigos('x ∈ A ⋂ B')).toEqual([])
    expect(codigos('(A ⋂ B) ⊆ C ⋃ D')).toEqual([])
  })
})

describe('sintaxe', () => {
  it('atalhos ASCII são aceitos diretamente', () => {
    // o ⟺ fica dentro do ∀x (o escopo passa do ")"): só o aviso E14
    expect(codigos('\\A x (x \\in A -> x \\notin B) <-> ~P & Q(x) | x != y', [dic('P', 'predicado', 0)])).toEqual(['E14'])
    // com o quantificador entre parênteses, o x de fora fica livre (E6)
    expect(codigos('(\\A x (x \\in A -> x \\notin B)) <-> ~P & Q(x) | x != y', [dic('P', 'predicado', 0)])).toEqual(['E6', 'E6'])
  })

  it('precedência ¬ > ∧ > ∨ > ⟹ > ⟺ e ⟹ à direita', () => {
    const p = (s: string) => imprimir(validar(s, [dic('P', 'predicado'), dic('Q', 'predicado'), dic('R', 'predicado'), dic('S', 'predicado')]).ast!)
    const ast = validar('P ∨ Q ∧ R ⟹ S ⟹ P ⟺ Q', ['P', 'Q', 'R', 'S'].map((n) => dic(n, 'predicado'))).ast!
    expect(ast.k).toBe('iff')
    expect(p('P ⟹ Q ⟹ R')).toBe('P ⟹ Q ⟹ R')
    expect(p('(P ⟹ Q) ⟹ R')).toBe('(P ⟹ Q) ⟹ R')
    expect(p('¬P ∧ Q')).toBe('¬P ∧ Q')
  })

  it('subscrito é aplicação de função', () => {
    const a = validar('∀i (fᵢ = f(i))')
    expect(a.diags).toEqual([])
    expect(validar('f_i ⊆ A').ast).toEqual(expect.objectContaining({ k: 'rel' }))
    expect(imprimir(validar('∃i (f_i ∈ A)').ast!)).toBe('∃i (fᵢ ∈ A)')
  })

  it('quantificador depois de conectivo se estende até o fim', () => {
    const r = validar('P(a) ∧ ∀x Q(x) ∨ R(x)')
    // a leitura é a de sempre; o E16 só avisa que o escopo vai até o fim
    expect(r.diags.map((d) => `${d.codigo}:${d.nivel}`)).toEqual(['E16:aviso'])
    expect(imprimir(r.ast!)).toBe('P(a) ∧ (∀x (Q(x) ∨ R(x)))')
  })

  it('aceita ∀x(...) sem espaço e parênteses de termo', () => {
    expect(codigos('∀x(x ∈ A)')).toEqual([])
    expect(codigos('(A ⋃ B) ⊆ C')).toEqual([])
    expect(codigos('¬(x ∈ A)')).toEqual([])
  })

  it('dica quando há espaço antes do parêntese', () => {
    expect(validar('P (x)').diags[0].msg).toMatch(/sem espaço/)
  })
})

describe('atalhos de teclado', () => {
  it('converte no cursor', () => {
    expect(converterNoCursor('P -', 3)).toBeNull()
    expect(converterNoCursor('P ->', 4)).toEqual({ texto: 'P ⟹', cursor: 3 })
    expect(converterNoCursor('P <->', 5)).toEqual({ texto: 'P ⟺', cursor: 3 })
    expect(converterNoCursor('\\A', 2)).toEqual({ texto: '∀', cursor: 1 })
    expect(converterNoCursor('x \\notin', 8)!.texto).toBe('x ∉')
    expect(converterNoCursor('f_i', 3)!.texto).toBe('fᵢ')
    expect(converterNoCursor('f_b', 3)).toBeNull()
  })

  it('converte um texto inteiro colado', () => {
    expect(converterTudo('\\A i \\in I (f_i \\sub A) & a != b -> ~P <-> \\E x (x \\in \\empty)')).toBe(
      '∀ i ∈ I (fᵢ ⊆ A) ∧ a ≠ b ⟹ ¬P ⟺ ∃ x (x ∈ ∅)',
    )
  })
})

describe('E14: escopo do quantificador passa do parêntese', () => {
  it('avisa quando o ")" parece fechar o quantificador mas o escopo continua', () => {
    const r = validar('∀x (¬∃y (y ≠ x ∧ P(x, y)) ⟹ P(x, x))')
    expect(r.diags.map((d) => d.codigo)).toEqual(['E14'])
    expect(r.diags[0].nivel).toBe('aviso')
    expect(validar('∃y (P(y)) ∧ Q(a)').diags.map((d) => d.codigo)).toEqual(['E14'])
  })
  it('não dá E14 quando o escopo termina no ")" ou não começa com "(" (aí quem avisa é o E16)', () => {
    expect(validar('∀x ((¬∃y (y ≠ x ∧ P(x, y))) ⟹ P(x, x))').diags).toEqual([])
    expect(validar('∀x (x ∈ A ⟺ ∃i∈I (x ∈ f(i)))').diags).toEqual([])
    expect(validar('∃i∈I ∃j∈I (i ≠ j ∧ f(i) ≠ f(j))').diags).toEqual([])
    expect(codigos('∃x P(x) ∧ Q(a)')).toEqual(['E16'])
  })
})
