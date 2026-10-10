import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { validar } from '../src/logica/validador'
import { canonica, procurarLeis } from '../src/motor/lacunas'
import { OPCOES_PADRAO, perguntar } from '../src/motor/motor'

const op = { ...OPCOES_PADRAO, N: 5 }
const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({
  id: simbolo,
  simbolo,
  tipo,
  aridade,
  termo: simbolo,
  definicao: '',
})
const g = (id: string, ...formulas: string[]) => ({ id, rotulo: id, formulas })

describe('procurar a lei que falta', () => {
  const dic = [ficha('a', 'constante'), ficha('b', 'constante'), ficha('c', 'constante'), ficha('P', 'predicado', 1), ficha('Q', 'predicado', 1)]

  it('mesmos elementos não bastam para a = b: sugere a extensionalidade', () => {
    const leis = [g('L1', '∀x (x ∈ a ⟺ x ∈ b)')]
    const r = procurarLeis(leis, [], 'a = b', dic, op)
    expect(r.tipo).toBe('sugestoes')
    if (r.tipo !== 'sugestoes') return
    const ext = r.itens.find((s) => s.nome === 'Extensionalidade')!
    expect(ext).toBeTruthy()
    expect(ext.notas).toEqual(['L1'])
    expect(ext.porque.valor).toBe(false)
    // a sugestão de fato fecha o teorema
    expect(perguntar([...leis, g('nova', ext.formula)], 'a = b', dic, op).tipo).toBe('segue')
  })

  it('ponte entre predicados, e a nota desativada vem primeiro', () => {
    const leis = [g('L1', 'P(c)')]
    const r = procurarLeis(leis, [g('desligada', '∀y (P(y) ⟹ Q(y))')], 'Q(c)', dic, op)
    if (r.tipo !== 'sugestoes') throw new Error(r.tipo)
    expect(r.itens[0]).toMatchObject({ notaId: 'desligada', notas: ['L1'], equivalente: false })
    // a lei geral igual à nota (só muda a variável) não aparece repetida
    expect(r.itens.filter((s) => s.nome === 'P implica Q')).toHaveLength(0)
  })

  it('nunca sugere lei que contradiz as leis e fatos', () => {
    const leis = [g('L1', '∀x ¬Q(x) ∨ P(c)'), g('L2', '¬P(c)')]
    const r = procurarLeis(leis, [], '∃x Q(x)', dic, op)
    expect(r.tipo).toBe('contradiz')
  })

  it('teorema que já segue', () => {
    expect(procurarLeis([g('L1', 'P(c)')], [], '∃x P(x)', dic, op).tipo).toBe('ja-segue')
  })

  it('marca a lei que equivale ao próprio teorema', () => {
    const r = procurarLeis([g('L1', 'P(c)')], [g('mesma', 'Q(c)')], 'Q(c)', dic, op)
    if (r.tipo !== 'sugestoes') throw new Error(r.tipo)
    expect(r.itens.find((s) => s.notaId === 'mesma')?.equivalente).toBe(true)
    expect(r.itens.at(-1)!.equivalente).toBe(true)
  })

  it('forma canônica ignora o nome das variáveis ligadas', () => {
    const f = (t: string) => canonica(validar(t, dic).ast!)
    expect(f('∀x (P(x) ⟹ Q(x))')).toBe(f('∀y (P(y) ⟹ Q(y))'))
    expect(f('∀x P(x)')).not.toBe(f('∃x P(x)'))
  })
})

describe('variáveis das leis candidatas', () => {
  it('não usam nomes do dicionário (x como constante não some com as candidatas)', () => {
    const dic = [
      { id: 'x', simbolo: 'x', tipo: 'constante' as const, aridade: 0, termo: 'x', definicao: '', numerico: true },
      { id: 'P', simbolo: 'P', tipo: 'predicado' as const, aridade: 1, termo: 'P', definicao: '' },
      { id: 'Q', simbolo: 'Q', tipo: 'predicado' as const, aridade: 1, termo: 'Q', definicao: '' },
      { id: 'a', simbolo: 'a', tipo: 'constante' as const, aridade: 0, termo: 'a', definicao: '' },
      { id: 'b', simbolo: 'b', tipo: 'constante' as const, aridade: 0, termo: 'b', definicao: '' },
    ]
    const r = procurarLeis([{ id: 'L1', rotulo: 'L1', formulas: ['∀z (P(z) ⟹ Q(z))', 'P(a)'] }], [], 'Q(b)', dic, { ...OPCOES_PADRAO, N: 4 })
    if (r.tipo !== 'sugestoes') throw new Error(r.tipo)
    expect(r.itens.map((s) => s.nome)).toContain('Tudo tem P')
    expect(r.itens.every((s) => !/∀x|∃x/.test(s.formula))).toBe(true)
  })
})
