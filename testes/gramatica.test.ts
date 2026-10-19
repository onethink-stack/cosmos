// A gramática do Caderno (versão semântica m2) conferida contra o pacote de
// conformidade em especificacao/: cada exemplo de exemplos-m2.json, as grafias de
// lexico-m2.json e os códigos de diagnosticos-m2.json. Mudar um exemplo é mudar o
// sentido de fórmulas: só com uma nova versão semântica.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import type { Formula, Termo } from '../src/logica/ast'
import { expandir } from '../src/logica/acucar'
import { canonica } from '../src/logica/canonica'
import { imprimir } from '../src/logica/impressao'
import { lex } from '../src/logica/lexer'
import { definirAvisoDeEscopo, validar } from '../src/logica/validador'
import { nao, OPCOES_PADRAO, perguntar, prepararFormulas, type Grupo } from '../src/motor/motor'
import { checarZ3 } from '../src/motor/z3'
import textoDiagnosticos from '../especificacao/diagnosticos-m2.json?raw'
import textoExemplos from '../especificacao/exemplos-m2.json?raw'
import textoLexico from '../especificacao/lexico-m2.json?raw'

/** A árvore entre parênteses: (conectivo filhos…); termos e fórmulas no mesmo formato. */
const t = (x: Termo): string => {
  switch (x.k) {
    case 'nome':
      return x.nome
    case 'num':
      return x.valor
    case 'vazio':
      return '∅'
    case 'reais':
      return 'ℝ'
    case 'inteiros':
      return 'ℤ'
    case 'app':
      return x.subscrito ? `(_ ${x.fn} ${x.args.map(t).join(' ')})` : `(${x.fn} ${x.args.map(t).join(' ')})`
    case 'inter':
      return `(⋂ ${t(x.l)} ${t(x.r)})`
    case 'uniao':
      return `(⋃ ${t(x.l)} ${t(x.r)})`
    case 'arit':
      return `(${x.op} ${t(x.l)} ${t(x.r)})`
    case 'neg':
      return `(− ${t(x.t)})`
  }
}
const OP = { and: '∧', or: '∨', imp: '⟹', iff: '⟺' } as const
const f = (x: Formula): string => {
  switch (x.k) {
    case 'pred':
      return x.args.length ? `(${x.nome} ${x.args.map(t).join(' ')})` : x.nome
    case 'rel':
      return `(${x.op} ${t(x.l)} ${t(x.r)})`
    case 'not':
      return `(¬ ${f(x.f)})`
    case 'nec':
      return `(□ ${f(x.f)})`
    case 'pos':
      return `(◇ ${f(x.f)})`
    case 'crenca':
      return `(B "${x.agente}" ${f(x.f)})`
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return `(${OP[x.k]} ${f(x.l)} ${f(x.r)})`
    case 'forall':
    case 'exists':
      return `(${x.k === 'forall' ? '∀' : '∃'} ${x.v}${x.dom ? ` ∈ ${t(x.dom)}` : ''} ${f(x.corpo)})`
    case 'const':
      return x.valor ? '⊤' : '⊥'
  }
}

const codigos = (texto: string) =>
  validar(texto, [])
    .diags.map((d) => `${d.codigo}${d.nivel === 'aviso' ? '?' : ''}`)
    .join(',')

/** O pacote de conformidade (especificacao/): exemplos normativos, léxico e diagnósticos. */
interface Exemplo {
  id: string
  texto: string
  fichas: Omit<EntradaDicionario, 'id' | 'termo' | 'definicao'>[]
  aceita: boolean
  arvore: string | null
  arvoreExpandida: string | null
  diagnosticos: { codigo: string; nivel: string }[]
}
const PACOTE: { versao: string; exemplos: Exemplo[] } = JSON.parse(textoExemplos)

describe('gramática normativa: cada exemplo do pacote é lido como o arquivo diz', () => {
  it('versão m2, 73 exemplos', () => {
    expect(PACOTE.versao).toBe('m2')
    expect(PACOTE.exemplos).toHaveLength(73)
  })
  for (const e of PACOTE.exemplos)
    it(`${e.id} ${e.texto}`, () => {
      const dic: EntradaDicionario[] = e.fichas.map((x) => ({ id: x.simbolo, termo: x.simbolo, definicao: '', ...x }))
      const v = validar(e.texto, dic)
      expect(v.ok).toBe(e.aceita)
      expect(v.ast ? f(v.ast) : null).toBe(e.arvore)
      expect(v.ok && v.ast ? f(expandir(v.ast)) : null).toBe(e.arvoreExpandida)
      expect(v.diags.map((d) => ({ codigo: d.codigo, nivel: d.nivel }))).toEqual(e.diagnosticos)
    })
})

