// Histórico: tudo o que a reação em cadeia e o segundo modelo já concluíram —
// teoremas decididos, consequências descobertas, leis que o modelo adotou ou
// induziu, conflitos —, guardado no aparelho num banco próprio. Uma rodada
// nova não apaga o que a anterior achou (as rodadas em si só guardam as
// últimas); o backup leva o histórico junto.
//
// Cada achado aparece uma vez: o mesmo teorema com o mesmo resultado só
// atualiza a última vez e conta quantas rodadas chegaram a ele; se o
// resultado muda (passou a seguir, foi refutado), entra um achado novo — dá
// para ver a evolução.

import { useEffect, useReducer } from 'preact/hooks'
import type { RelatorioCadeia } from '../motor/cadeia'
import type { RelatorioModelo } from '../motor/modelo'
import type { Nota } from './tipos'

export type TipoAchado = 'teorema' | 'consequencia' | 'lei' | 'conflito'

export type ResultadoAchado =
  /** teorema que segue (até N objetos) */
  | 'segue'
  | 'nao-segue'
  /** as leis implicam o contrário */
  | 'contradiz'
  | 'tempo'
  /** consequência nova, ainda não escrita */
  | 'descoberta'
  /** lei criada pelo segundo modelo para fechar teoremas */
  | 'adotada'
  /** lei induzida dos dados do mundo */
  | 'induzida'
  /** leis (ou teses) que juntas se contradizem */
  | 'conflito'

export interface Achado {
  chave: string
  tipo: TipoAchado
  resultado: ResultadoAchado
  formula: string
  titulo: string
  explicacao: string
  /** o conjunto: "Leis e fatos", "Visão de …" */
  contexto: string
  origem: 'cadeia' | 'modelo'
  /** até quantos objetos (e mundos) foi conferido */
  N: number
  K: number
  /** as notas de onde vem (id e título na hora em que foi achado) */
  notas: { id: string; titulo: string }[]
  primeiraVez: string
  ultimaVez: string
  /** quantas rodadas chegaram a ele */
  vezes: number
  /** a rodada (ou execução do modelo) que o registrou por último */
  ultimoRegistro: string
}

export type NovoAchado = Omit<Achado, 'chave' | 'primeiraVez' | 'ultimaVez' | 'vezes' | 'ultimoRegistro'>

export const NOME_RESULTADO: Record<ResultadoAchado, string> = {
  segue: '✓ segue',
  'nao-segue': '✗ não segue',
  contradiz: '✗ refutado',
  tempo: '⏱ não decidiu a tempo',
  descoberta: '✨ consequência nova',
  adotada: 'lei adotada pelo modelo',
  induzida: 'lei induzida dos dados',
  conflito: '⚠ conflito',
}

const sem = (f: string) => f.replace(/\s+/g, '')
const chaveDe = (a: NovoAchado) => [a.tipo, a.origem, a.contexto, sem(a.formula), a.resultado].join('|')

/** id da nota de um id de teorema ("nota:0") */
const notaDe = (id: string) => {
  const k = id.lastIndexOf(':')
  return k > 0 && /^\d+$/.test(id.slice(k + 1)) ? id.slice(0, k) : id
}
const comTitulos = (ids: string[], notas: Nota[]) =>
  [...new Set(ids)].map((id) => ({ id: notaDe(id), titulo: notas.find((n) => n.id === notaDe(id))?.titulo || 'Sem título' }))

