import { describe, expect, it } from 'vitest'
import { candidatosDeQuem, decidir, perguntaPara, type ParecerZ3 } from '../src/dados/resposta'
import { traduzirComClaude } from '../src/dados/tradutor'
import type { EntradaDicionario } from '../src/dados/tipos'
import type { MundoExplicado, ResultadoPergunta } from '../src/motor/motor'
import type { Tarefa } from '../src/motor/tarefas'

const mundo = { n: 2 } as unknown as MundoExplicado
const unsat = (notas: string[] = ['L1']): ParecerZ3 => ({ resultado: 'unsat', notas })
const sat: ParecerZ3 = { resultado: 'sat', notas: [] }
const unknown: ParecerZ3 = { resultado: 'unknown', notas: [] }
const segue: ResultadoPergunta = { tipo: 'segue', N: 6, K: 1, notas: ['L1', 'L2'] }
const naoSegue: ResultadoPergunta = { tipo: 'nao-segue', N: 6, mundo }
const contradiz: ResultadoPergunta = { tipo: 'contradiz', N: 6, K: 1, notas: ['L3'], mundo }

describe('decidir: só prova, cenário ou "não sei"', () => {
  it('sim e não só com prova do Z3', () => {
    expect(decidir('φ', segue, unsat(['L1']), sat, true)).toMatchObject({ veredito: 'sim', definitiva: true, notas: ['L1'] })
    expect(decidir('φ', contradiz, sat, unsat(['L3']), true)).toMatchObject({ veredito: 'nao', definitiva: true, notas: ['L3'] })
    // o motor finito sozinho nunca dá "sim": fica "provavelmente", sem prova
    expect(decidir('φ', segue, unknown, unknown, true, ['o Z3 não achou prova'])).toMatchObject({
      veredito: 'quase-sim',
      definitiva: false,
      N: 6,
      motivos: ['o Z3 não achou prova'],
    })
    expect(decidir('φ', segue, null, null, true)).toMatchObject({ veredito: 'quase-sim', definitiva: false })
    expect(decidir('φ', contradiz, unknown, unknown, true)).toMatchObject({ veredito: 'quase-nao', definitiva: false })
  })

  it('cenários reais decidem que não decorre', () => {
    expect(decidir('φ', naoSegue, unknown, unknown, true)).toMatchObject({ veredito: 'nao-decidem', definitiva: true, mundo })
    // só o mundo a favor ficou grande demais: não decorre, sem saber se contradiz
    expect(decidir('φ', { ...naoSegue, semMundoAFavor: true }, unknown, unknown, true)).toMatchObject({ veredito: 'nao-decorre', definitiva: true })
    // o Z3 achou um cenário maior em que falha, e o finito um em que vale: não decidem
    expect(decidir('φ', segue, sat, unknown, true)).toMatchObject({ veredito: 'nao-decidem', definitiva: true })
    // com notas de números, o cenário do motor finito não vale (ele as deixou de fora)
    expect(decidir('φ', naoSegue, unknown, unknown, false)).toMatchObject({ veredito: 'nao-sei', definitiva: false })
  })

  it('notas contraditórias e motores em desacordo', () => {
    expect(decidir('φ', segue, unsat(['L1']), unsat(['L2']), true)).toMatchObject({ veredito: 'contraditorias', definitiva: true, notas: ['L1', 'L2'] })
    expect(decidir('φ', { tipo: 'premissas-contraditorias', N: 6 }, unknown, unknown, true)).toMatchObject({ veredito: 'contraditorias', definitiva: false })
    // o Z3 achou modelo: as notas não são contraditórias (só não havia cenário pequeno)
    expect(decidir('φ', { tipo: 'premissas-contraditorias', N: 6 }, sat, unknown, true).veredito).toBe('nao-decorre')
    expect(decidir('φ', naoSegue, unsat(), unknown, true).veredito).toBe('discordam')
    expect(decidir('φ', segue, unknown, unsat(), true).veredito).toBe('discordam')
  })

  it('cenários já conhecidos (guardados pelo conselheiro) valem como os do motor finito', () => {
    expect(decidir('φ', null, null, null, true, [], { falha: mundo, vale: true })).toMatchObject({ veredito: 'nao-decidem', definitiva: true, mundoConhecido: true })
    expect(decidir('φ', null, null, unknown, true, [], { falha: mundo })).toMatchObject({ veredito: 'nao-decorre', definitiva: true })
    expect(decidir('φ', null, null, unsat(['L3']), true, [], { falha: mundo })).toMatchObject({ veredito: 'nao', notas: ['L3'] })
    // um cenário conhecido onde vale contra uma "prova" do contrário: defeito, sem resposta
    expect(decidir('φ', null, unknown, unsat(), true, [], { vale: true }).veredito).toBe('discordam')
    expect(decidir('φ', null, unsat(), unknown, true, [], { falha: mundo }).veredito).toBe('discordam')
  })

  it('sem nada decidido: "não sei" com os motivos', () => {
    expect(decidir('φ', { tipo: 'grande-demais', n: 4 }, null, null, true, ['grande demais'])).toMatchObject({ veredito: 'nao-sei', motivos: ['grande demais'] })
  })
})

