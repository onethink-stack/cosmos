import { conferirCadeia } from './cadeiaPessoal'
import { conferirFaseCosmos, verificarHashTeoria } from './cadeiaCosmos'
import { PUBKEY_SELO_502426C, verificar } from './selo'
import { VOCAB_COSMOS } from '../dados/vocabularioCosmos'

export const FASES_ASSINADAS_COSMOS = [...VOCAB_COSMOS.fases, 'F5', 'F6', 'F7', 'F8'] as const

export interface ConferenciaElosCosmos { verificado: boolean; detalhe: string; cabeca: string | null }
const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Confere C1–C8 e vincula a cadeia assinada aos hashes atuais e à chave fixada. */
export async function conferirElosCosmos(pacote: unknown, fases: Record<string, unknown>[]): Promise<ConferenciaElosCosmos> {
  const recusa = (detalhe: string): ConferenciaElosCosmos => ({ verificado: false, detalhe, cabeca: null })
  if (!objeto(pacote)) return recusa('não verificado: faltam elos assinados')
  try {
    if (pacote.selo !== VOCAB_COSMOS.selo || !objeto(pacote.cadeia) || pacote.cadeia.chave !== PUBKEY_SELO_502426C) return recusa('Selo ou chave pública divergente da chave fixada para 502426c.')
    if (fases.length !== FASES_ASSINADAS_COSMOS.length || !FASES_ASSINADAS_COSMOS.every((id, i) => fases[i]?.id === id)) return recusa('As fases devem ser exatamente F0–F8, em ordem.')
    const assinados = pacote.elos_assinados
    const elos = pacote.cadeia.elos
    if (!Array.isArray(assinados) || !Array.isArray(elos) || assinados.length !== fases.length || elos.length !== fases.length) return recusa('Quantidade de elos divergente das nove fases.')
    const conferencia = await conferirCadeia(pacote.cadeia)
    if (conferencia.veredito !== 'aceita') return recusa(`${conferencia.motivo}: ${conferencia.detalhe}`)
    for (const [i, fase] of fases.entries()) {
      if (!conferirFaseCosmos(fase).valida || !await verificarHashTeoria(fase)) return recusa(`Hash ou metadados divergentes em ${fase.id}.`)
      const assinado = assinados[i]
      if (!objeto(assinado) || assinado.fase !== fase.id || assinado.hash_teoria !== fase.hash_teoria || assinado.pubkey !== PUBKEY_SELO_502426C || typeof assinado.assinatura !== 'string' || !verificar(String(fase.hash_teoria), assinado.assinatura, PUBKEY_SELO_502426C)) return recusa(`Assinatura do hash inválida ou chave divergente em ${fase.id}.`)
      const registro: unknown = JSON.parse(elos[i].registroTexto)
      if (!objeto(registro) || registro.fase !== fase.id || registro.hash_teoria !== fase.hash_teoria || registro.selo !== VOCAB_COSMOS.selo) return recusa(`O elo assinado não corresponde à fase ${fase.id}.`)
    }
    return { verificado: true, detalhe: '✓ C1-C8 verificado: elos assinados com 502426c', cabeca: conferencia.cabeca }
  } catch { return recusa('Falha ao verificar os elos assinados; nenhum resultado foi aprovado.') }
}