/** O que uma rodada da reação em cadeia concluiu (só o que foi decidido). */
export function achadosDaCadeia(relatorios: RelatorioCadeia[], notas: Nota[]): NovoAchado[] {
  const r: NovoAchado[] = []
  for (const rel of relatorios) {
    const base = { contexto: rel.rotulo, origem: 'cadeia' as const, N: rel.N, K: rel.K }
    if (rel.consistencia?.tipo === 'sem-modelo')
      r.push({
        ...base,
        tipo: 'conflito',
        resultado: 'conflito',
        formula: '',
        titulo: `${rel.rotulo}: as leis se contradizem`,
        explicacao: 'conflito mínimo entre',
        notas: comTitulos(rel.consistencia.conflito, notas),
      })
    for (const t of rel.teoremas) {
      const titulo = notas.find((n) => n.id === t.notaId)?.titulo || 'Sem título'
      const res = t.resultado
      const ate = `em todos os cenários até ${rel.N} objeto${rel.N > 1 ? 's' : ''} (ainda sem prova para cenários maiores)`
      // o Z3 achou um cenário (maior que os testados, ou infinito) em que as leis valem e ele falha
      if (t.z3 === 'nao-segue' || t.z3 === 'nao-contradiz')
        r.push({
          ...base,
          tipo: 'teorema',
          resultado: 'nao-segue',
          formula: t.formula,
          titulo,
          explicacao:
            t.z3 === 'nao-contradiz'
              ? 'não segue, e as leis também não o contradizem: o Z3 achou um cenário em que as leis e ele valem juntos'
              : 'o Z3 achou um cenário (maior que os testados, ou infinito) em que as leis valem e ele falha',
          notas: [],
        })
      else if (res.tipo === 'segue') {
        const apoio = t.apoio?.length ? t.apoio : res.notas
        const como = t.z3 === 'segue' ? 'provado (vale com qualquer número de objetos)' : `segue ${ate}`
        r.push({
          ...base,
          tipo: 'teorema',
          resultado: 'segue',
          formula: t.formula,
          titulo,
          explicacao: apoio.length ? `${como}; vem de` : `${como}, sem precisar de lei`,
          notas: comTitulos(apoio, notas),
        })
      } else if (res.tipo === 'nao-segue')
        r.push({ ...base, tipo: 'teorema', resultado: 'nao-segue', formula: t.formula, titulo, explicacao: `há um cenário com ${res.mundo.n} objeto${res.mundo.n > 1 ? 's' : ''} em que as leis valem e ele falha`, notas: [] })
      else if (res.tipo === 'contradiz')
        r.push({
          ...base,
          tipo: 'teorema',
          resultado: 'contradiz',
          formula: t.formula,
          titulo,
          explicacao: `as leis implicam o contrário${t.z3 === 'contradiz' ? ' (provado, qualquer número de objetos)' : ` ${ate}`}; vem de`,
          notas: comTitulos(res.notas, notas),
        })
      else if (res.tipo === 'tempo')
        r.push({
          ...base,
          tipo: 'teorema',
          resultado: 'tempo',
          formula: t.formula,
          titulo,
          explicacao: res.n > 1 ? `sem contraexemplo até ${res.n - 1} objetos; com ${res.n}, passou do prazo` : 'passou do prazo',
          notas: [],
        })
    }
    for (const q of rel.consequencias ?? [])
      r.push({ ...base, tipo: 'consequencia', resultado: 'descoberta', formula: q.formula, titulo: q.descricao, explicacao: 'consequência nova; vem de', notas: comTitulos(q.notas, notas) })
  }
  return r
}

/** O que o segundo modelo concluiu (teoremas, descobertas, leis que criou). */
export function achadosDoModelo(rel: RelatorioModelo): NovoAchado[] {
  const r: NovoAchado[] = []
  const N = rel.final?.[0]?.N ?? rel.N
  const K = rel.final?.[0]?.K ?? rel.K
  for (const it of rel.itens) {
    const contexto = it.chave === 'geral' ? 'Leis e fatos' : it.chave.startsWith('visao:') ? `Visão de ${it.chave.slice('visao:'.length)}` : it.chave
    const tipoRes: [TipoAchado, ResultadoAchado] | null =
      it.classe === 'provado'
        ? ['teorema', 'segue']
        : it.classe === 'refutado'
          ? ['teorema', 'contradiz']
          : it.classe === 'tese'
            ? ['teorema', 'nao-segue']
            : it.classe === 'conflito'
              ? ['teorema', 'conflito']
              : it.classe === 'descoberta'
                ? ['consequencia', 'descoberta']
                : it.classe === 'adotada'
                  ? ['lei', 'adotada']
                  : it.classe === 'induzida'
                    ? ['lei', 'induzida']
                    : null
    if (!tipoRes) continue
    r.push({
      tipo: tipoRes[0],
      resultado: tipoRes[1],
      formula: it.formula,
      titulo: it.titulo,
      explicacao: it.explicacao,
      contexto,
      origem: 'modelo',
      N,
      K,
      notas: comTitulos(it.apoio ?? [], rel.notas),
    })
  }
  return r
}

// ------------------------------------------------------------- guardado

const NOME_DB = 'caderno-historico'
const LOJA = 'achados'

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_DB, 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA, { keyPath: 'chave' })
    }
    r.onsuccess = () => {
      const db = r.result
      db.onversionchange = () => db.close()
      ok(db)
    }
    r.onerror = () => falha(r.error)
  })
}

