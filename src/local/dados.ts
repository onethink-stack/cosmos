import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { canonicalizarV2, lerCanonicoV2 } from '../v2/canonico'
import { validarPubkeyLocal } from './protocolo'

export interface RascunhoLocal { id: string; nome: string; formula: string; dominio: string; descricao: string; rascunho: boolean }
export interface ConversaLocal { id: number; pergunta: string; resposta: string }
export interface DadosConta { formato: 'cosmos-dados-conta-v1'; rascunhos: RascunhoLocal[]; conversas: ConversaLocal[]; redeAtiva: string | null }
export interface DadosCifrados { formato: 'cosmos-dados-cifrados-v1'; titular: string; iv: string; cifrado: string }
export const dadosVazios = (): DadosConta => ({ formato: 'cosmos-dados-conta-v1', rascunhos: [], conversas: [], redeAtiva: null })
const campos = (x: object, s: string) => Object.keys(x).sort().join(',') === s
const texto = (x: unknown, max: number) => typeof x === 'string' && x.length > 0 && x.length <= max
export function validarDadosConta(d: DadosConta): void {
  const canonico = canonicalizarV2(d)
  if (canonico.length > 50000 || !d || !campos(d, 'conversas,formato,rascunhos,redeAtiva') || d.formato !== 'cosmos-dados-conta-v1' || !Array.isArray(d.rascunhos) || !Array.isArray(d.conversas) || d.rascunhos.length > 100 || d.conversas.length > 50 || (d.redeAtiva !== null && !/^[a-f0-9]{64}$/.test(d.redeAtiva))) throw new Error('Dados da conta inválidos ou limite de 50 mil caracteres atingido')
  if (d.rascunhos.some(r => !r || !campos(r, 'descricao,dominio,formula,id,nome,rascunho') || !/^D[0-9]{1,8}$/.test(r.id) || !texto(r.nome, 80) || !texto(r.formula, 300) || !texto(r.dominio, 80) || !texto(r.descricao, 300) || r.rascunho !== true) || new Set(d.rascunhos.map(r => r.id)).size !== d.rascunhos.length) throw new Error('Rascunho inválido ou duplicado')
  if (d.conversas.some(c => !c || !campos(c, 'id,pergunta,resposta') || !Number.isSafeInteger(c.id) || c.id < 1 || !texto(c.pergunta, 2000) || !texto(c.resposta, 12000)) || new Set(d.conversas.map(c => c.id)).size !== d.conversas.length) throw new Error('Conversa inválida ou duplicada')
}
export function validarCifraDados(d: DadosCifrados, titular: string): void {
  canonicalizarV2(d); validarPubkeyLocal(titular)
  if (!d || !campos(d, 'cifrado,formato,iv,titular') || d.formato !== 'cosmos-dados-cifrados-v1' || d.titular !== titular || typeof d.iv !== 'string' || !/^[a-f0-9]{24}$/.test(d.iv) || typeof d.cifrado !== 'string' || d.cifrado.length < 32 || d.cifrado.length > 220000 || !/^(?:[a-f0-9]{2})+$/.test(d.cifrado)) throw new Error('Envelope de dados inválido')
}
export async function cifrarDadosConta(dados: DadosConta, chave: CryptoKey, titular: string): Promise<DadosCifrados> {
  validarDadosConta(dados); validarPubkeyLocal(titular)
  const iv = crypto.getRandomValues(new Uint8Array(12)), bytes = new TextEncoder().encode(canonicalizarV2(dados))
  try {
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('COSMOS/DADOS/LOCAL/V1|' + titular) }, chave, bytes)
    return { formato: 'cosmos-dados-cifrados-v1', titular, iv: bytesToHex(iv), cifrado: bytesToHex(new Uint8Array(cifrado)) }
  } finally { bytes.fill(0) }
}
export async function decifrarDadosConta(d: DadosCifrados, chave: CryptoKey, titular: string): Promise<DadosConta> {
  validarCifraDados(d, titular)
  let bytes: Uint8Array | undefined
  try {
    bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(d.iv), additionalData: new TextEncoder().encode('COSMOS/DADOS/LOCAL/V1|' + titular) }, chave, hexToBytes(d.cifrado)))
    const dados = lerCanonicoV2(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as DadosConta
    validarDadosConta(dados); return dados
  } catch { throw new Error('Dados locais não autenticados ou corrompidos; nada foi substituído') }
  finally { bytes?.fill(0) }
}
