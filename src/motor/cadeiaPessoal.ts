// A cadeia pessoal (formato cadeia-v1, especificacao/cadeia-v1.md): os registros de uma pessoa, cada um num elo preso
// ao anterior pelo resumo e assinado pela chave dela. Aqui ficam o texto do elo, o resumo, a conferência de uma cadeia
// (C1 a C8) e a comparação de duas versões da mesma cadeia (igual, extensão, encurtada, bifurcada). A conferência não
// confere os registros: isso é a de src/motor/registro.ts.

import { conferirAssinatura, lerChave } from './ed25519'
import { lerJsonEstrito, sha256 } from './registro'

export const FORMATO_CADEIA = 'cadeia-v1'
export const ZEROS = '0'.repeat(64)

export interface Elo {
  indice: number
  anterior: string
  registroTexto: string
  assinatura: string
}
export interface Cadeia {
  formato: typeof FORMATO_CADEIA
  chave: string
  elos: Elo[]
  arquivos?: Record<string, string>
}

export const paraHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
export const deHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16))

/** O texto que a chave assina: cinco linhas terminadas em LF (seção 2 da especificação). */
export async function textoDoElo(chave: string, indice: number, anterior: string, registroTexto: string): Promise<string> {
  const linhas = [FORMATO_CADEIA, `chave ${chave}`, `indice ${indice}`, `anterior ${anterior}`, `registro ${await sha256(registroTexto)}`]
  return linhas.map((l) => l + '\n').join('')
}

/** O elo seguinte de uma cadeia, assinado por `assinar` (o WebCrypto no app; o Node nos geradores). */
export async function novoElo(
  chave: string,
  indice: number,
  anterior: string,
  registroTexto: string,
  assinar: (mensagem: Uint8Array) => Promise<Uint8Array>,
): Promise<{ elo: Elo; resumo: string }> {
  const texto = await textoDoElo(chave, indice, anterior, registroTexto)
  const assinatura = paraHex(await assinar(new TextEncoder().encode(texto)))
  return { elo: { indice, anterior, registroTexto, assinatura }, resumo: await sha256(texto) }
}

export interface ConferenciaDaCadeia {
  veredito: 'aceita' | 'recusada'
  /** o código do primeiro passo que falhou (C1 a C8), ou null */
  motivo: string | null
  /** o índice do elo em que está o defeito, quando está num elo */
  elo: number | null
  detalhe: string
  /** os resumos dos elos conferidos, em ordem */
  resumos: string[]
  /** o resumo da cadeia (o do último elo), se ela é aceita */
  cabeca: string | null
}

const HEX64 = /^[0-9a-f]{64}$/
const HEX128 = /^[0-9a-f]{128}$/
const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const soEstes = (o: Record<string, unknown>, campos: string[]) => Object.keys(o).every((k) => campos.includes(k))

/** A conferência de uma cadeia escrita como texto JSON (o que chega de fora): a leitura estrita, depois o resto. */
export async function conferirCadeiaTexto(texto: string): Promise<ConferenciaDaCadeia> {
  let c: unknown
  try {
    c = lerJsonEstrito(texto)
  } catch (erro) {
    return { veredito: 'recusada', motivo: 'C1', elo: null, detalhe: (erro as Error).message, resumos: [], cabeca: null }
  }
  return conferirCadeia(c)
}

