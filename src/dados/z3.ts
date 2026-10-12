// Z3 no navegador: carregado sob demanda (35 MB), só no PWA servido por
// http(s) com isolamento entre origens (o service worker cuida dos cabeçalhos).
// Guarda as respostas por pergunta, para não repetir checagens.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useReducer } from 'preact/hooks'
import type { EntradaDicionario } from './tipos'
import type { Formula } from '../logica/ast'
import { guardarZ3, lerZ3Guardados } from '../motor/bancoProvas'
import { analisar, nao, nomesNumericos, relevantes } from '../motor/motor'
import { checarZ3, TEMPO_Z3_MS, type ResultadoZ3 } from '../motor/z3'
import { gravarConfig, lerConfig } from './db'

export type StatusZ3 = 'desligado' | 'carregando' | 'pronto' | 'erro'

export interface Confirmacao {
  estado: 'rodando' | 'feito' | 'erro'
  resultado?: ResultadoZ3
  ms?: number
  erro?: string
}

/** Pode haver Z3 neste ambiente? Se não, por quê. */
export function disponibilidadeZ3(): { ok: true } | { ok: false; motivo: string; recarregar?: boolean } {
  if (__MODO_ARQUIVO__) return { ok: false, motivo: 'O Z3 não cabe no arquivo único (35 MB). Use a versão instalada (PWA).' }
  if (typeof window === 'undefined' || !location.protocol.startsWith('http'))
    return { ok: false, motivo: 'O Z3 só funciona no app aberto pelo endereço (http/https).' }
  if (typeof SharedArrayBuffer === 'undefined' || !crossOriginIsolated) {
    const controlado = !!navigator.serviceWorker?.controller
    return controlado
      ? { ok: false, motivo: 'Falta recarregar a página uma vez para ativar o modo que o Z3 exige.', recarregar: true }
      : { ok: false, motivo: 'Este navegador ainda não está pronto para o Z3. Abra o app instalado ou recarregue a página.', recarregar: true }
  }
  return { ok: true }
}

const url = (f: string) => new URL(`./z3/${f}`, location.href).href

function carregarScript(src: string): Promise<void> {
  return new Promise((ok, falha) => {
    if ((globalThis as any).initZ3) return ok()
    const s = document.createElement('script')
    s.src = src
    s.onload = () => ok()
    s.onerror = () => falha(new Error('não foi possível baixar o Z3 (sem internet e ainda não guardado no aparelho?)'))
    document.head.appendChild(s)
  })
}

class EstadoZ3 {
  /** o usuário quer usar o Z3 (fica gravado) */
  ativo = false
  status: StatusZ3 = 'desligado'
  erro: string | null = null
  /** download para uso offline: bytes já baixados / total */
  download: { feito: number; total: number } | null = null
  guardado = false
  private api: any = null
  private carregando: Promise<any> | null = null
  private confirmacoes = new Map<string, Confirmacao>()
  private fila: Promise<unknown> = Promise.resolve()
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  async carregarConfig() {
    try {
      this.ativo = !!(await lerConfig<boolean>('z3'))
    } catch {
      /* sem banco */
    }
    await this.conferirGuardado()
    this.avisar()
  }

  async definirAtivo(v: boolean) {
    this.ativo = v
    void gravarConfig('z3', v).catch(() => {})
    this.avisar()
    if (v && disponibilidadeZ3().ok) await this.carregar().catch(() => {})
  }

  /** O Z3 já está no cache do aparelho? */
  async conferirGuardado() {
    try {
      const nomes = await caches.keys()
      for (const n of nomes.filter((k) => k.startsWith('caderno-z3-'))) {
        const c = await caches.open(n)
        if (await c.match(url('z3-built.wasm'))) this.guardado = true
      }
    } catch {
      /* sem Cache API */
    }
  }

