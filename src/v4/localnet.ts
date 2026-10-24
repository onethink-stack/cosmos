import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { canonicalizarV2 } from '../v2/canonico'
import { ATORES_DEMO, type EstadoDemo } from '../v3/escrowSimulado'
import { verificarPerfilLocal, type PerfilAssinado } from './carteira'

export const SUPPLY_TESTE = 1000000n
export const SUPPLY_MAX_TESTE = 1000000000n
export function somenteHostLocal(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
}
export interface GenesisTeste {
  formato: 'cosmos-localnet-simulada-v4'; unidade: 'UNIDADE-TESTE-SEM-VALOR'
  supply: string; queimaBps: number; iniciadorPubkey: string; destinatario: typeof ATORES_DEMO[0]
}
export interface LocalnetTeste { genesis: GenesisTeste; hashGenesis: string; estado: EstadoDemo }
/** Mint apenas no genesis de uma simulação nova. Não existe API de remint,
 * emissão Bitcoin, rede pública ou recompensa. Não é consenso entre nós.
 * A assinatura do perfil comprova autoria do perfil, não assinatura do genesis.
 */
export function iniciarLocalnetTeste(perfil: PerfilAssinado, supply = SUPPLY_TESTE, queimaBps = 500): LocalnetTeste {
  if (!verificarPerfilLocal(perfil)) throw new Error('Autoria local inválida')
  if (typeof supply !== 'bigint' || supply < 1n || supply > SUPPLY_MAX_TESTE) throw new Error('Supply de teste fora do limite de 1 a 1 bilhão')
  if (!Number.isSafeInteger(queimaBps) || queimaBps < 0 || queimaBps > 10000) throw new Error('Queima inválida')
  const genesis: GenesisTeste = { formato: 'cosmos-localnet-simulada-v4', unidade: 'UNIDADE-TESTE-SEM-VALOR', supply: String(supply), queimaBps, iniciadorPubkey: perfil.perfil.pubkey, destinatario: ATORES_DEMO[0] }
  const hashGenesis = bytesToHex(sha256(new TextEncoder().encode(canonicalizarV2(genesis))))
  return { genesis, hashGenesis, estado: { parametros: { queimaBps, maxOfertas: 20 }, totalInicial: supply, queimado: 0n, ofertas: [], eventos: [], utxos: [{ id: `genesis-${hashGenesis}`, dono: ATORES_DEMO[0], valor: supply, trava: null }] } }
}
