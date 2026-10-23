import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export interface EstadoOts {
  estado: 'pendente' | 'enviado_calendario' | 'confirmado_bitcoin'
  vinculoValido: boolean
  confirmacaoVerificada: boolean
  sha256_alvo: string
  calendarios: string[]
}
/** Somente Node: valida com o parser OTS oficial isolado; não é importado pelo browser. */
export function conferirProvaLocal(prova: Uint8Array, alvo: Uint8Array): EstadoOts {
  if (prova.length > 1048576 || alvo.length > 1048576) throw new Error('Limite OTS excedido')
  const entrada = JSON.stringify({ prova: Buffer.from(prova).toString('base64'), alvo: Buffer.from(alvo).toString('base64') })
  try {
    return JSON.parse(execFileSync('python', [fileURLToPath(new URL('../../scripts/cosmos-ots.py', import.meta.url)), 'inspect'], {
      input: entrada, encoding: 'utf8', timeout: 10000, maxBuffer: 1048576, windowsHide: true,
    })) as EstadoOts
  } catch (erro) {
    const e = erro as { stdout?: string }
    let detalhe = 'cliente oficial indisponível'
    try { detalhe = JSON.parse(e.stdout ?? '{}').erro ?? detalhe } catch { /* saída não confiável */ }
    throw new Error(`Prova OTS recusada: ${detalhe}`)
  }
}