describe('o léxico e os diagnósticos do pacote batem com o Caderno', () => {
  const lexico: {
    simbolos: { token: string; grafias: string[] }[]
    especiais: { token: string; grafias: string[] }[]
    nome: { sobrescritosComAvisoE17: string[] }
  } = JSON.parse(textoLexico)

  it('cada grafia vira o símbolo que o arquivo diz', () => {
    for (const s of [...lexico.simbolos, ...lexico.especiais])
      for (const g of s.grafias) {
        const { tokens, erros } = lex(g)
        expect(erros, g).toEqual([])
        expect(tokens.map((k) => k.t), g).toEqual([s.token, 'eof'])
      }
  })

  it('os sobrescritos do E17 são os que o validador avisa', () => {
    for (const c of lexico.nome.sobrescritosComAvisoE17) expect(validar(`x${c} = y`, []).diags.map((d) => d.codigo), c).toEqual(['E17'])
  })

  it('o arquivo de diagnósticos tem os códigos do Caderno, E0 a E17', () => {
    const d: { codigos: { codigo: string }[] } = JSON.parse(textoDiagnosticos)
    expect(d.codigos.map((x) => x.codigo)).toEqual(Array.from({ length: 18 }, (_, i) => `E${i}`))
  })
})

describe('E16: aviso de escopo, nunca erro, e dá para desligar', () => {
  afterEach(() => definirAvisoDeEscopo(true))

  it('mostra a leitura do Caderno e a alternativa com parênteses', () => {
    const d = validar('∀x P(x) ⟹ Q(b)', []).diags.find((x) => x.codigo === 'E16')!
    expect(d.nivel).toBe('aviso')
    expect(d.msg).toContain('Lido como ∀x (P(x) ⟹ Q(b))')
    expect(d.msg).toContain('(∀x P(x)) ⟹ Q(b)')
    // a alternativa sugerida é mesmo a outra leitura
    expect(f(validar('(∀x P(x)) ⟹ Q(b)', []).ast!)).toBe('(⟹ (∀ x (P x)) (Q b))')
  })

  it('desligado, some o aviso e a árvore fica igual', () => {
    const antes = validar('∀x P(x) ⟹ Q(b)', [])
    definirAvisoDeEscopo(false)
    const depois = validar('∀x P(x) ⟹ Q(b)', [])
    expect(depois.diags.map((d) => d.codigo)).not.toContain('E16')
    expect(f(depois.ast!)).toBe(f(antes.ast!))
    expect(canonica(expandir(depois.ast!))).toBe(canonica(expandir(antes.ast!)))
  })

  it('com o corpo entre parênteses não há aviso, e a fórmula é a mesma', () => {
    expect(codigos('∀x (P(x) ⟹ Q(b))')).toBe('')
    expect(f(validar('∀x (P(x) ⟹ Q(b))', []).ast!)).toBe(f(validar('∀x P(x) ⟹ Q(b)', []).ast!))
  })

  it('E14 e E16 não se repetem no mesmo quantificador', () => {
    expect(codigos('∀x (P(x)) ⟹ Q(b)')).toBe('E14?')
  })
})

describe('E17: sobrescrito em nome é aviso, e o nome continua sendo outro nome', () => {
  it('sugere a potência com ^ quando o sobrescrito está no fim', () => {
    expect(validar('x² = 4', []).diags[0].msg).toContain('x^2')
    expect(validar('xⁿ = y', []).diags[0].msg).toContain('x^n')
  })

  it('x² não é ligado por ∀x: é uma constante', () => {
    const v = validar('∀x P(x²)', [])
    expect(f(v.ast!)).toBe('(∀ x (P x²))')
    expect(canonica(expandir(v.ast!))).not.toBe(canonica(expandir(validar('∀x P(x)', []).ast!)))
  })
})

