import { describe, expect, it } from 'vitest'
import { fichasDoConjunto, inferirTipos, lerTabela, montarConjunto, nomeSimbolo } from '../src/dados/tabela'
import type { EntradaDicionario } from '../src/dados/tipos'
import { induzirCasos, induzirObjetos, lerNumero, numeroTexto, testarNosDados, type ConjuntoDados } from '../src/motor/dados'
import { analisar, OPCOES_PADRAO, perguntar } from '../src/motor/motor'
import { entradaDoModelo } from '../src/dados/mundo'
import type { Nota } from '../src/dados/tipos'
import { rodarModelo, type RelatorioModelo } from '../src/motor/modelo'
import { oQueObservar } from '../src/motor/observar'

const ASTROS = `nome;tipo;rochoso;orbita;massa
Mercúrio;planeta;sim;Sol;0,33
Vênus;planeta;sim;Sol;4,87
Terra;planeta;sim;Sol;5,97
Marte;planeta;sim;Sol;0,642
Júpiter;planeta;não;Sol;1898
Lua;lua;sim;Terra;0,073
Fobos;lua;sim;Marte;0,0000107
Deimos;lua;sim;Marte;0,0000015
Sol;estrela;não;;1989000`

function conjunto(texto: string, dic: EntradaDicionario[] = []): { c: ConjuntoDados; dic: EntradaDicionario[] } {
  const { cabecalho, linhas } = lerTabela(texto)
  const c = montarConjunto({ id: 't', nome: 'teste', fonte: 'teste', pasta: 'dados' }, cabecalho, linhas, dic)
  return { c, dic: [...dic, ...fichasDoConjunto(c, dic).map((e) => ({ ...e, id: e.simbolo }))] }
}
const formula = (t: string, dic: EntradaDicionario[]) => {
  const f = analisar([t], dic, true)[0]
  if (!f) throw new Error(`fórmula inválida: ${t}`)
  return f.expandida
}

describe('tabelas', () => {
  it('lê CSV com ponto e vírgula, vírgula decimal e aspas', () => {
    const { cabecalho, linhas } = lerTabela('a;b;c\n"x; y";1,5;\n2;"diz ""oi""";3\n')
    expect(cabecalho).toEqual(['a', 'b', 'c'])
    expect(linhas).toEqual([
      ['x; y', '1,5', null],
      ['2', 'diz "oi"', '3'],
    ])
    expect(lerNumero('1.234,5')).toBe(1234.5)
    expect(lerNumero('6,674e-11')).toBeCloseTo(6.674e-11)
    expect(lerNumero('abc')).toBe(null)
  })

  it('adivinha o tipo de cada coluna e dá símbolos válidos', () => {
    const { cabecalho, linhas } = lerTabela(ASTROS)
    expect(inferirTipos(cabecalho, linhas)).toEqual(['nome', 'categoria', 'booleano', 'objeto', 'numero'])
    expect(nomeSimbolo('período orbital (dias)', false)).toBe('períodoOrbitalDias')
    expect(nomeSimbolo('2 fases', true)).toBe('N2Fases')
  })

  it('reaproveita o símbolo do dicionário quando a coluna tem o mesmo nome', () => {
    const dic: EntradaDicionario[] = [{ id: 'm', simbolo: 'massa', termo: 'massa', tipo: 'constante', aridade: 0, definicao: '', numerico: true }]
    const { c } = conjunto(ASTROS, dic)
    expect(c.colunas.find((x) => x.titulo === 'massa')!.simbolo).toBe('massa')
  })
})

describe('testar leis nos dados', () => {
  const { c, dic } = conjunto(ASTROS)
  const P = c.colunas.find((x) => x.titulo === 'tipo')!.valores!
  const rochoso = c.colunas.find((x) => x.titulo === 'rochoso')!.simbolo
  const orbita = c.colunas.find((x) => x.titulo === 'orbita')!.simbolo

  it('acha o contraexemplo observado', () => {
    const r = testarNosDados(formula(`∀x (${P.planeta}(x) ⟹ ${rochoso}(x))`, dic), c)
    expect(r).toMatchObject({ tipo: 'falha', contra: ['Júpiter'], modo: 'objetos' })
  })

  it('confirma o que vale em todos os objetos observados', () => {
    const r = testarNosDados(formula(`∀x (${P.lua}(x) ⟹ ${rochoso}(x))`, dic), c)
    expect(r).toMatchObject({ tipo: 'vale', modo: 'objetos' })
    const s = testarNosDados(formula(`∀x ∀y (${orbita}(x, y) ⟹ ¬${P.lua}(y))`, dic), c)
    expect(s).toMatchObject({ tipo: 'vale' })
  })

  it('o que não foi observado fica desconhecido, não falso', () => {
    // o Sol não orbita nada (célula vazia): "tudo orbita algo" não pode ser refutado por ele
    const r = testarNosDados(formula(`∀x ∃y ${orbita}(x, y)`, dic), c)
    expect(r?.tipo).not.toBe('falha')
  })

  it('fórmulas de outro assunto não são testadas', () => {
    const dic2 = [...dic, { id: 'Q', simbolo: 'Q', termo: 'Q', tipo: 'predicado' as const, aridade: 1, definicao: '' }]
    expect(testarNosDados(formula('∀x Q(x)', dic2), c)).toBe(null)
  })
})

