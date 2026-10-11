// Biblioteca TPTP no aparelho: o pacote com todas as teorias de axiomas do
// TPTP (já traduzidas para a linguagem do caderno) fica guardado num banco
// próprio. Daqui se procura e se carrega no caderno só a teoria que
// interessa — juntar centenas de teorias num caderno só deixaria o motor
// inutilizável, e cada uma usa os nomes à sua maneira.
//
// Pacote: texto com uma linha JSON por teoria (compactado em .gz), lido aos
// poucos (um pacote de centenas de MB não passa inteiro pela memória).

import { useEffect, useReducer } from 'preact/hooks'
import { notaVazia } from './estado'
import { adaptarAoDicionario } from './teorias'
import type { EntradaDicionario, Nota } from './tipos'

export interface FormulaDaTeoria {
  nome: string
  papel: string
  /** já na linguagem do caderno */
  texto: string
}

export interface TeoriaTptp {
  /** nome do arquivo sem .ax, ex. "SET006+0" */
  id: string
  /** raiz, ITP001 ou SET007 */
  pasta: string
  dominio: string
  descricao: string
  formulas: FormulaDaTeoria[]
  fichas: Omit<EntradaDicionario, 'id' | 'definicao'>[]
  /** trechos que não deu para traduzir */
  avisos: number
  /** teoria gigante (ontologia inteira): só no catálogo, com quantas fórmulas tem */
  grande?: number
}

/** O que fica no catálogo (sem as fórmulas). */
export type ItemCatalogo = Omit<TeoriaTptp, 'formulas'> & { nFormulas: number }

/** teorias maiores que isto não entram inteiras no caderno (o motor confere tudo junto) */
export const MAX_FORMULAS_NO_CADERNO = 400

const NOME_DB = 'caderno-biblioteca'

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('catalogo', { keyPath: 'id' })
      r.result.createObjectStore('teorias', { keyPath: 'id' })
    }
    r.onsuccess = () => {
      const db = r.result
      db.onversionchange = () => db.close()
      ok(db)
    }
    r.onerror = () => falha(r.error)
  })
}

const pedido = <T>(r: IDBRequest<T>) =>
  new Promise<T>((ok, falha) => {
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
  })

class Biblioteca {
  catalogo: ItemCatalogo[] = []
  carregado = false
  /** abrindo um pacote: quantas teorias já entraram */
  abrindo: { feitas: number; total: number } | null = null
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

  async carregar() {
    try {
      const db = await abrirDb()
      this.catalogo = (await pedido(db.transaction('catalogo').objectStore('catalogo').getAll())) as ItemCatalogo[]
      db.close()
    } catch {
      this.catalogo = []
    }
    this.carregado = true
    this.mudou()
  }

  /**
   * Lê o pacote (.jsonl ou .jsonl.gz) aos poucos e guarda cada teoria.
   * Substitui o que havia.
   */
  async abrirPacote(arquivo: File) {
    const db = await abrirDb()
    await pedido(db.transaction('catalogo', 'readwrite').objectStore('catalogo').clear())
    await pedido(db.transaction('teorias', 'readwrite').objectStore('teorias').clear())
    this.abrindo = { feitas: 0, total: 0 }
    this.mudou()
    const inicio = new Uint8Array(await arquivo.slice(0, 2).arrayBuffer())
    const bruto: ReadableStream<BufferSource> = arquivo.stream()
    const fluxo: ReadableStream<BufferSource> = inicio[0] === 0x1f && inicio[1] === 0x8b ? bruto.pipeThrough(new DecompressionStream('gzip')) : bruto
    const leitor = fluxo.pipeThrough(new TextDecoderStream()).getReader()
    let resto = ''
    let lote: TeoriaTptp[] = []
    const gravar = async () => {
      if (!lote.length) return
      const tx = db.transaction(['catalogo', 'teorias'], 'readwrite')
      for (const t of lote) {
        tx.objectStore('teorias').put(t)
        const { formulas, ...cat } = t
        tx.objectStore('catalogo').put({ ...cat, nFormulas: t.grande ?? formulas.length })
      }
      await new Promise<void>((ok, falha) => {
        tx.oncomplete = () => ok()
        tx.onerror = () => falha(tx.error)
      })
      this.abrindo = { feitas: this.abrindo!.feitas + lote.length, total: this.abrindo!.total }
      lote = []
      this.mudou()
    }
    const linha = async (l: string) => {
      if (!l.trim()) return
      const o = JSON.parse(l)
      if (o.tipo === 'cabecalho') {
        if (o.formato !== 'biblioteca-tptp') throw new Error('este arquivo não é um pacote da biblioteca TPTP do Caderno')
        this.abrindo = { feitas: 0, total: o.teorias }
      } else if (o.tipo === 'teoria') {
        delete o.tipo
        lote.push(o as TeoriaTptp)
        if (lote.length >= 50) await gravar()
      }
    }
    try {
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        resto += value
        let i: number
        while ((i = resto.indexOf('\n')) >= 0) {
          await linha(resto.slice(0, i))
          resto = resto.slice(i + 1)
        }
      }
      await linha(resto)
      await gravar()
    } finally {
      db.close()
      this.abrindo = null
    }
    await this.carregar()
  }

  async teoria(id: string): Promise<TeoriaTptp | undefined> {
    const db = await abrirDb()
    try {
      return (await pedido(db.transaction('teorias').objectStore('teorias').get(id))) as TeoriaTptp | undefined
    } finally {
      db.close()
    }
  }

  /** Apaga a biblioteca do aparelho (as teorias já carregadas no caderno ficam). */
  async apagar() {
    this.catalogo = []
    this.mudou()
    await new Promise<void>((ok) => {
      const r = indexedDB.deleteDatabase(NOME_DB)
      r.onsuccess = r.onerror = () => ok()
      r.onblocked = () => setTimeout(ok, 2000)
    })
  }
}

