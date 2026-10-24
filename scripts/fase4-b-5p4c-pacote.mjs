// Conferencia do envelope publico e dos testemunhos. Nao executa GPU nem gera fixture.
import { converter5p4c } from '../FASE4_B_5P4C_PONTE_B_FINAL.ts'
import { traduzir5p4c, sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'

export function conferirPacote5p4c(lerPacote, lerFonte) {
  const json = nome => JSON.parse(lerPacote(nome).toString('utf8'))
  const pacote = json('pacote.json')
  const esperados = ['entrada.bin', 'kernel.wgsl', 'testemunhos-repeticao.bin', 'host-metadata.json', 'host-build.json', 'host-build-pin.json'].sort()
  if (pacote.formato !== 'cosmos-b-5p4c-gpu-pacote-v1' || pacote.gpuFisicaObservada !== true
    || pacote.fallbackCpu !== false || pacote.repeticoesIdenticas !== true || pacote.bytesSaida !== 4194304
    || JSON.stringify(Object.keys(pacote.arquivos ?? {}).sort()) !== JSON.stringify(esperados)) throw new Error('pacote-invalido')
  for (const nome of esperados) if (sha256(lerPacote(nome)) !== pacote.arquivos[nome]) throw new Error('arquivo-gpu-divergente')
  const saida = lerPacote('testemunhos.bin'), repeticao = lerPacote('testemunhos-repeticao.bin')
  if (saida.length !== 4194304 || repeticao.length !== 4194304 || sha256(saida) !== pacote.saidaSha256 || !saida.equals(repeticao)) throw new Error('saida-ou-repeticao-divergente')
  const host = json('host-metadata.json'), build = json('host-build.json'), pin = json('host-build-pin.json')
  if (host.formato !== 'cosmos-b-gpu-5p4c-host-observacao-v1' || !['IntegratedGpu', 'DiscreteGpu'].includes(host.deviceType)
    || host.vendor !== 4098 || !/vega 8/i.test(host.adapterName) || host.backend !== 'Vulkan' || host.fallbackCpu !== false
    || host.wgpuVersao !== '30.0.1' || JSON.stringify(host.dispatch) !== '[16384,1,1]' || host.workgroupSize !== 64
    || host.bytesReadback !== 4194304 || host.limiteMs !== 20000) throw new Error('dispositivo-nao-conferido')
  const exe = '98b69259443e67dd03731dcb589c162a39ad04054bc4c68b40a77bc3872dd7a6'
  if (build.formato !== 'cosmos-b-5p4c-host-build-v1' || pin.formato !== 'cosmos-b-5p4c-host-pin-v1'
    || pin.exeSha256 !== exe || build.exeSha256 !== exe || pacote.exeSha256 !== exe
    || pin.commit !== '5c7d837b85ef5c4028695a14045c97ec82ff49b1' || build.commit !== pin.commit
    || String(pin.runId) !== '40128153884' || String(build.runId) !== '40128153884'
    || build.rustToolchain !== '1.99.1' || build.wgpu !== '30.0.1' || build.target !== 'x86_64-pc-windows-gnu'
    || sha256(lerPacote('host-build.json')) !== pin.hostBuildSha256) throw new Error('pin-host-divergente')
  const fontes = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml', 'kernel.wgsl', 'src/main.rs'].sort()
  if (JSON.stringify(Object.keys(build.arquivos ?? {}).sort()) !== JSON.stringify(fontes)) throw new Error('fontes-incompletas')
  for (const nome of fontes) if (sha256(lerFonte(`fase4-b-5p4c/host/${nome}`)) !== build.arquivos[nome]) throw new Error('fonte-divergente')
  if (pin.kernelSha256 !== build.arquivos['kernel.wgsl'] || pacote.kernelSha256 !== pin.kernelSha256
    || sha256(lerPacote('kernel.wgsl')) !== pin.kernelSha256 || pin.cargoLockSha256 !== build.arquivos['Cargo.lock']
    || pacote.cargoLockSha256 !== pin.cargoLockSha256) throw new Error('kernel-ou-lock-divergente')
  if (!Array.isArray(pacote.execucoesLocais) || pacote.execucoesLocais.length !== 2 || pacote.execucoesLocais.some((r, i) =>
    r.execucao !== i + 1 || r.status !== 0 || r.signal !== null || r.erro !== null || !Number.isInteger(r.duracaoMs) || r.duracaoMs < 0 || r.duracaoMs >= 20000)) throw new Error('execucoes-incompletas')
  const smt2 = lerFonte('fase4-b-5p4c/entrada.smt2'), t = traduzir5p4c(smt2)
  if (!t.buffer.equals(lerPacote('entrada.bin')) || pin.entradaBufferSha256 !== t.bufferSha256
    || pacote.bufferEntradaSha256 !== t.bufferSha256 || pacote.smt2Sha256 !== t.smt2Sha256) throw new Error('entrada-divergente')
  // Derivar da saida recebida; nenhum acesso ao modulo de fixtures sinteticas.
  const ponte = converter5p4c(smt2, saida)
  if (ponte.provaSha256 !== pacote.provaLocalSha256 || ponte.prova.length !== pacote.provaLocalBytes) throw new Error('prova-local-divergente')
  return { pacote, host, build, pin, ponte, smt2 }
}
