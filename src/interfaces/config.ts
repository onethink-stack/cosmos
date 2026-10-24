/** Integrações ausentes: não inventar diretório, endpoint, credencial ou cotação. */
export const provenanceConfig = Object.freeze({
  comprovadosPath: null,
  ragEndpoint: null,
  cosmMarketEndpoint: null,
  mode: 'demo-identificado',
} as const)
export type InterfaceProduto = 'i-ai' | 'lab' | 'terminal' | 'conta'
export function rotaProduto(hash: string, pathname = ''): InterfaceProduto | null {
  const rota = (hash ? hash.replace(/^#\/?/, '') : pathname.replace(/\/$/, '').split('/').at(-1) ?? '').split('?')[0]
  return rota === 'i-ai' || rota === 'lab' || rota === 'terminal' || rota === 'conta' ? rota : null
}
