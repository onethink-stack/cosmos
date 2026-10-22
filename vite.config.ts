import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import preact from '@preact/preset-vite'
import type { Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { defineConfig } from 'vitest/config'
import pacoteZ3 from 'z3-solver/package.json' with { type: 'json' }
import { PACOTE_COSMOS } from './src/dados/pacoteCosmos.ts'

const VERSAO_Z3 = pacoteZ3.version
// Não há VitePWA: o manifest canônico é o arquivo público, compartilhado pelos dois nomes.
const MANIFEST_COSMOS = JSON.parse(readFileSync(new URL('./public/manifest.webmanifest', import.meta.url), 'utf8'))

function conferirManifestCosmos(): Plugin {
  return {
    name: 'cosmos-manifest-unico',
    apply: 'build',
    buildStart() {
      const alternativo = JSON.parse(readFileSync(new URL('./public/manifest.json', import.meta.url), 'utf8'))
      if (JSON.stringify(alternativo) !== JSON.stringify(MANIFEST_COSMOS)) throw new Error('manifest.json diverge do manifest.webmanifest canônico.')
      if (MANIFEST_COSMOS.name !== 'Cosmos 502426c' || MANIFEST_COSMOS.short_name !== 'Cosmos 502426c' || MANIFEST_COSMOS.id !== '/cosmos/' || MANIFEST_COSMOS.scope !== '/cosmos/' || MANIFEST_COSMOS.start_url !== '/cosmos/#/cadeia') throw new Error('Manifest Cosmos com nome ou caminhos incorretos.')
    },
  }
}

function exportarCosmos(): Plugin {
  return {
    name: 'cosmos-exportacao-assinada',
    apply: 'build',
    generateBundle() {
      const source = JSON.stringify(PACOTE_COSMOS, null, 2) + '\n'
      this.emitFile({ type: 'asset', fileName: 'cosmos-502426c.json', source })
      this.emitFile({ type: 'asset', fileName: 'dist/cosmos-502426c.json', source })
    },
  }
}

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
      // O Caderno antigo só é baixado quando a pessoa sai da rota Cosmos.
      const precache = doBuild.filter((f) => {
        const item = bundle[f]
        return item.type !== 'chunk' || !Object.keys(item.modules).some((m) => /[\\/]dados[\\/](biblioteca|teorias|tptp)\.ts$/.test(m))
      })
      // só arquivos do topo de public/ (a pasta z3/, de 35 MB, entra no cache só quando usada)
      const publicos = readdirSync('public', { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
      const arquivos = [...new Set(['./', ...precache, ...publicos].map((f) => (f === './' ? f : `./${f}`)))].sort()
      const conteudoHtml = bundle['index.html']
      const hash = createHash('sha256')
      hash.update(arquivos.join('\n'))
      if (conteudoHtml && conteudoHtml.type === 'asset') hash.update(String(conteudoHtml.source))
      // o conteúdo de cada arquivo também entra: qualquer mudança gera cache novo
      for (const f of doBuild) {
        const item = bundle[f]
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source))
      }
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

// A página do app vem da rede quando há internet (assim uma versão nova chega
// na hora, sem misturar com arquivos velhos); sem internet, do cache.
async function paginaDoApp() {
  const indice = new URL('./index.html', self.registration.scope).href
  try {
    const r = await Promise.race([
      fetch(indice, { cache: 'no-store' }),
      new Promise((_, nao) => setTimeout(() => nao(new Error('demorou')), 4000)),
    ])
    if (r.ok) {
      const c = await caches.open(CACHE)
      await c.put(indice, r.clone())
      return r
    }
  } catch {}
  return (await caches.match(indice)) || fetch(indice)
}

// Tocar numa notificação: volta para o app aberto (sem recarregar, para não
// interromper o motor) e pede para mostrar a tela do resultado.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (cs) => {
      const c = cs.find((x) => x.url.startsWith(self.registration.scope))
      if (!c) return self.clients.openWindow(url)
      c.postMessage({ tipo: 'ir', url })
      return c.focus()
    }),
  )
})

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
    e.respondWith(paginaDoApp().then(isolado))
    return
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(async (r) => {
    if (r) return r
    const resposta = await fetch(req)
    if (resposta.ok) await (await caches.open(CACHE)).put(req, resposta.clone())
    return resposta
  }).then(isolado))
})
`
}

const AVISO_DO_CADERNO = `Cosmos 502426c
Copyright (C) 2026 Gustavo Phadua Silva da Costa e os autores do projeto
Software livre sob a GNU Affero General Public License, versão 3 ou posterior, SEM NENHUMA GARANTIA.
Código-fonte e licenças: https://github.com/onethink-stack/cosmos (LICENCAS.md e THIRD_PARTY_NOTICES.md).`