const COLISOES = `mi;vi;mj;vj;vi2;vj2
1;2;1;0;0;2
2;3;1;0;1;4
1;1;3;-1;-2;0
2;1;2;-1;-1;1`

describe('casos medidos', () => {
  const { c, dic } = conjunto(COLISOES)

  it('testa uma lei caso a caso, com tolerância', () => {
    const lei = formula('mi · vi + mj · vj = mi · vi2 + mj · vj2', dic)
    expect(testarNosDados(lei, c)).toMatchObject({ tipo: 'vale', conferidos: 4 })
    const errada = formula('vi2 = vi', dic)
    expect(testarNosDados(errada, c)).toMatchObject({ tipo: 'falha', modo: 'casos' })
  })

  it('a tolerância aceita o erro de medição', () => {
    const t = lerTabela('a;b\n1;1,01\n2;2,02\n3;3,01')
    const cc = montarConjunto({ id: 't2', nome: 't2', fonte: 't', pasta: 'd' }, t.cabecalho, t.linhas, [])
    const d = fichasDoConjunto(cc, []).map((e) => ({ ...e, id: e.simbolo }))
    expect(testarNosDados(formula('a = b', d), cc)).toMatchObject({ tipo: 'vale' })
    expect(testarNosDados(formula('a = b', d), { ...cc, tolerancia: 0.001 })).toMatchObject({ tipo: 'falha' })
  })
})

describe('indução', () => {
  it('propõe leis que os objetos apoiam sem contraexemplo', () => {
    const { c } = conjunto(ASTROS)
    const P = c.colunas.find((x) => x.titulo === 'tipo')!.valores!
    const leis = induzirObjetos(c, ['x', 'y', 'z'])
    const formulas = leis.map((l) => l.formula)
    expect(formulas).toContain(`∀x (${P.lua}(x) ⟹ Rochoso(x))`)
    // Júpiter não é rochoso: "todo planeta é rochoso" não pode aparecer
    expect(formulas).not.toContain(`∀x (${P.planeta}(x) ⟹ Rochoso(x))`)
    expect(leis.every((l) => l.apoio >= 3 || l.formula.includes('Orbita'))).toBe(true)
  })

  it('acha relações entre grandezas medidas', () => {
    const t = lerTabela('p1;p2;p3;q\n1;2;3;2\n2;3;5;4\n4;1;5;8\n3;3;6;6')
    const c = montarConjunto({ id: 'n', nome: 'n', fonte: 't', pasta: 'd' }, t.cabecalho, t.linhas, [])
    const formulas = induzirCasos(c).map((l) => l.formula)
    expect(formulas).toContain('p1 + p2 = p3')
    expect(formulas).toContain('q = 2 · p1')
    expect(formulas).toContain('p1 > 0')
    // grandezas diferentes (p e q) não se comparam nem se somam
    expect(formulas.some((f) => /p\d (<|\+) q|q (<|\+) p/.test(f))).toBe(false)
  })

  it('escreve números sem expoente', () => {
    expect(numeroTexto(6.6743e-11)).toBe('0.00000000006674')
    expect(numeroTexto(-2.5)).toBe('−2.5')
    expect(numeroTexto(1898)).toBe('1898')
  })
})

