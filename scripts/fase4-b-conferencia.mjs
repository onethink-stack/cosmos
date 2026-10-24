// Ponte sintética e conferência independente de pacote GPU público, modos distintos.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { converterTestemunhosB, gerarTestemunhosSinteticosB, shaB } from './fase4-b-ponte.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const binario = resolve(process.argv[2] ?? '')
const gpu = process.argv[3] ? resolve(process.argv[3]) : null
const destino = join(root, gpu ? 'evidencias/fase4-b-run-gpu' : 'evidencias/fase4-b-run-ponte')
const pin = 'fcd06852931d36b13e6d3f7965c81a068f5cfe2f3c5e7da2d91af500f8f1bfda'
const inicio = performance.now()
mkdirSync(destino)
const recibo = { formato: gpu ? 'cosmos-b-gpu-cert-v1' : 'cosmos-b-ponte-prototipo-v1',
  origemTestemunhos: gpu ? 'pacote-gpu-a-conferir' : 'sintetica-cpu-exclusivamente-para-prototipo',
  estado: 'iniciado', gpuExecutadaNestaConferenciaLinux: false,
  commitConferido: process.env.GITHUB_SHA ?? null, ciRunId: process.env.GITHUB_RUN_ID ?? null,
  carcaraPin: pin, bGpu: 'pendente' }
