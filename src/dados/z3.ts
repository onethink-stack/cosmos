// Z3 no navegador: carregado sob demanda (35 MB), só no PWA servido por
// http(s) com isolamento entre origens (o service worker cuida dos cabeçalhos).
// Roda num worker só dele, trocado por um novo de tempos em tempos (cada
// checagem deixa memória presa no Z3) e sempre que ele quebra ou trava.
// Guarda as respostas por pergunta, para não repetir checagens.

import { useEffect, useReducer } from 'preact/hooks'
import type { EntradaDicionario } from './tipos'
import type { Formula } from '../logica/ast'
import { resumo } from '../logica/resumo'
import { guardarZ3, lerZ3Guardados, PREFIXO_CHAVE_Z3 } from '../motor/bancoProvas'
import { analisar, nao, nomesNumericos, relevantes } from '../motor/motor'
import { TEMPO_Z3_MS, type ResultadoZ3 } from '../motor/z3'
import type { PedidoZ3, RespostaZ3 } from '../motor/z3worker'
import { gravarConfig, lerConfig } from './db'

export type StatusZ3 = 'desligado' | 'carregando' | 'pronto' | 'erro'

export interface Confirmacao {
  estado: 'rodando' | 'feito' | 'erro'
  resultado?: ResultadoZ3
  ms?: number
  erro?: string
  /** o tempo que o Z3 teve (um "não sei" com pouco tempo pode ser tentado de novo com mais) */
  tempoMs?: number
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

/** o worker do Z3 é trocado por um novo depois de tantas checagens (solta a memória presa) */
export const RECICLAR_Z3_A_CADA = 100
/** sem resposta tanto tempo depois do prazo da checagem: o Z3 travou, e o worker é trocado */
const FOLGA_VIGIA_MS = 60_000

type Retorno = { resultado: ResultadoZ3 } | { erro: string }

class EstadoZ3 {
  /** o usuário quer usar o Z3 (fica gravado) */
  ativo = false
  status: StatusZ3 = 'desligado'
  erro: string | null = null
  /** download para uso offline: bytes já baixados / total */
  download: { feito: number; total: number } | null = null
  guardado = false
  /** checagens feitas e quantas vezes o worker foi trocado (para mostrar na tela) */
  checagens = 0
  reinicios = 0
  private trabalhador: Worker | null = null
  private carregando: Promise<void> | null = null
  private checagensNoWorker = 0
  private esperando = new Map<number, (r: Retorno) => void>()
  private proximoId = 0
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

  /** Liga o worker do Z3 (se ainda não há um) e espera o Z3 ficar pronto nele. */
  carregar(): Promise<void> {
    if (this.carregando) return this.carregando
    // trocar o worker não muda o que a tela mostra: só a primeira carga aparece
    if (this.status !== 'pronto') {
      this.status = 'carregando'
      this.erro = null
      this.avisar()
    }
    let w: Worker
    try {
      // no arquivo único não há Z3 (o worker nem chega a ser criado)
      if (__MODO_ARQUIVO__) throw new Error('indisponível no arquivo único')
      w = new Worker(new URL('../motor/z3worker.ts', import.meta.url), { type: 'module', name: 'z3' })
    } catch (e) {
      return Promise.reject(this.falhouAoCarregar(e as Error))
    }
    this.trabalhador = w
    this.checagensNoWorker = 0
    this.carregando = new Promise<void>((ok, falha) => {
      w.onmessage = (e: MessageEvent<RespostaZ3>) => {
        const m = e.data
        if (m.tipo === 'pronto') return ok()
        if (m.tipo === 'erro') return falha(new Error(m.msg))
        const fim = this.esperando.get(m.id)
        this.esperando.delete(m.id)
        fim?.(m.tipo === 'resultado' ? { resultado: m.resultado } : { erro: m.msg })
      }
      // o worker caiu (ex.: faltou memória): as checagens em curso falham e o próximo uso cria outro
      w.onerror = (e) => {
        e.preventDefault()
        falha(new Error(e.message || 'o Z3 parou'))
        if (this.trabalhador === w) this.descartar(e.message || 'o Z3 parou (memória?)')
      }
      w.postMessage({ tipo: 'iniciar', base: url('') } satisfies PedidoZ3)
    }).then(
      () => {
        if (this.status !== 'pronto') {
          this.status = 'pronto'
          void this.conferirGuardado().then(() => this.avisar())
          this.avisar()
        }
      },
      (e) => {
        if (this.trabalhador === w) this.descartar()
        throw this.falhouAoCarregar(e as Error)
      },
    )
    return this.carregando
  }

