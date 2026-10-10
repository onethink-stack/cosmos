import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { analisar, buscarModelo, OPCOES_PADRAO, perguntar, verificar } from '../src/motor/motor'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({
  id: simbolo,
  simbolo,
  tipo,
  aridade,
  termo: simbolo,
  definicao: '',
})
const dic = [ficha('P', 'predicado', 1), ficha('Q', 'predicado', 1), ficha('R', 'predicado', 2), ficha('a', 'constante'), ficha('f', 'funcao', 1)]
const op = { ...OPCOES_PADRAO, N: 5 }
const fs = (...t: string[]) => analisar(t, dic).map((x) => x.expandida)

// Um "existe" afirmado no topo vira uma constante nova (só dentro do motor):
// as respostas têm de ser as mesmas de antes.
describe('existe no topo vira constante', () => {
  it('existe contra para-todo', () => {
    expect(buscarModelo(fs('∃x P(x)', '∀y ¬P(y)'), op).status).toBe('sem-modelo')
    expect(buscarModelo(fs('¬∀x P(x)', '∀y P(y)'), op).status).toBe('sem-modelo')
    expect(buscarModelo(fs('¬(∀x P(x) ∨ ∀x Q(x))', '∀y (P(y) ∧ Q(y))'), op).status).toBe('sem-modelo')
    expect(buscarModelo(fs('¬(∃x P(x) ⟹ ∃x Q(x))', '∀y (P(y) ⟹ Q(y))'), op).status).toBe('sem-modelo')
  })

  it('vários "existe" encadeados e conjunções', () => {
    expect(buscarModelo(fs('∃x ∃y (R(x, y) ∧ x ≠ y)'), op).status).toBe('modelo')
    expect(buscarModelo(fs('∃x ∃y (R(x, y) ∧ x ≠ y)', '∀u ∀v (R(u, v) ⟹ u = v)'), op).status).toBe('sem-modelo')
    // precisa de 3 objetos diferentes
    const r = buscarModelo(fs('∃x ∃y ∃z (x ≠ y ∧ y ≠ z ∧ x ≠ z)'), op)
    expect(r.status === 'modelo' && r.n).toBe(3)
  })

  it('existe dentro de para-todo continua igual (não vira constante)', () => {
    expect(buscarModelo(fs('∀x ∃y R(x, y)', '∀x ¬R(x, x)'), op).status).toBe('modelo')
    expect(buscarModelo(fs('∀x ∃y R(x, y)', '∀x ∀y ¬R(x, y)'), op).status).toBe('sem-modelo')
  })

  it('as constantes do motor não aparecem no cenário mostrado', () => {
    const r = verificar([{ id: 'g', rotulo: 'g', formulas: ['∃x (P(x) ∧ Q(f(x)))', 'P(a)'] }], dic, op)
    expect(r.tipo).toBe('consistente')
    if (r.tipo === 'consistente') expect(r.modelo.constantes.map((c) => c.nome)).toEqual(['a'])
  })

  it('perguntar: segue, não segue e contradiz como antes', () => {
    const g = [{ id: 'L', rotulo: 'L', formulas: ['∀x (P(x) ⟹ Q(x))', '∃x P(x)'] }]
    expect(perguntar(g, '∃x Q(x)', dic, op).tipo).toBe('segue')
    expect(perguntar(g, '∀x Q(x)', dic, op).tipo).toBe('nao-segue')
    expect(perguntar(g, '∀x ¬Q(x)', dic, op).tipo).toBe('contradiz')
  })
})
