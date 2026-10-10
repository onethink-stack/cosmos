import { describe, expect, it } from 'vitest'
import { notaVazia } from '../src/dados/estado'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'
import { expandir } from '../src/logica/acucar'
import { converterTudo } from '../src/logica/atalhos'
import { imprimir } from '../src/logica/impressao'
import { validar } from '../src/logica/validador'
import { Avaliador } from '../src/motor/avaliar'
import { buscarModelo, OPCOES_PADRAO, perguntar, prepararFormulas, verificar, type Grupo } from '../src/motor/motor'
import { montarTarefas } from '../src/motor/tarefas'
import { inserirTexto } from '../src/ui/edicao'

const codigos = (t: string) => validar(t).diags.map((d) => d.codigo)
const vale = (f: string) => perguntar([], f, [], OPCOES_PADRAO).tipo
const grupos = (xs: string[]): Grupo[] => xs.map((f, i) => ({ id: `g${i}`, rotulo: `g${i}`, formulas: [f] }))

describe('sintaxe modal', () => {
  it('lê e reimprime □, ◇ e B[…]', () => {
    for (const t of ['□P(a)', '◇(x ∈ A)', 'B[cristãos] (A ∈ A)', 'B[Igreja Católica] P(a)', 'B[x] B[y] P(a)', '□P(a) ⟹ ◇P(a)', '¬□¬P(a)']) {
      const r = validar(t)
      expect(r.diags, t).toEqual([])
      expect(imprimir(r.ast!), t).toBe(t)
    }
  })

  it('□ liga como ¬: □P ∧ Q é (□P) ∧ Q', () => {
    const r = validar('□P(a) ∧ Q(a)')
    expect(r.ast!.k).toBe('and')
  })

  it('atalhos de teclado', () => {
    expect(converterTudo('\\nec P(a) -> <>P(a) & []Q(a)')).toBe('□ P(a) ⟹ ◇P(a) ∧ □Q(a)')
    expect(codigos('\\nec P(a)')).toEqual([])
    expect(inserirTexto('', 0, 0, 'B[‸] ')).toEqual({ texto: 'B[] ', cursor: 2 })
  })

  it('erros', () => {
    expect(codigos('B[] P(a)')).toEqual(['E0'])
    expect(codigos('B[x P(a)')).toEqual(['E0'])
    expect(codigos('□')).toEqual(['E1'])
    expect(codigos('□A')).toEqual(['E2'])
    expect(validar('□A').diags[0].msg).toMatch(/'□' aplicado a um termo/)
    expect(codigos('B[x]')).toEqual(['E1'])
  })

  it('B sem colchete continua sendo um nome comum', () => {
    expect(codigos('B ∈ A')).toEqual([])
    expect(codigos('P(B)')).toEqual([])
  })

  it('açúcar dentro de operadores modais é expandido', () => {
    expect(imprimir(expandir(validar('□(A ⊆ B)').ast!))).toBe('□(∀z (z ∈ A ⟹ z ∈ B))')
  })
})

describe('semântica: □ e ◇ (S5)', () => {
  it('o que vale', () => {
    expect(vale('□P(a) ⟹ P(a)')).toBe('segue') // T
    expect(vale('□P(a) ⟹ □□P(a)')).toBe('segue') // 4
    expect(vale('◇P(a) ⟹ □◇P(a)')).toBe('segue') // 5
    expect(vale('◇P(a) ⟺ ¬□¬P(a)')).toBe('segue') // dualidade
    expect(vale('□(P(a) ⟹ Q(a)) ⟹ (□P(a) ⟹ □Q(a))')).toBe('segue') // K
    expect(vale('□(a = b) ∨ □(a ≠ b)')).toBe('segue') // nomes rígidos
  })
  it('o que não vale', () => {
    expect(vale('◇P(a) ⟹ P(a)')).toBe('nao-segue')
    expect(vale('P(a) ⟹ □P(a)')).toBe('nao-segue')
  })
  it('□ e ◇ contraditórios', () => {
    expect(buscarModelo(prepararFormulas(['◇P(a)', '□¬P(a)'], []), OPCOES_PADRAO).status).toBe('sem-modelo')
  })
})

