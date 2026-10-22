import { render } from 'preact'
import { prepararInstalacao } from './dados/instalacao'
import { iniciarSegundoPlano } from './dados/segundoPlano'
import { registrarServiceWorker } from './dados/versao'
import { App } from './ui/App'

export function iniciarCaderno() {
  prepararInstalacao()
  iniciarSegundoPlano()
  render(<App />, document.getElementById('app')!)
  if (import.meta.env.PROD && !__MODO_ARQUIVO__ && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    if (document.readyState === 'complete') registrarServiceWorker()
    else window.addEventListener('load', registrarServiceWorker, { once: true })
  }
}
