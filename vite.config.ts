import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import preact from '@preact/preset-vite'
import type { Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vitest/config'
import pacoteZ3 from 'z3-solver/package.json' with { type: 'json' }

const VERSAO_Z3 = pacoteZ3.version

/** Cabeçalhos de isolamento entre origens, exigidos pelo Z3 (SharedArrayBuffer). */
const ISOLAMENTO = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

/**
 * PWA: gera dist/sw.js com a lista de todos os arquivos do build, para o app
 * funcionar offline depois do primeiro acesso. A versão do cache muda quando
 * qualquer arquivo muda (os nomes dos assets têm hash).
 */
function serviceWorker(): Plugin {
  return {
    name: 'caderno-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const doBuild = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js')
      // só arquivos do topo de public/ (a pasta z3/, de 35 MB, entra no cache só quando usada)
      const publicos = readdirSync('public', { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
      const arquivos = [...new Set(['./', ...doBuild, ...publicos].map((f) => (f === './' ? f : `./${f}`)))].sort()
      const conteudoHtml = bundle['index.html']
      const hash = createHash('sha256')
      hash.update(arquivos.join('\n'))
      if (conteudoHtml && conteudoHtml.type === 'asset') hash.update(String(conteudoHtml.source))
      const versao = hash.digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigoSW(versao, arquivos) })
    },
  }
}

function codigoSW(versao: string, arquivos: string[]): string {
  return `// Gerado no build. Cache-first: depois do primeiro acesso, tudo funciona offline.
// Também acrescenta os cabeçalhos COOP/COEP (isolamento entre origens), que o
// GitHub Pages não envia e que o Z3 (WebAssembly com threads) exige.
const CACHE = 'caderno-logico-${versao}'
const CACHE_Z3 = 'caderno-z3-${VERSAO_Z3}'
const ARQUIVOS = ${JSON.stringify(arquivos, null, 2)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks
            .filter((k) => (k.startsWith('caderno-logico-') && k !== CACHE) || (k.startsWith('caderno-z3-') && k !== CACHE_Z3))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isolado(r) {
  if (!r || r.status === 0 || r.type === 'opaque') return r
  const h = new Headers(r.headers)
  h.set('Cross-Origin-Embedder-Policy', 'require-corp')
  h.set('Cross-Origin-Opener-Policy', 'same-origin')
  h.set('Cross-Origin-Resource-Policy', 'same-origin')
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h })
}

async function doZ3(req) {
  const c = await caches.open(CACHE_Z3)
  const guardado = await c.match(req, { ignoreSearch: true })
  if (guardado) return guardado
  const r = await fetch(req)
  if (r.ok) await c.put(req, r.clone())
  return r
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.includes('/z3/')) {
    e.respondWith(doZ3(req).then(isolado))
    return
  }
  // só o endereço do app recebe index.html (um download também chega como navegação)
  if (req.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
    const indice = new URL('./index.html', self.registration.scope).href
    e.respondWith(caches.match(indice).then((r) => r || fetch(req)).then(isolado))
    return
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)).then(isolado))
})
`
}

/** No arquivo único não há manifesto nem ícones externos: tira os links do HTML. */
function semLinksExternos(): Plugin {
  return {
    name: 'caderno-sem-links-externos',
    transformIndexHtml(html) {
      return html.replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '')
    },
  }
}

export default defineConfig(({ mode }) => {
  const arquivo = mode === 'arquivo'
  return {
    base: './',
    plugins: [preact(), ...(arquivo ? [semLinksExternos(), viteSingleFile()] : [serviceWorker()])],
    publicDir: arquivo ? false : 'public',
    server: { headers: ISOLAMENTO },
    preview: { headers: ISOLAMENTO },
    define: { __MODO_ARQUIVO__: JSON.stringify(arquivo) },
    build: {
      outDir: arquivo ? 'dist-arquivo' : 'dist',
      emptyOutDir: true,
    },
    test: {
      include: ['testes/**/*.test.ts'],
    },
  }
})
