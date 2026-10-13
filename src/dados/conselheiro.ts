// O conselheiro: aprende com o que já foi conferido e só muda a ORDEM e o
// RECORTE do que o juiz (motor finito e Z3) confere — nunca o veredito.
//
// Ele guarda duas coisas:
// - cenários (mundos) já achados em que as notas de um conjunto valiam. Se as
//   notas de AGORA ainda valem num deles e a pergunta é falsa nele, ela não
//   segue — e isso é um cenário real, não palpite: decide na hora, sem procurar.
// - as notas que cada prova do Z3 usou. Para uma pergunta nova, as notas que
//   provaram perguntas parecidas (com os mesmos nomes) e as que falam dos
//   mesmos nomes vão primeiro ao Z3, sozinhas. Sem modelo com menos notas =
//   sem modelo com todas; com modelo não vale nada (pode ser falta de nota), e
//   o Z3 tenta de novo com mais.
// Cada tentativa fica registrada, para medir se ele está ajudando.

import { useEffect, useReducer } from 'preact/hooks'
import type { Formula } from '../logica/ast'
import { resumo } from '../logica/resumo'
import { estadoEfetivo, type ContextoCadeia, type PedidoCadeia, type RelatorioCadeia } from '../motor/cadeia'
import { sugerirNotas, valeNoMundo, type ConselhoCadeia } from '../motor/conselho'
import { analisar, nomesDaFormula, type Grupo, type Modelo } from '../motor/motor'
import type { EntradaDicionario } from './tipos'

export { julgarNosMundos, sugerirNotas, valeNoMundo } from '../motor/conselho'

export interface MundoGuardado {
  id: string
  /** "geral" ou "visao:<titular>" */
  contexto: string
  modelo: Modelo
  /**
   * as notas do conjunto quando ele foi achado, se ele vale para todas elas
   * (se ainda forem as mesmas, nem precisa reconferir); '' = reconferir sempre
   */
  assinatura: string
  quando: number
}

export interface ProvaGuardada {
  id: string
  contexto: string
  /** os nomes da fórmula provada */
  simbolos: string[]
  /** as notas que a prova usou */
  notas: string[]
  quando: number
}

/** onde a tentativa foi decidida (ou não) */
export type Etapa = 'mundos' | 'sugeridas' | 'ligadas' | 'todas' | 'finito'

export interface Tentativa {
  quando: number
  contexto: string
  etapa: Etapa
  /** notas que entraram */
  premissas: number
  /** notas do conjunto */
  total: number
  /** 'unsat' | 'sat' | 'unknown' (Z3), o tipo do motor finito, ou o que os cenários disseram */
  resultado: string
  ms: number
}

const MAX_MUNDOS_POR_CONTEXTO = 40
const MAX_PROVAS = 3000
const MAX_TENTATIVAS = 5000
/** quantas provas vão para cada rodada da reação em cadeia (as mais novas) */
const PROVAS_POR_RODADA = 400
/** tempo máximo para reconferir os cenários guardados depois que as notas mudam (o resto fica para a próxima) */
const PRAZO_RECONFERIR_MS = 300

/** a assinatura das notas de um conjunto (a mesma para as mesmas fórmulas, em qualquer ordem) */
export const assinaturaNotas = (grupos: Grupo[]) => resumo(JSON.stringify(grupos.flatMap((g) => g.formulas.map((f) => f.trim())).sort()))

// ------------------------------------------------------------ guardado

const NOME_DB = 'caderno-conselheiro'
const LOJAS = ['mundos', 'provas', 'tentativas'] as const

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_DB, 1)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains('mundos')) db.createObjectStore('mundos', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('provas')) db.createObjectStore('provas', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('tentativas')) db.createObjectStore('tentativas', { autoIncrement: true })
    }
    r.onsuccess = () => {
      const db = r.result
      db.onversionchange = () => db.close()
      ok(db)
    }
    r.onerror = () => falha(r.error)
  })
}

export interface EstatisticasConselheiro {
  mundos: number
  provas: number
  tentativas: number
  /** perguntas decididas só pelos cenários guardados */
  decididasPorMundos: number
  /** perguntas em que um cenário guardado mostrou que não segue */
  refutadasPorMundos: number
  /** provas do Z3 só com as notas sugeridas: quantas, e em média quantas notas de quantas */
  provasSugeridas: { n: number; premissas: number; total: number; ms: number }
  /** provas que precisaram das ligadas pelos nomes, ou de todas */
  provasComMais: { n: number; ms: number }
  /** checagens do Z3 que não decidiram */
  semDecisao: number
}

