import { HDKey } from '@scure/bip32'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { canonicalizarV2, lerCanonicoV2 } from '../v2/canonico'

export const FORMATO_LEDGER = 'cosmos-ledger-local-v1'
export const DOMINIO_OPERACAO = 'COSMOS/LOCAL/OPERACAO/V1\n'
export const LIMITE_OPERACOES = 500
const HEX = /^[a-f0-9]{64}$/
export interface OperacaoLocal {
  formato: 'cosmos-operacao-local-v1'; tipo: 'genesis' | 'transferencia'; rede: string
  autor: string; destinatario: string; quantidade: string; indice: number; anterior: string; pedido: string; criadoEm: number
}
export interface EloLocal { operacao: OperacaoLocal; assinatura: string }
export interface LedgerLocal { formato: typeof FORMATO_LEDGER; rede: string; elos: EloLocal[] }
export const hashLocal = (s: string) => bytesToHex(sha256(new TextEncoder().encode(s)))
export function validarPubkeyLocal(pub: string): void {
  if (typeof pub !== 'string' || !/^(02|03)[a-f0-9]{64}$/.test(pub)) throw new Error('Chave pública local inválida')
  new HDKey({ publicKey: hexToBytes(pub) })
}
export function enderecoLocal(pub: string): string { validarPubkeyLocal(pub); return `cosmos-local:${pub}:${hashLocal('COSMOS/LOCAL/ENDERECO/V1|' + pub).slice(0, 8)}` }
export function pubkeyDoEnderecoLocal(endereco: string): string {
  if (!endereco.startsWith('cosmos-local:')) throw new Error('Use endereço cosmos-local:, não endereço Bitcoin ou rede pública')
  const partes = endereco.split(':'), pub = partes[1]
  validarPubkeyLocal(pub)
  if (partes.length !== 3 || enderecoLocal(pub) !== endereco) throw new Error('Checksum do endereço local inválido')
  return pub
}
export function validarOperacaoLocal(o: OperacaoLocal): void {
  canonicalizarV2(o) // antes de ler campos; recusa getters e dados não JSON
  if (!o || Object.keys(o).sort().join(',') !== 'anterior,autor,criadoEm,destinatario,formato,indice,pedido,quantidade,rede,tipo') throw new Error('Campos da operação inválidos')
  if (o.formato !== 'cosmos-operacao-local-v1' || !['genesis', 'transferencia'].includes(o.tipo) || !HEX.test(o.rede) || !HEX.test(o.anterior) || !/^[a-f0-9]{32}$/.test(o.pedido)) throw new Error('Formato ou rede da operação inválidos')
  validarPubkeyLocal(o.autor); validarPubkeyLocal(o.destinatario)
  if (typeof o.quantidade !== 'string' || !/^[1-9][0-9]{0,9}$/.test(o.quantidade) || BigInt(o.quantidade) > 1000000000n || !Number.isSafeInteger(o.indice) || o.indice < 0 || !Number.isSafeInteger(o.criadoEm) || o.criadoEm < 0) throw new Error('Valor ou índice inválidos')
}
export const mensagemOperacaoLocal = (o: OperacaoLocal) => { validarOperacaoLocal(o); return DOMINIO_OPERACAO + canonicalizarV2(o) }
export function verificarEloLocal(e: EloLocal): boolean {
  try {
    canonicalizarV2(e)
    if (Object.keys(e).sort().join(',') !== 'assinatura,operacao' || !/^[a-f0-9]{128}$/.test(e.assinatura)) return false
    return new HDKey({ publicKey: hexToBytes(e.operacao.autor) }).verify(sha256(new TextEncoder().encode(mensagemOperacaoLocal(e.operacao))), hexToBytes(e.assinatura))
  } catch { return false }
}
export const hashEloLocal = (e: EloLocal) => hashLocal(canonicalizarV2(e))
export function conferirLedgerLocal(l: LedgerLocal): { saldos: Map<string, bigint>; supply: bigint; head: string } {
  canonicalizarV2(l)
  if (!l || Object.keys(l).sort().join(',') !== 'elos,formato,rede' || l.formato !== FORMATO_LEDGER || !HEX.test(l.rede) || !Array.isArray(l.elos) || !l.elos.length || l.elos.length > LIMITE_OPERACOES) throw new Error('Ledger local inválido ou limite atingido')
  const saldos = new Map<string, bigint>(), pedidos = new Set<string>()
  let head = '0'.repeat(64), supply = 0n
  l.elos.forEach((e, i) => {
    if (!verificarEloLocal(e)) throw new Error('Assinatura de operação inválida')
    const o = e.operacao, quantidade = BigInt(o.quantidade)
    if (o.rede !== l.rede || o.indice !== i || o.anterior !== head || pedidos.has(o.pedido)) throw new Error('Rede, sequência, anterior ou pedido divergente')
    if (!i) {
      if (o.tipo !== 'genesis' || o.autor !== o.destinatario) throw new Error('Genesis inválido')
      supply = quantidade; saldos.set(o.autor, quantidade)
    } else {
      if (o.tipo !== 'transferencia' || o.autor === o.destinatario) throw new Error('Transferência inválida')
      const saldo = saldos.get(o.autor) ?? 0n
      if (saldo < quantidade) throw new Error('Saldo local insuficiente')
      saldos.set(o.autor, saldo - quantidade); saldos.set(o.destinatario, (saldos.get(o.destinatario) ?? 0n) + quantidade)
    }
    pedidos.add(o.pedido); head = hashEloLocal(e)
  })
  if ([...saldos.values()].reduce((a, b) => a + b, 0n) !== supply) throw new Error('Supply divergente')
  return { saldos, supply, head }
}
export function anexarEloLocal(l: LedgerLocal, e: EloLocal): LedgerLocal {
  conferirLedgerLocal(l)
  const novo: LedgerLocal = { ...l, elos: [...l.elos, e] }; conferirLedgerLocal(novo); return novo
}
export function lerLedgerLocal(texto: string): LedgerLocal {
  const l = lerCanonicoV2(texto) as LedgerLocal; conferirLedgerLocal(l); return l
}