const ficha = (simbolo: string, tipo: EntradaDicionario['tipo'], aridade = 0, termo = simbolo): EntradaDicionario => ({
  id: simbolo,
  termo,
  simbolo,
  tipo,
  aridade,
  definicao: '',
})
const dic = [ficha('Socrates', 'constante', 0, 'Sócrates'), ficha('Zeus', 'constante'), ficha('Homem', 'predicado', 1, 'homem'), ficha('Mortal', 'predicado', 1, 'mortal')]

describe('perguntas de "quem"', () => {
  it('testa só os nomes que aparecem nas notas', () => {
    const tarefa: Tarefa = { chave: 'geral', rotulo: 'Leis e fatos', grupos: [{ id: 'L1', rotulo: 'L1', formulas: ['Homem(Socrates)', '∀x (Homem(x) ⟹ Mortal(x))'] }] }
    expect(candidatosDeQuem(tarefa, dic).map((e) => e.simbolo)).toEqual(['Socrates'])
    expect(perguntaPara('Mortal(x)', 'x', 'Socrates', dic)).toBe('Mortal(Socrates)')
    // só a variável livre muda
    expect(perguntaPara('Mortal(x) ∧ ∀x Homem(x)', 'x', 'Socrates', dic)).toBe('Mortal(Socrates) ∧ ∀x Homem(x)')
  })
})

describe('tradutor pelo Claude (API simulada)', () => {
  const resposta = (input: object, status = 200) =>
    new Response(JSON.stringify(status === 200 ? { content: [{ type: 'tool_use', id: 't1', name: 'traduzir', input }] } : { error: { message: 'x' } }), {
      status,
    })

  it('manda o dicionário, pede a ferramenta e confere a fórmula', async () => {
    const pedidos: { url: string; corpo: Record<string, unknown>; headers: Record<string, string> }[] = []
    const buscar = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, corpo: JSON.parse(init.body as string), headers: init.headers as Record<string, string> })
      return resposta({ tipo: 'sim-ou-nao', formula: '∀x (Homem(x) ⟹ Mortal(x))', explicacao: 'todo homem é mortal' })
    }) as typeof fetch
    const r = await traduzirComClaude('Será que todos os seres humanos morrem?', dic, { chave: 'k', modelo: 'claude-opus-5-5' }, undefined, buscar)
    expect(r).toMatchObject({ ok: true, tipo: 'sim-ou-nao', formula: '∀x (Homem(x) ⟹ Mortal(x))', por: 'claude' })
    expect(pedidos[0].url).toBe('https://api.anthropic.com/v1/messages')
    expect(pedidos[0].headers['x-api-key']).toBe('k')
    expect(pedidos[0].corpo.model).toBe('claude-opus-5-5')
    expect(pedidos[0].corpo.tool_choice).toEqual({ type: 'tool', name: 'traduzir' })
    expect(pedidos[0].corpo.system).toContain('Mortal | predicado/1 | mortal')
    // o texto das notas nunca vai
    expect(JSON.stringify(pedidos[0].corpo)).not.toContain('definicao')
  })

  it('fórmula inválida: pede de novo uma vez, com o erro', async () => {
    let n = 0
    const buscar = (async () => resposta(n++ === 0 ? { tipo: 'sim-ou-nao', formula: 'Imortal(Socrates)', explicacao: '' } : { tipo: 'sim-ou-nao', formula: '¬Mortal(Socrates)', explicacao: '' })) as typeof fetch
    const r = await traduzirComClaude('Sócrates é imortal?', dic, { chave: 'k', modelo: 'claude-opus-5-5' }, undefined, buscar)
    expect(n).toBe(2)
    expect(r).toMatchObject({ ok: true, formula: '¬Mortal(Socrates)' })
  })

  it('"quem" com a variável livre, "fora" e chave recusada', async () => {
    const quem = await traduzirComClaude('Quem morre?', dic, { chave: 'k', modelo: 'm' }, undefined, (async () => resposta({ tipo: 'quem', formula: 'Mortal(x)', explicacao: '' })) as typeof fetch)
    expect(quem).toMatchObject({ ok: true, tipo: 'quem', variavel: 'x' })
    const fora = await traduzirComClaude('Que horas são?', dic, { chave: 'k', modelo: 'm' }, undefined, (async () => resposta({ tipo: 'fora', formula: '', explicacao: 'não há horas no dicionário' })) as typeof fetch)
    expect(fora).toMatchObject({ ok: false, explicacao: 'não há horas no dicionário' })
    const recusada = await traduzirComClaude('x', dic, { chave: 'k', modelo: 'm' }, undefined, (async () => resposta({}, 401)) as typeof fetch)
    expect(recusada).toMatchObject({ ok: false, erro: expect.stringContaining('chave') })
  })
})
