import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { _fecharParaTestes } from '../src/dados/db'
import { Estado, notaVazia } from '../src/dados/estado'
import { FILTRO_VAZIO, filtrarNotas } from '../src/dados/filtro'
import { preparar } from '../src/dados/premissas'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'
import { distancia, nomeParecido } from '../src/logica/distancia'
import { deduzirFichas, renomear } from '../src/logica/nomes'
import { validar } from '../src/logica/validador'
import { erroSimbolo } from '../src/ui/Dicionario'

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0, termo = simbolo): EntradaDicionario => ({
  id: simbolo,
  termo,
  simbolo,
  tipo,
  aridade,
  definicao: '',
})

const nota = (p: Partial<Nota>): Nota => ({ ...notaVazia(), id: Math.random().toString(36).slice(2), ...p })

describe('nomes não declarados (E12) e "você quis dizer" (E13)', () => {
  const dic = [ficha('Amigo', 'predicado', 1), ficha('A', 'constante')]

  it('nome sem ficha gera aviso E12, que não bloqueia', () => {
    const r = validar('P(x) ∧ x ∈ A', dic, { exigirFichas: true })
    expect(r.diags.map((d) => d.codigo)).toEqual(['E12', 'E12'])
    expect(r.diags[0].ficha).toEqual({ simbolo: 'P', tipo: 'predicado', aridade: 1 })
    expect(r.diags[1].ficha).toEqual({ simbolo: 'x', tipo: 'constante', aridade: 0 })
    expect(r.ok).toBe(true)
  })

  it('variáveis ligadas não precisam de ficha', () => {
    expect(validar('∀x Amigo(x)', dic, { exigirFichas: true }).diags).toEqual([])
  })

  it('Amgio → "você quis dizer Amigo?"', () => {
    const r = validar('∃x Amgio(x)', dic, { exigirFichas: true })
    expect(r.diags.map((d) => d.codigo)).toEqual(['E13'])
    expect(r.diags[0].sugestao).toBe('Amigo')
    expect(r.diags[0].msg).toMatch(/quis dizer 'Amigo'/)
  })

  it('sem a opção, nada muda (testes da etapa 1 continuam valendo)', () => {
    expect(validar('P(x)', []).diags).toEqual([])
  })

  it('distância com transposição', () => {
    expect(distancia('Amgio', 'Amigo')).toBe(1)
    expect(distancia('Amig', 'Amigo')).toBe(1)
    expect(distancia('Amg', 'Amigo')).toBe(2)
    expect(distancia('Pessoa', 'Amigo')).toBeGreaterThan(2)
  })

  it('distância e tamanho contam caracteres Unicode, não unidades de UTF-16', () => {
    expect(distancia('𝑥𝑦z', 'xyz')).toBe(2)
    expect(nomeParecido('𝑥ab', ['xab'])).toBe('xab')
  })

  it('não sugere entre nomes curtos', () => {
    expect(nomeParecido('B', ['A'])).toBeNull()
    expect(nomeParecido('fi', ['f'])).toBeNull()
    expect(nomeParecido('Amigos', ['Amigo', 'A'])).toBe('Amigo')
    expect(nomeParecido('Inimigo', ['Amigo'])).toBeNull()
  })

  it('renomear troca só ocorrências livres', () => {
    expect(renomear('Amgio(a) ∧ ∀Amgio (Amgio = a)', 'Amgio', 'Amigo')).toBe('Amigo(a) ∧ ∀Amgio (Amgio = a)')
    expect(renomear('f(f(x)) ∈ fᵢ', 'f', 'g')).toBe('g(g(x)) ∈ gᵢ')
  })

  it('renomear mantém os parênteses em volta do nome (o E13 aponta para o nome)', () => {
    expect(renomear('(Pesoa(a)) ∧ Q(b)', 'Pesoa', 'Pessoa')).toBe('(Pessoa(a)) ∧ Q(b)')
    expect(renomear('(fnc(a)) = b', 'fnc', 'func')).toBe('(func(a)) = b')
    expect(renomear('P((Joa))', 'Joa', 'Joao')).toBe('P((Joao))')
    const d = validar('(Pesoa(a))', [ficha('Pessoa', 'predicado', 1)], { exigirFichas: true }).diags.find((x) => x.codigo === 'E13')!
    expect([d.pos, d.end]).toEqual([1, 6])
  })
})

