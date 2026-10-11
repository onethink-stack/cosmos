// Vários núcleos ao mesmo tempo: as checagens independentes (cada teorema,
// cada lei batida com as outras, a lei que falta de cada teorema, cada
// conclusão no aprofundamento) vão para um conjunto de workers, um por núcleo
// livre do aparelho. Sem workers (testes, navegador que não deixa criar),
// roda tudo aqui mesmo, uma por vez — o resultado é o mesmo.

import type { EntradaDicionario } from '../dados/tipos'
import type { Formula } from '../logica/ast'
import { estadoDaLei, type EstadoLei } from './cadeia'
import { procurarLeis, type ResultadoLacunas } from './lacunas'
import { analisar, buscarNaFaixa, minimizarRapido, perguntar, type BuscaFaixa, type Grupo, type OpcoesMotor, type ResultadoPergunta } from './motor'

export type Trabalho =
  /** procura modelo só nesses tamanhos (o aprofundamento); `prazoMs` conta a partir de quando começa */
  | { tipo: 'faixa'; formulas: Formula[]; ns: number[]; ks: number[]; limite: number; prazoMs?: number }
  /** `prazoMs`: cada teorema desiste depois disso (fica "não decidiu a tempo"); conta de quando começa */
  | { tipo: 'perguntar'; grupos: Grupo[]; formula: string; dicionario: EntradaDicionario[]; op: OpcoesMotor; prazoMs?: number }
  | { tipo: 'lacunas'; grupos: Grupo[]; inativas: Grupo[]; formula: string; dicionario: EntradaDicionario[]; op: OpcoesMotor }
  /** a lei decorre das outras ou é independente? */
  | { tipo: 'lei'; grupos: Grupo[]; alvo: string; dicionario: EntradaDicionario[]; op: OpcoesMotor }
  /** os grupos necessários para `fixas` não ter modelo (ids); cada checagem com prazo, que conta de quando começa */
  | { tipo: 'minimizar'; grupos: Grupo[]; fixas: Formula[]; dicionario: EntradaDicionario[]; op: OpcoesMotor; prazoMs?: number }

export type ResultadoDe<T extends Trabalho> = T['tipo'] extends 'faixa'
  ? BuscaFaixa
  : T['tipo'] extends 'perguntar'
    ? ResultadoPergunta
    : T['tipo'] extends 'lacunas'
      ? ResultadoLacunas
      : T['tipo'] extends 'minimizar'
        ? string[]
        : EstadoLei

export function executarTrabalho(t: Trabalho): unknown {
  switch (t.tipo) {
    case 'faixa':
      return buscarNaFaixa(t.formulas, t.ns, t.ks, t.limite, t.prazoMs ? Date.now() + t.prazoMs : undefined)
    case 'perguntar':
      return perguntar(t.grupos, t.formula, t.dicionario, t.prazoMs ? { ...t.op, prazo: Date.now() + t.prazoMs } : t.op)
    case 'lacunas':
      return procurarLeis(t.grupos, t.inativas, t.formula, t.dicionario, t.op)
    case 'lei':
      return estadoDaLei(t.grupos, t.alvo, t.dicionario, t.op)
    case 'minimizar': {
      const prontos = t.grupos.map((g) => ({ g, itens: analisar(g.formulas, t.dicionario) })).filter((x) => x.itens.length)
      const op = t.prazoMs ? { ...t.op, prazo: Date.now() + t.prazoMs } : t.op
      return minimizarRapido(prontos, t.fixas, op, 0).map((x) => x.g.id)
    }
  }
}

export interface Pool {
  /** quantos trabalhos rodam ao mesmo tempo */
  readonly tamanho: number
  rodar(t: Trabalho): Promise<unknown>
  encerrar(): void
}

/** Sem workers: um trabalho por vez, aqui mesmo. */
class PoolLocal implements Pool {
  readonly tamanho = 1
  private fila: Promise<unknown> = Promise.resolve()
  // em fila: cada trabalho começa depois que o anterior acabou e foi avisado (o progresso aparece um a um)
  rodar(t: Trabalho) {
    const r = this.fila.then(() => executarTrabalho(t))
    this.fila = r.catch(() => {})
    return r
  }
  encerrar() {}
}

interface Pendente {
  t: Trabalho
  ok: (r: unknown) => void
  falha: (e: Error) => void
}

/** Um worker por núcleo; cada um pega o próximo trabalho da fila quando fica livre. */
export class PoolWorkers implements Pool {
  private workers: Worker[] = []
  private livres: Worker[] = []
  private fila: Pendente[] = []
  private emCurso = new Map<Worker, Pendente>()

  constructor(
    private criar: () => Worker,
    readonly tamanho: number,
  ) {
    for (let i = 0; i < tamanho; i++) this.adicionar()
  }

  private adicionar() {
    const w = this.criar()
    w.onmessage = (e: MessageEvent<{ resultado?: unknown; erro?: string }>) => {
      const p = this.emCurso.get(w)
      this.emCurso.delete(w)
      this.livres.push(w)
      if (p) e.data.erro !== undefined ? p.falha(new Error(e.data.erro)) : p.ok(e.data.resultado)
      this.despachar()
    }
    // o worker quebrou (ex.: faltou memória): o trabalho falha e entra um worker novo no lugar
    w.onerror = (e) => {
      e.preventDefault?.()
      const p = this.emCurso.get(w)
      this.emCurso.delete(w)
      this.workers = this.workers.filter((x) => x !== w)
      w.terminate()
      p?.falha(new Error(e.message || 'um worker do motor parou (memória?)'))
      this.adicionar()
      this.despachar()
    }
    this.workers.push(w)
    this.livres.push(w)
  }

  rodar(t: Trabalho): Promise<unknown> {
    return new Promise((ok, falha) => {
      this.fila.push({ t, ok, falha })
      this.despachar()
    })
  }

  private despachar() {
    while (this.livres.length && this.fila.length) {
      const w = this.livres.pop()!
      const p = this.fila.shift()!
      this.emCurso.set(w, p)
      w.postMessage(p.t)
    }
  }

  encerrar() {
    for (const w of this.workers) w.terminate()
    for (const p of [...this.emCurso.values(), ...this.fila]) p.falha(new Error('encerrado'))
    this.workers = []
    this.livres = []
    this.fila = []
    this.emCurso.clear()
  }
}

let pool: Pool = new PoolLocal()

export const poolAtual = () => pool

/** Troca o conjunto de workers (o anterior é encerrado). */
export function definirPool(p: Pool) {
  if (p !== pool) pool.encerrar()
  pool = p
}

/** Volta a rodar tudo aqui mesmo (testes, ou quando não dá para criar workers). */
export function semParalelo() {
  definirPool(new PoolLocal())
}

/**
 * Roda um trabalho por item, todos ao mesmo tempo (até o tamanho do pool),
 * e devolve os resultados na ordem dos itens. `aoTerminar` é chamado a cada
 * um que acaba (na ordem em que acabam).
 */
export async function emParalelo<I, T extends Trabalho>(itens: I[], trabalho: (x: I, i: number) => T, aoTerminar?: (i: number, r: ResultadoDe<T>) => void): Promise<ResultadoDe<T>[]> {
  return Promise.all(
    itens.map(async (x, i) => {
      const r = (await pool.rodar(trabalho(x, i))) as ResultadoDe<T>
      aoTerminar?.(i, r)
      return r
    }),
  )
}

/** Deixa as mensagens que chegaram (ex.: respostas do Z3) serem tratadas antes de seguir. */
export const darVez = () => new Promise<void>((ok) => setTimeout(ok, 0))