  private falhouAoCarregar(e: Error): Error {
    this.status = 'erro'
    this.erro = e.message
    this.carregando = null
    this.avisar()
    return e
  }

  /** Joga fora o worker do Z3 (e toda a memória dele); o próximo uso cria outro. */
  private descartar(motivo = 'o Z3 foi reiniciado') {
    this.trabalhador?.terminate()
    if (this.trabalhador) this.reinicios++
    this.trabalhador = null
    this.carregando = null
    for (const fim of this.esperando.values()) fim({ erro: motivo })
    this.esperando.clear()
  }

  /**
   * Uma checagem no worker do Z3. Troca o worker antes, se ele já fez muitas;
   * se a checagem falhar (o Z3 quebrou ou travou), tenta mais uma vez num worker novo.
   */
  private async checar(formulas: Formula[], tempoMs: number, numericos: Set<string>, tentativa = 0): Promise<ResultadoZ3> {
    if (this.checagensNoWorker >= RECICLAR_Z3_A_CADA) this.descartar()
    await this.carregar()
    const w = this.trabalhador!
    this.checagensNoWorker++
    this.checagens++
    const id = ++this.proximoId
    const r = await new Promise<Retorno>((ok) => {
      const vigia = setTimeout(() => {
        if (this.esperando.has(id) && this.trabalhador === w) this.descartar('o Z3 não respondeu (travou) e foi reiniciado')
      }, tempoMs + FOLGA_VIGIA_MS)
      this.esperando.set(id, (x) => {
        clearTimeout(vigia)
        ok(x)
      })
      w.postMessage({ tipo: 'checar', id, formulas, tempoMs, numericos: [...numericos] } satisfies PedidoZ3)
    })
    if ('resultado' in r) return r.resultado
    // depois de uma falha o Z3 pode ter ficado num estado ruim: worker novo
    if (this.trabalhador === w) this.descartar()
    if (tentativa === 0) return this.checar(formulas, tempoMs, numericos, 1)
    throw new Error(r.erro)
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
  async provarFormulas(formulas: Formula[], dicionario: EntradaDicionario[], tempoMs = TEMPO_APROFUNDAR_MS): Promise<ResultadoZ3 | null> {
    const chave = `${PREFIXO_CHAVE_Z3}${resumo(`formulas:${JSON.stringify(formulas, (k, v) => (k === 'pos' || k === 'end' ? undefined : v))}`)}`
    const ja = this.confirmacoes.get(chave)
    // "não sei" com menos tempo do que agora: tenta de novo, com o tempo maior (modo de horas)
    const deNovo = ja?.estado === 'feito' && ja.resultado === 'unknown' && (ja.tempoMs ?? TEMPO_APROFUNDAR_MS) < tempoMs
    if (!ja || deNovo) {
      this.confirmacoes.set(chave, { estado: 'rodando' })
      this.fila = this.fila.then(async () => {
        const ini = Date.now()
        try {
          const resultado = await this.checar(formulas, tempoMs, nomesNumericos(dicionario))
          this.confirmacoes.set(chave, { estado: 'feito', resultado, ms: Date.now() - ini, tempoMs })
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
        let prontas = analisar(formulas, dicionario, true)
        const [phi] = negar !== undefined ? analisar([negar], dicionario, true) : []
        if (negar !== undefined && !phi) throw new Error('fórmula inválida')
        const [centro] = phi ? [phi] : foco !== undefined ? analisar([foco], dicionario, true) : []
        if (centro && soRelevantes) prontas = relevantes(prontas, centro)
        const fs = prontas.map((x) => x.expandida)
        if (phi) fs.push(nao(phi.expandida))
        const resultado = await this.checar(fs, TEMPO_Z3_MS, nomesNumericos(dicionario))
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

/** Chave de uma checagem do Z3: fórmulas, fórmula negada e as fichas (tipo, aridade, número), resumidas. */
export const chaveZ3 = (formulas: string[], negar: string | null, dic: EntradaDicionario[]) =>
  `${PREFIXO_CHAVE_Z3}${resumo(JSON.stringify([formulas, negar, dic.map((e) => [e.simbolo, e.tipo, e.aridade, !!e.numerico, e.argumentos ?? null])]))}`