describe('semântica: crenças B[x] (KD45)', () => {
  it('o que vale', () => {
    expect(vale('¬(B[x] P(a) ∧ B[x] ¬P(a))')).toBe('segue') // D: crenças consistentes
    expect(vale('B[x] P(a) ⟹ B[x] B[x] P(a)')).toBe('segue') // 4: introspecção positiva
    expect(vale('¬B[x] P(a) ⟹ B[x] ¬B[x] P(a)')).toBe('segue') // 5: introspecção negativa
    expect(vale('□P(a) ⟹ B[x] P(a)')).toBe('segue')
  })
  it('o que não vale', () => {
    expect(vale('B[x] P(a) ⟹ P(a)')).toBe('nao-segue') // crença pode ser falsa
    expect(vale('B[x] P(a) ⟹ B[y] P(a)')).toBe('nao-segue') // agentes diferentes
    expect(vale('B[x] B[y] P(a) ⟹ B[y] P(a)')).toBe('nao-segue')
  })
  it('crença falsa é consistente com o fato contrário (T8 em versão modal)', () => {
    const r = verificar(grupos(['A ∉ A', 'B[x] (A ∈ A)']), [], OPCOES_PADRAO)
    expect(r.tipo).toBe('consistente')
    if (r.tipo === 'consistente') expect(r.modelo.mundos).toBeGreaterThanOrEqual(2)
  })
  it('crenças aninhadas contraditórias', () => {
    const r = verificar(grupos(['B[x] B[y] P(a)', 'B[x] B[y] ¬P(a)', 'Q(b)']), [], OPCOES_PADRAO)
    expect(r.tipo).toBe('sem-modelo')
    if (r.tipo === 'sem-modelo') {
      expect(r.conflito.sort()).toEqual(['g0', 'g1'])
      expect(r.K).toBe(OPCOES_PADRAO.K)
    }
  })
  it('contraexemplo explicado com mundos', () => {
    const r = perguntar([], 'B[x] P(a) ⟹ P(a)', [], OPCOES_PADRAO)
    if (r.tipo !== 'nao-segue') throw new Error(r.tipo)
    expect(r.mundo.passos.motivo).toBe('a condição vale, mas a conclusão não')
    expect(r.mundo.passos.filhos[0].motivo).toMatch(/vale em todos os mundos que x considera possíveis/)
  })
  it('a explicação desce até o mundo onde a crença falha', () => {
    const r = perguntar(grupos(['□¬P(a)']), 'B[x] P(a)', [], OPCOES_PADRAO)
    expect(r.tipo).toBe('contradiz')
    if (r.tipo !== 'contradiz') return
    expect(r.mundo.passos.motivo).toMatch(/^x considera possível o mundo w., e lá não vale$/)
    expect(r.mundo.passos.filhos[0].valor).toBe(false)
  })
})

describe('avaliador concorda com o motor em modelos modais', () => {
  const conjuntos = [
    ['A ∉ A', 'B[x] (A ∈ A)'],
    ['◇P(a)', '◇¬P(a)', '□(P(a) ⟹ Q(a))'],
    ['B[x] ◇P(a)', 'B[y] □¬Q(b)', '∀z (B[x] (z ∈ C))'],
    ['f(a) ≠ a', '◇(f(a) = a)'],
  ]
  for (const fs of conjuntos)
    it(fs.join(' ; '), () => {
      const r = buscarModelo(prepararFormulas(fs, []), OPCOES_PADRAO)
      expect(r.status).toBe('modelo')
      if (r.status !== 'modelo') return
      const av = new Avaliador(r.modelo)
      for (const f of fs) expect(av.avaliar(validar(f).ast!), f).toBe(true)
    })
})

describe('conjunto "tudo junto": crenças como B[titular] com as leis', () => {
  const dic: EntradaDicionario[] = [{ id: 'A', termo: 'A', simbolo: 'A', tipo: 'constante', aridade: 0, definicao: '' }]
  const nota = (p: Partial<Nota>): Nota => ({ ...notaVazia(), id: p.titulo!, ...p })

  it('existe só quando há visões, e envolve cada fórmula da visão em B[titular]', () => {
    expect(montarTarefas([nota({ titulo: 'Ax4', formulas: ['A ∉ A'] })], dic).tarefas.map((t) => t.chave)).toEqual(['geral'])
    const notas = [
      nota({ titulo: 'Ax4', formulas: ['A ∉ A'] }),
      nota({ titulo: 'fé', compartimento: 'visao', titular: 'Igreja Católica', formulas: ['A ∈ A'] }),
    ]
    const { tarefas } = montarTarefas(notas, dic)
    expect(tarefas.map((t) => t.chave)).toEqual(['geral', 'visao:Igreja Católica', 'tudo'])
    const tudo = tarefas.find((t) => t.chave === 'tudo')!
    expect(tudo.grupos.map((g) => g.formulas)).toEqual([['A ∉ A'], ['B[Igreja Católica] (A ∈ A)']])
    // T8 continua valendo: a crença falsa não contradiz a lei
    expect(verificar(tudo.grupos, dic, OPCOES_PADRAO).tipo).toBe('consistente')
  })

  it('uma lei sobre o necessário pode contradizer uma crença', () => {
    const notas = [
      nota({ titulo: 'Necessário', formulas: ['□(A ∉ A)'] }),
      nota({ titulo: 'fé', compartimento: 'visao', titular: 'x', formulas: ['A ∈ A'] }),
    ]
    const tudo = montarTarefas(notas, dic).tarefas.find((t) => t.chave === 'tudo')!
    const r = verificar(tudo.grupos, dic, OPCOES_PADRAO)
    expect(r.tipo).toBe('sem-modelo')
    if (r.tipo === 'sem-modelo') expect(r.conflito.sort()).toEqual(['Necessário', 'fé'])
    // o conjunto geral e o da visão, separados, continuam consistentes
    expect(verificar(montarTarefas(notas, dic).tarefas[0].grupos, dic, OPCOES_PADRAO).tipo).toBe('consistente')
  })
})

describe('atalho [] não atrapalha B[…]', () => {
  it('B[] não vira B□', async () => {
    const { converterNoCursor } = await import('../src/logica/atalhos')
    expect(converterNoCursor('B[]', 3)).toBeNull()
    expect(converterNoCursor('x []', 4)!.texto).toBe('x □')
    expect(converterTudo('B[] e []')).toBe('B[] e □')
  })
})
