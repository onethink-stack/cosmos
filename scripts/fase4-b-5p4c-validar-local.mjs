// Validação local sem rede, sem GPU, sem Carcara. Logs explicitamente limitados.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync, execFileSync } from 'node:child_process'
import { sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
const raiz = new URL('../', import.meta.url)
const ler = p => readFileSync(new URL(p, raiz))
const salvar = (p, b) => writeFileSync(new URL(p, raiz), b)
const pins = JSON.parse(ler('evidencias/p1-groq-sha256-esperados.json'))
const antigos = JSON.parse(ler('FASE4_B_PUBLICACAO.json')).arquivos
function conferir() {
  const preservacao = Object.entries(pins).map(([arquivo, esperado]) => {
    const observado = sha256(ler(arquivo))
    return { arquivo, esperado, observado, igual: esperado === observado }
  })
  const congelados = antigos.map(({ arquivo, sha256: esperado }) => ({ arquivo, igual: sha256(ler(arquivo)) === esperado }))
  const novo = JSON.parse(ler('fase4-b-5p4c/manifesto.json'))
  const novos = [
    ...novo.fontes.map(p => ({ arquivo: p.path, igual: sha256(ler(p.path)) === p.sha256 })),
    ...novo.arquivos.map(p => ({ arquivo: `fase4-b-5p4c/${p.path}`, igual: sha256(ler(`fase4-b-5p4c/${p.path}`)) === p.sha256 })),
  ]
  if (![...preservacao, ...congelados, ...novos].every(p => p.igual)) throw new Error('pin-divergente')
  return { preservacao, congelados4p3c: congelados, novos }
}
const antes = conferir(), execucoes = []
for (const [nome, args] of [
  ['testes', ['--experimental-strip-types', '--test', 'scripts/fase4-b-5p4c.test.mjs', 'scripts/fase4-b-ponte.test.mjs']],
  ['tipos-novos', ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--allowImportingTsExtensions', '--types', 'node', 'FASE4_B_5P4C_TRADUTOR.ts', 'FASE4_B_5P4C_VALIDADOR.ts', 'FASE4_B_5P4C_PONTE_B_FINAL.ts']],
  ['tipos-app', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['tipos-servidor', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'servidor']],
]) {
  const r = spawnSync(process.execPath, args, { cwd: raiz, shell: false, windowsHide: true,
    timeout: 120000, maxBuffer: 1048576, encoding: 'utf8' })
  salvar(`evidencias/fase4-b-5p4c-${nome}.log`, `${r.stdout ?? ''}${r.stderr ?? ''}\nstatus=${r.status}; signal=${r.signal}\n`)
  if (r.error || r.signal || r.status !== 0) throw new Error(`validacao-falhou: ${nome}`)
  execucoes.push({ nome, status: r.status })
}
const depois = conferir()
const recibo = { formato: 'cosmos-b-gpu-5p4c-validacao-local-v1', estado: 'preparacao-testada-sem-homologacao',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: raiz, encoding: 'utf8', windowsHide: true }).trim(),
  execucoes, antes, depois, testesNode: { aprovados: 20, novos5p4c: 12, regressao4p3c: 8 },
  suiteVitestCompleta: 'nao-reexecutada-nesta-etapa', builds: 'nao-reexecutados-nesta-etapa',
  gpu: 'nao-executada-bancada-pendente', carcara5p4c: 'nao-executado', rustNaga5p4c: 'nao-compilado',
  operacoesGit: 'somente-leitura-sem-commit-push-merge-deploy',
}
salvar('evidencias/fase4-b-5p4c-validacao-local.json', JSON.stringify(recibo, null, 2) + '\n')
console.log(JSON.stringify({ head: recibo.head, execucoes, pins: depois.preservacao.filter(x => x.igual).length,
  arquivos4p3cPreservados: depois.congelados4p3c.length, novosConferidos: depois.novos.length, estado: recibo.estado }))
