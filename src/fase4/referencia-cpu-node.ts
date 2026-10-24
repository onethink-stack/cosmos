/** Referência CPU local. Não é serviço HTTP, sandbox do SO ou atestação GPU.
 * Executáveis e seus pins vêm exclusivamente do operador local confiável.
 * Hashes vinculam artefatos; somente Carcara real pode conferir a prova.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENTRADA_CPU = fileURLToPath(new URL('./entrada-4-pombos-3-caixas.smt2', import.meta.url))
export const SHA_ENTRADA_CPU = '5ead6b1b65836e0610ab91e657ad35b4c57122211f07126383ade24afd875edd'
export const ARGS_CVC5_CPU = Object.freeze(['--dump-proofs', '--proof-format-mode=alethe', '--seed=0'])
export const LIMITE_CPU = 1048576
export const shaCpu = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type FerramentaCpu = Readonly<{ binario: string; sha256: string }>
export type ConfigCpu = Readonly<{ cvc5: FerramentaCpu; carcara?: FerramentaCpu; prazoMs?: number }>
type CertificadoCpu = {
  formato: 'cosmos-referencia-cpu-v1'; escopo: 'cpu-sem-atestacao-gpu'; entradaSha256: string
  resultado: 'unsat'; provaSha256: string; produtor: 'cvc5'; produtorSha256: string
}
export type ResultadoCpu = {
  estado: 'gerado-nao-verificado' | 'verificado-cpu' | 'invalido' | 'indisponivel'
  motivo: string; gpu: 'pendente'; provaSha256?: string
}
const resultado = (estado: ResultadoCpu['estado'], motivo: string, provaSha256?: string): ResultadoCpu =>
  ({ estado, motivo, gpu: 'pendente', ...(provaSha256 ? { provaSha256 } : {}) })
const serializar = (c: CertificadoCpu) => JSON.stringify(c, null, 2) + '\n'

function prazo(config: ConfigCpu): number {
  const n = config.prazoMs ?? 20000
  if (!Number.isInteger(n) || n < 1 || n > 20000) throw new Error('Prazo inválido')
  return n
}
function lerLimitado(arquivo: string): Buffer {
  const st = lstatSync(arquivo)
  if (!st.isFile() || st.isSymbolicLink() || st.size < 1 || st.size > LIMITE_CPU) throw new Error('Arquivo recusado')
  const bytes = readFileSync(arquivo)
  if (bytes.length > LIMITE_CPU) throw new Error('Arquivo excedente')
  return bytes
}
function conferirFerramenta(f: FerramentaCpu): string {
  if (!f || !isAbsolute(f.binario) || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Ferramenta sem pin confiável')
  // Não aplicar limite de 1 MiB ao executável; as provas/entradas são limitadas.
  const st = lstatSync(f.binario)
  if (!st.isFile() || st.isSymbolicLink() || st.size > 268435456 || shaCpu(readFileSync(f.binario)) !== f.sha256) throw new Error('Ferramenta divergente')
  return realpathSync(f.binario)
}
function executar(binario: string, args: string[], tempo: number, cwd: string): string | null {
  const r = spawnSync(binario, args, {
    cwd, timeout: tempo, killSignal: 'SIGKILL', maxBuffer: LIMITE_CPU,
    windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
    // Não herdar credenciais do processo. SystemRoot é requisito de runtime Windows.
    env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {},
  })
  if (r.error || r.signal || r.status !== 0 || !Buffer.isBuffer(r.stdout) || r.stdout.length > LIMITE_CPU) return null
  try { return new TextDecoder('utf-8', { fatal: true }).decode(r.stdout) } catch { return null }
}
function lerCertificado(bytes: Buffer): CertificadoCpu {
  const c = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as CertificadoCpu
  if (!c || c.formato !== 'cosmos-referencia-cpu-v1' || c.escopo !== 'cpu-sem-atestacao-gpu'
    || c.entradaSha256 !== SHA_ENTRADA_CPU || c.resultado !== 'unsat' || c.produtor !== 'cvc5'
    || !/^[a-f0-9]{64}$/.test(c.provaSha256) || !/^[a-f0-9]{64}$/.test(c.produtorSha256)
    || Object.keys(c).sort().join(',') !== 'entradaSha256,escopo,formato,produtor,produtorSha256,provaSha256,resultado'
    || serializar(c) !== bytes.toString('utf8')) throw new Error('Certificado recusado')
  // A serialização exata acima também recusa chaves JSON duplicadas e campos excedentes.
  return c
}

/** Cria diretório novo e nunca sobrescreve uma entrega existente. Nenhuma rede. */
export function gerarReferenciaCpu(destino: string, config: ConfigCpu): ResultadoCpu {
  try {
    const tempo = prazo(config)
    if (!isAbsolute(destino)) return resultado('invalido', 'Diretório absoluto novo obrigatório.')
    const cvc5 = conferirFerramenta(config.cvc5)
    const entrada = lerLimitado(ENTRADA_CPU)
    if (shaCpu(entrada) !== SHA_ENTRADA_CPU) return resultado('invalido', 'Entrada confiável divergente.')
    // Falha se já existir. Trabalha com cópia pinada para evitar leitura de arquivos históricos.
    mkdirSync(destino)
    writeFileSync(join(destino, 'entrada.smt2'), entrada, { flag: 'wx' })
    const saida = executar(cvc5, [...ARGS_CVC5_CPU, 'entrada.smt2'], tempo, destino)
    if (saida === null) return resultado('indisponivel', 'Produtor falhou, excedeu limite ou prazo; prova não aprovada.')
    const inicio = /^unsat\r?\n/.exec(saida)
    if (!inicio) return resultado('invalido', 'Produtor não retornou UNSAT seguido de prova.')
    const prova = Buffer.from(saida.slice(inicio[0].length), 'utf8')
    if (!prova.length || prova.length > LIMITE_CPU || !prova.toString('utf8').trim().startsWith('(')) return resultado('invalido', 'Prova ausente ou fora do limite.')
    const hash = shaCpu(prova)
    const cert: CertificadoCpu = { formato: 'cosmos-referencia-cpu-v1', escopo: 'cpu-sem-atestacao-gpu',
      entradaSha256: SHA_ENTRADA_CPU, resultado: 'unsat', provaSha256: hash, produtor: 'cvc5', produtorSha256: config.cvc5.sha256 }
    writeFileSync(join(destino, 'proof.alethe'), prova, { flag: 'wx' })
    writeFileSync(join(destino, 'cert.json'), serializar(cert), { flag: 'wx' })
    return resultado('gerado-nao-verificado', 'Prova produzida em CPU; requer conferência independente Carcara.', hash)
  } catch { return resultado('indisponivel', 'Configuração, arquivo ou execução indisponível; nenhum resultado aprovado.') }
}