describe('o mundo no segundo modelo', () => {
  const nota = (id: string, compartimento: Nota['compartimento'], formulas: string[], extra: Partial<Nota> = {}): Nota => ({
    id,
    titulo: id,
    texto: '',
    formulas,
    tags: [],
    criadaEm: '2026-01-01T00:00:00.000Z',
    atualizadaEm: '2026-01-01T00:00:00.000Z',
    ativa: true,
    compartimento,
    grau: 'F',
    fonte: '',
    data: '',
    titular: '',
    ...extra,
  })

  it('o observado derruba leis, induz outras, confirma e refuta teses', async () => {
    const { c, dic } = conjunto(ASTROS)
    const P = c.colunas.find((x) => x.titulo === 'tipo')!.valores!
    const notas = [
      nota('L-errada', 'lei', [`∀x (${P.planeta}(x) ⟹ Rochoso(x))`], { grau: 'D' }),
      nota('T-existe', 'teorema', [`∃x (${P.lua}(x) ∧ Rochoso(x))`]),
      nota('T-universal', 'teorema', [`∀x (${P.estrela}(x) ⟹ Rochoso(x))`]),
      nota('T-aberta', 'teorema', [`∀x (Rochoso(x) ⟹ ${P.lua}(x))`]),
    ]
    const entrada = entradaDoModelo(notas, [], dic, [c])
    expect(entrada.desativadasPelosDados['L-errada']).toContain('Júpiter')
    expect(entrada.notas.find((n) => n.id === 'L-errada')!.ativa).toBe(false)
    const induzidas = entrada.notas.filter((n) => n.id.startsWith('induzida-'))
    expect(induzidas.length).toBeGreaterThan(0)
    expect(induzidas.every((n) => n.grau === 'M')).toBe(true)

    let final: RelatorioModelo | null = null
    await rodarModelo(
      { notas: entrada.notas, orcamentoMs: 60_000, dados: entrada.dados, desativadasPelosDados: entrada.desativadasPelosDados },
      dic,
      { ...OPCOES_PADRAO, N: 4 },
      (r) => (final = r),
      () => {},
    )
    const r = final! as RelatorioModelo
    const item = (id: string) => r.itens.find((i) => i.id === id)!
    expect(item('L-errada').classe).toBe('desativada')
    expect(r.eventos.some((e) => e.tipo === 'desativou' && e.conjunto === 'Dados do mundo')).toBe(true)
    // um exemplo observado basta para um "existe"
    expect(item('T-existe:0').classe).toBe('provado')
    // o Sol é estrela e não é rochoso
    expect(item('T-universal:0').classe).toBe('refutado')
    expect(item('T-universal:0').explicacao).toContain('Sol')
  })
})

describe('o que observar', () => {
  const dic: EntradaDicionario[] = [
    { id: 'P', simbolo: 'P', termo: 'P', tipo: 'predicado', aridade: 1, definicao: '' },
    { id: 'Q', simbolo: 'Q', termo: 'Q', tipo: 'predicado', aridade: 1, definicao: '' },
    { id: 'a', simbolo: 'a', termo: 'a', tipo: 'constante', aridade: 0, definicao: '' },
  ]
  const leis = [{ id: 'L', rotulo: 'L', formulas: ['∀x (P(x) ⟹ Q(x))'] }]
  const op = { ...OPCOES_PADRAO, N: 4 }

  it('aponta o fato que decidiria a tese', () => {
    const obs = oQueObservar(leis, 'Q(a)', dic, op)
    expect(obs.find((o) => o.efeito === 'confirma')?.formula).toBe('P(a)')
    // observar a própria tese não conta
    expect(obs.some((o) => o.formula === 'Q(a)' || o.formula === '¬Q(a)')).toBe(false)
  })

  it('para uma tese universal, o retrato do objeto que a derrubaria', () => {
    const r = perguntar(leis, '∀x (Q(x) ⟹ P(x))', dic, op)
    expect(r.tipo).toBe('nao-segue')
    const obs = oQueObservar(leis, '∀x (Q(x) ⟹ P(x))', dic, op, r.tipo === 'nao-segue' ? r.mundo : undefined)
    expect(obs.some((o) => o.efeito === 'refuta' && o.texto.includes('Q e ¬P'))).toBe(true)
  })

  it('com números: o que medir', () => {
    const d2: EntradaDicionario[] = ['m', 'v', 'p'].map((s) => ({ id: s, simbolo: s, termo: s, tipo: 'constante', aridade: 0, definicao: '', numerico: true }))
    const obs = oQueObservar([{ id: 'L', rotulo: 'L', formulas: ['p = m · v'] }], 'p > 0', d2, op)
    expect(obs[0].efeito).toBe('medir')
    expect(obs[0].texto).toContain('p, m, v')
  })
})

describe('unidades no nome da coluna', () => {
  it('a [unidade] não entra no símbolo e não atrapalha achar o do dicionário', () => {
    expect(nomeSimbolo('massa [quilograma]', false)).toBe('massa')
    const dic: EntradaDicionario[] = [{ id: 'm', simbolo: 'massa', termo: 'massa', tipo: 'constante', aridade: 0, definicao: '', numerico: true }]
    const t = lerTabela('nome;massa [kg]\na;1\nb;2')
    const c = montarConjunto({ id: 'u', nome: 'u', fonte: 't', pasta: 'd' }, t.cabecalho, t.linhas, dic)
    expect(c.colunas[1].simbolo).toBe('massa')
  })
})
