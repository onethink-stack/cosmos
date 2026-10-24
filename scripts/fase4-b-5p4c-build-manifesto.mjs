import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
const pasta = 'fase4-b-5p4c/host/'
const exe = pasta + 'target/x86_64-pc-windows-gnu/release/cosmos-b-gpu-host.exe'
const lock = readFileSync(pasta + 'Cargo.lock')
if (sha256(lock) !== '9fab7f9f7917878da0adffb178bfc1145937a20b2e565cbbbb8f627cb03c7e82') throw new Error('lock-divergente')
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 20000, maxBuffer: 1048576 }).trim()
const rustc = run('rustup', ['which', '--toolchain', '1.99.1', 'rustc'])
const gcc = realpathSync(run('which', ['x86_64-w64-mingw32-gcc-posix']))
const arquivos = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'kernel.wgsl', 'src/main.rs']
const dlls = run('bash', ['-o', 'pipefail', '-c', "x86_64-w64-mingw32-objdump -p fase4-b-5p4c/host/target/x86_64-pc-windows-gnu/release/cosmos-b-gpu-host.exe | awk '/DLL Name:/ {print $3}'"])
const manifesto = { formato: 'cosmos-b-5p4c-host-build-v1', commit: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null, target: 'x86_64-pc-windows-gnu', rustToolchain: '1.99.1',
  rustc: run('rustc', ['+1.99.1', '-Vv']), rustcBinarioSha256: sha256(readFileSync(rustc)),
  cargo: run('cargo', ['+1.99.1', '--version']), wgpu: '30.0.1',
  linker: run(gcc, ['--version']), linkerBinarioSha256: sha256(readFileSync(gcc)),
  pacotesUbuntu: run('dpkg-query', ['-W', 'gcc-mingw-w64-x86-64-posix', 'mingw-w64-x86-64-dev', 'binutils-mingw-w64-x86-64']),
  rustflags: '-C target-feature=+crt-static', backendCompilado: 'Vulkan',
  arquivos: Object.fromEntries(arquivos.map(f => [f, sha256(readFileSync(pasta + f))])),
  exeSha256: sha256(readFileSync(exe)), exeBytes: readFileSync(exe).length,
  dllsImportadas: dlls.split(/\r?\n/).filter(Boolean), gpuExecutada: false,
  observacao: 'Compilacao cruzada; nao executa GPU nem atesta hardware.' }
writeFileSync(pasta + 'host-build.json', JSON.stringify(manifesto, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(manifesto, null, 2))
