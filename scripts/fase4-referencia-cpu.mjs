// CLI explícita, sem listener, rede, dotenv ou leitura de chave.
import { resolve } from 'node:path'
import { gerarReferenciaCpu, verificarReferenciaCpu } from '../src/fase4/referencia-cpu-node.ts'

const [acao, ...args] = process.argv.slice(2)
const opcoes = new Map()
try {
  if (!['gerar', 'verificar'].includes(acao) || args.length % 2) throw new Error()
  for (let i = 0; i < args.length; i += 2) {
    if (!['--pacote', '--trabalho', '--cvc5', '--cvc5-sha256', '--carcara', '--carcara-sha256'].includes(args[i]) || opcoes.has(args[i]) || !args[i + 1]) throw new Error()
    opcoes.set(args[i], args[i + 1])
  }
  const pacote = opcoes.get('--pacote'), pinCvc5 = opcoes.get('--cvc5-sha256')
  if (!pacote || !pinCvc5 || (acao === 'gerar' && !opcoes.has('--cvc5')) || (acao === 'verificar' && !opcoes.has('--trabalho'))) throw new Error()
  if (opcoes.has('--carcara') !== opcoes.has('--carcara-sha256')) throw new Error()
  const config = { cvc5: { binario: opcoes.get('--cvc5') ? resolve(opcoes.get('--cvc5')) : '', sha256: pinCvc5 },
    ...(opcoes.has('--carcara') ? { carcara: { binario: resolve(opcoes.get('--carcara')), sha256: opcoes.get('--carcara-sha256') } } : {}) }
  const r = acao === 'gerar' ? gerarReferenciaCpu(resolve(pacote), config)
    : verificarReferenciaCpu(resolve(pacote), resolve(opcoes.get('--trabalho')), config)
  console.log(JSON.stringify(r, null, 2))
  process.exitCode = r.estado === 'gerado-nao-verificado' || r.estado === 'verificado-cpu' ? 0 : 2
} catch {
  console.error('Uso: node --experimental-strip-types scripts/fase4-referencia-cpu.mjs gerar|verificar --pacote DIR --cvc5-sha256 SHA [--cvc5 BIN] [--trabalho DIR_NOVO] [--carcara BIN --carcara-sha256 SHA]')
  process.exitCode = 2
}
