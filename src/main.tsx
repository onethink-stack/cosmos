import { render } from 'preact'
import { CosmosApp } from './ui/CosmosApp'
import { guarda } from './ui/rotas'
import './ui/estilo.css'
import './ui/telas.css'
import './ui/cosmos.css'

export const somenteCosmos = (hash: string) => ['cadeia', 'outras'].includes(hash.replace(/^#\/?/, '').split(/[/?]/)[0])
const modoCosmos = somenteCosmos(location.hash)
// Trocar de aplicação reinicia o documento para também descarregar o motor antigo.
window.addEventListener('hashchange', (evento) => {
  if (somenteCosmos(location.hash) !== modoCosmos) {
    evento.stopImmediatePropagation()
    if (!modoCosmos && guarda.sair && !guarda.sair()) {
      history.replaceState(null, '', evento.oldURL)
      return
    }
    location.reload()
  }
}, true)

if (modoCosmos) render(<CosmosApp />, document.getElementById('app')!)
else void import('./cadernoLegado').then(({ iniciarCaderno }) => iniciarCaderno()).catch((erro) => {
  document.getElementById('app')!.textContent = 'Não foi possível carregar as notas do Cosmos 502426c. Recarregue a página.'
  console.error(erro)
})

// PWA: só no build publicado (http/https). No arquivo único (file://) não há service worker.
if (modoCosmos && import.meta.env.PROD && !__MODO_ARQUIVO__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const registrar = () => { void navigator.serviceWorker.register('./sw.js').then((reg) => reg.update()).catch(console.warn) }
  if (document.readyState === 'complete') registrar()
  else window.addEventListener('load', registrar, { once: true })
}

// Pede ao navegador para não apagar os dados quando faltar espaço (silencioso; pode ser recusado).
void navigator.storage?.persist?.().catch(() => {})
