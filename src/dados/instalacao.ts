import { useEffect, useReducer } from 'preact/hooks'

// O Chrome avisa (beforeinstallprompt) quando o app pode ser instalado; guardamos
// o evento para mostrar um botão "Instalar" na hora que o usuário quiser.

interface EventoInstalar extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let evento: EventoInstalar | null = null
let instalado = false
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export function prepararInstalacao() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    evento = e as EventoInstalar
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    instalado = true
    evento = null
    avisar()
  })
}

export function rodandoInstalado(): boolean {
  return instalado || (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches)
}

export function podeInstalar(): boolean {
  return !!evento
}

export async function instalar(): Promise<boolean> {
  if (!evento) return false
  await evento.prompt()
  const { outcome } = await evento.userChoice
  evento = null
  avisar()
  return outcome === 'accepted'
}

export function useInstalacao() {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    ouvintes.add(forcar as () => void)
    return () => {
      ouvintes.delete(forcar as () => void)
    }
  }, [])
}
