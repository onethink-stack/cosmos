import { HDKey } from '@scure/bip32'
import { bech32 } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import { ripemd160 } from '@noble/hashes/legacy.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { canonicalizarV2 } from '../v2/canonico'
import { mensagemOperacaoLocal, type OperacaoLocal, type EloLocal } from '../local/protocolo'

export const CAMINHO_TESTE = "m/44'/1'/0'/0/"
export const FORMATO_COFRE = 'cosmos-hd-teste-v4'
export const ITERACOES = 600000
const encoder = new TextEncoder()
const aad = encoder.encode(`${FORMATO_COFRE}|localnet-cosmos|secp256k1|${CAMINHO_TESTE}|tb1q`)
const VERSOES_TESTE = { private: 0x04358394, public: 0x043587cf }
export interface CofreTeste {
  formato: typeof FORMATO_COFRE; rede: 'localnet-cosmos'; kdf: 'PBKDF2-SHA256'
  iteracoes: typeof ITERACOES; sal: string; iv: string; cifrado: string
}
export interface EnderecoTeste { caminho: string; endereco: string; pubkey: string; indice: number }
export interface PerfilLocal {
  formato: 'cosmos-autoria-local-v4'; escopo: 'autoria-sob-chave-nao-identidade-civil'
  rede: 'localnet-cosmos'; apelido: string; caminho: string; endereco: string; pubkey: string
}
export interface PerfilAssinado { perfil: PerfilLocal; assinatura: string }
function senhaValida(senha: string): void {
  if (typeof senha !== 'string' || senha.length < 12 || senha.length > 256) throw new Error('Use senha de teste entre 12 e 256 caracteres')
}
function validarCofre(c: CofreTeste): void {
  if (!c || Object.getPrototypeOf(c) !== Object.prototype || Object.keys(c).sort().join(',') !== 'cifrado,formato,iteracoes,iv,kdf,rede,sal') throw new Error('Cofre de teste inválido')
  if (Object.values(Object.getOwnPropertyDescriptors(c)).some(d => !('value' in d))) throw new Error('Cofre não admite acessores')
  if (typeof c.sal !== 'string' || typeof c.iv !== 'string' || typeof c.cifrado !== 'string') throw new Error('Campos cifrados devem ser texto hexadecimal')
  if (c.formato !== FORMATO_COFRE || c.rede !== 'localnet-cosmos' || c.kdf !== 'PBKDF2-SHA256' || c.iteracoes !== ITERACOES || !/^[a-f0-9]{32}$/.test(c.sal) || !/^[a-f0-9]{24}$/.test(c.iv) || !/^[a-f0-9]{96}$/.test(c.cifrado)) throw new Error('Parâmetros do cofre inválidos')
}
export function lerCofreTeste(texto: string): CofreTeste {
  if (texto.length > 2048) throw new Error('Cofre excede limite')
  const c: CofreTeste = JSON.parse(texto)
  validarCofre(c)
  // O cofre só é produzido localmente; rejeita texto divergente, inclusive chaves duplicadas.
  if (JSON.stringify(c) !== texto) throw new Error('Serialização do cofre não canônica')
  return c
}
async function chaveAES(senha: string, sal: Uint8Array): Promise<CryptoKey> {
  senhaValida(senha)
  const bytes = encoder.encode(senha)
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey'])
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(sal), iterations: ITERACOES, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  } finally { bytes.fill(0) }
}
/** Seed CSPRNG de 256 bits, sem frase BIP39, importação, log ou retorno em claro. */
export async function criarCofreTeste(senha: string): Promise<CofreTeste> {
  senhaValida(senha)
  const seed = crypto.getRandomValues(new Uint8Array(32))
  const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  try {
    const chave = await chaveAES(senha, sal)
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, chave, seed)
    return { formato: FORMATO_COFRE, rede: 'localnet-cosmos', kdf: 'PBKDF2-SHA256', iteracoes: ITERACOES, sal: bytesToHex(sal), iv: bytesToHex(iv), cifrado: bytesToHex(new Uint8Array(cifrado)) }
  } finally { seed.fill(0) }
}
async function comFilho<T>(cofre: CofreTeste, senha: string, indice: number, usar: (filho: HDKey) => T): Promise<T> {
  validarCofre(cofre)
  if (!Number.isSafeInteger(indice) || indice < 0 || indice >= 0x80000000) throw new Error('Índice HD inválido')
  const chave = await chaveAES(senha, hexToBytes(cofre.sal))
  let seed: Uint8Array | undefined
  const nos: HDKey[] = []
  try {
    seed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(cofre.iv), additionalData: aad }, chave, hexToBytes(cofre.cifrado)))
    if (seed.length !== 32) throw new Error('Seed de teste inválida')
    let no = HDKey.fromMasterSeed(seed, VERSOES_TESTE); nos.push(no)
    for (const i of [44 + 0x80000000, 1 + 0x80000000, 0x80000000, 0, indice]) { no = no.deriveChild(i); nos.push(no) }
    return usar(no)
  } catch { throw new Error('Cofre não autenticado ou operação HD inválida') }
  finally { seed?.fill(0); for (const no of nos) no.wipePrivateData() }
}
/** P2WPKH v0 testnet; somente conversão local, sem consulta/transação Bitcoin. */
export function enderecoTesteDaPubkey(pubkey: Uint8Array): string {
  if (pubkey.length !== 33 || ![2, 3].includes(pubkey[0])) throw new Error('Pubkey comprimida inválida')
  new HDKey({ publicKey: pubkey, versions: VERSOES_TESTE }) // valida ponto secp256k1
  return bech32.encode('tb', [0, ...bech32.toWords(ripemd160(sha256(pubkey)))])
}
const publico = (filho: HDKey, indice: number): EnderecoTeste => ({ indice, caminho: CAMINHO_TESTE + indice, endereco: enderecoTesteDaPubkey(filho.publicKey!), pubkey: bytesToHex(filho.publicKey!) })
export const derivarEnderecoTeste = (cofre: CofreTeste, senha: string, indice: number): Promise<EnderecoTeste> => comFilho(cofre, senha, indice, filho => publico(filho, indice))
/** Chave não extraível para dados da conta, independente da chave de cifra do cofre. */
export async function chaveDadosLocaisTeste(cofre: CofreTeste, senha: string): Promise<CryptoKey> {
  validarCofre(cofre)
  const salDados = sha256(encoder.encode('COSMOS/DADOS/LOCAL/V1|' + cofre.sal)).slice(0, 16)
  return chaveAES(senha, salDados)
}
/** Assinatura com domínio próprio. Não assina transações Bitcoin nem mensagens v1. */
export async function assinarOperacaoLocalTeste(cofre: CofreTeste, senha: string, operacao: OperacaoLocal): Promise<EloLocal> {
  const mensagem = mensagemOperacaoLocal(operacao)
  return comFilho(cofre, senha, 0, filho => {
    if (bytesToHex(filho.publicKey!) !== operacao.autor) throw new Error('Autor não corresponde ao cofre')
    return { operacao, assinatura: bytesToHex(filho.sign(sha256(encoder.encode(mensagem)))) }
  })
}
export async function assinarPerfilLocal(cofre: CofreTeste, senha: string, apelido: string): Promise<PerfilAssinado> {
  if (!/^[\p{L}\p{N}_ -]{1,40}$/u.test(apelido) || apelido.normalize('NFC') !== apelido) throw new Error('Apelido local inválido; use até 40 letras/números em NFC')
  return comFilho(cofre, senha, 0, filho => {
    const p = publico(filho, 0)
    const perfil: PerfilLocal = { formato: 'cosmos-autoria-local-v4', escopo: 'autoria-sob-chave-nao-identidade-civil', rede: 'localnet-cosmos', apelido, caminho: p.caminho, endereco: p.endereco, pubkey: p.pubkey }
    return { perfil, assinatura: bytesToHex(filho.sign(sha256(encoder.encode(canonicalizarV2(perfil))))) }
  })
}
export function verificarPerfilLocal(p: PerfilAssinado): boolean {
  try {
    canonicalizarV2(p) // rejeita acessores sem executá-los, antes de ler o perfil
    if (!p || Object.keys(p).sort().join(',') !== 'assinatura,perfil') return false
    const f = p.perfil
    if (!f || Object.keys(f).sort().join(',') !== 'apelido,caminho,endereco,escopo,formato,pubkey,rede' || f.formato !== 'cosmos-autoria-local-v4' || f.escopo !== 'autoria-sob-chave-nao-identidade-civil' || f.rede !== 'localnet-cosmos' || f.caminho !== CAMINHO_TESTE + '0' || !/^[\p{L}\p{N}_ -]{1,40}$/u.test(f.apelido) || !/^(02|03)[a-f0-9]{64}$/.test(f.pubkey) || !/^[a-f0-9]{128}$/.test(p.assinatura)) return false
    const pub = hexToBytes(f.pubkey)
    if (enderecoTesteDaPubkey(pub) !== f.endereco) return false
    return new HDKey({ publicKey: pub, versions: VERSOES_TESTE }).verify(sha256(encoder.encode(canonicalizarV2(f))), hexToBytes(p.assinatura))
  } catch { return false }
}
