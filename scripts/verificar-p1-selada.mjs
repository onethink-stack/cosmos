// Verificação de artefatos locais/CI; sem rede, dotenv, credenciais ou execução de modelos.
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, relative } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const sha = b => createHash('sha256').update(b).digest('hex')
const argumentos = process.argv.slice(2)
const opcoes = new Map()
for (let i = 0; i < argumentos.length; i += 2) {
  const k = argumentos[i], v = argumentos[i + 1]
  if (!['--resultados', '--saida'].includes(k) || !v || opcoes.has(k)) throw new Error('Argumentos inválidos')
  opcoes.set(k, v)
}
function caminhoLocal(p) {
  const abs = resolve(root, p), rel = relative(root, abs).replaceAll('\\', '/')
  if (rel.startsWith('../') || /^(privado|\.git|\.env)(\/|$)/i.test(rel) || rel.includes('/.env')) throw new Error('Caminho fora do escopo')
  return abs
}
function conferirSuite(s) {
  if (s.success !== true || s.numTotalTests !== 995 || s.numPassedTests !== 995 || s.numFailedTests !== 0
      || s.numPendingTests !== 0 || s.numTodoTests !== 0 || !Array.isArray(s.testResults) || s.testResults.length !== 65
      || s.testResults.some(t => t.status !== 'passed' || !Array.isArray(t.assertionResults) || t.assertionResults.some(a => a.status !== 'passed')))
    throw new Error('Suíte diverge de 995/995, 65 arquivos e zero pulados')
}
try {
  const stats = JSON.parse(await readFile(caminhoLocal(opcoes.get('--resultados') ?? 'tmp/p1-ci-testes.json'), 'utf8'))
  conferirSuite(stats)
  const pins = JSON.parse(await readFile(new URL('../evidencias/p1-groq-sha256-esperados.json', import.meta.url), 'utf8'))
  if (Object.keys(pins).length !== 13) throw new Error('Inventário deve conter 13 hashes')
  const preservacao = []
  for (const [arquivo, esperado] of Object.entries(pins)) {
    if (!/^[a-f0-9]{64}$/.test(esperado)) throw new Error('SHA esperado inválido')
    const atual = sha(await readFile(caminhoLocal(arquivo)))
    preservacao.push({ arquivo, esperado, atual, identico: atual === esperado })
  }
  if (preservacao.some(p => !p.identico)) throw new Error('Preservação 13/13 falhou')
  // O mesmo conjunto de provas usado como verificador público na Fase 3.
  const base = '17a016817c539658d4a92c01d8cb5284333ff115'
  execFileSync('git', ['diff', '--exit-code', base, 'HEAD', '--', 'especificacao/provas-t1', 'especificacao/registros-v1'], { cwd: root, stdio: 'pipe' })
  // Somente fontes explicitamente selecionadas; nunca varrer .env, privado/ ou tmp/.
  const inventario = JSON.parse(await readFile(new URL('../COMMIT_P1_ARQUIVOS.json', import.meta.url), 'utf8'))
  for (const p of inventario.arquivos) {
    if (!/\.(?:[cm]?[jt]sx?|yml|html)$/.test(p)) continue
    const fonte = await readFile(caminhoLocal(p), 'utf8')
    if (/\b(?:import\.meta\.env|process\.env)\.VITE_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|BEARER|SEED)\b/.test(fonte)
        || /\bVITE_[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|BEARER|SEED)\s*[:=]\s*['"`][^'"`]+['"`]/.test(fonte)) throw new Error('Referência VITE sensível na seleção')
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const resultado = { formato: 'cosmos-p1-selada-v1', commit, verificadorSha256: sha(await readFile(fileURLToPath(import.meta.url))),
    seloHistorico: '502426c', verificadorPublicoBase: base, ciHistorica: 39664843135,
    testes: { aprovados: 995, total: 995, arquivos: 65, falhas: 0, pulados: 0 }, preservacao,
    limites: 'Sem prova de ausência universal de segredos: varredura estática limitada às fontes selecionadas. Sem chamada Groq, Fase 4 ou deploy.' }
  await writeFile(caminhoLocal(opcoes.get('--saida') ?? 'tmp/p1-ci-verificacao.json'), JSON.stringify(resultado, null, 2) + '\n')
  console.log(`P1 selada: 995/995, 65 arquivos, 13/13 SHA-256; verificador ${resultado.verificadorSha256}`)
} catch {
  console.error('Selagem P1 recusada: confira suíte, hashes, seleção e verificador público. Nenhum conteúdo de erro bruto foi impresso.')
  process.exitCode = 1
}