class Historico {
  achados: Achado[] = []
  carregado = false
  private db: Promise<IDBDatabase> | null = null
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
  private async gravar(as: Achado[]) {
    const p = this.banco()
    if (!p || !as.length) return
    try {
      const db = await p
      const tx = db.transaction(LOJA, 'readwrite')
      for (const a of as) tx.objectStore(LOJA).put(a)
      await new Promise<void>((ok, falha) => {
        tx.oncomplete = () => ok()
        tx.onerror = () => falha(tx.error)
      })
    } catch {
      /* sem banco: fica só na memória desta sessão */
    }
  }

  async carregar() {
    const p = this.banco()
    if (p)
      try {
        const db = await p
        const lidos = await new Promise<Achado[]>((ok, falha) => {
          const q = db.transaction(LOJA).objectStore(LOJA).getAll()
          q.onsuccess = () => ok(q.result as Achado[])
          q.onerror = () => falha(q.error)
        })
        // o que foi registrado antes de carregar fica por cima
        const m = new Map(lidos.map((a) => [a.chave, a]))
        for (const a of this.achados) m.set(a.chave, a)
        this.achados = [...m.values()]
      } catch {
        /* sem banco */
      }
    this.carregado = true
    this.mudou()
  }

  /** Registra o que uma rodada (ou execução do modelo) achou; `registro` identifica essa rodada. */
  registrar(novos: NovoAchado[], registro: string) {
    if (!novos.length) return
    const agora = new Date().toISOString()
    const porChave = new Map(this.achados.map((a) => [a.chave, a]))
    const mudados: Achado[] = []
    for (const n of novos) {
      const chave = chaveDe(n)
      const ja = porChave.get(chave)
      const a: Achado = ja
        ? {
            ...ja,
            ...n,
            chave,
            N: Math.max(ja.N, n.N),
            K: Math.max(ja.K, n.K),
            primeiraVez: ja.primeiraVez,
            ultimaVez: agora,
            vezes: ja.ultimoRegistro === registro ? ja.vezes : ja.vezes + 1,
            ultimoRegistro: registro,
          }
        : { ...n, chave, primeiraVez: agora, ultimaVez: agora, vezes: 1, ultimoRegistro: registro }
      if (ja && ja.ultimoRegistro === registro && ja.N === a.N && ja.K === a.K && ja.explicacao === a.explicacao && ja.notas.length === a.notas.length) continue
      porChave.set(chave, a)
      mudados.push(a)
    }
    if (!mudados.length) return
    this.achados = [...porChave.values()]
    this.mudou()
    void this.gravar(mudados)
  }

  /** Junta achados de um backup (pela chave: o mais recente fica). */
  async mesclar(lista: Achado[]) {
    const m = new Map(this.achados.map((a) => [a.chave, a]))
    for (const a of lista) {
      const ja = m.get(a.chave)
      if (!ja || a.ultimaVez > ja.ultimaVez) m.set(a.chave, ja ? { ...a, primeiraVez: ja.primeiraVez < a.primeiraVez ? ja.primeiraVez : a.primeiraVez } : a)
    }
    this.achados = [...m.values()]
    this.mudou()
    await this.gravar(this.achados)
  }

  /** Troca tudo pelo do backup. */
  async substituir(lista: Achado[]) {
    await this.apagarTudo()
    await this.mesclar(lista)
  }

  async apagar(chave: string) {
    this.achados = this.achados.filter((a) => a.chave !== chave)
    this.mudou()
    const p = this.banco()
    if (p)
      try {
        ;(await p).transaction(LOJA, 'readwrite').objectStore(LOJA).delete(chave)
      } catch {
        /* sem banco */
      }
  }

  async apagarTudo() {
    this.achados = []
    this.mudou()
    const p = this.banco()
    if (p)
      try {
        const db = await p
        await new Promise<void>((ok) => {
          const q = db.transaction(LOJA, 'readwrite').objectStore(LOJA).clear()
          q.onsuccess = q.onerror = () => ok()
        })
      } catch {
        /* sem banco */
      }
  }
}

export const historico = new Historico()

export function useHistorico(): Historico {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => historico.assinar(() => forcar(undefined)), [])
  return historico
}

/** Confere um achado vindo de um backup (os inválidos ficam de fora). */
export function achadoValido(x: unknown): x is Achado {
  const a = x as Partial<Achado>
  return (
    !!a &&
    typeof a.chave === 'string' &&
    typeof a.formula === 'string' &&
    typeof a.titulo === 'string' &&
    typeof a.resultado === 'string' &&
    a.resultado in NOME_RESULTADO &&
    typeof a.primeiraVez === 'string' &&
    typeof a.ultimaVez === 'string' &&
    Array.isArray(a.notas)
  )
}
