import { describe, expect, it } from 'vitest'
import { CODATA, constantesComoFatos } from '../src/dados/codata'
import { notasDaTeoria, TEORIAS } from '../src/dados/teorias'
import { importarTptp, lerTptp } from '../src/dados/tptp'
import type { EntradaDicionario } from '../src/dados/tipos'
import { validar } from '../src/logica/validador'
import { OPCOES_PADRAO, perguntar } from '../src/motor/motor'

const comId = (es: EntradaDicionario[]) => es.map((e) => ({ ...e, id: e.simbolo }))

describe('biblioteca de teorias', () => {
  for (const t of TEORIAS)
    it(`${t.nome}: fórmulas válidas e teoremas conferidos`, () => {
      const { fichas, notas } = notasDaTeoria(t, [])
      const dic = comId(fichas)
      for (const n of notas) for (const f of n.formulas) expect(validar(f, dic).ok, `${n.titulo}: ${f}`).toBe(true)
      const grupos = notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
      for (const n of notas.filter((x) => x.compartimento === 'teorema')) {
        // o grupo não comutativo menor tem 6 elementos
        const r = perguntar(grupos, n.formulas[0], dic, { ...OPCOES_PADRAO, N: /6 elementos/.test(n.titulo) ? 6 : 4 })
        // os de título com "(não)" ou "não há" são exemplos de teses que não seguem
        const esperado = /\(não|Não há/.test(n.titulo) ? 'nao-segue' : 'segue'
        expect(r.tipo, `${t.nome} — ${n.titulo}`).toBe(esperado)
      }
    })

  it('um símbolo já usado com outro sentido ganha sufixo, e variáveis não colidem com constantes', () => {
    const dic: EntradaDicionario[] = [
      { id: 'p', simbolo: 'ParteDe', termo: 'outra', tipo: 'predicado', aridade: 1, definicao: '' },
      { id: 'x', simbolo: 'x', termo: 'xis', tipo: 'constante', aridade: 0, definicao: '' },
    ]
    const { fichas, notas } = notasDaTeoria(TEORIAS[0], dic)
    expect(fichas.map((f) => f.simbolo)).toContain('ParteDe2')
    const todos = [...dic, ...comId(fichas)]
    for (const n of notas) for (const f of n.formulas) expect(validar(f, todos).ok, f).toBe(true)
    expect(notas[0].formulas[0]).toBe('∀x1 ParteDe2(x1, x1)')
  })
})

describe('TPTP', () => {
  const ARQUIVO = `% teste
fof(transitiva, axiom, ![X,Y,Z]: ((less_than(X,Y) & less_than(Y,Z)) => less_than(X,Z))).
fof(irreflexiva, axiom, ![X]: ~ less_than(X,X)).
fof(assimetrica, conjecture, ![X,Y]: (less_than(X,Y) => ~less_than(Y,X))).
cnf(c1, axiom, f(X) != a | p(X)).
include('Axioms/SET001-0.ax').
tff(t, type, n: $int).`

  it('lê FOF e CNF e avisa o que não lê', () => {
    const { formulas, avisos } = lerTptp(ARQUIVO)
    expect(formulas.map((f) => f.nome)).toEqual(['transitiva', 'irreflexiva', 'assimetrica', 'c1'])
    expect(avisos.some((a) => a.includes('include'))).toBe(true)
    expect(avisos.some((a) => a.includes('tff'))).toBe(true)
  })

  it('traduz para a linguagem do caderno e o motor confere a conjectura', () => {
    const r = importarTptp(ARQUIVO, 'teste.p', 'tptp', [])
    const leis = r.notas.filter((n) => n.compartimento === 'lei')
    const conj = r.notas.find((n) => n.compartimento === 'teorema')!
    expect(conj.formulas[0]).toBe('∀x ∀y ((lessThan(x, y) ⟹ ¬(lessThan(y, x))))')
    expect(r.notas.find((n) => n.titulo.startsWith('c1'))!.formulas[0]).toBe('∀x ((f(x) ≠ a ∨ p(x)))')
    const dic = comId(r.fichas)
    const res = perguntar(
      leis.map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas })),
      conj.formulas[0],
      dic,
      { ...OPCOES_PADRAO, N: 4 },
    )
    expect(res.tipo).toBe('segue')
  })

  it('variáveis não viram constantes do dicionário', () => {
    const dic: EntradaDicionario[] = [{ id: 'x', simbolo: 'x', termo: 'x', tipo: 'constante', aridade: 0, definicao: '' }]
    const r = importarTptp('fof(a, axiom, ![X]: p(X)).', 't.p', 'tptp', dic)
    expect(r.notas[0].formulas[0]).toBe('∀x1 (p(x1))')
  })
})

describe('constantes físicas', () => {
  it('viram fatos válidos com o valor inteiro', () => {
    const { fichas, fatos } = constantesComoFatos(CODATA, [])
    const dic = comId(fichas)
    for (const f of fatos) expect(validar(f.formulas[0], dic).ok, f.formulas[0]).toBe(true)
    expect(fatos.find((f) => f.formulas[0].startsWith('cLuz'))!.formulas[0]).toBe('cLuz = 299792458')
    expect(fatos.find((f) => f.formulas[0].startsWith('gNewton'))!.formulas[0]).toBe('gNewton = 0.000000000066743')
    expect(fatos.find((f) => f.formulas[0].startsWith('nAvogadro'))!.formulas[0]).toBe('nAvogadro = 602214076000000000000000')
  })
})