/** O certificado não escolhe o pin confiável nem o executável do checker.
 * Diretório/binários devem pertencer ao operador local, sem escritor concorrente adversário.
 * Copia bytes conferidos para diretório novo antes de executar o checker.
 */
export function verificarReferenciaCpu(pacote: string, trabalho: string, config: ConfigCpu): ResultadoCpu {
  let cert: CertificadoCpu
  let entrada: Buffer, prova: Buffer
  try {
    prazo(config)
    if (!isAbsolute(pacote) || !isAbsolute(trabalho)) return resultado('invalido', 'Caminhos absolutos obrigatórios.')
    entrada = lerLimitado(join(pacote, 'entrada.smt2'))
    prova = lerLimitado(join(pacote, 'proof.alethe'))
    cert = lerCertificado(lerLimitado(join(pacote, 'cert.json')))
    if (shaCpu(entrada) !== SHA_ENTRADA_CPU || shaCpu(prova) !== cert.provaSha256
      || cert.produtorSha256 !== config.cvc5.sha256) return resultado('invalido', 'Vínculo de entrada, prova ou produtor divergente.')
  } catch { return resultado('invalido', 'Pacote ou prazo inválido; nenhum resultado aprovado.') }
  if (!config.carcara) return resultado('indisponivel', 'Carcara não configurado; hashes não comprovam a prova.', cert.provaSha256)
  try {
    const carcara = conferirFerramenta(config.carcara)
    mkdirSync(trabalho)
    writeFileSync(join(trabalho, 'entrada.smt2'), entrada, { flag: 'wx' })
    writeFileSync(join(trabalho, 'proof.alethe'), prova, { flag: 'wx' })
    // Sem --ignore-unknown-rules, elaboração permissiva ou RARE fornecido pelo produtor.
    const saida = executar(carcara, ['--no-color', 'check', 'proof.alethe', 'entrada.smt2'], prazo(config), trabalho)
    if (saida === null) return resultado('indisponivel', 'Checker falhou, excedeu limite ou prazo; nenhum resultado aprovado.')
    if (saida.trim() !== 'valid') return resultado('invalido', 'Checker não retornou veredito exclusivo valid.')
    return resultado('verificado-cpu', 'Carcara conferiu a prova contra a entrada fixa em CPU; B GPU pendente.', cert.provaSha256)
  } catch { return resultado('indisponivel', 'Checker/configuração indisponível; nenhum resultado aprovado.') }
}
