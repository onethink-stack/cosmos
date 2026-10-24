import { canonicalizarV2, lerCanonicoV2 } from '../v2/canonico'
import { lerCofreTeste, verificarPerfilLocal, type CofreTeste, type PerfilAssinado } from '../v4/carteira'
import { conferirLedgerLocal, hashLocal, type LedgerLocal } from './protocolo'
import { validarCifraDados, type DadosCifrados } from './dados'

export interface BackupConta {
  formato: 'cosmos-backup-local-v1'; cofre: CofreTeste; perfil: PerfilAssinado
  dados: DadosCifrados | null; ledger: LedgerLocal | null; resumo: string
}
export function criarBackupConta(cofre: CofreTeste, perfil: PerfilAssinado, dados: DadosCifrados | null, ledger: LedgerLocal | null): BackupConta {
  const corpo = { formato: 'cosmos-backup-local-v1' as const, cofre, perfil, dados, ledger }
  const b = { ...corpo, resumo: hashLocal(canonicalizarV2(corpo)) }; validarBackupConta(b); return b
}
export function validarBackupConta(b: BackupConta): void {
  canonicalizarV2(b)
  if (!b || Object.keys(b).sort().join(',') !== 'cofre,dados,formato,ledger,perfil,resumo' || b.formato !== 'cosmos-backup-local-v1' || typeof b.resumo !== 'string' || !/^[a-f0-9]{64}$/.test(b.resumo) || !verificarPerfilLocal(b.perfil)) throw new Error('Backup local inválido')
  lerCofreTeste(JSON.stringify(b.cofre))
  const { resumo, ...corpo } = b
  if (hashLocal(canonicalizarV2(corpo)) !== resumo) throw new Error('Resumo do backup divergente')
  if (b.dados !== null) validarCifraDados(b.dados, b.perfil.perfil.pubkey)
  if (b.ledger !== null) conferirLedgerLocal(b.ledger)
}
export function lerBackupConta(texto: string): BackupConta {
  const b = lerCanonicoV2(texto) as BackupConta; validarBackupConta(b); return b
}
