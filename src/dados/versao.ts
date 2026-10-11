// Versão nova do app publicada enquanto ele está aberto: o service worker novo
// assume na hora, mas a página aberta continua com o código antigo até
// recarregar. Avisa na tela; com o app em segundo plano e o motor parado,
// recarrega sozinho (as notas e as rodadas estão guardadas no aparelho).

import { useEffect, useReducer } from 'preact/hooks'
import { verificacao } from './verificacao'

/** de quanto em quanto tempo o app pergunta se há versão nova (aberto por dias, ele nunca recarregaria) */
const PROCURAR_A_CADA_MS = 30 * 60_000

class Versao {
  nova = false
  private ouvintes = new Set<() => void>()
  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => void this.ouvintes.delete(fn)
  }
  avisar() {
    this.nova = true
    this.ouvintes.forEach((f) => f())
    this.recarregarSePuder()
  }
  /** só recarrega sem pedir com o app fora da tela e o motor sem trabalho */
  recarregarSePuder() {
    if (this.nova && document.visibilityState === 'hidden' && !verificacao.ocupado) location.reload()
  }
}

export const versao = new Versao()

export function useVersao(): Versao {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => versao.assinar(() => forcar(undefined)), [])
  return versao
}

/** Registra o service worker e fica de olho em versões novas. */
export function registrarServiceWorker() {
  // já havia um service worker controlando a página: a troca é uma versão nova (não a primeira instalação)
  const tinha = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => tinha && versao.avisar())
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => setInterval(() => void reg.update().catch(() => {}), PROCURAR_A_CADA_MS))
    .catch((e) => console.warn('Service worker não registrado:', e))
  document.addEventListener('visibilitychange', () => versao.recarregarSePuder())
  verificacao.assinar(() => versao.recarregarSePuder())
}
