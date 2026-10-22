import { VOCAB_COSMOS } from '../dados/vocabularioCosmos'
import { qsqrt2, toString } from './qsqrt2'

export interface FaseCosmos { id: string; testemunha: unknown; campo: unknown }
export function campoExato(campo: unknown): boolean {
  if (!campo || typeof campo !== 'object' || Array.isArray(campo)) return false
  const c = campo as Record<string, unknown>
  if (Object.keys(c).some((k) => !['a', 'b', 'repr'].includes(k))) return false
  if (typeof c.a !== 'number' || typeof c.b !== 'number') return false
  try { const q = qsqrt2(c.a, c.b); return c.repr === undefined || c.repr === toString(q) } catch { return false }
}
export function validarFaseCosmos(fase: FaseCosmos): { valida: boolean; erros: string[]; aplica: boolean } {
  const aplica = ['F2', 'F3', 'F4', 'F5'].includes(fase.id)
  const erros: string[] = []
  if (aplica) {
    if (!Array.isArray(fase.testemunha) || fase.testemunha.length !== 2 || !VOCAB_COSMOS.testemunha.every((t) => (fase.testemunha as unknown[]).includes(t))) erros.push('A testemunha deve conter exatamente Z35 e Z39.')
    if (!campoExato(fase.campo)) erros.push('O campo deve representar a + b√2 com coeficientes inteiros exatos e repr coerente.')
    else {
      const c = fase.campo as { a: number; b: number; repr?: string }
      if (c.a !== Number(fase.id.slice(1)) - 2 || c.b !== 1 || (fase.id !== 'F5' && c.repr !== toString(c))) erros.push('Coeficientes ou repr não correspondem à fase.')
    }
  }
  return { valida: erros.length === 0, erros, aplica }
}
const TAXONOMIA: Record<string, readonly string[]> = {
  F0: ['hipotese', 'cadeia pessoal', 'cosmos', 'proposta'],
  F1: ['definicao', 'definicao', 'pessoa', 'proposta'],
  F2: ['teorema', 'teorema', 'campo', 'corrobora'],
  F3: ['evidencia', 'evidencia', 'testemunha', 'corroborada'],
  F4: ['fechamento', 'fechamento', 'selo', 'segue'],
  F5: ['entrega', 'entrega', 'entrega', 'entregue'],
  F6: ['multi-pessoa', 'multi-pessoa', 'pessoas', 'proposta'],
  F7: ['verificar selo puro', 'verificacao', 'selo', 'proposta'],
  F8: ['publicar IPFS', 'publicacao', 'IPFS', 'proposta'],
}
export function conferirFaseCosmos(fase: Record<string, unknown>) {
  const campos = Object.keys(fase)
  const campos13Validos = campos.length === 13 && VOCAB_COSMOS.campos13.every((c) => campos.includes(c))
  const seloValido = fase.selo === VOCAB_COSMOS.selo
  const pessoaExigida = ['F1', 'F2', 'F3', 'F4'].includes(String(fase.id))
  const pessoaPresente = fase.pessoa === VOCAB_COSMOS.pessoa
  const testemunhaExigida = ['F2', 'F3', 'F4', 'F5'].includes(String(fase.id))
  const simbolica = validarFaseCosmos({ id: String(fase.id), testemunha: fase.testemunha, campo: fase.campo })
  const erros: string[] = []
  if (!campos13Validos) erros.push('A fase deve conter exatamente os 13 campos oficiais.')
  const taxonomia = TAXONOMIA[String(fase.id)]
  if (!taxonomia) erros.push('Identificador de fase desconhecido.')
  else ['afirmacao', 'tipo', 'dominio', 'estado'].forEach((chave, i) => { if (fase[chave] !== taxonomia[i]) erros.push(`Vocabulário divergente em ${chave}.`) })
  if (!seloValido) erros.push('O selo difere de 502426c.')
  if (pessoaExigida && !pessoaPresente) erros.push('pessoa(φ) ausente ou diferente do vocabulário.')
  if (['F0', 'F5', 'F6', 'F7', 'F8'].includes(String(fase.id)) && fase.pessoa !== null) erros.push('Pessoa deve ser null nesta fase.')
  if (testemunhaExigida) erros.push(...simbolica.erros)
  else if (!Array.isArray(fase.testemunha) || (fase.id === 'F6' ? fase.testemunha.join('/') !== 'Z35/Z39' : fase.testemunha.length !== 0)) erros.push('Testemunhas divergentes.')
  if (!testemunhaExigida && fase.campo !== null) erros.push('Campo deve ser null nesta fase.')
  if (fase.id === 'F5') {
    const c = fase.campo as { a?: unknown; b?: unknown } | null
    if (!c || c.a !== 3 || c.b !== 1) erros.push('F5 exige 3 + 1√2.')
  }
  if (!['aberto', 'fechado'].includes(String(fase.situacao))) erros.push('Situação desconhecida.')
  if (fase.gramatica !== 'm2' || fase.traducao !== 't1') erros.push('Gramática ou tradução divergente.')
  if (typeof fase.hash_teoria !== 'string' || !/^[a-f0-9]{64}$/.test(fase.hash_teoria)) erros.push('hash_teoria deve ser SHA-256 hexadecimal.')
  return { valida: erros.length === 0, erros, campos13Validos, seloValido, pessoaExigida, pessoaPresente, testemunhaExigida, simbolica }
}
/** JSON.stringify dos outros 12 campos na ordem oficial; UTF-8, SHA-256. */
export async function calcularHashTeoria(fase: Record<string, unknown>): Promise<string> {
  const outros = Object.fromEntries(VOCAB_COSMOS.campos13.filter((c) => c !== 'hash_teoria').map((c) => [c, fase[c]]))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(outros)))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export async function verificarHashTeoria(fase: Record<string, unknown>) { return fase.hash_teoria === await calcularHashTeoria(fase) }
export function progressoCosmos(fases: ReadonlyArray<{ situacao: string }>) {
  const total = fases.length
  const fechadas = fases.filter((f) => f.situacao === 'fechado').length
  const abertas = fases.filter((f) => f.situacao === 'aberto').length
  return { total, fechadas, abertas, percentualFechado: total ? Math.round(fechadas / total * 100) : 0, percentualAberto: total ? Math.round(abertas / total * 100) : 0 }
}
