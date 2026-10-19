// Avisos quando o motor termina um trabalho: notificação do sistema (com o
// app em segundo plano) ou um aviso dentro do app (se você está em outra tela).
// E a opção de manter a tela acesa enquanto o motor calcula.

import { useEffect, useReducer } from 'preact/hooks'
import { definirAvisoDeEscopo } from '../logica/validador'
import { gravarConfig, lerConfig } from './db'

export interface Aviso {
  id: number
  titulo: string
  corpo: string
  /** tela onde está o resultado, ex.: "#/cadeia" */
  rota: string
}

const DURACAO_AVISO_MS = 15000

class Avisos {
  /** o usuário quer notificações do sistema (fica gravado) */
  notificar = false
  /** manter a tela acesa enquanto o motor trabalha (fica gravado) */
  telaAcesa = false
  /** aviso E16, do escopo do quantificador que pode surpreender (fica gravado) */
  avisoEscopo = true
  /** avisos dentro do app, mais novo por último */
  lista: Aviso[] = []
  private proximo = 1
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private mudou() {
    this.ouvintes.forEach((f) => f())
  }

  async carregarConfig() {
    try {
      this.notificar = (await lerConfig<boolean>('notificar')) ?? false
      this.telaAcesa = (await lerConfig<boolean>('telaAcesa')) ?? false
      this.avisoEscopo = (await lerConfig<boolean>('avisoEscopo')) ?? true
      definirAvisoDeEscopo(this.avisoEscopo)
    } catch {
      /* sem banco */
    }
    // a permissão pode ter sido retirada nas configurações do navegador
    if (this.notificar && this.permissao() !== 'granted') this.notificar = false
    this.mudou()
  }

  /** 'granted' | 'denied' | 'default' | 'indisponivel' */
  permissao(): NotificationPermission | 'indisponivel' {
    return typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission
  }

  /** Liga as notificações (pede a permissão ao navegador; precisa de um toque do usuário). */
  async ligarNotificacoes(): Promise<boolean> {
    if (this.permissao() === 'indisponivel') return false
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    this.notificar = p === 'granted'
    void gravarConfig('notificar', this.notificar).catch(() => {})
    this.mudou()
    if (this.notificar) void this.mostrar('Avisos ligados', 'O Caderno Lógico vai avisar quando o motor achar algo.', location.hash || '#/notas')
    return this.notificar
  }

  desligarNotificacoes() {
    this.notificar = false
    void gravarConfig('notificar', false).catch(() => {})
    this.mudou()
  }

  definirTelaAcesa(v: boolean) {
    this.telaAcesa = v
    void gravarConfig('telaAcesa', v).catch(() => {})
    this.mudou()
  }

  definirAvisoEscopo(v: boolean) {
    this.avisoEscopo = v
    definirAvisoDeEscopo(v)
    void gravarConfig('avisoEscopo', v).catch(() => {})
    this.mudou()
  }

  /**
   * Avisa que um trabalho terminou. Com o app escondido: notificação do
   * sistema (se ligada). Com o app aberto em outra tela: aviso dentro do app.
   * Na própria tela do resultado: nada (você já está vendo).
   */
  avisar(titulo: string, corpo: string, rota: string) {
    const visivel = typeof document === 'undefined' || document.visibilityState === 'visible'
    const naTela = visivel && (location.hash || '#/notas').startsWith(rota)
    if (naTela) return
    if (!visivel) {
      if (this.notificar) void this.mostrar(titulo, corpo, rota)
      // também fica dentro do app, para ver ao voltar
    }
    const a: Aviso = { id: this.proximo++, titulo, corpo, rota }
    this.lista = [...this.lista.slice(-2), a]
    this.mudou()
    if (visivel) setTimeout(() => this.fechar(a.id), DURACAO_AVISO_MS)
  }

  fechar(id: number) {
    this.lista = this.lista.filter((a) => a.id !== id)
    this.mudou()
  }

  /** Notificação do sistema. No Android, só funciona pelo service worker. */
  private async mostrar(titulo: string, corpo: string, rota: string) {
    if (this.permissao() !== 'granted') return
    const url = new URL(rota, location.href).href
    const opcoes: NotificationOptions = { body: corpo, icon: './icone-192.png', badge: './icone-192.png', tag: `caderno-${rota}`, data: { url } }
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg) return await reg.showNotification(titulo, opcoes)
      const n = new Notification(titulo, opcoes)
      n.onclick = () => {
        window.focus()
        location.hash = rota
        n.close()
      }
    } catch {
      /* o navegador recusou: fica só o aviso dentro do app */
    }
  }
}

export const avisos = new Avisos()

export function useAvisos(): Avisos {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => avisos.assinar(() => forcar(undefined)), [])
  return avisos
}
