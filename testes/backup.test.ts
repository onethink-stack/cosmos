import { describe, expect, it } from 'vitest'
import { criarBackup, lerBackup, mesclarDicionario, mesclarPorId, nomeArquivo, precisaLembrete } from '../src/dados/backup'
import { notaVazia } from '../src/dados/estado'
import type { EntradaDicionario, Nota } from '../src/dados/tipos'

const DIA = 86_400_000
const nota = (id: string, p: Partial<Nota> = {}): Nota => ({ ...notaVazia(), id, ...p })
const ficha = (id: string, simbolo: string): EntradaDicionario => ({ id, simbolo, termo: simbolo, tipo: 'constante', aridade: 0, definicao: '' })

describe('exportar e importar', () => {
  it('ida e volta preserva tudo', () => {
    const notas = [
      nota('a', { titulo: 'Ax4', formulas: ['A ∉ A'], tags: ['x'], compartimento: 'lei', grau: 'D' }),
      nota('b', { compartimento: 'visao', titular: 'cristãos', formulas: ['A ∈ A'], ativa: false }),
      nota('c', { compartimento: 'fato', fonte: 'https://exemplo', data: '2026-10-01' }),
    ]
    const dic = [ficha('1', 'A'), { ...ficha('2', 'f'), tipo: 'funcao' as const, aridade: 1 }]
    const json = JSON.stringify(criarBackup(notas, dic, 6))
    const r = lerBackup(json)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.backup.notas).toEqual(notas)
    expect(r.backup.dicionario).toEqual(dic)
    expect(r.backup.config.N).toBe(6)
    expect(r.avisos).toEqual([])
  })

  it('leva os conjuntos de dados do Mundo, e as fichas com o tipo de cada argumento', () => {
    const conjunto = {
      id: 'd1',
      nome: 'medidas',
      fonte: 'tabela',
      pasta: 'dados-medidas',
      criadoEm: '2026-10-12T00:00:00.000Z',
      tolerancia: 0.02,
      colunas: [{ nome: 'x', simbolo: 'x', tipo: 'numero' as const }],
      linhas: [['1'], ['2']],
    }
    const dic = [{ ...ficha('t', 'tam'), tipo: 'funcao' as const, aridade: 1, numerico: true, argumentos: ['obj' as const] }]
    const b = criarBackup([], dic, 6, new Date(), [], [conjunto as never])
    const r = lerBackup(JSON.stringify({ ...b, conjuntos: [...b.conjuntos!, { nome: 'sem id' }] }))
    if (!r.ok) throw new Error(r.erro)
    expect(r.backup.conjuntos).toEqual([conjunto])
    expect(r.avisos.some((a) => a.includes('conjunto'))).toBe(true)
    expect(r.backup.dicionario[0]).toMatchObject({ numerico: true, argumentos: ['obj'] })
  })

  it('leva os alvos da caçada de falhas (regras, promessas e achados)', () => {
    const alvo = {
      id: 'alvo-1',
      nome: 'ponte',
      programa: '',
      escopo: '',
      regras: [{ id: 'r1', titulo: 'guarda', formula: '∀x (D(x) ⟹ G(x))', fonte: 'Ponte.sol:10', ativa: true }],
      promessas: [{ id: 'p1', titulo: 'saca', citacao: 'todo depósito pode ser sacado', formula: '∀x (D(x) ⟹ S(x))', fonte: '' }],
      achados: [],
      criadoEm: '2026-10-13T00:00:00.000Z',
      atualizadoEm: '2026-10-13T00:00:00.000Z',
    }
    const b = criarBackup([], [], 6, new Date(), [], [], [alvo])
    const r = lerBackup(JSON.stringify({ ...b, alvos: [...b.alvos!, { nome: 'sem id' }] }))
    if (!r.ok) throw new Error(r.erro)
    expect(r.backup.alvos).toEqual([alvo])
    expect(r.avisos.some((a) => a.includes('alvo'))).toBe(true)
    // backups antigos não têm alvos
    const antigo = lerBackup(JSON.stringify({ ...b, alvos: undefined }))
    expect(antigo.ok && antigo.backup.alvos).toEqual([])
  })

  it('recusa arquivos que não são backup', () => {
    expect(lerBackup('não é json')).toEqual({ ok: false, erro: 'O arquivo não é um JSON válido.' })
    expect(lerBackup('{"foo": 1}').ok).toBe(false)
    expect(lerBackup('{"app":"caderno-logico","versao":2,"notas":[],"dicionario":[]}').ok).toBe(false)
  })

  it('completa campos faltando e ignora itens inválidos, avisando', () => {
    const r = lerBackup(
      JSON.stringify({
        app: 'caderno-logico',
        versao: 1,
        notas: [{ id: 'x', formulas: ['P(a)', 3] }, { titulo: 'sem id' }],
        dicionario: [ficha('1', 'A'), ficha('2', 'A'), { id: '3', simbolo: 'B', tipo: 'outro' }],
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.backup.notas).toHaveLength(1)
    expect(r.backup.notas[0]).toMatchObject({ id: 'x', formulas: ['P(a)'], compartimento: 'lei', grau: 'F', ativa: true, tags: [] })
    expect(r.backup.dicionario.map((e) => e.simbolo)).toEqual(['A'])
    expect(r.avisos).toHaveLength(3)
  })

  it('mesclar atualiza pelo id e evita símbolo duplicado', () => {
    expect(mesclarPorId([nota('a', { titulo: 'velha' }), nota('b')], [nota('a', { titulo: 'nova' }), nota('c')]).map((n) => [n.id, n.titulo])).toEqual([
      ['a', 'nova'],
      ['b', ''],
      ['c', ''],
    ])
    const m = mesclarDicionario([ficha('1', 'A'), ficha('2', 'B')], [ficha('9', 'A')])
    expect(m.map((e) => `${e.id}:${e.simbolo}`).sort()).toEqual(['2:B', '9:A'])
  })

  it('nome do arquivo com a data', () => {
    expect(nomeArquivo(new Date(2026, 9, 9))).toBe('caderno-logico-2026-10-09.json')
  })
})

describe('lembrete de backup a cada 7 dias', () => {
  const agora = 100 * DIA
  it('sem dados, nunca lembra', () => {
    expect(precisaLembrete({ agora, primeiroUso: 0, temDados: false })).toBe(false)
  })
  it('conta a partir do último backup, ou do primeiro uso', () => {
    expect(precisaLembrete({ agora, primeiroUso: agora - 6 * DIA, temDados: true })).toBe(false)
    expect(precisaLembrete({ agora, primeiroUso: agora - 7 * DIA, temDados: true })).toBe(true)
    expect(precisaLembrete({ agora, primeiroUso: 0, ultimoBackup: agora - 3 * DIA, temDados: true })).toBe(false)
    expect(precisaLembrete({ agora, primeiroUso: 0, ultimoBackup: agora - 8 * DIA, temDados: true })).toBe(true)
  })
  it('"lembrar amanhã" adia', () => {
    expect(precisaLembrete({ agora, primeiroUso: 0, adiadoAte: agora + DIA, temDados: true })).toBe(false)
    expect(precisaLembrete({ agora, primeiroUso: 0, adiadoAte: agora - 1, temDados: true })).toBe(true)
  })
})
