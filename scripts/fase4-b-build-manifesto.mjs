import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { shaB } from './fase4-b-ponte.mjs'
const pasta = 'fase4-b-gpu/'
const exe = pasta + 'target/x86_64-pc-windows-gnu/release/cosmos-b-gpu-host.exe'
const lock = readFileSync(pasta + 'Cargo.lock')
const fonteWgpu = lock.toString().split('[[package]]').find(s => /name = "wgpu"/.test(s))
if (!fonteWgpu?.includes('version = "30.0.1"') || !fonteWgpu.includes('527ccdf43dd5b2e8676eed9984ce00e2bbb0a1b85b70c1969dcb6cd2eb55ab9e')) throw new Error('wgpu-lock-divergente')
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', timeout: 20000, maxBuffer: 1048576 }).trim()
const rustc = run('rustup', ['which', '--toolchain', '1.99.1', 'rustc'])
const gcc = realpathSync(run('which', ['x86_64-w64-mingw32-gcc-posix']))
const arquivos = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'kernel.wgsl', 'src/main.rs']
const objdump = run('x86_64-w64-mingw32-objdump', ['-p', exe])
const manifesto = { formato: 'cosmos-b-gpu-host-build-v1', commit: process.env.GITHUB_SHA ?? null,
  runId: process.env.GITHUB_RUN_ID ?? null, target: 'x86_64-pc-windows-gnu', rustToolchain: '1.99.1',
  rustc: run('rustc', ['+1.99.1', '-Vv']), rustcBinarioSha256: shaB(readFileSync(rustc)),
  cargo: run('cargo', ['+1.99.1', '--version']), wgpu: '30.0.1',
  wgpuCrateSha256: '527ccdf43dd5b2e8676eed9984ce00e2bbb0a1b85b70c1969dcb6cd2eb55ab9e',
  linker: run(gcc, ['--version']), linkerBinarioSha256: shaB(readFileSync(gcc)),
  pacotesUbuntu: run('dpkg-query', ['-W', 'gcc-mingw-w64-x86-64-posix', 'mingw-w64-x86-64-dev', 'binutils-mingw-w64-x86-64']),
  rustflags: '-C target-feature=+crt-static', backendCompilado: 'Vulkan',
  arquivos: Object.fromEntries(arquivos.map(f => [f, shaB(readFileSync(pasta + f))])),
  exeSha256: shaB(readFileSync(exe)), exeBytes: readFileSync(exe).length,
  dllsImportadas: [...objdump.matchAll(/DLL Name:\s*([^\r\n]+)/g)].map(m => m[1].trim()),
  kernelExecutado: false, observacao: 'Compilação cruzada; não executa GPU no runner nem constitui atestação de hardware.' }
writeFileSync(pasta + 'host-build.json', JSON.stringify(manifesto, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ exeSha256: manifesto.exeSha256, cargoLockSha256: manifesto.arquivos['Cargo.lock'], kernelSha256: manifesto.arquivos['kernel.wgsl'], dlls: manifesto.dllsImportadas }))
