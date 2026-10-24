import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

console.log('Cosmos P0: preparando a prévia local compilada…')
const { build } = await import('vite')

// Entrada manual. P0 padrão sem rede. --groq habilita P1 explicitamente.
// GROQ_API_KEY é consultada SOMENTE em runtime Node após ação de teste/envio.
// Não há leitura dotenv, impressão ou inclusão da chave no bundle.
// envDir:false impede carregamento dotenv, separado do servidor/dev já existente.
const origem = 'http://127.0.0.1:4175'
let ponte, api, server, encerrando = false
async function encerrar() {
  if (encerrando) return
  encerrando = true
  ponte?.encerrar()
  await api?.encerrar()
  if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
}
try {
  // Modo arquivo: HTML autocontido sem service worker. Não toca dist/ histórico.
  await build({ envDir: false, envPrefix: [], mode: 'arquivo', logLevel: 'silent',
    build: { outDir: 'tmp/integracoes-p0-interface' },
  })
  // Bundle Node dedicado: evita executar a API pelo runner SSR de desenvolvimento.
  // Sem config de build do site, dotenv, public/ ou segredo gravado no artefato.
  await build({ configFile: false, envDir: false, envPrefix: [], publicDir: false, logLevel: 'silent',
    build: { ssr: true, outDir: 'tmp/integracoes-p0-runtime', emptyOutDir: true,
      rolldownOptions: { input: { servidor: 'src/integracoes/servidor-node.ts', ponte: 'src/integracoes/ponte-node.ts' },
        output: { entryFileNames: '[name].mjs' } } },
  })
  const html = await readFile(new URL('../tmp/integracoes-p0-interface/index.html', import.meta.url))
  const { iniciarServidorIntegracoes } = await import(new URL('../tmp/integracoes-p0-runtime/servidor.mjs', import.meta.url).href)
  const { criarPonteIntegracoes } = await import(new URL('../tmp/integracoes-p0-runtime/ponte.mjs', import.meta.url).href)
  api = await iniciarServidorIntegracoes({ origemPermitida: origem })
  ponte = criarPonteIntegracoes({ origem, portaApi: api.endereco.porta, token: api.sessao.token,
    ...(process.argv.includes('--groq') ? { groq: { chave: () => process.env.GROQ_API_KEY } } : {}) })
  server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    if (req.url?.startsWith('/cosmos/__p0/')) { ponte.tratar(req, res); return }
    const host = req.rawHeaders.filter((h, i) => i % 2 === 0 && h.toLowerCase() === 'host').length
    if (req.socket.remoteAddress !== '127.0.0.1' || host !== 1 || req.headers.host !== '127.0.0.1:4175') { res.writeHead(403); res.end(); return }
    if (req.method !== 'GET' || !['/', '/cosmos/', '/cosmos/index.html'].includes(req.url ?? '')) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' })
    res.end(html)
  })
  server.maxConnections = 8; server.requestTimeout = 10000; server.headersTimeout = 5000; server.keepAliveTimeout = 1
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4175, '127.0.0.1', resolve) })
  process.once('SIGINT', () => { void encerrar() })
  process.once('SIGTERM', () => { void encerrar() })
  console.log(`Cosmos local: ${origem}/cosmos/#/integracoes (${process.argv.includes('--groq') ? 'P1 Groq habilitado; teste somente por ação explícita' : 'P0 simulado, sem provedor externo'})`)
} catch {
  await encerrar()
  console.error('Não foi possível iniciar Cosmos P0 local. Confira a compilação e se a porta 4175 está livre.')
  process.exitCode = 1
}