/** A conferência de uma cadeia (seção 4 da especificação). */
export async function conferirCadeia(c: unknown): Promise<ConferenciaDaCadeia> {
  const resumos: string[] = []
  const recusa = (motivo: string, elo: number | null, detalhe: string): ConferenciaDaCadeia => ({ veredito: 'recusada', motivo, elo, detalhe, resumos, cabeca: null })

  // C1 e C2: a forma do arquivo e o formato
  if (!ehObjeto(c)) return recusa('C1', null, 'a cadeia não é um objeto')
  if (!soEstes(c, ['formato', 'chave', 'elos', 'arquivos'])) return recusa('C1', null, 'campo que a cadeia não tem')
  for (const k of ['formato', 'chave', 'elos']) if (!(k in c)) return recusa('C1', null, `falta o campo ${k}`)
  if (typeof c.formato !== 'string') return recusa('C1', null, 'formato é um texto')
  if (typeof c.chave !== 'string' || !HEX64.test(c.chave)) return recusa('C1', null, 'chave: 64 dígitos hexadecimais minúsculos')
  if (!Array.isArray(c.elos) || !c.elos.length) return recusa('C1', null, 'elos é uma lista com pelo menos um elo')
  for (const [i, e] of (c.elos as unknown[]).entries()) {
    if (!ehObjeto(e) || !soEstes(e, ['indice', 'anterior', 'registroTexto', 'assinatura']) || Object.keys(e).length !== 4)
      return recusa('C1', i, 'o elo tem os campos indice, anterior, registroTexto e assinatura, e só eles')
    if (!Number.isInteger(e.indice) || (e.indice as number) < 0) return recusa('C1', i, 'indice é um inteiro')
    if (typeof e.anterior !== 'string' || !HEX64.test(e.anterior)) return recusa('C1', i, 'anterior: 64 dígitos hexadecimais minúsculos')
    if (typeof e.registroTexto !== 'string') return recusa('C1', i, 'registroTexto é um texto')
    if (typeof e.assinatura !== 'string' || !HEX128.test(e.assinatura)) return recusa('C1', i, 'assinatura: 128 dígitos hexadecimais minúsculos')
  }
  if ('arquivos' in c && (!ehObjeto(c.arquivos) || !Object.values(c.arquivos).every((v) => typeof v === 'string')))
    return recusa('C1', null, 'arquivos é um objeto de caminho para texto')
  if (c.formato !== FORMATO_CADEIA) return recusa('C2', null, `formato desconhecido: ${JSON.stringify(c.formato)}`)

  // C3: a chave
  const chave = deHex(c.chave)
  if (!lerChave(chave)) return recusa('C3', null, 'a chave não se lê como ponto, ou não tem ordem L')
  const autor = await sha256(chave)

  // cada elo: o índice, o anterior, o registro, o autor e a assinatura
  let anterior = ZEROS
  for (const [i, e] of (c.elos as Elo[]).entries()) {
    if (e.indice !== i) return recusa('C4', i, `o elo na posição ${i} diz ${e.indice}`)
    if (e.anterior !== anterior) return recusa('C5', i, i ? 'o anterior não é o resumo do elo anterior' : 'o elo 0 tem 64 zeros no anterior')
    let r: unknown
    try {
      r = lerJsonEstrito(e.registroTexto)
    } catch (erro) {
      return recusa('C6', i, `o registro não se lê: ${(erro as Error).message}`)
    }
    if (!ehObjeto(r) || typeof r.autor !== 'string') return recusa('C6', i, 'o registro não é um objeto com autor')
    if (r.autor !== autor) return recusa('C7', i, 'o autor do registro não é o SHA-256 da chave da cadeia')
    const texto = await textoDoElo(c.chave, i, e.anterior, e.registroTexto)
    if (!(await conferirAssinatura(chave, new TextEncoder().encode(texto), deHex(e.assinatura)))) return recusa('C8', i, 'a assinatura não vale para o texto do elo')
    anterior = await sha256(texto)
    resumos.push(anterior)
  }
  return { veredito: 'aceita', motivo: null, elo: null, detalhe: '', resumos, cabeca: anterior }
}

export type RelacaoDeVersoes = 'igual' | 'extensao' | 'encurtada' | 'bifurcada' | 'outra-chave'

/**
 * A relação entre duas versões aceitas de uma cadeia (seção 5 da especificação), pelos resumos dos elos. `elo` é o
 * primeiro índice em que elas bifurcam.
 */
export function compararVersoes(antiga: { chave: string; resumos: string[] }, nova: { chave: string; resumos: string[] }): { relacao: RelacaoDeVersoes; elo: number | null } {
  if (antiga.chave !== nova.chave) return { relacao: 'outra-chave', elo: null }
  const n = Math.min(antiga.resumos.length, nova.resumos.length)
  for (let i = 0; i < n; i++) if (antiga.resumos[i] !== nova.resumos[i]) return { relacao: 'bifurcada', elo: i }
  if (antiga.resumos.length === nova.resumos.length) return { relacao: 'igual', elo: null }
  return { relacao: antiga.resumos.length < nova.resumos.length ? 'extensao' : 'encurtada', elo: null }
}