describe('fichas deduzidas antes do motor', () => {
  it('deduz tipo e aridade dos axiomas', () => {
    const p = deduzirFichas(
      [
        { texto: '∀i∈I (f(i) ⊆ A)', notaId: 'n1' },
        { texto: 'A ∉ A', notaId: 'n2' },
      ],
      [],
    )
    expect(p.map((x) => [x.simbolo, x.tipo, x.aridade, x.notas])).toEqual([
      ['A', 'constante', 0, ['n1', 'n2']],
      ['f', 'funcao', 1, ['n1']],
      ['I', 'constante', 0, ['n1']],
    ])
    expect(p.every((x) => x.conflito === null)).toBe(true)
  })

  it('aponta uso conflitante entre notas', () => {
    const [p] = deduzirFichas(
      [
        { texto: 'f(a) = a', notaId: 'n1' },
        { texto: 'f ∈ a', notaId: 'n2' },
      ],
      [ficha('a', 'constante')],
    )
    expect(p.simbolo).toBe('f')
    expect(p.conflito).toMatch(/função\/1.*constante|constante.*função\/1/)
  })

  it('o motor só fica pronto com todos os nomes confirmados', () => {
    const notas = [nota({ formulas: ['A ∉ A'] }), nota({ compartimento: 'visao', titular: 'x', formulas: ['B ∈ B'] })]
    expect(preparar(notas, []).pronto).toBe(false)
    expect(preparar(notas, [ficha('A', 'constante')]).semFicha.map((p) => p.simbolo)).toEqual(['B'])
    const p = preparar(notas, [ficha('A', 'constante'), ficha('B', 'constante')])
    expect(p.pronto).toBe(true)
    expect(p.premissas.map((f) => f.texto)).toEqual(['A ∉ A'])
    expect([...p.visoes.keys()]).toEqual(['x'])
  })

  it('notas inativas e fórmulas com erro ficam de fora', () => {
    const notas = [nota({ formulas: ['A ∉ A', 'P(x) Q(x)'] }), nota({ ativa: false, formulas: ['Z ∈ Z'] })]
    const p = preparar(notas, [ficha('A', 'constante')])
    expect(p.premissas.map((f) => f.texto)).toEqual(['A ∉ A'])
    expect(p.comErro.map((f) => f.texto)).toEqual(['P(x) Q(x)'])
    expect(p.pronto).toBe(true)
  })
})

describe('filtro da lista', () => {
  const dic = [ficha('Am', 'predicado', 1, 'amigo')]
  const notas = [
    nota({ titulo: 'Amizade', compartimento: 'lei', grau: 'F', tags: ['ética'] }),
    nota({ titulo: 'Outra', compartimento: 'lei', grau: 'D', formulas: ['∀x Am(x)'] }),
    nota({ titulo: 'Notícia', compartimento: 'fato', fonte: 'jornal' }),
    nota({ titulo: 'Fé', compartimento: 'visao', titular: 'cristãos' }),
  ]
  const titulos = (f: Partial<typeof FILTRO_VAZIO>) => filtrarNotas(notas, { ...FILTRO_VAZIO, ...f }, dic).map((n) => n.titulo)

  it('por compartimento, grau e tag', () => {
    expect(titulos({ compartimento: 'lei' })).toEqual(['Amizade', 'Outra'])
    expect(titulos({ grau: 'D' })).toEqual(['Outra'])
    expect(titulos({ tag: 'ética' })).toEqual(['Amizade'])
  })

  it('busca ignora acento e acha pelo termo do dicionário', () => {
    expect(titulos({ busca: 'cristaos' })).toEqual(['Fé'])
    expect(titulos({ busca: 'amigo' })).toEqual(['Outra'])
    expect(titulos({ busca: 'amiz' })).toEqual(['Amizade'])
  })
})

describe('ficha do dicionário', () => {
  it('símbolo precisa ser um nome válido e único', () => {
    expect(erroSimbolo('A', [], '')).toBeNull()
    expect(erroSimbolo('', [], '')).toMatch(/Informe/)
    expect(erroSimbolo('A B', [], '')).toMatch(/um nome só/)
    expect(erroSimbolo('∀', [], '')).toMatch(/um nome só/)
    expect(erroSimbolo('A', [ficha('A', 'constante')], 'outro')).toMatch(/Já existe/)
    expect(erroSimbolo('A', [ficha('A', 'constante')], 'A')).toBeNull()
  })
})

describe('persistência no IndexedDB', () => {
  beforeEach(async () => {
    _fecharParaTestes()
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase('caderno-logico')
      r.onsuccess = r.onerror = r.onblocked = () => ok()
    })
  })

  it('grava, recarrega e apaga notas e fichas', async () => {
    const a = new Estado()
    await a.carregar()
    expect(a.erroBanco).toBeNull()
    const n = await a.salvarNota({ ...notaVazia('fato'), titulo: 'T', formulas: ['A ∉ A'], fonte: 'livro' })
    await a.salvarEntradas(ficha('A', 'constante'))
    expect(n.id).toBeTruthy()

    const b = new Estado()
    await b.carregar()
    expect(b.notas.map((x) => [x.titulo, x.compartimento, x.fonte, x.formulas])).toEqual([['T', 'fato', 'livro', ['A ∉ A']]])
    expect(b.dicionario.map((e) => e.simbolo)).toEqual(['A'])

    await b.apagarNota(n.id)
    const c = new Estado()
    await c.carregar()
    expect(c.notas).toEqual([])
  })
})