export const biblioteca = new Biblioteca()

export function useBiblioteca(): Biblioteca {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => biblioteca.assinar(() => forcar(undefined)), [])
  return biblioteca
}

const sem = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Procura por nome, área, descrição ou símbolo. */
export function procurar(catalogo: ItemCatalogo[], busca: string, dominio: string | null): ItemCatalogo[] {
  const termos = sem(busca).split(/\s+/).filter(Boolean)
  return catalogo.filter((t) => {
    if (dominio && t.dominio !== dominio) return false
    if (!termos.length) return true
    const alvo = sem(`${t.id} ${t.dominio} ${t.descricao} ${t.fichas.map((f) => `${f.simbolo} ${f.termo}`).join(' ')}`)
    return termos.every((x) => alvo.includes(x))
  })
}

/** Pontes entre nomes do TPTP e símbolos da própria linguagem (∈, ⊆). */
const PONTES: { simbolo: string; aridade: number; operador: string; formula: (p: string) => string; leitura: string }[] = [
  { simbolo: 'member', aridade: 2, operador: '∈', formula: (p) => `∀x ∀y (${p}(x, y) ⟺ x ∈ y)`, leitura: 'member(x, y) é o mesmo que x ∈ y' },
  { simbolo: 'subset', aridade: 2, operador: '⊆', formula: (p) => `∀x ∀y (${p}(x, y) ⟺ x ⊆ y)`, leitura: 'subset(x, y) é o mesmo que x ⊆ y' },
]

/**
 * Quanto a teoria conversa com o caderno: símbolos em comum com o dicionário
 * (mesmo nome, tipo e aridade) e pontes possíveis (member ↔ ∈, subset ↔ ⊆,
 * quando o caderno usa ∈ e ⊆).
 */
export function conversa(t: ItemCatalogo, dicionario: EntradaDicionario[], usaOperadores: Set<string>): { comuns: string[]; pontes: string[] } {
  const dic = new Map(dicionario.map((e) => [sem(e.simbolo), e]))
  const comuns = t.fichas.filter((f) => {
    const e = dic.get(sem(f.simbolo))
    return e && e.tipo === f.tipo && e.aridade === f.aridade
  })
  const pontes = PONTES.filter((p) => usaOperadores.has(p.operador) && t.fichas.some((f) => f.simbolo === p.simbolo && f.aridade === p.aridade))
  return { comuns: comuns.map((f) => f.simbolo), pontes: pontes.map((p) => `${p.simbolo} ↔ ${p.operador}`) }
}

/** Os operadores de conjunto que o caderno usa (para as pontes). */
export const operadoresDoCaderno = (notas: Nota[]) => new Set(['∈', '⊆'].filter((op) => notas.some((n) => n.formulas.some((f) => f.includes(op)))))

/**
 * As notas e fichas de uma teoria da biblioteca, ajustadas ao dicionário; com
 * as leis-ponte (member ↔ ∈, subset ↔ ⊆) quando o caderno usa ∈ e ⊆.
 */
export function notasDaBiblioteca(t: TeoriaTptp, dicionario: EntradaDicionario[], usaOperadores: Set<string>): { fichas: EntradaDicionario[]; notas: Nota[] } {
  const fonte = `TPTP (seetptp.tptp.org): Axioms/${t.pasta === 'raiz' ? '' : `${t.pasta}/`}${t.id}.ax`
  const { fichas, trocar, nomes } = adaptarAoDicionario(
    t.fichas.map((f) => ({ ...f, definicao: `Do TPTP: ${t.id} (${t.dominio}).` })),
    dicionario,
  )
  const pasta = `tptp-${t.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const agora = new Date().toISOString()
  const notas: Nota[] = t.formulas.map((f) => {
    const teorema = ['conjecture', 'theorem', 'lemma', 'corollary'].includes(f.papel)
    return {
      ...notaVazia(teorema ? 'teorema' : 'lei'),
      id: `${pasta}-${f.nome}`,
      titulo: `${f.nome} (${t.id})`,
      formulas: [trocar(f.texto)],
      tags: [pasta, 'tptp'],
      fonte,
      texto: `${t.dominio}: ${t.descricao}`,
      criadaEm: agora,
      atualizadaEm: agora,
    }
  })
  for (const p of PONTES)
    if (usaOperadores.has(p.operador) && t.fichas.some((f) => f.simbolo === p.simbolo && f.aridade === p.aridade))
      notas.push({
        ...notaVazia('lei'),
        id: `${pasta}-ponte-${p.simbolo}`,
        titulo: `Ponte: ${p.leitura} (${t.id})`,
        formulas: [trocar(p.formula(nomes.get(p.simbolo) ?? p.simbolo))],
        tags: [pasta, 'tptp', 'ponte'],
        grau: 'D',
        fonte,
        texto: `Lei-ponte criada pelo Caderno: liga o nome do TPTP (${p.simbolo}) ao símbolo da linguagem (${p.operador}), para a teoria conversar com o resto do caderno. É uma decisão (grau D).`,
        criadaEm: agora,
        atualizadaEm: agora,
      })
  return { fichas, notas }
}
