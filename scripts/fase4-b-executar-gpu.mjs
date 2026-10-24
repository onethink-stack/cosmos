// Processo local confiável Windows. Não baixa nem escolhe executável de cliente.
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { traduzirSmt2B, validarTestemunhosB, converterTestemunhosB, shaB } from './fase4-b-ponte.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const ferramenta = resolve(process.argv[2] ?? '')
const destino = resolve(process.argv[3] ?? '')
const incidente = join(root, 'evidencias/fase4-b-incidente-local.json')
const inicio = performance.now()
const limpar = s => String(s ?? '').replaceAll(root, '<workspace>')
try {
  if (process.argv.length !== 4 || process.platform !== 'win32' || process.versions.node !== '22.14.0' || existsSync(destino)) throw new Error('ambiente-ou-destino-invalido')
  const pin = JSON.parse(readFileSync(join(ferramenta, 'host-build-pin.json'), 'utf8'))
  const buildBytes = readFileSync(join(ferramenta, 'host-build.json'))
  const build = JSON.parse(buildBytes)
  const exe = join(ferramenta, 'cosmos-b-gpu-host.exe')
  if (pin.formato !== 'cosmos-b-gpu-host-pin-v1' || shaB(buildBytes) !== pin.hostBuildSha256
    || lstatSync(exe).isSymbolicLink() || shaB(readFileSync(exe)) !== pin.exeSha256 || build.exeSha256 !== pin.exeSha256
    || build.wgpu !== '30.0.1' || build.rustToolchain !== '1.99.1' || build.target !== 'x86_64-pc-windows-gnu'
    || JSON.stringify(Object.keys(build.arquivos).sort()) !== JSON.stringify(['Cargo.lock', 'Cargo.toml', 'kernel.wgsl', 'rust-toolchain.toml', 'src/main.rs'].sort())) throw new Error('pin-host-ou-toolchain-divergente')
  const kernel = readFileSync(join(root, 'fase4-b-gpu/kernel.wgsl'))
  if (shaB(kernel) !== pin.kernelSha256 || build.arquivos['kernel.wgsl'] !== pin.kernelSha256
    || shaB(readFileSync(join(root, 'fase4-b-gpu/Cargo.lock'))) !== pin.cargoLockSha256
    || build.arquivos['Cargo.lock'] !== pin.cargoLockSha256) throw new Error('fontes-ou-lock-divergentes')
  for (const [nome, hash] of Object.entries(build.arquivos)) {
    if (!['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'kernel.wgsl', 'src/main.rs'].includes(nome)
      || shaB(readFileSync(join(root, 'fase4-b-gpu', nome))) !== hash) throw new Error('fonte-host-divergente')
  }
  const smt = readFileSync(join(root, 'src/fase4/entrada-4-pombos-3-caixas.smt2'))
  const t = traduzirSmt2B(smt)
  if (pin.entradaBufferSha256 !== t.bufferSha256) throw new Error('pin-buffer-divergente')
  const trabalho = join(root, 'tmp/fase4-b-execucao-gpu')
  mkdirSync(trabalho)
  writeFileSync(join(trabalho, 'entrada.bin'), t.buffer, { flag: 'wx' })
  const registros = []
  for (let i = 0; i < 2; i++) {
    if (shaB(readFileSync(exe)) !== pin.exeSha256) throw new Error('executavel-alterado-antes-de-executar')
    const dir = join(trabalho, `execucao-${i + 1}`)
    const inicioExec = performance.now()
    const r = spawnSync(exe, [join(trabalho, 'entrada.bin'), dir], { cwd: trabalho, env: { SystemRoot: process.env.SystemRoot },
      shell: false, windowsHide: true, timeout: 20000, killSignal: 'SIGKILL', maxBuffer: 1048576, stdio: ['ignore', 'pipe', 'pipe'] })
    const reg = { execucao: i + 1, status: r.status, signal: r.signal, erro: r.error?.code ?? null,
      stdout: limpar(r.stdout), stderr: limpar(r.stderr), duracaoMs: Math.trunc(performance.now() - inicioExec) }
    registros.push(reg)
    writeFileSync(join(trabalho, `execucao-${i + 1}.json`), JSON.stringify(reg, null, 2) + '\n', { flag: 'wx' })
    if (r.error || r.signal || r.status !== 0) throw new Error('host-gpu-falhou-ou-timeout')
    const meta = JSON.parse(readFileSync(join(dir, 'host-metadata.json'), 'utf8'))
    if (!['IntegratedGpu', 'DiscreteGpu'].includes(meta.deviceType) || meta.vendor !== 4098 || !/vega 8/i.test(meta.adapterName)
      || meta.backend !== 'Vulkan' || meta.fallbackCpu !== false || meta.wgpuVersao !== '30.0.1'
      || JSON.stringify(meta.dispatch) !== '[64,1,1]' || meta.workgroupSize !== 64 || meta.bytesReadback !== 16384) throw new Error('metadados-dispositivo-nao-conferem')
    if (!readFileSync(join(dir, 'entrada.bin')).equals(t.buffer) || !readFileSync(join(dir, 'kernel.wgsl')).equals(kernel)) throw new Error('bytes-executados-divergentes')
    validarTestemunhosB(readFileSync(join(dir, 'testemunhos.bin')), t.clausulas)
  }
  const primeira = join(trabalho, 'execucao-1'), segunda = join(trabalho, 'execucao-2')
  const saida = readFileSync(join(primeira, 'testemunhos.bin'))
  const repeticao = readFileSync(join(segunda, 'testemunhos.bin'))
  if (!saida.equals(repeticao)) throw new Error('divergencia-gpu-byte-a-byte')
  const prova = converterTestemunhosB(smt, saida)
  mkdirSync(destino)
  const arquivos = { 'entrada.bin': t.buffer, 'kernel.wgsl': kernel,
    'testemunhos.bin': saida, 'testemunhos-repeticao.bin': repeticao,
    'host-metadata.json': readFileSync(join(primeira, 'host-metadata.json')),
    'host-build.json': buildBytes, 'host-build-pin.json': readFileSync(join(ferramenta, 'host-build-pin.json')) }
  for (const [nome, bytes] of Object.entries(arquivos)) writeFileSync(join(destino, nome), bytes, { flag: 'wx' })
  const pacote = { formato: 'cosmos-b-gpu-pacote-v1', estado: 'gpu-executada-conferencia-linux-pendente',
    gpuFisicaObservada: true, fallbackCpu: false, smt2Sha256: t.entradaSha256, bufferEntradaSha256: t.bufferSha256,
    saidaSha256: shaB(saida), bytesSaida: saida.length, repeticoesIdenticas: true, exeSha256: pin.exeSha256,
    kernelSha256: pin.kernelSha256, cargoLockSha256: pin.cargoLockSha256, provaLocalSha256: prova.provaSha256, provaLocalBytes: prova.prova.length,
    arquivos: Object.fromEntries(Object.entries(arquivos).filter(([nome]) => nome !== 'testemunhos.bin').map(([nome, b]) => [nome, shaB(b)])),
    execucoesLocais: registros, duracaoTotalMs: Math.trunc(performance.now() - inicio),
    limites: ['Observação operacional local, não atestação criptográfica do hardware.', 'Prova ainda requer Carcara Linux independente.'] }
  writeFileSync(join(destino, 'pacote.json'), JSON.stringify(pacote, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ estado: pacote.estado, gpu: 'AMD Vega 8 / Vulkan', saidaSha256: pacote.saidaSha256,
    bytesSaida: saida.length, repeticoesIdenticas: true, provaBytes: prova.prova.length }))
} catch (e) {
  const motivo = e instanceof Error && /^[a-z0-9-]+$/.test(e.message) ? e.message : 'falha-nao-aprovada'
  if (!existsSync(incidente)) writeFileSync(incidente, JSON.stringify({ formato: 'cosmos-b-gpu-incidente-v1', motivo,
    estado: 'interrompido-contatar-operador', duracaoMs: Math.trunc(performance.now() - inicio), bGpu: 'pendente' }, null, 2) + '\n', { flag: 'wx' })
  console.error(`B GPU interrompido; contatar operador: ${motivo}`); process.exitCode = 2
}
