import { render } from 'preact'
import { CosmosApp } from './ui/CosmosApp'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProdutosApp } from './interfaces/Produtos'
import { iniciarSessaoLocal } from './local/conta'
import { rotaProduto } from './interfaces/config'
import './ui/estilo.css'
import './ui/telas.css'
import './ui/cosmos.css'
import './ui/v3/claro.css'
import './ui/v3/terminal.css'

// A v3 não inicializa o Caderno antigo, seus motores ou o banco privado.
const modoCosmos = true
const container = document.getElementById('app')!
let raizReact: Root | null = null
let produtoAtivo = false
function montarInterface() {
  const produto = location.hash.split('?')[0] === '#/integracoes' ? 'integracoes' : rotaProduto(location.hash, location.pathname)
  if (produto) {
    if (!produtoAtivo) { render(null, container); raizReact = createRoot(container) }
    raizReact!.render(createElement(ProdutosApp, { rota: produto, key: produto }))
  } else {
    if (raizReact) { raizReact.unmount(); raizReact = null }
    render(<CosmosApp />, container)
  }
  produtoAtivo = !!produto
}
const encerrarSessaoLocal = iniciarSessaoLocal()
montarInterface()
window.addEventListener('hashchange', montarInterface)
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('hashchange', montarInterface)
  encerrarSessaoLocal()
  if (raizReact) raizReact.unmount()
  else render(null, container)
})

// PWA: só no build publicado (http/https). No arquivo único (file://) não há service worker.
if (modoCosmos && import.meta.env.PROD && !__MODO_ARQUIVO__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const registrar = () => { void navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(console.warn) }
  if (document.readyState === 'complete') registrar()
  else window.addEventListener('load', registrar, { once: true })
}

// Pede ao navegador para não apagar os dados quando faltar espaço (silencioso; pode ser recusado).
void navigator.storage?.persist?.().catch(() => {})
