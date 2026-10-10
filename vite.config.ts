import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import preact from '@preact/preset-vite'
import type { Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vitest/config'

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
      const publicos = readdirSync('public')
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
const CACHE = 'caderno-logico-${versao}'
const ARQUIVOS = ${JSON.stringify(arquivos, null, 2)}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('caderno-logico-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    const indice = new URL('./index.html', self.registration.scope).href
    e.respondWith(caches.match(indice).then((r) => r || fetch(req)))
    return
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)))
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