try {
  if (process.versions.node !== '22.14.0' || process.platform !== 'linux' || shaB(readFileSync(binario)) !== pin) throw new Error('ambiente-ou-pin-divergente')
  const inventario = JSON.parse(readFileSync(join(root, 'FASE4_B_PUBLICACAO.json'), 'utf8'))
  for (const f of inventario.arquivos) {
    if (f.arquivo.includes('..') || !/^(?:fase4-b-gpu\/|scripts\/fase4-b-|evidencias\/fase4-b-|FASE4_B_|\.github\/workflows\/fase4-b-|\.gitattributes$)/.test(f.arquivo)
      || shaB(readFileSync(join(root, f.arquivo))) !== f.sha256) throw new Error('inventario-publicado-divergente')
  }
  recibo.inventarioSha256 = shaB(readFileSync(join(root, 'FASE4_B_PUBLICACAO.json')))
  const smt = readFileSync(join(root, 'src/fase4/entrada-4-pombos-3-caixas.smt2'))
  let saida
  if (!gpu) saida = gerarTestemunhosSinteticosB(smt)
  else {
    const meta = JSON.parse(readFileSync(join(gpu, 'pacote.json'), 'utf8'))
    const requeridos = ['entrada.bin', 'kernel.wgsl', 'host-metadata.json', 'host-build.json', 'host-build-pin.json', 'testemunhos-repeticao.bin']
    if (meta.formato !== 'cosmos-b-gpu-pacote-v1' || meta.gpuFisicaObservada !== true || meta.fallbackCpu !== false
      || !meta.arquivos || JSON.stringify(Object.keys(meta.arquivos).sort()) !== JSON.stringify(requeridos.sort())) throw new Error('pacote-sem-gpu-fisica')
    saida = readFileSync(join(gpu, 'testemunhos.bin'))
    if (meta.saidaSha256 !== shaB(saida) || meta.smt2Sha256 !== shaB(smt)) throw new Error('vinculo-gpu-divergente')
    for (const [nome, hash] of Object.entries(meta.arquivos)) {
      if (!['entrada.bin', 'kernel.wgsl', 'host-metadata.json', 'host-build.json', 'host-build-pin.json', 'testemunhos-repeticao.bin'].includes(nome)
        || shaB(readFileSync(join(gpu, nome))) !== hash) throw new Error('arquivo-gpu-divergente')
    }
    if (!saida.equals(readFileSync(join(gpu, 'testemunhos-repeticao.bin')))) throw new Error('divergencia-repeticao-gpu')
    const host = JSON.parse(readFileSync(join(gpu, 'host-metadata.json'), 'utf8'))
    const build = JSON.parse(readFileSync(join(gpu, 'host-build.json'), 'utf8'))
    const pinHost = JSON.parse(readFileSync(join(gpu, 'host-build-pin.json'), 'utf8'))
    if (!['IntegratedGpu', 'DiscreteGpu'].includes(host.deviceType) || host.vendor !== 4098 || !/vega 8/i.test(host.adapterName)
      || host.backend !== 'Vulkan' || host.fallbackCpu !== false || host.wgpuVersao !== '30.0.1'
      || JSON.stringify(host.dispatch) !== '[64,1,1]' || host.workgroupSize !== 64 || host.bytesReadback !== 16384
      || pinHost.formato !== 'cosmos-b-gpu-host-pin-v1' || build.exeSha256 !== pinHost.exeSha256 || meta.exeSha256 !== pinHost.exeSha256
      || shaB(readFileSync(join(gpu, 'host-build.json'))) !== pinHost.hostBuildSha256
      || build.wgpu !== '30.0.1' || build.rustToolchain !== '1.99.1' || build.target !== 'x86_64-pc-windows-gnu'
      || build.arquivos['kernel.wgsl'] !== pinHost.kernelSha256 || meta.kernelSha256 !== pinHost.kernelSha256
      || shaB(readFileSync(join(gpu, 'kernel.wgsl'))) !== pinHost.kernelSha256
      || build.arquivos['Cargo.lock'] !== pinHost.cargoLockSha256 || meta.cargoLockSha256 !== pinHost.cargoLockSha256) throw new Error('metadados-host-gpu-divergentes')
    if (JSON.stringify(Object.keys(build.arquivos).sort()) !== JSON.stringify(['Cargo.lock', 'Cargo.toml', 'kernel.wgsl', 'rust-toolchain.toml', 'src/main.rs'].sort())) throw new Error('fontes-host-incompletas')
    for (const [nome, hash] of Object.entries(build.arquivos)) if (shaB(readFileSync(join(root, 'fase4-b-gpu', nome))) !== hash) throw new Error('fonte-host-diferente-da-executada')
    recibo.pacoteGpu = meta
  }
  const p = converterTestemunhosB(smt, saida)
  if (gpu && !p.buffer.equals(readFileSync(join(gpu, 'entrada.bin')))) throw new Error('buffer-nao-corresponde-smt2')
  if (gpu && (recibo.pacoteGpu.provaLocalSha256 !== p.provaSha256 || recibo.pacoteGpu.provaLocalBytes !== p.prova.length)) throw new Error('prova-local-e-linux-divergem')
  writeFileSync(join(destino, 'entrada.smt2'), smt, { flag: 'wx' })
  writeFileSync(join(destino, 'entrada.bin'), p.buffer, { flag: 'wx' })
  writeFileSync(join(destino, 'testemunhos.bin'), saida, { flag: 'wx' })
  writeFileSync(join(destino, 'proof.alethe'), p.prova, { flag: 'wx' })
  Object.assign(recibo, { smt2Sha256: p.entradaSha256, bufferEntradaSha256: p.bufferSha256, saidaSha256: p.saidaSha256,
    provaSha256: p.provaSha256, provaBytes: p.prova.length, resolucoes: p.resolucoes, prefixosComprimidos: p.prefixosComprimidos,
    conversorSha256: shaB(readFileSync(join(root, 'scripts/fase4-b-ponte.mjs'))) })
  function conferir(nome) {
    const t = performance.now()
    const r = spawnSync(binario, ['--no-color', 'check', nome, 'entrada.smt2'], { cwd: destino, env: {}, shell: false,
      timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 1048576, stdio: ['ignore', 'pipe', 'pipe'] })
    return { status: r.status, signal: r.signal, erro: r.error?.code ?? null,
      duracaoMs: Math.trunc(performance.now() - t), stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') }
  }
  const positivo = conferir('proof.alethe'); recibo.positivo = positivo
  if (positivo.erro || positivo.signal || positivo.status !== 0 || positivo.stdout.trim() !== 'valid') throw new Error('carcara-positivo-nao-valid')
  // Negativo semântico: inverte somente a polaridade declarada do pivô da
  // primeira resolução, mantendo premissas/conclusão. Original intacto.
  const texto = p.prova.toString()
  const mutante = texto.replace(/(\(step r0 [^\n]+:args \([^ ]+ )true(\)\))/, '$1false$2')
  if (mutante === texto) throw new Error('negativo-nao-construido')
  writeFileSync(join(destino, 'proof-negativa.alethe'), mutante, { flag: 'wx' })
  const negativo = conferir('proof-negativa.alethe'); recibo.negativo = negativo
  if (negativo.erro || negativo.signal || negativo.status !== 1 || negativo.stdout.trim() !== 'invalid'
    || /parser error/i.test(negativo.stderr)) throw new Error('negativo-semantico-nao-recusado')
  recibo.negativosAlethe = [{ caso: 'polaridade-pivo-invertida', provaMutanteSha256: shaB(Buffer.from(mutante)), ...negativo }]
  const premissaOriginal = '(assume a0 (or p0h0 p0h1 p0h2))'
  const premissaFora = texto.replace(premissaOriginal, '(assume a0 false)')
  if (premissaFora === texto || !p.prova.subarray(-2).equals(Buffer.from(')\n'))) throw new Error('mutacoes-nao-construidas')
  for (const [nome, bytes, parser] of [
    ['truncamento', p.prova.subarray(0, p.prova.length - 2), true],
    ['premissa-fora', Buffer.from(premissaFora), false],
  ]) {
    const arquivo = `proof-${nome}.alethe`
    writeFileSync(join(destino, arquivo), bytes, { flag: 'wx' })
    const n = conferir(arquivo)
    recibo.negativosAlethe.push({ caso: nome, provaMutanteSha256: shaB(bytes), ...n })
    if (n.erro || n.signal || n.status !== 1 || n.stdout.trim() !== 'invalid'
      || parser !== /parser error/i.test(n.stderr)
      || (!parser && !/not in original problem's assumptions/.test(n.stderr))) throw new Error('negativo-alethe-nao-recusado')
  }
  recibo.negativosTestemunhos = []
  for (const [caso, valor, offset, esperado] of [
    ['slot-nao-escrito', 0xFFFFFFFE, 0, 'slot-nao-escrito'],
    ['sentinela-sat', 0xFFFFFFFF, 0, 'sentinela-sat'],
    ['indice-invalido', 34, 0, 'indice-fora-do-dominio'],
    ['clausula-verdadeira', 0, 4095 * 4, 'testemunho-nao-falsifica-clausula'],
  ]) {
    const alterado = Buffer.from(saida); alterado.writeUInt32LE(valor, offset)
    let motivo = null
    try { converterTestemunhosB(smt, alterado) } catch (e) { motivo = e.message }
    recibo.negativosTestemunhos.push({ caso, natureza: 'mutacao-intencional-em-copia', hashRecalculado: shaB(alterado), motivo })
    if (motivo !== esperado) throw new Error('negativo-testemunho-nao-recusado')
  }
  recibo.estado = gpu ? 'prova-da-saida-gpu-conferida-linux' : 'ponte-sintetica-conferida-nao-e-execucao-gpu'
  recibo.bGpu = gpu ? 'execucao-local-e-conferencia-linux-registradas-revisao-pendente' : 'pendente'
  console.log(`${recibo.estado}; prova ${p.prova.length} bytes; positivo valid e negativo semântico invalid.`)
} catch (e) {
  recibo.estado = 'nao-aprovado'
  recibo.motivo = e instanceof Error && /^[a-z0-9-]+$/.test(e.message) ? e.message : 'falha-interna'
  process.exitCode = 1; console.error(`B não aprovado: ${recibo.motivo}`)
} finally {
  recibo.duracaoMs = Math.trunc(performance.now() - inicio)
  writeFileSync(join(destino, 'recibo.json'), JSON.stringify(recibo, null, 2) + '\n', { flag: 'wx' })
}
