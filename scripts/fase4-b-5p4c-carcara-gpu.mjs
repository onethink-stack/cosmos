// Linux somente. Conferencia de bytes reais GPU; nao importa nem gera fixtures sinteticas.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conferirPacote5p4c } from './fase4-b-5p4c-pacote.mjs'
import { sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
import { validar5p4c } from '../FASE4_B_5P4C_VALIDADOR.ts'

const raiz = fileURLToPath(new URL('../', import.meta.url))
const [binario, pasta, pacoteDir] = process.argv.slice(2)
const pin = 'fcd06852931d36b13e6d3f7965c81a068f5cfe2f3c5e7da2d91af500f8f1bfda'
if (!binario || !isAbsolute(binario) || !pasta || process.argv.length !== 5 || !pacoteDir
  || process.platform !== 'linux' || process.versions.node !== '22.14.0'
  || sha256(readFileSync(binario)) !== pin) throw new Error('ambiente-ou-pin-divergente')
const destino = resolve(pasta)
mkdirSync(destino) // destino obrigatoriamente novo; jamais sobrescrever recibos
const recibo = { formato: 'cosmos-b-5p4c-gpu-cert-v1', estado: 'iniciado',
  origem: 'testemunhos-GPU-pacote-publico', carcaraPin: pin, commit: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null, gpuExecutadaNesteRunner: false, negativos: [] }
const gravar = (nome, bytes) => writeFileSync(join(destino, nome), bytes, { flag: 'wx' })
try {
  const inventario = JSON.parse(readFileSync(join(raiz, 'fase4-b-5p4c/manifesto.json')))
  for (const f of inventario.fontes) {
    if (f.path.includes('..') || isAbsolute(f.path) || sha256(readFileSync(join(raiz, f.path))) !== f.sha256) throw new Error('fonte-divergente')
  }
  for (const f of inventario.arquivos) {
    if (f.path.includes('..') || isAbsolute(f.path) || sha256(readFileSync(join(raiz, 'fase4-b-5p4c', f.path))) !== f.sha256) throw new Error('artefato-divergente')
  }
  const verificado = conferirPacote5p4c(n => readFileSync(join(resolve(pacoteDir), n)), n => readFileSync(join(raiz, n)))
  const { smt2, ponte } = verificado
  recibo.pacoteGpu = verificado.pacote
  recibo.dispositivoObservado = verificado.host
  recibo.exeSha256 = verificado.pin.exeSha256
  recibo.limites = ['Instancia fixa 5p/4c, nao SMT geral.', 'Observacao GPU operacional nao e atestacao criptografica de hardware.', 'Sem OTS/ancora, sem homologacao Windows.']
  if (ponte.prova.length > 1048576) throw new Error('prova-divergente')
  gravar('entrada.smt2', smt2); gravar('proof.alethe', ponte.prova)
  function conferir(nome) {
    const r = spawnSync(binario, ['--no-color', 'check', nome, 'entrada.smt2'], {
      cwd: destino, env: {}, shell: false, timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 1048576,
      stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    })
    return { status: r.status, signal: r.signal, erro: r.error?.code ?? null, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  recibo.positivo = conferir('proof.alethe')
  if (recibo.positivo.status !== 0 || recibo.positivo.signal || recibo.positivo.erro || recibo.positivo.stdout.trim() !== 'valid') throw new Error('positivo-nao-valid')
  const texto = ponte.prova.toString()
  const pivo = texto.replace(/(\(step r0 [^\n]+:args \([^ ]+ )true(\)\))/, '$1false$2')
  const premissa = texto.replace('(assume a0 (or p0h0 p0h1 p0h2 p0h3))', '(assume a0 false)')
  if (pivo === texto || premissa === texto) throw new Error('negativo-nao-construido')
  for (const [nome, bytes, diagnostico] of [
    ['pivo', Buffer.from(pivo), /pivot was not found/],
    ['premissa', Buffer.from(premissa), /not in original problem/],
    ['truncada', ponte.prova.subarray(0, ponte.prova.length - 2), /EOF/],
  ]) {
    const arquivo = `proof-${nome}.alethe`; gravar(arquivo, bytes)
    const r = conferir(arquivo)
    recibo.negativos.push({ caso: nome, sha256: sha256(bytes), ...r })
    if (r.status !== 1 || r.signal || r.erro || r.stdout.trim() !== 'invalid' || !diagnostico.test(r.stderr)) throw new Error(`negativo-nao-recusado: ${nome}`)
  }
  recibo.negativosTestemunhos = []
  const saidaOriginal = readFileSync(join(resolve(pacoteDir), 'testemunhos.bin'))
  for (const [caso, valor, esperado] of [
    ['slot-nao-escrito', 0xfffffffe, 'slot-nao-escrito'],
    ['sentinela-sat', 0xffffffff, 'sentinela-sat'],
    ['indice-75', 75, 'indice-fora-do-dominio'],
    ['clausula-verdadeira', 0, 'testemunho-nao-falsifica-clausula'],
  ]) {
    const mutante = Buffer.from(saidaOriginal)
    mutante.writeUInt32LE(valor, mutante.length - 4)
    let observado = null
    try { validar5p4c(smt2, mutante) } catch (e) { observado = e instanceof Error ? e.message : 'erro' }
    recibo.negativosTestemunhos.push({ caso, sha256Recalculado: sha256(mutante), esperado, observado })
    if (observado !== esperado) throw new Error('negativo-testemunho-nao-recusado')
  }
  Object.assign(recibo, { estado: 'prova-gpu-5p4c-verificada-carcara', provaSha256: ponte.provaSha256,
    provaBytes: ponte.prova.length, resolucoes: ponte.resolucoes, smt2Sha256: ponte.smt2Sha256,
    bufferSha256: ponte.bufferSha256, saidaGpuSha256: ponte.saidaSha256 })
} catch (e) {
  recibo.estado = 'falhou'; recibo.motivo = e instanceof Error ? e.message : 'erro'
  process.exitCode = 2
} finally {
  gravar('recibo.json', JSON.stringify(recibo, null, 2) + '\n')
  console.log(JSON.stringify(recibo, null, 2))
}
