import { render } from 'preact'
import { prepararInstalacao } from './dados/instalacao'
import { iniciarSegundoPlano } from './dados/segundoPlano'
import { App } from './ui/App'
import './ui/estilo.css'
import './ui/telas.css'

prepararInstalacao()
iniciarSegundoPlano()
render(<App />, document.getElementById('app')!)

// PWA: só no build publicado (http/https). No arquivo único (file://) não há service worker.
if (import.meta.env.PROD && !__MODO_ARQUIVO__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker não registrado:', e))
  })
}

// Pede ao navegador para não apagar os dados quando faltar espaço (silencioso; pode ser recusado).
void navigator.storage?.persist?.().catch(() => {})
