import nacl from 'tweetnacl'
import pin from '../dados/selo-publico.json'

export const PUBKEY_SELO_502426C = pin.pubkey
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
const deHex = (texto: string) => Uint8Array.from(texto.match(/../g) ?? [], (b) => parseInt(b, 16))
export const gerarKeypair = () => nacl.sign.keyPair()
/** Assina os 64 caracteres hexadecimais do hash, em UTF-8. A chave nunca é empacotada. */
export function assinar(hash_teoria: string, chavePrivada: Uint8Array): string {
  if (!/^[a-f0-9]{64}$/.test(hash_teoria)) throw new Error('hash_teoria deve ser SHA-256 hexadecimal minúsculo.')
  return hex(nacl.sign.detached(new TextEncoder().encode(hash_teoria), chavePrivada))
}
export function verificar(hash: string, assinatura: string, pubkey: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(hash) || !/^[a-f0-9]{128}$/.test(assinatura) || !/^[a-f0-9]{64}$/.test(pubkey)) return false
  try { return nacl.sign.detached.verify(new TextEncoder().encode(hash), deHex(assinatura), deHex(pubkey)) } catch { return false }
}