/**
 * Os avisos de licença vão junto do app: o empacotamento tira os do Preact e os do trecho do Vite. No site, como
 * arquivos (LICENSE, LICENCAS.md, THIRD_PARTY_NOTICES.md e a pasta LICENSES/). No arquivo único, que não leva
 * arquivos soltos, num comentário no fim do <head> com os textos inteiros: a AGPL e os avisos que as licenças MIT e a
 * do Unicode pedem que acompanhem as cópias. Fica no fim, e não no começo, para o <meta charset> continuar nos
 * primeiros 1.024 bytes, como os navegadores esperam num arquivo aberto do disco.
 */
function avisosDeLicenca(arquivo: boolean): Plugin {
  const comentario = (texto: string) => {
    // os textos entram sem mudança nenhuma (a AGPL proíbe mudar o texto dela): se algum fechasse o comentário, o
    // build para
    if (/<!--|-->|--!>/.test(texto)) throw new Error('um aviso de licença tem uma sequência que fecha o comentário do HTML')
    return `<!--\n${texto}\n-->`
  }
  return {
    name: 'caderno-avisos-de-licenca',
    apply: 'build',
    transformIndexHtml(html) {
      const texto = arquivo
        ? [
            AVISO_DO_CADERNO,
            'Este arquivo inclui o Preact, o Z3 e um trecho do Vite, com os avisos abaixo, e dados do Unicode.',
            ...['MIT-preact.txt', 'MIT-z3-solver.txt', 'MIT-vite.txt', 'Unicode-3.0.txt', 'Unlicense-tweetnacl.txt'].map((n) => readFileSync(`LICENSES/${n}`, 'utf8').trim()),
            readFileSync('LICENSE', 'utf8').trim(),
          ].join('\n\n')
        : AVISO_DO_CADERNO
      return html.replace('</head>', `${comentario(texto)}\n  </head>`)
    },
    generateBundle() {
      if (arquivo) return
      const nomes = ['LICENSE', 'LICENCAS.md', 'THIRD_PARTY_NOTICES.md', ...readdirSync('LICENSES').map((n) => `LICENSES/${n}`)]
      for (const fileName of nomes) this.emitFile({ type: 'asset', fileName, source: readFileSync(fileName) })
    },
  }
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
    base: arquivo ? './' : '/cosmos/',
    plugins: [preact(), conferirManifestCosmos(), avisosDeLicenca(arquivo), ...(arquivo ? [semLinksExternos(), viteSingleFile()] : [exportarCosmos(), serviceWorker()])],
    publicDir: arquivo ? false : 'public',
    server: { headers: ISOLAMENTO },
    preview: { headers: ISOLAMENTO },
    define: { __MODO_ARQUIVO__: JSON.stringify(arquivo) },
    build: {
      outDir: arquivo ? 'dist-arquivo' : 'dist',
      emptyOutDir: true,
    },
    test: {
      include: ['testes/**/*.test.ts', 'servidor/**/*.test.ts'],
    },
  }
})