  /** Baixa os arquivos do Z3 (passam pelo service worker, que os guarda). */
  async baixarParaOffline() {
    try {
      this.erro = null
      await fetch(url('z3-built.js'))
      const r = await fetch(url('z3-built.wasm'))
      if (!r.ok || !r.body) throw new Error(`falha ao baixar (${r.status})`)
      const total = Number(r.headers.get('content-length')) || 35_000_000
      this.download = { feito: 0, total }
      const leitor = r.body.getReader()
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        this.download = { feito: this.download.feito + value.length, total }
        this.avisar()
      }
      this.download = null
      await this.conferirGuardado()
    } catch (e) {
      this.download = null
      this.erro = (e as Error).message
    }
    this.avisar()
  }

  carregar(): Promise<any> {
    if (this.api) return Promise.resolve(this.api)
    if (this.carregando) return this.carregando
    this.status = 'carregando'
    this.erro = null
    this.avisar()
    // no arquivo único o ramo do import() some do build (constante falsa)
    this.carregando = (
      __MODO_ARQUIVO__
        ? Promise.reject(new Error('indisponível no arquivo único'))
        : (async () => {
            await carregarScript(url('z3-built.js'))
            ;(globalThis as any).global ??= globalThis
            const { init } = await import('z3-solver')
            return init({ locateFile: (f: string) => url(f), mainScriptUrlOrBlob: url('z3-built.js') } as any)
          })()
    )
      .then((api) => {
        this.api = api
        this.status = 'pronto'
        void this.conferirGuardado().then(() => this.avisar())
        this.avisar()
        return api
      })
      .catch((e) => {
        this.status = 'erro'
        this.erro = (e as Error).message
        this.carregando = null
        this.avisar()
        throw e
      })
    return this.carregando
  }

  /** Traz do banco de provas as respostas do Z3 já guardadas no aparelho. */
  async carregarGuardados() {
    try {
      for (const r of await lerZ3Guardados())
        if (!this.confirmacoes.has(r.chave)) this.confirmacoes.set(r.chave, { estado: 'feito', resultado: r.resultado, ms: r.ms })
      this.avisar()
    } catch {
      /* sem banco */
    }
  }

  /** Esquece as respostas (o banco de provas foi apagado). */
  esquecerTudo() {
    this.confirmacoes.clear()
    this.avisar()
  }

  /** Espera a checagem terminar (devolve na hora se já terminou ou nunca foi pedida). */
  esperar(chave: string): Promise<Confirmacao | undefined> {
    return new Promise((ok) => {
      let sair: (() => void) | null = null
      const ver = () => {
        const c = this.confirmacoes.get(chave)
        if (c && c.estado === 'rodando') return false
        sair?.()
        ok(c)
        return true
      }
      if (!ver()) sair = this.assinar(() => void ver())
    })
  }

  /**
   * O conjunto de fórmulas (já prontas, do motor) não tem modelo de nenhum
   * tamanho? Usado pelo aprofundamento: o que o Z3 prova não precisa ser
   * reconferido com mais objetos. Resposta guardada como as outras.
   */
  async provarFormulas(formulas: Formula[], dicionario: EntradaDicionario[]): Promise<ResultadoZ3 | null> {
    const chave = `formulas:${JSON.stringify(formulas, (k, v) => (k === 'pos' || k === 'end' ? undefined : v))}`
    if (!this.confirmacoes.has(chave)) {
      this.confirmacoes.set(chave, { estado: 'rodando' })
      this.fila = this.fila.then(async () => {
        const ini = Date.now()
        try {
          const api = await this.carregar()
          const resultado = await checarZ3(api, formulas, TEMPO_APROFUNDAR_MS, nomesNumericos(dicionario))
          this.confirmacoes.set(chave, { estado: 'feito', resultado, ms: Date.now() - ini })
          if (resultado !== 'unknown') guardarZ3({ chave, resultado, ms: Date.now() - ini })
        } catch (e) {
          this.confirmacoes.set(chave, { estado: 'erro', erro: (e as Error).message })
        }
        this.avisar()
      })
    }
    return (await this.esperar(chave))?.resultado ?? null
  }

  /** Resultado já calculado (ou em cálculo) para esta checagem. */
  consulta(chave: string): Confirmacao | undefined {
    return this.confirmacoes.get(chave)
  }

  /**
   * Checa no Z3 se `formulas` (mais ¬negar, se dado) têm modelo. Uma checagem
   * por vez; o resultado fica guardado pela chave.
   */
  /**
   * `soRelevantes`: só as fórmulas ligadas por nomes à negada (ou a `foco`),
   * para o Z3 não se perder em leis que não têm nada a ver.
   */
  confirmar(chave: string, formulas: string[], dicionario: EntradaDicionario[], negar?: string, soRelevantes = false, foco?: string) {
    if (this.confirmacoes.has(chave)) return
    this.confirmacoes.set(chave, { estado: 'rodando' })
    this.avisar()
    this.fila = this.fila.then(async () => {
      const ini = Date.now()
      try {
        const api = await this.carregar()
        let prontas = analisar(formulas, dicionario, true)
        const [phi] = negar !== undefined ? analisar([negar], dicionario, true) : []
        if (negar !== undefined && !phi) throw new Error('fórmula inválida')
        const [centro] = phi ? [phi] : foco !== undefined ? analisar([foco], dicionario, true) : []
        if (centro && soRelevantes) prontas = relevantes(prontas, centro)
        const fs = prontas.map((x) => x.expandida)
        if (phi) fs.push(nao(phi.expandida))
        const resultado = await checarZ3(api, fs, TEMPO_Z3_MS, nomesNumericos(dicionario))
        this.confirmacoes.set(chave, { estado: 'feito', resultado, ms: Date.now() - ini })
        // fica no banco de provas (não precisa provar de novo noutro dia)
        if (resultado !== 'unknown') guardarZ3({ chave, resultado, ms: Date.now() - ini })
      } catch (e) {
        this.confirmacoes.set(chave, { estado: 'erro', erro: (e as Error).message })
      }
      this.avisar()
    })
  }
}

/** tempo do Z3 para cada conclusão do aprofundamento (o motor finito segue trabalhando enquanto isso) */
const TEMPO_APROFUNDAR_MS = 10_000

export const z3 = new EstadoZ3()

export function useZ3(): EstadoZ3 {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => z3.assinar(() => forcar(undefined)), [])
  return z3
}

/** Chave de uma checagem do Z3: fórmulas, fórmula negada e as fichas (tipo, aridade, número). */
export const chaveZ3 = (formulas: string[], negar: string | null, dic: EntradaDicionario[]) =>
  JSON.stringify([formulas, negar, dic.map((e) => [e.simbolo, e.tipo, e.aridade, !!e.numerico, e.argumentos ?? null])])
