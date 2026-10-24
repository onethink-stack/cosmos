import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ResultadoCarcara {
  estado: 'verificado' | 'invalido' | 'indisponivel'
  escopo: 'prova_alethe_contra_smtlib'; motivo: string
  hashProva?: string; hashProblema?: string; hashVerificador?: string
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const REGRAS_SHA = 'ffbfc076411a039624a55dfbb9f0c588996aeac10bb8e72161cd64039b071fad'
/** Adaptador CLI local, não serviço público nem sandbox de sistema operacional.
 * Só aceita `valid` do executável explicitamente configurado e pinado pelo operador.
 * Não confunde hash, código de saída zero ou `holey` com prova conferida.
 */
export function conferirAletheLocal(prova: string, problema: string, config: { binario?: string; sha256Binario?: string } = {}): ResultadoCarcara {
  const base = { escopo: 'prova_alethe_contra_smtlib' as const }
  const binario = config.binario ?? process.env.COSMOS_CARCARA_BIN
  const pin = config.sha256Binario ?? process.env.COSMOS_CARCARA_SHA256
  if (!binario || !isAbsolute(binario) || !pin || !/^[a-f0-9]{64}$/.test(pin)) return { ...base, estado: 'indisponivel', motivo: 'Configure executável Carcara absoluto e SHA-256 confiável do binário.' }
  try {
    if (sha(readFileSync(binario)) !== pin) return { ...base, estado: 'indisponivel', motivo: 'Binário diverge do SHA-256 configurado.' }
    const regras = fileURLToPath(new URL('../../especificacao/provas-t1/regras.rare', import.meta.url))
    if (sha(readFileSync(regras)) !== REGRAS_SHA) return { ...base, estado: 'indisponivel', motivo: 'Regras confiáveis divergentes.' }
    for (const f of [prova, problema]) if (!statSync(f).isFile() || statSync(f).size > 1048576) return { ...base, estado: 'invalido', motivo: 'Arquivos devem ter até 1 MiB.' }
    const hashes = { hashProva: sha(readFileSync(prova)), hashProblema: sha(readFileSync(problema)), hashVerificador: pin }
    const saida = execFileSync(binario, ['--no-color', 'check', '--allow-int-real-subtyping', '--expand-let-bindings', '--rare-file', regras, prova, problema], { encoding: 'utf8', timeout: 10000, maxBuffer: 1048576, windowsHide: true })
    const valid = saida.replace(/\x1b\[[0-9;]*m/g, '').trim().split(/\r?\n/)[0] === 'valid'
    return { ...base, ...hashes, estado: valid ? 'verificado' : 'invalido', motivo: valid ? 'Carcara conferiu a prova contra este problema SMT-LIB.' : 'Saída sem veredito valid; não aprovado.' }
  } catch {
    return { ...base, estado: 'indisponivel', motivo: 'Falha, timeout ou erro de leitura/execução; nenhum resultado aprovado.' }
  }
}