describe('testes gerados: o leitor nunca quebra, e imprimir e ler de novo dá a mesma árvore', () => {
  // sorteio determinístico: a mesma semente dá sempre as mesmas fórmulas
  const sorteio = (semente: number) => () => {
    semente = (semente * 1103515245 + 12345) % 2147483648
    return semente / 2147483648
  }
  const ATOMOS = ['P(a)', 'Q(x)', 'R(x, y)', 'a = b', 'x ∈ A', 'f(x) = y', 'P(x)', 'Q(b)']
  const gerar = (r: () => number, prof: number): string => {
    const sub = () => gerar(r, prof - 1)
    switch (Math.floor(r() * (prof > 0 ? 10 : 1))) {
      case 0:
        return ATOMOS[Math.floor(r() * ATOMOS.length)]
      case 1:
        return `¬${sub()}`
      case 2:
        return `${sub()} ∧ ${sub()}`
      case 3:
        return `${sub()} ∨ ${sub()}`
      case 4:
        return `${sub()} ⟹ ${sub()}`
      case 5:
        return `${sub()} ⟺ ${sub()}`
      case 6:
        return `∀x ${sub()}`
      case 7:
        return `∃y (${sub()})`
      case 8:
        return `(${sub()})`
      default:
        return r() < 0.5 ? `□${sub()}` : `B[Ana] ${sub()}`
    }
  }

  it('3.000 fórmulas sorteadas: imprimir a árvore e ler de novo dá a mesma árvore', () => {
    const r = sorteio(42)
    let validas = 0
    for (let i = 0; i < 3000; i++) {
      const t = gerar(r, 4)
      const v = validar(t, [])
      if (!v.ok || !v.ast) continue
      validas++
      const impresso = imprimir(v.ast)
      const outra = validar(impresso, [])
      expect(outra.ast ? f(outra.ast) : null, `${t}  →  ${impresso}`).toBe(f(v.ast))
    }
    expect(validas).toBeGreaterThan(1000)
  })

  it('3.000 textos aleatórios com os símbolos da linguagem: sempre árvore ou erro, nunca exceção', () => {
    const r = sorteio(7)
    const PECAS = ['∀x', '∃y', '¬', '∧', '∨', '⟹', '⟺', '(', ')', 'P(a)', 'x', '=', '∈', 'A', ',', 'B[Ana]', '□', '◇', '²', '⋂', '−', '2', 'f(', '[', ']']
    for (let i = 0; i < 3000; i++) {
      const t = Array.from({ length: 1 + Math.floor(r() * 12) }, () => PECAS[Math.floor(r() * PECAS.length)]).join(' ')
      const v = validar(t, [])
      expect(v.ok ? !!v.ast : v.diags.length > 0, t).toBe(true)
    }
  })
})

describe('escopo do quantificador: as duas leituras são fórmulas diferentes em todos os componentes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any
  beforeAll(async () => {
    api = await init()
  }, 60_000)
  afterAll(async () => {
    await killThreads(api.em)
  })

  const caderno = '∀x P(x) ⟹ Q(b)'
  const explicita = '∀x (P(x) ⟹ Q(b))'
  const livros = '(∀x P(x)) ⟹ Q(b)'
  const premissas = ['P(c)', '¬P(d)', '¬Q(b)']
  const grupos = (xs: string[]): Grupo[] => xs.map((x, i) => ({ id: `g${i}`, rotulo: `g${i}`, formulas: [x] }))
  const ast = (x: string) => expandir(validar(x, []).ast!)

  it('a escrita sem parênteses é a mesma fórmula que a explícita', () => {
    expect(f(validar(caderno, []).ast!)).toBe(f(validar(explicita, []).ast!))
    expect(canonica(ast(caderno))).toBe(canonica(ast(explicita)))
    expect(canonica(ast(caderno))).not.toBe(canonica(ast(livros)))
  })

  it('motor finito: com P(c), ¬P(d) e ¬Q(b), a leitura do Caderno é falsa e a dos livros segue', () => {
    expect(perguntar(grupos(premissas), caderno, [], OPCOES_PADRAO).tipo).toBe('contradiz')
    expect(perguntar(grupos(premissas), livros, [], OPCOES_PADRAO).tipo).toBe('segue')
  })

  it('Z3: as mesmas duas respostas, para qualquer tamanho', async () => {
    const base = prepararFormulas(premissas, [])
    expect(await checarZ3(api, [...base, ast(caderno)], 15_000)).toBe('unsat')
    expect(await checarZ3(api, [...base, nao(ast(livros))], 15_000)).toBe('unsat')
  }, 60_000)
})
