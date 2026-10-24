// Preparação local explícita. Não compila, não executa GPU, não acessa rede.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { gerarSmt2, traduzir5p4c, sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
import { converter5p4c } from '../FASE4_B_5P4C_PONTE_B_FINAL.ts'
import { fixture5p4c } from './fase4-b-5p4c-fixture.mjs'

const raiz = new URL('../', import.meta.url)
const ler = path => readFileSync(new URL(path, raiz))
const destino = new URL('fase4-b-5p4c/', raiz)
if (existsSync(destino)) throw new Error('destino-deve-ser-novo')
function substituir(texto, pares) {
  for (const [antes, depois] of pares) {
    if (!texto.includes(antes)) throw new Error(`origem-incompativel: ${antes}`)
    texto = texto.replaceAll(antes, depois)
  }
  return texto
}
const kernel = substituir(ler('fase4-b-gpu/kernel.wgsl').toString(), [
  ['34', '75'], ['4096', '1048576'], ['12u', '20u'], ['0xfffu', '0xfffffu'],
  // vec4 imporia alinhamento de struct 16 e tamanho mínimo 624. Usar
  // array<u32,4> mantém header de 16 bytes e struct alinhada a 8: 616 exatos.
  ['cabecalho: vec4<u32>', 'cabecalho: array<u32, 4>'],
  ['cabecalho.x', 'cabecalho[0]'], ['cabecalho.y', 'cabecalho[1]'],
  ['cabecalho.z', 'cabecalho[2]'], ['cabecalho.w', 'cabecalho[3]'],
])
const host = substituir(ler('fase4-b-gpu/src/main.rs').toString(), [
  ['288', '616'], ['16384', '4194304'], ['4096', '1048576'],
  ['0..34', '0..75'], ['[1, 12, 34, 1048576]', '[1, 20, 75, 1048576]'],
  ['!0xfff', '!0xfffff'], ['max_compute_workgroups_per_dimension < 64', 'max_compute_workgroups_per_dimension < 16384'],
  ['dispatch_workgroups(64,', 'dispatch_workgroups(16384,'], ['dispatch-64x64', 'dispatch-16384x64'],
  ['"dispatch":[64,1,1]', '"dispatch":[16384,1,1]'], ['dispatch 64x64', 'dispatch 16384x64'],
  ['COSMOS B GPU', 'COSMOS B GPU 5p4c'],
  ['cosmos-b-gpu-host-observacao-v1', 'cosmos-b-gpu-5p4c-host-observacao-v1'],
  ['assert_eq!(modulo.global_variables.len(), 2);', `assert_eq!(modulo.global_variables.len(), 2);
    let entrada = modulo.global_variables.iter().find(|(_, g)| {
        g.binding.as_ref().is_some_and(|b| b.group == 0 && b.binding == 0)
    }).expect("binding de entrada").1;
    match &modulo.types[entrada.ty].inner {
        wgpu::naga::TypeInner::Struct { span, .. } => assert_eq!(*span, 616, "layout storage deve ter 616 bytes"),
        _ => panic!("entrada deve ser struct"),
    }`],
])
const smt2 = gerarSmt2(), traducao = traduzir5p4c(smt2)
const fixture = fixture5p4c(), ponte = converter5p4c(fixture.smt2, fixture.saida)
const arquivos = new Map([
  ['entrada.smt2', smt2], ['entrada.bin', traducao.buffer],
  ['host/kernel.wgsl', Buffer.from(kernel)], ['host/src/main.rs', Buffer.from(host)],
  ...['Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'].map(p => [`host/${p}`, ler(`fase4-b-gpu/${p}`)]),
  ['sintetico/proof.alethe', ponte.prova],
])
const fontes = ['FASE4_B_5P4C_TRADUTOR.ts', 'FASE4_B_5P4C_VALIDADOR.ts', 'FASE4_B_5P4C_PONTE_B_FINAL.ts',
  'scripts/fase4-b-5p4c-preparar.mjs', 'scripts/fase4-b-5p4c-fixture.mjs', 'scripts/fase4-b-5p4c.test.mjs']
const manifesto = {
  formato: 'cosmos-b-gpu-5p4c-preparacao-v1', estado: 'preparado-local-nao-homologado',
  base4p3c: 'fde305b5106c23f0e4a24cb419ebb19371a89c2d',
  arquitetura: 'GPU testemunhos; CPU serializacao Alethe, sem outro solver',
  variaveis: 20, clausulas: 75, atribuicoes: 1048576, entradaBytes: 616, saidaBytes: 4194304,
  dispatch: [16384, 1, 1], workgroupSize: 64,
  sintetico: { rotulo: 'SINTETICO-NAO-GPU-NAO-CONFERIDO-CARCARA', saidaSha256: ponte.saidaSha256,
    provaBytes: ponte.prova.length, provaSha256: ponte.provaSha256, resolucoes: ponte.resolucoes,
    compartilhamentos: ponte.compartilhamentos, cortes: ponte.cortes, visitas: ponte.visitas,
    clausulasTestemunhadas: ponte.clausulasTestemunhadas },
  limites: { provaBytes: 1048576, processoMs: 20000 },
  execucaoGpu: 'pendente-liberacao-bancada', carcara: 'nao-executado-para-5p4c',
  hostExecutavelSha256: null, saidaGpuSha256: null,
  carcaraPinEsperado: 'fcd06852931d36b13e6d3f7965c81a068f5cfe2f3c5e7da2d91af500f8f1bfda',
  fontes: fontes.map(p => ({ path: p, sha256: sha256(ler(p)) })),
  arquivos: [...arquivos].map(([p, b]) => ({ path: p, bytes: b.length, sha256: sha256(b) })),
}
for (const [p, b] of arquivos) {
  const url = new URL(p, destino)
  mkdirSync(new URL('./', url), { recursive: true }); writeFileSync(url, b, { flag: 'wx' })
}
writeFileSync(new URL('manifesto.json', destino), JSON.stringify(manifesto, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(manifesto, null, 2))
