import { useEffect, useState } from 'preact/hooks'
import type { Compartimento } from '../dados/tipos'

export type Rota =
  | { tela: 'notas' }
  | { tela: 'nota'; id: string }
  | { tela: 'nova'; compartimento: Compartimento }
  | { tela: 'dicionario' }
  | { tela: 'contradicoes' }
  | { tela: 'backup' }
  | { tela: 'sistemas' }
  | { tela: 'cadeia' }

export function lerRota(hash: string): Rota {
  const partes = hash.replace(/^#\/?/, '').split('/')
  switch (partes[0]) {
    case 'nota':
      return partes[1] ? { tela: 'nota', id: decodeURIComponent(partes[1]) } : { tela: 'notas' }
    case 'nova': {
      const c = partes[1]
      return { tela: 'nova', compartimento: c === 'fato' || c === 'visao' || c === 'teorema' ? c : 'lei' }
    }
    case 'dicionario':
      return { tela: 'dicionario' }
    case 'contradicoes':
      return { tela: 'contradicoes' }
    case 'backup':
      return { tela: 'backup' }
    case 'sistemas':
      return { tela: 'sistemas' }
    case 'cadeia':
      return { tela: 'cadeia' }
    default:
      return { tela: 'notas' }
  }
}

/**
 * Guarda de saída: enquanto definida, é chamada antes de trocar de tela
 * (ex.: editor com alterações não salvas). Se devolver false, a troca é desfeita.
 */
export const guarda: { sair: (() => boolean) | null } = { sair: null }

let hashAtual = typeof location !== 'undefined' ? location.hash : ''
let ignorarProxima = false

export function ir(hash: string, substituir = false) {
  if (substituir) {
    history.replaceState(null, '', hash)
    hashAtual = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else location.hash = hash
}

/** Troca o endereço sem trocar de tela (ex.: nota nova salva sozinha ganha o endereço dela). */
export function trocarEndereco(hash: string) {
  history.replaceState(null, '', hash)
  hashAtual = hash
}

export function useRota(): Rota {
  const [rota, setRota] = useState(() => lerRota(location.hash))
  useEffect(() => {
    const aoMudar = () => {
      if (ignorarProxima) {
        ignorarProxima = false
        return
      }
      if (location.hash !== hashAtual && guarda.sair && !guarda.sair()) {
        ignorarProxima = true
        location.hash = hashAtual
        return
      }
      hashAtual = location.hash
      setRota(lerRota(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])
  return rota
}
