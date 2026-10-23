// Os registros do formato aberto (registro-v1, especificacao/registros-v1.md): a forma canônica e os textos que dão os
// hashes, e a conferência do Caderno em cada exemplo de especificacao/registros-v1/exemplos.json, que tem de dar o
// veredito esperado. A prova Alethe não se confere aqui: é do Carcara, no fluxo conferir-provas do GitHub, que também
// confere os exemplos com a leitura e a tradução independentes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { Formula } from '../src/logica/ast'
import { analisar } from '../src/motor/motor'
import { comoDicionario, compararPontos, conferirRegistro, conferirRegistroTexto, formaCanonica, lerJsonEstrito, sha256, textoDaTeoria, type Ficha } from '../src/motor/registro'
import { problemaSmt } from '../src/motor/z3'
import textoExemplos from '../especificacao/registros-v1/exemplos.json?raw'
import textoCaderno from '../especificacao/registros-v1/lote-cego-1/caderno.json?raw'
import textoLote from '../especificacao/registros-v1/lote-cego-1/entradas.json?raw'

const arquivos = import.meta.glob<string>('../especificacao/registros-v1/arquivos/*', { eager: true, query: '?raw', import: 'default' })
const arquivosDoLote = import.meta.glob<string>('../especificacao/registros-v1/lote-cego-1/arquivos/*', { eager: true, query: '?raw', import: 'default' })
const ler = (texto: string, fichas: Ficha[]): Formula | null => analisar([texto], comoDicionario(fichas), true)[0]?.expandida ?? null
const PQ: Ficha[] = [
  { simbolo: 'P', tipo: 'predicado', aridade: 1 },
  { simbolo: 'Q', tipo: 'predicado', aridade: 1 },
]

describe('a forma canônica e o hash da teoria', () => {
  it('troca as variáveis ligadas por #1, #2… na ordem dos quantificadores, na árvore expandida da m2', () => {
    expect(formaCanonica(ler('∀y (P(y) ⟹ Q(y))', PQ)!)).toBe('(∀ #1 (⟹ (P #1) (Q #1)))')
    expect(formaCanonica(ler('∀x (P(x) ⟹ Q(x))', PQ)!)).toBe('(∀ #1 (⟹ (P #1) (Q #1)))')
    expect(formaCanonica(ler('(∀x P(x)) ∧ (∃x Q(x))', PQ)!)).toBe('(∧ (∀ #1 (P #1)) (∃ #2 (Q #2)))')
  })

  it('o hash da teoria não depende da ordem nem da repetição das premissas', async () => {
    const a = textoDaTeoria(['(P a)', '(Q a)'], PQ)
    expect(a).toBe('teoria-v1\nficha P predicado 1 - -\nficha Q predicado 1 - -\npremissa (P a)\npremissa (Q a)\n')
    expect(await sha256(textoDaTeoria(['(Q a)', '(P a)', '(Q a)'], [...PQ].reverse()))).toBe(await sha256(a))
  })

  it('a leitura do JSON recusa chave repetida em qualquer nível, e lê o resto como o JSON.parse', () => {
    expect(() => lerJsonEstrito('{"a": 1, "b": {"c": 2, "c": 3}}')).toThrow(/chave repetida: c/)
    expect(() => lerJsonEstrito('{"a": 1} x')).toThrow(/sobra/)
    const texto = '{"a": [1, -25, 0, "é\\n\\"", true, null], "b": {}}'
    expect(lerJsonEstrito(texto)).toEqual(JSON.parse(texto))
  })

  it('a leitura do JSON recusa o número com ponto ou expoente, e o que não é JSON (NaN, Infinity)', () => {
    for (const n of ['1.0', '1e0', '-2.5e3', '10E2', 'NaN', 'Infinity']) expect(() => lerJsonEstrito(`{"aridade": ${n}}`), n).toThrow()
  })

  it('ordena pelos pontos de código, não pelas unidades de UTF-16', () => {
    // 𝑥 (U+1D465) vem depois de ｚ (U+FF5A) em pontos de código, e antes em UTF-16
    expect(compararPontos('𝑥', 'ｚ')).toBeGreaterThan(0)
    expect('𝑥' < 'ｚ').toBe(true)
  })
})

describe('os exemplos de registros-v1', { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any
  beforeAll(async () => {
    api = await init()
  }, 60_000)
  afterAll(async () => {
    await killThreads(api.em)
  })

  it('cada exemplo dá o veredito esperado na conferência do Caderno (menos a prova, que é do Carcara)', async () => {
    const { exemplos } = JSON.parse(textoExemplos)
    expect(exemplos.length).toBeGreaterThan(20)
    const amb = {
      ler,
      arquivo: (c: string) => {
        const texto = arquivos[`../especificacao/registros-v1/${c}`]
        return texto === undefined ? null : new TextEncoder().encode(texto)
      },
      traduzir: (fs: Formula[], numericos: Set<string>) => problemaSmt(api, fs, numericos),
    }
    for (const e of exemplos) {
      // um registro dado como texto (R28) é lido sem aceitar chave repetida
      const c = e.registroTexto !== undefined ? await conferirRegistroTexto(e.registroTexto, amb) : await conferirRegistro(e.registro, amb)
      // o defeito R10 está na prova, que só o Carcara confere
      const esperado = e.esperado.veredito === 'aceito' || e.esperado.motivo === 'R10' ? null : e.esperado.motivo
      expect(c.motivo, `${e.id}: ${c.detalhe}`).toBe(esperado)
      if (e.esperado.motivo === 'R10') expect(c.provasSemConferir, e.id).toBeGreaterThan(0)
    }
  })

  it('cada registro do lote cego 1 dá a resposta que o Caderno registrou antes (sem o Carcara)', async () => {
    const { registros } = JSON.parse(textoLote)
    const respostas = new Map(JSON.parse(textoCaderno).resultados.map((r: { id: string }) => [r.id, r]))
    expect(registros.length).toBe(62)
    const amb = {
      ler,
      arquivo: (c: string) => {
        const texto = arquivosDoLote[`../especificacao/registros-v1/lote-cego-1/${c}`]
        return texto === undefined ? null : new TextEncoder().encode(texto)
      },
      traduzir: (fs: Formula[], numericos: Set<string>) => problemaSmt(api, fs, numericos),
    }
    for (const e of registros) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r: any = respostas.get(e.id)
      const c = await conferirRegistroTexto(e.registroTexto, amb)
      // a pendente é a que só tinha a prova por conferir, e a prova é do Carcara
      expect(c.motivo, `${e.id}: ${c.detalhe}`).toBe(r.veredito === 'recusado' ? r.motivo : null)
      if (r.veredito !== 'recusado') expect(c.provasSemConferir > 0, e.id).toBe(r.veredito === 'pendente')
    }
  })
})
