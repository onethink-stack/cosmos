// Mesmo caminho de execução em Windows/Linux. Sem dotenv, servidor ou chave real.
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
await mkdir('tmp', { recursive: true })
function rodar(comando, args) {
  const r = spawnSync(comando, args, { stdio: 'inherit', shell: process.platform === 'win32' && comando === npm })
  if (r.error || r.status !== 0) throw new Error('Etapa local/CI não aprovada')
}
try {
  rodar(npm, ['test', '--', '--maxWorkers=1', '--reporter=default', '--reporter=json', '--outputFile=tmp/p1-ci-testes.json'])
  rodar(npm, ['run', 'typecheck'])
  const { build } = await import('vite')
  await build({ mode: 'arquivo', envDir: false, envPrefix: [] })
  await build({ envDir: false, envPrefix: [] })
  rodar(process.execPath, ['scripts/verificar-p1-selada.mjs'])
} catch {
  console.error('CI P1 não aprovada. Logs anteriores preservados; sem retry automático ou relaxamento de checks.')
  process.exitCode = 1
}
