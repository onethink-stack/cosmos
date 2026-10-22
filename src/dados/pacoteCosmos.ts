import principal from './cadeia-F0-F4.json' with { type: 'json' }
import outras from './cadeia-outras-F5-F8.json' with { type: 'json' }
import assinaturas from './elos-assinados.json' with { type: 'json' }
import chave from './selo-publico.json' with { type: 'json' }

/** Exportação pública verificável, sem acesso à chave privada. */
export const PACOTE_COSMOS = {
  formato: 'cosmos-502426c-v1',
  selo: assinaturas.selo,
  pubkey: chave.pubkey,
  fases: [...principal.fases, ...outras.fases],
  elos_assinados: assinaturas.elos_assinados,
  cadeia: assinaturas.cadeia,
  resumo_final: assinaturas.resumo_final,
  carimbo_ots: 'pendente',
}
