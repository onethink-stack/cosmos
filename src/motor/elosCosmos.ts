import { conferirCadeia } from './cadeiaPessoal'
import { conferirFaseCosmos, verificarHashTeoria } from './cadeiaCosmos'
import { PUBKEY_SELO_502426C, verificar } from './selo'
import { VOCAB_COSMOS } from '../dados/vocabularioCosmos'

export const FASES_ASSINADAS_COSMOS = [...VOCAB_COSMOS.fases, 'F5', 'F6', 'F7', 'F8'] as const

export interface ConferenciaElosCosmos {
  verificado: boolean; detalhe: string; cabeca: string | null
  integridadeCadeia?: boolean
  validacaoEnvelopeCompleto?: boolean
}
const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Confere C1–C8 e vincula a cadeia assinada aos hashes atuais e à chave fixada. */
async function conferirIntegridadeCadeiaCosmos(pacote: unknown, fases: Record<string, unknown>[]): Promise<ConferenciaElosCosmos> {
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
    if ('resumo_final' in pacote && pacote.resumo_final !== conferencia.cabeca) return recusa('O resumo final não corresponde à cabeça da cadeia assinada.')
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

/** O envelope v1 continua byte a byte igual; esta função valida também seu escopo externo.
 * O carimbo v1 é somente a declaração histórica "pendente". Uma prova OTS fica em sidecar.
 * Nenhum resultado desta função concede permissão de escrita ou comprova verdade científica.
 */
export async function conferirElosCosmos(pacote: unknown, fases: Record<string, unknown>[]): Promise<ConferenciaElosCosmos> {
  const interna = await conferirIntegridadeCadeiaCosmos(pacote, fases)
  const parcial = { ...interna, integridadeCadeia: interna.verificado, validacaoEnvelopeCompleto: false }
  const recusa = (detalhe: string) => ({ ...parcial, verificado: false, detalhe })
  if (!interna.verificado || !objeto(pacote)) return parcial
  const externo = ['formato', 'pubkey', 'fases', 'carimbo_ots'].some((k) => Object.hasOwn(pacote, k))
  const chaves = externo
    ? ['formato', 'selo', 'pubkey', 'fases', 'elos_assinados', 'cadeia', 'resumo_final', 'carimbo_ots']
    : ['selo', 'elos_assinados', 'cadeia', 'resumo_final']
  if (Object.keys(pacote).length !== chaves.length || !chaves.every((k) => Object.hasOwn(pacote, k))) return recusa('Envelope: campos ausentes ou desconhecidos.')
  const assinados = pacote.elos_assinados as Record<string, unknown>[]
  if (assinados.some((e) => Object.keys(e).length !== 4 || !['fase', 'hash_teoria', 'assinatura', 'pubkey'].every((k) => Object.hasOwn(e, k)))) return recusa('Envelope: metadados de assinatura desconhecidos.')
  if (objeto(pacote.cadeia) && Object.keys(pacote.cadeia).length !== 3) return recusa('Envelope: metadados de cadeia desconhecidos.')
  if (!externo) return parcial
  if (pacote.formato !== 'cosmos-502426c-v1' || pacote.pubkey !== PUBKEY_SELO_502426C || pacote.carimbo_ots !== 'pendente') return recusa('Envelope: formato, chave externa ou declaração OTS divergente da v1.')
  if (!Array.isArray(pacote.fases)) return recusa('Envelope: fases ausentes.')
  const recebida = await conferirIntegridadeCadeiaCosmos(pacote, pacote.fases)
  if (!recebida.verificado) return recusa(`Envelope: ${recebida.detalhe}`)
  return { ...parcial, validacaoEnvelopeCompleto: true }
}
