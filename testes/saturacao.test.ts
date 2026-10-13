import { describe, expect, it } from 'vitest'
import type { EntradaDicionario } from '../src/dados/tipos'
import { validar } from '../src/logica/validador'
import { analisar } from '../src/motor/motor'
import { clausificar, formulaDaClausula, Gerador, subsume, type EventoGerador, type TeoremaGerado } from '../src/motor/saturacao'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0): EntradaDicionario => ({
  id: simbolo,
  simbolo,
  tipo,
  aridade,
  termo: simbolo,
  definicao: '',
})
const dic = [ficha('P', 'predicado', 1), ficha('Q', 'predicado', 1), ficha('R', 'predicado', 2), ficha('a', 'constante'), ficha('b', 'constante'), ficha('c', 'constante')]
const notas = (...xs: [string, string][]) => xs.map(([id, f]) => ({ id, formulas: analisar([f], dic).map((i) => i.expandida) }))
const ocupados = new Set(dic.map((e) => e.simbolo))

/** roda até saturar, achar a contradição, achar todas as `procuradas` ou gastar os passos */
function gerar(ns: ReturnType<typeof notas>, passos = 600, procuradas: string[] = []) {
  const g = new Gerador(ns, ocupados)
  const eventos: EventoGerador[] = []
  const achou = () => procuradas.length > 0 && procuradas.every((f) => eventos.some((e) => e.tipo === 'teorema' && e.t.formula === f))
  for (let i = 0; i < passos / 100 && !g.saturado && !g.contradicao && !achou(); i++) eventos.push(...g.passo(100))
  const teoremas = eventos.filter((e): e is { tipo: 'teorema'; t: TeoremaGerado } => e.tipo === 'teorema').map((e) => e.t)
  return { g, eventos, teoremas, formulas: teoremas.map((t) => t.formula) }
}

