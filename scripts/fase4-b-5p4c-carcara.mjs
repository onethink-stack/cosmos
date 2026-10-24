// Linux somente. Prototipo sintetico explicitamente separado de qualquer pacote GPU.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { converter5p4c } from '../FASE4_B_5P4C_PONTE_B_FINAL.ts'
import { sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
import { fixture5p4c } from './fase4-b-5p4c-fixture.mjs'

const raiz = fileURLToPath(new URL('../', import.meta.url))
const [binario, pasta] = process.argv.slice(2)
const pin = 'fcd06852931d36b13e6d3f7965c81a068f5cfe2f3c5e7da2d91af500f8f1bfda'
if (!binario || !isAbsolute(binario) || !pasta || process.argv.length !== 4
  || process.platform !== 'linux' || process.versions.node !== '22.14.0'
  || sha256(readFileSync(binario)) !== pin) throw new Error('ambiente-ou-pin-divergente')
const destino = resolve(pasta)
mkdirSync(destino) // destino obrigatoriamente novo; jamais sobrescrever recibos
const recibo = { formato: 'cosmos-b-5p4c-carcara-sintetico-v1', estado: 'iniciado',
  origem: 'sintetica-CPU-nao-GPU', carcaraPin: pin, commit: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null, gpuExecutada: false, negativos: [] }
const gravar = (nome, bytes) => writeFileSync(join(destino, nome), bytes, { flag: 'wx' })
try {
  const inventario = JSON.parse(readFileSync(join(raiz, 'fase4-b-5p4c/manifesto.json')))
  for (const f of inventario.fontes) {
    if (f.path.includes('..') || isAbsolute(f.path) || sha256(readFileSync(join(raiz, f.path))) !== f.sha256) throw new Error('fonte-divergente')
  }
  for (const f of inventario.arquivos) {
    if (f.path.includes('..') || isAbsolute(f.path) || sha256(readFileSync(join(raiz, 'fase4-b-5p4c', f.path))) !== f.sha256) throw new Error('artefato-divergente')
  }
  const { smt2, saida } = fixture5p4c(), ponte = converter5p4c(smt2, saida)
  if (ponte.prova.length > 1048576 || ponte.provaSha256 !== inventario.sintetico.provaSha256) throw new Error('prova-divergente')
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
  Object.assign(recibo, { estado: 'sintetico-verificado-carcara-nao-GPU', provaSha256: ponte.provaSha256,
    provaBytes: ponte.prova.length, resolucoes: ponte.resolucoes, smt2Sha256: ponte.smt2Sha256,
    bufferSha256: ponte.bufferSha256, saidaSinteticaSha256: ponte.saidaSha256 })
} catch (e) {
  recibo.estado = 'falhou'; recibo.motivo = e instanceof Error ? e.message : 'erro'
  process.exitCode = 2
} finally {
  gravar('recibo.json', JSON.stringify(recibo, null, 2) + '\n')
  console.log(JSON.stringify(recibo, null, 2))
}
