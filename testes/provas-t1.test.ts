// Os certificados dos exemplos da t1 (especificacao/provas-t1): cada problema publicado é exatamente o
// texto que a tradução t1 manda ao Z3, e os SHA-256 do registro conferem com os arquivos. Assim uma prova
// fica presa à tradução: se a tradução mudar, este teste falha e as provas têm de ser refeitas. Os modelos dos
// sat passam pela conferência do Caderno, sem busca: o finito, nos sat sem números, e o exato (modelo-exato-t1-v1),
// nos sat com números.
// (A conferência das provas em si é a do Carcara, e a dos modelos e do vínculo também é feita pela implementação
// independente, no fluxo conferir-provas do GitHub.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { init, killThreads } from 'z3-solver'
import type { EntradaDicionario } from '../src/dados/tipos'
import { falhasDoCertificado, type CertificadoDeModelo } from '../src/motor/certificadoModelo'
import { falhasDoModeloExato, FORMATO_EXATO, type ModeloExato } from '../src/motor/modeloExato'
import { analisar, nomesNumericos } from '../src/motor/motor'
import { problemaSmt, VERSAO_TRADUCAO_Z3 } from '../src/motor/z3'
import textoExemplos from '../especificacao/traducao-z3-t1-exemplos.json?raw'
import textoRegistro from '../especificacao/provas-t1/certificados.json?raw'
import regrasRare from '../especificacao/provas-t1/regras.rare?raw'

const NL = String.fromCharCode(10)
const arquivos = import.meta.glob<string>('../especificacao/provas-t1/{problemas,provas}/*', { eager: true, query: '?raw', import: 'default' })
const arquivo = (nome: string) => arquivos[`../especificacao/provas-t1/${nome}`]
const sha256 = async (texto: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))].map((b) => b.toString(16).padStart(2, '0')).join('')

interface Certificado {
  id: string
  formulas: string[]
  fichas: Omit<EntradaDicionario, 'id' | 'termo' | 'definicao'>[]
  traducao: string
  z3: { versao: string; veredito: string }
  problema: { arquivo: string; sha256: string }
  prova: { arquivo: string; sha256: string } | null
  semCertificado?: { cvc5: string }
  modelo?: CertificadoDeModelo | ModeloExato
}
const EXEMPLOS: { z3: string; exemplos: { id: string; formulas: string[]; z3: string; motorFinito: { status: string } | null }[] } =
  JSON.parse(textoExemplos)
const REGISTRO: { traducao: string; regrasRare: { arquivo: string; sha256: string; regras: string[] }; certificados: Certificado[] } =
  JSON.parse(textoRegistro)

describe('certificados da t1: o problema provado é o da tradução', { timeout: 120_000 }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let api: any
  beforeAll(async () => {
    api = await init()
  }, 60_000)
  afterAll(async () => {
    await killThreads(api.em)
  })

  it('um registro por exemplo normativo, com as mesmas fórmulas, a mesma versão e o mesmo veredito', () => {
    expect(REGISTRO.traducao).toBe(VERSAO_TRADUCAO_Z3)
    expect(REGISTRO.certificados.map((c) => c.id)).toEqual(EXEMPLOS.exemplos.map((e) => e.id))
    for (const [i, c] of REGISTRO.certificados.entries()) {
      const e = EXEMPLOS.exemplos[i]
      expect(c.formulas, c.id).toEqual(e.formulas)
      expect(c.z3, c.id).toEqual({ versao: EXEMPLOS.z3, veredito: e.z3 })
      // todo unsat tem prova ou diz por que não tem; sat e unknown não têm prova
      if (e.z3 === 'unsat') expect(!!c.prova !== !!c.semCertificado, c.id).toBe(true)
      else expect(c.prova, c.id).toBeNull()
    }
  })

  it('cada problema é exatamente o texto que a tradução t1 manda ao Z3', () => {
    for (const c of REGISTRO.certificados) {
      const dic: EntradaDicionario[] = c.fichas.map((x) => ({ id: x.simbolo, termo: x.simbolo, definicao: '', ...x }))
      const prontas = analisar(c.formulas, dic, true)
      expect(prontas, c.id).toHaveLength(c.formulas.length)
      const linhas = arquivo(c.problema.arquivo).split(NL)
      const corpo = linhas.slice(linhas.indexOf('(set-logic ALL)') + 1, linhas.indexOf('(check-sat)')).join(NL)
      expect(corpo, c.id).toBe(problemaSmt(api, prontas.map((x) => x.expandida), nomesNumericos(dic)))
    }
  })

  it('os SHA-256 do registro conferem com os problemas, as provas e o arquivo de regras', async () => {
    expect(await sha256(regrasRare)).toBe(REGISTRO.regrasRare.sha256)
    for (const c of REGISTRO.certificados) {
      expect(await sha256(arquivo(c.problema.arquivo)), c.id).toBe(c.problema.sha256)
      if (c.prova) expect(await sha256(arquivo(c.prova.arquivo)), c.id).toBe(c.prova.sha256)
    }
  })

  it('cada sat traz um modelo, que a conferência do Caderno aceita sem busca; com a primeira fórmula negada, recusa', () => {
    for (const [i, c] of REGISTRO.certificados.entries()) {
      const e = EXEMPLOS.exemplos[i]
      if (e.z3 !== 'sat') {
        expect(c.modelo, c.id).toBeUndefined()
        continue
      }
      expect(c.modelo, c.id).toBeDefined()
      const dic: EntradaDicionario[] = c.fichas.map((x) => ({ id: x.simbolo, termo: x.simbolo, definicao: '', ...x }))
      const expandidas = analisar(c.formulas, dic, true).map((x) => x.expandida)
      const [primeira, ...resto] = expandidas
      const negada = [{ k: 'not' as const, f: primeira, pos: 0, end: 0 }, ...resto]
      if (e.motorFinito === null) {
        // com números: o modelo exato (negar um ∃ sobre ℝ também é recusado, pela polaridade)
        expect((c.modelo as ModeloExato).formato, c.id).toBe(FORMATO_EXATO)
        expect(falhasDoModeloExato(c.modelo, expandidas, nomesNumericos(dic)), c.id).toEqual([])
        expect(falhasDoModeloExato(c.modelo, negada, nomesNumericos(dic)), c.id).not.toEqual([])
      } else {
        expect(falhasDoCertificado(c.modelo, expandidas), c.id).toEqual([])
        expect(falhasDoCertificado(c.modelo, negada), c.id).toContain('a fórmula 1 é falsa no mundo 0')
      }
    }
  })

  it('as provas não têm passo sem justificativa, e cada regra RARE que usam está no arquivo de regras', () => {
    const usadas = new Set<string>()
    for (const c of REGISTRO.certificados) {
      if (!c.prova) continue
      const prova = arquivo(c.prova.arquivo)
      expect(prova.match(/:rule (hole|trust)/g), c.id).toBeNull()
      expect(prova.trimEnd().split(NL).pop(), c.id).toMatch(/^\(step \S+ \(cl\) /)
      for (const m of prova.matchAll(/:rule rare_rewrite :args \("([^"]+)"/g)) usadas.add(m[1])
    }
    expect([...usadas].sort()).toEqual(REGISTRO.regrasRare.regras)
    for (const r of REGISTRO.regrasRare.regras) expect(regrasRare, r).toContain(`(declare-rare-rule ${r} `)
  })
})