describe('gerador de teoremas (saturação)', () => {
  it('passa as fórmulas para cláusulas, com um nome novo no lugar do "existe"', () => {
    const [imp] = analisar(['∀x (P(x) ⟹ Q(x))'], dic)
    expect(clausificar(imp.expandida)).toEqual([
      [
        { pos: false, p: 'P', a: [0] },
        { pos: true, p: 'Q', a: [0] },
      ],
    ])
    const [ex] = analisar(['∀x ∃y R(x, y)'], dic)
    expect(clausificar(ex.expandida)).toEqual([[{ pos: true, p: 'R', a: [0, { f: '§1', a: [0] }] }]])
  })

  it('a cláusula volta como fórmula do caderno', () => {
    expect(formulaDaClausula([{ pos: false, p: 'R', a: [0, 1] }, { pos: true, p: 'R', a: [1, 0] }], ocupados)).toBe('∀x ∀y (R(x, y) ⟹ R(y, x))')
    expect(formulaDaClausula([{ pos: false, p: '=', a: [{ f: 'a', a: [] }, { f: 'b', a: [] }] }], ocupados)).toBe('a ≠ b')
    expect(formulaDaClausula([{ pos: false, p: 'P', a: [0] }, { pos: false, p: 'Q', a: [0] }], ocupados)).toBe('∀x ¬(P(x) ∧ Q(x))')
  })

  it('subsunção: o mais geral diz o mesmo que o mais específico', () => {
    expect(subsume([{ pos: true, p: 'P', a: [0] }], [{ pos: true, p: 'P', a: [{ f: 'a', a: [] }] }, { pos: true, p: 'Q', a: [0] }])).toBe(true)
    expect(subsume([{ pos: true, p: 'P', a: [{ f: 'a', a: [] }] }], [{ pos: true, p: 'P', a: [0] }])).toBe(false)
  })

  it('a reação em cadeia: simétrica + transitiva + "todos com alguém" dá a reflexiva (para qualquer tamanho), e R(b, a)', () => {
    const { formulas, teoremas, g } = gerar(
      notas(['L1', '∀x ∀y (R(x, y) ⟹ R(y, x))'], ['L2', '∀x ∀y ∀z (R(x, y) ∧ R(y, z) ⟹ R(x, z))'], ['L3', '∀x ∃y R(x, y)'], ['L4', 'R(a, b)']),
      600,
      ['∀x R(x, x)', 'R(b, a)'],
    )
    expect(g.contradicao).toBeNull()
    expect(formulas).toContain('∀x R(x, x)')
    expect(formulas).toContain('R(b, a)')
    // a reflexiva vem de L1, L2 e L3 (não precisa de L4)
    expect(teoremas.find((t) => t.formula === '∀x R(x, x)')!.apoio).toEqual(['L1', 'L2', 'L3'])
    // nenhum teorema só repete uma lei, nenhum usa os nomes inventados, e todos o caderno lê de volta
    expect(formulas).not.toContain('∀x ∀y (R(x, y) ⟹ R(y, x))')
    expect(formulas.some((f) => f.includes('§'))).toBe(false)
    for (const f of formulas) expect(validar(f, dic).ok, f).toBe(true)
  }, 60_000)

  it('cada teorema guarda de quais teoremas veio, e quantas vezes serviu para provar outro', () => {
    const { teoremas, eventos } = gerar(notas(['L1', '∀x (P(x) ⟹ Q(x))'], ['L2', '∀x (Q(x) ⟹ R(x, x))'], ['L3', 'P(a)']))
    const qa = teoremas.find((t) => t.formula === 'Q(a)')!
    const raa = teoremas.find((t) => t.formula === 'R(a, a)')!
    expect(qa).toBeDefined()
    expect(raa.apoio).toEqual(['L1', 'L2', 'L3'])
    // R(a, a) veio de um teorema guardado antes (Q(a) ou ∀x (P(x) ⟹ R(x, x)))
    expect(raa.pais.length).toBeGreaterThan(0)
    expect(eventos.some((e) => e.tipo === 'uso')).toBe(true)
  })

  it('acha a contradição (provada para qualquer tamanho) e diz de quais leis ela vem', () => {
    const { g } = gerar(notas(['L1', '∀x (P(x) ⟹ Q(x))'], ['L2', 'P(a)'], ['L3', '¬Q(a)'], ['L4', 'R(b, c)']))
    expect(g.contradicao).toEqual(['L1', 'L2', 'L3'])
  })

  it('igualdade: troca iguais por iguais (escrevendo tudo na forma que a ordem escolhe: b vira a)', () => {
    const { formulas } = gerar(notas(['L1', 'a = b'], ['L2', 'P(b)'], ['L3', '∀x (P(x) ⟹ Q(x))']))
    expect(formulas).toContain('P(a)')
    expect(formulas).toContain('Q(a)')
    // Q(b) diz o mesmo que Q(a) (b = a): não sai de novo
    expect(formulas).not.toContain('Q(b)')
  })

  it('teoria de grupos: com a igualdade nativa, sai o inverso do inverso (e outras leis de grupo)', () => {
    const dicG = [ficha('op', 'funcao', 2), ficha('inv', 'funcao', 1), ficha('e', 'constante')]
    const ns = [
      ['G1', '∀x ∀y ∀z (op(op(x, y), z) = op(x, op(y, z)))'],
      ['G2', '∀x (op(e, x) = x)'],
      ['G3', '∀x (op(inv(x), x) = e)'],
    ].map(([id, f]) => ({ id, formulas: analisar([f], dicG).map((i) => i.expandida) }))
    const g = new Gerador(ns, new Set(dicG.map((x) => x.simbolo)), { pesoMax: 20, litMax: 2, profTermo: 4, passivasMax: 200_000 })
    // o banco no fim (os superados — versões ainda não simplificadas — saem)
    const banco = new Map<string, string>()
    for (let i = 0; i < 200 && !g.saturado; i++)
      for (const ev of g.passo(100)) {
        if (ev.tipo === 'teorema') banco.set(ev.t.chave, ev.t.formula)
        if (ev.tipo === 'superado') banco.delete(ev.chave)
      }
    const formulas = [...banco.values()]
    // cada lei, escrita com o lado que for
    const tem = (q: string, l: string, r: string) => formulas.includes(`${q}${l} = ${r}${q ? ')' : ''}`) || formulas.includes(`${q}${r} = ${l}${q ? ')' : ''}`)
    expect(tem('∀x (', 'inv(inv(x))', 'x'), 'inverso do inverso').toBe(true)
    expect(tem('∀x (', 'op(x, e)', 'x'), 'neutro à direita').toBe(true)
    expect(tem('∀x (', 'op(x, inv(x))', 'e'), 'inverso à direita').toBe(true)
    expect(tem('', 'inv(e)', 'e'), 'inverso do neutro').toBe(true)
    expect(tem('∀x ∀y (', 'inv(op(x, y))', 'op(inv(y), inv(x))'), 'inverso do produto').toBe(true)
    // o que ainda dava para simplificar não fica no banco
    expect(formulas).not.toContain('∀x (x = op(inv(e), x))')
    expect(g.contradicao).toBeNull()
  }, 120_000)

  it('para quando tudo até o peso máximo já foi gerado (saturou)', () => {
    const { g } = gerar(notas(['L1', '∀x (P(x) ⟹ Q(x))'], ['L2', 'P(a)']))
    expect(g.saturado).toBe(true)
  })

  it('deixa de fora o que não lê (lógica modal), e diz de qual nota', () => {
    const dicM = [...dic, ficha('João', 'constante')]
    const ns = [{ id: 'M1', formulas: analisar(['□P(a)'], dicM).map((i) => i.expandida) }, ...notas(['L1', 'P(b)'])]
    const g = new Gerador(ns, ocupados)
    expect(g.ignoradas).toEqual([{ nota: 'M1', motivo: 'lógica modal' }])
  })
})