class Conselheiro {
  mundos: MundoGuardado[] = []
  provas: ProvaGuardada[] = []
  tentativas: Tentativa[] = []
  carregado = false
  private db: Promise<IDBDatabase> | null = null
  private carregando: Promise<void> | null = null
  /** cenário + assinatura das notas → as notas valem nele? */
  private conferidos = new Map<string, boolean>()
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => void this.ouvintes.delete(fn)
  }
  private mudou() {
    this.ouvintes.forEach((f) => f())
  }
  private banco() {
    if (typeof indexedDB === 'undefined') return null
    this.db ??= abrirDb().catch((e) => {
      this.db = null
      throw e
    })
    return this.db
  }
  private async escrever(fn: (tx: IDBTransaction) => void, lojas: readonly string[] = LOJAS) {
    const p = this.banco()
    if (!p) return
    try {
      const db = await p
      const tx = db.transaction([...lojas], 'readwrite')
      fn(tx)
      await new Promise<void>((ok, falha) => {
        tx.oncomplete = () => ok()
        tx.onerror = () => falha(tx.error)
      })
    } catch {
      /* sem banco: fica só na memória desta sessão */
    }
  }

  carregar(): Promise<void> {
    this.carregando ??= (async () => {
      const p = this.banco()
      if (p) {
        try {
          const db = await p
          const ler = <T>(loja: string) =>
            new Promise<T[]>((ok, falha) => {
              const r = db.transaction(loja).objectStore(loja).getAll()
              r.onsuccess = () => ok(r.result as T[])
              r.onerror = () => falha(r.error)
            })
          this.mundos = await ler<MundoGuardado>('mundos')
          this.provas = await ler<ProvaGuardada>('provas')
          this.tentativas = (await ler<Tentativa>('tentativas')).slice(-MAX_TENTATIVAS)
        } catch {
          /* sem banco */
        }
      }
      this.carregado = true
      this.mudou()
    })()
    return this.carregando
  }

  /** Um cenário em que as notas do conjunto valem (achado pelo motor finito). */
  guardarMundo(contexto: string, modelo: Modelo, assinatura: string) {
    const id = resumo(`${contexto}|${JSON.stringify(modelo)}`)
    if (this.mundos.some((m) => m.id === id)) return
    const novo: MundoGuardado = { id, contexto, modelo, assinatura, quando: Date.now() }
    this.mundos.push(novo)
    // por conjunto, ficam os mais novos
    const doContexto = this.mundos.filter((m) => m.contexto === contexto)
    const saem = doContexto.length > MAX_MUNDOS_POR_CONTEXTO ? doContexto.sort((a, b) => a.quando - b.quando).slice(0, doContexto.length - MAX_MUNDOS_POR_CONTEXTO) : []
    if (saem.length) this.mundos = this.mundos.filter((m) => !saem.includes(m))
    void this.escrever((tx) => {
      const loja = tx.objectStore('mundos')
      loja.put(novo)
      for (const m of saem) loja.delete(m.id)
    }, ['mundos'])
    this.mudou()
  }

  /** As notas que uma prova do Z3 usou. */
  guardarProva(contexto: string, simbolos: string[], notas: string[]) {
    if (!notas.length || !simbolos.length) return
    const s = [...new Set(simbolos)].sort()
    const ns = [...new Set(notas)].sort()
    const id = resumo(`${contexto}|${s.join(',')}|${ns.join(',')}`)
    if (this.provas.some((p) => p.id === id)) return
    const nova: ProvaGuardada = { id, contexto, simbolos: s, notas: ns, quando: Date.now() }
    this.provas.push(nova)
    const saem = this.provas.length > MAX_PROVAS ? this.provas.splice(0, this.provas.length - MAX_PROVAS) : []
    void this.escrever((tx) => {
      const loja = tx.objectStore('provas')
      loja.put(nova)
      for (const p of saem) loja.delete(p.id)
    }, ['provas'])
    this.mudou()
  }

  registrar(t: Tentativa) {
    this.tentativas.push(t)
    if (this.tentativas.length > MAX_TENTATIVAS) this.tentativas.splice(0, this.tentativas.length - MAX_TENTATIVAS)
    void this.escrever((tx) => {
      const loja = tx.objectStore('tentativas')
      loja.add(t)
      // de tempos em tempos, as mais antigas saem
      if (Math.random() < 0.02) {
        const r = loja.getAllKeys()
        r.onsuccess = () => {
          const chaves = r.result as number[]
          if (chaves.length > MAX_TENTATIVAS) loja.delete(IDBKeyRange.upperBound(chaves[chaves.length - MAX_TENTATIVAS - 1]))
        }
      }
    }, ['tentativas'])
    this.mudou()
  }

  /**
   * Os cenários guardados do conjunto em que as notas de agora valem. Os
   * achados com as mesmas notas valem direto; os outros são reconferidos
   * (com prazo: o que não der tempo fica para a próxima pergunta).
   */
  mundosValidos(contexto: string, assinatura: string, notas: Formula[]): Modelo[] {
    const r: Modelo[] = []
    const ate = Date.now() + PRAZO_RECONFERIR_MS
    for (const m of [...this.mundos].filter((x) => x.contexto === contexto).sort((a, b) => b.quando - a.quando)) {
      const k = `${m.id}|${assinatura}`
      let ok = m.assinatura && m.assinatura === assinatura ? true : this.conferidos.get(k)
      if (ok === undefined) {
        if (Date.now() > ate) continue
        ok = notas.every((f) => valeNoMundo(f, m.modelo) === true)
        this.conferidos.set(k, ok)
      }
      if (ok) r.push(m.modelo)
    }
    return r
  }

  /** As notas que vão primeiro ao Z3 numa pergunta sobre `phi` (ids, da mais promissora). */
  sugerir(contexto: string, phi: Formula, grupos: { id: string; itens: Formula[] }[]): string[] {
    const disponiveis = grupos.map((g) => ({ id: g.id, simbolos: [...new Set(g.itens.flatMap(nomesDaFormula))] }))
    return sugerirNotas(
      this.provas.filter((p) => p.contexto === contexto),
      [...new Set(nomesDaFormula(phi))],
      disponiveis,
    )
  }

  /** O que vai para uma rodada da reação em cadeia, por conjunto: os cenários e as provas guardados dele. */
  conselhoPara(contexto: string): ConselhoCadeia {
    return {
      mundos: this.mundos.filter((m) => m.contexto === contexto).map((m) => m.modelo),
      provas: this.provas
        .filter((p) => p.contexto === contexto)
        .slice(-PROVAS_POR_RODADA)
        .map((p) => ({ simbolos: p.simbolos, notas: p.notas })),
    }
  }

  /** O pedido da rodada com o conselho de cada conjunto (sem nada aprendido, como está). */
  comConselho(pedido: PedidoCadeia): PedidoCadeia {
    if (!this.mundos.length && !this.provas.length) return pedido
    return {
      ...pedido,
      contextos: pedido.contextos.map((c): ContextoCadeia => {
        const conselho = this.conselhoPara(c.chave)
        return conselho.mundos.length || conselho.provas.length ? { ...c, conselho } : c
      }),
    }
  }

  /** O que uma rodada da reação em cadeia ensina: os cenários das leis e as notas de cada prova do Z3. */
  aprenderDaCadeia(relatorios: RelatorioCadeia[], contextos: { chave: string; grupos: Grupo[] }[], dicionario: EntradaDicionario[]) {
    for (const r of relatorios) {
      const c = contextos.find((x) => x.chave === r.chave)
      if (!c) continue
      // com notas de números, o cenário do motor finito não vale para elas
      if (c.grupos.some((g) => analisar(g.formulas, dicionario, true).some((f) => f.aritmetica))) continue
      // a rodada separa as notas em blocos independentes (e deixa as pesadas à parte): um cenário dela
      // pode valer só para parte das notas — sem assinatura, ele é sempre reconferido antes de ser usado
      if (r.consistencia?.tipo === 'consistente') this.guardarMundo(r.chave, r.consistencia.modelo, '')
      for (const m of r.conselho?.aFavor ?? []) this.guardarMundo(r.chave, m, '')
      for (const t of r.teoremas) {
        const e = estadoEfetivo(t)
        if (!t.z3 && (t.resultado.tipo === 'nao-segue' || t.resultado.tipo === 'contradiz')) this.guardarMundo(r.chave, t.resultado.mundo.modelo, '')
        if (e.provado && (e.tipo === 'segue' || e.tipo === 'contradiz') && (t.resultado.tipo === 'segue' || t.resultado.tipo === 'contradiz')) {
          const [phi] = analisar([t.formula], dicionario, true)
          if (phi) this.guardarProva(r.chave, nomesDaFormula(phi.expandida), t.resultado.notas)
        }
      }
    }
  }

  estatisticas(): EstatisticasConselheiro {
    const ts = this.tentativas
    const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
    const sug = ts.filter((t) => t.etapa === 'sugeridas' && t.resultado === 'unsat')
    const mais = ts.filter((t) => (t.etapa === 'ligadas' || t.etapa === 'todas') && t.resultado === 'unsat')
    return {
      mundos: this.mundos.length,
      provas: this.provas.length,
      tentativas: ts.length,
      decididasPorMundos: ts.filter((t) => t.etapa === 'mundos' && t.resultado === 'decidiu').length,
      refutadasPorMundos: ts.filter((t) => t.etapa === 'mundos' && (t.resultado === 'decidiu' || t.resultado === 'refutou')).length,
      provasSugeridas: { n: sug.length, premissas: media(sug.map((t) => t.premissas)), total: media(sug.map((t) => t.total)), ms: media(sug.map((t) => t.ms)) },
      provasComMais: { n: mais.length, ms: media(mais.map((t) => t.ms)) },
      semDecisao: ts.filter((t) => t.etapa !== 'mundos' && t.etapa !== 'finito' && t.resultado === 'unknown').length,
    }
  }

  /** Esquece tudo o que aprendeu (as respostas não mudam: só a ordem e o tempo). */
  async esquecer() {
    this.mundos = []
    this.provas = []
    this.tentativas = []
    this.conferidos.clear()
    await this.escrever((tx) => {
      for (const l of LOJAS) tx.objectStore(l).clear()
    })
    this.mudou()
  }
}

export const conselheiro = new Conselheiro()

export function useConselheiro(): Conselheiro {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => conselheiro.assinar(() => forcar(undefined)), [])
  return conselheiro
}
