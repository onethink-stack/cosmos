// Biblioteca TPTP no aparelho: o pacote com todas as teorias de axiomas do
// TPTP (já traduzidas para a linguagem do caderno) fica guardado num banco
// próprio. Daqui se procura e se carrega no caderno só a teoria que
// interessa — juntar centenas de teorias num caderno só deixaria o motor
// inutilizável, e cada uma usa os nomes à sua maneira.
//
// Pacote: texto com uma linha JSON por teoria (compactado em .gz), lido aos
// poucos (um pacote de centenas de MB não passa inteiro pela memória).
//
// O pacote dos Problemas (problemas-tptp) vai no mesmo banco: cada problema
// traz a conjectura, o que os provadores já sabem dela (o "Status") e quais
// teorias da biblioteca ele inclui; ao carregar, as teorias entram junto.

import { useEffect, useReducer } from 'preact/hooks'
import { ETIQUETA_TPTP, SABE, type Sabe } from './conhecido'
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

/** Um problema do TPTP: as fórmulas dele (as das teorias incluídas ficam na biblioteca). */
export interface ProblemaTptp {
  /** nome do arquivo sem .p, ex. "SET002+4" */
  id: string
  dominio: string
  titulo: string
  ingles: string
  /** o Status do TPTP (Theorem, CounterSatisfiable, Unsatisfiable…) */
  status: string
  sabe: Sabe
  /** dificuldade atual no TPTP: fração dos provadores que não resolvem (0 a 1) */
  dificuldade: number | null
  /** as teorias da biblioteca que entram junto (todas as fórmulas, ou só as de `so`) */
  inclui: { id: string; so?: string[] }[]
  formulas: FormulaDaTeoria[]
  fichas: Omit<EntradaDicionario, 'id' | 'definicao'>[]
  /** quantas fórmulas ao todo, com as das teorias incluídas */
  nFormulas: number
  grande?: boolean
  /** por que não dá para carregar (alguma parte o caderno não lê: a resposta conhecida poderia mudar) */
  incompleto?: string
}

export type ItemProblema = Omit<ProblemaTptp, 'formulas' | 'fichas'>

/** teorias maiores que isto não entram inteiras no caderno (o motor confere tudo junto) */
export const MAX_FORMULAS_NO_CADERNO = 400

const NOME_DB = 'caderno-biblioteca'

const LOJAS = ['catalogo', 'teorias', 'catalogoProblemas', 'problemas']

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(NOME_DB, 2)
    r.onupgradeneeded = () => {
      for (const loja of LOJAS) if (!r.result.objectStoreNames.contains(loja)) r.result.createObjectStore(loja, { keyPath: 'id' })
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

/** os dois pacotes: onde cada um guarda o catálogo e os itens inteiros */
const PACOTES = {
  'biblioteca-tptp': { catalogo: 'catalogo', itens: 'teorias', linha: 'teoria', total: 'teorias' },
  'problemas-tptp': { catalogo: 'catalogoProblemas', itens: 'problemas', linha: 'problema', total: 'problemas' },
} as const
type Formato = keyof typeof PACOTES

class Biblioteca {
  catalogo: ItemCatalogo[] = []
  problemas: ItemProblema[] = []
  carregado = false
  /** abrindo um pacote: quantos itens já entraram */
  abrindo: { feitas: number; total: number; formato: Formato | null } | null = null
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
      this.problemas = (await pedido(db.transaction('catalogoProblemas').objectStore('catalogoProblemas').getAll())) as ItemProblema[]
      db.close()
    } catch {
      this.catalogo = []
      this.problemas = []
    }
    this.carregado = true
    this.mudou()
  }

  /**
   * Lê o pacote (.jsonl ou .jsonl.gz) aos poucos e guarda cada teoria (ou
   * cada problema). Substitui o que havia do mesmo tipo. Devolve o tipo.
   */
  async abrirPacote(arquivo: File): Promise<Formato> {
    const db = await abrirDb()
    let formato: Formato | null = null
    let feitas = 0
    let total = 0
    this.abrindo = { feitas, total, formato }
    this.mudou()
    const inicio = new Uint8Array(await arquivo.slice(0, 2).arrayBuffer())
    const bruto: ReadableStream<BufferSource> = arquivo.stream()
    const fluxo: ReadableStream<BufferSource> = inicio[0] === 0x1f && inicio[1] === 0x8b ? bruto.pipeThrough(new DecompressionStream('gzip')) : bruto
    const leitor = fluxo.pipeThrough(new TextDecoderStream()).getReader()
    let resto = ''
    let lote: (TeoriaTptp | ProblemaTptp)[] = []
    const gravar = async () => {
      if (!lote.length || !formato) return
      const { catalogo, itens } = PACOTES[formato]
      const tx = db.transaction([catalogo, itens], 'readwrite')
      for (const t of lote) {
        tx.objectStore(itens).put(t)
        if ('nFormulas' in t) {
          const { formulas: _, fichas: __, ...cat } = t
          tx.objectStore(catalogo).put(cat)
        } else {
          const { formulas, ...cat } = t
          tx.objectStore(catalogo).put({ ...cat, nFormulas: t.grande ?? formulas.length })
        }
      }
      await new Promise<void>((ok, falha) => {
        tx.oncomplete = () => ok()
        tx.onerror = () => falha(tx.error)
      })
      feitas += lote.length
      this.abrindo = { feitas, total, formato }
      lote = []
      this.mudou()
    }
    const linha = async (l: string) => {
      if (!l.trim()) return
      const o = JSON.parse(l)
      if (o.tipo === 'cabecalho') {
        if (!(o.formato in PACOTES)) throw new Error('este arquivo não é um pacote da biblioteca TPTP do Caderno')
        formato = o.formato as Formato
        const { catalogo, itens, total: campoTotal } = PACOTES[formato]
        await pedido(db.transaction(catalogo, 'readwrite').objectStore(catalogo).clear())
        await pedido(db.transaction(itens, 'readwrite').objectStore(itens).clear())
        total = o[campoTotal]
        this.abrindo = { feitas, total, formato }
        this.mudou()
      } else if (formato && o.tipo === PACOTES[formato].linha) {
        delete o.tipo
        lote.push(o)
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
    if (!formato) throw new Error('este arquivo não é um pacote da biblioteca TPTP do Caderno')
    await this.carregar()
    return formato
  }

  async teoria(id: string): Promise<TeoriaTptp | undefined> {
    const db = await abrirDb()
    try {
      return (await pedido(db.transaction('teorias').objectStore('teorias').get(id))) as TeoriaTptp | undefined
    } finally {
      db.close()
    }
  }

  async problema(id: string): Promise<ProblemaTptp | undefined> {
    const db = await abrirDb()
    try {
      return (await pedido(db.transaction('problemas').objectStore('problemas').get(id))) as ProblemaTptp | undefined
    } finally {
      db.close()
    }
  }

  /** Apaga a biblioteca do aparelho, teorias e problemas (o que já foi carregado no caderno fica). */
  async apagar() {
    this.catalogo = []
    this.problemas = []
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

/** Procura problemas por nome, área, título, texto ou pelo que se sabe deles. */
export function procurarProblemas(problemas: ItemProblema[], busca: string, dominio: string | null, sabe: Sabe | null): ItemProblema[] {
  const termos = sem(busca).split(/\s+/).filter(Boolean)
  return problemas.filter((p) => {
    if (dominio && p.dominio !== dominio) return false
    if (sabe && p.sabe !== sabe) return false
    if (!termos.length) return true
    const alvo = sem(`${p.id} ${p.dominio} ${p.titulo} ${p.ingles} ${p.inclui.map((i) => i.id).join(' ')}`)
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
export function notasDaBiblioteca(
  t: TeoriaTptp,
  dicionario: EntradaDicionario[],
  usaOperadores: Set<string>,
  { pasta = pastaDaTeoria(t.id), fonte = `TPTP (seetptp.tptp.org): Axioms/${t.pasta === 'raiz' ? '' : `${t.pasta}/`}${t.id}.ax` } = {},
): { fichas: EntradaDicionario[]; notas: Nota[] } {
  const { fichas, trocar, nomes } = adaptarAoDicionario(
    t.fichas.map((f) => ({ ...f, definicao: `Do TPTP: ${t.id} (${t.dominio}).` })),
    dicionario,
  )
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

/** a pasta (etiqueta) de uma teoria da biblioteca no caderno */
export const pastaDaTeoria = (id: string) => `tptp-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
/** a pasta de um problema: separada da das teorias (um problema leva as teorias que inclui) */
export const pastaDoProblema = (id: string) => `tptp-problema-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

/**
 * As notas de um problema: as fórmulas das teorias que ele inclui (da
 * biblioteca no aparelho) e as dele, numa pasta só. A conjectura leva o que o
 * TPTP sabe dela (etiqueta e texto), para o segundo modelo comparar.
 * `faltam`: teorias incluídas que não estão no aparelho (abra o pacote da biblioteca).
 */
export async function notasDoProblema(
  p: ProblemaTptp,
  dicionario: EntradaDicionario[],
  usaOperadores: Set<string>,
): Promise<{ fichas: EntradaDicionario[]; notas: Nota[]; faltam: string[] }> {
  const faltam: string[] = []
  const formulas: FormulaDaTeoria[] = []
  const fichas = new Map<string, TeoriaTptp['fichas'][number]>()
  const nomes = new Set<string>()
  const juntar = (f: FormulaDaTeoria) => {
    let nome = f.nome
    for (let i = 2; nomes.has(nome); i++) nome = `${f.nome}_${i}`
    nomes.add(nome)
    formulas.push({ ...f, nome })
  }
  for (const inc of p.inclui) {
    const t = await biblioteca.teoria(inc.id)
    if (!t) {
      faltam.push(inc.id)
      continue
    }
    for (const f of t.formulas) if (!inc.so || inc.so.includes(f.nome)) juntar(f)
    for (const f of t.fichas) if (!fichas.has(f.simbolo)) fichas.set(f.simbolo, f)
  }
  // as fórmulas do próprio problema (pelo nome, depois de juntar): a conjectura leva o que se sabe
  const doProblema = new Map<string, string>()
  for (const f of p.formulas) {
    juntar(f)
    doProblema.set(formulas[formulas.length - 1].nome, f.papel)
  }
  for (const f of p.fichas) if (!fichas.has(f.simbolo)) fichas.set(f.simbolo, f)
  if (faltam.length) return { fichas: [], notas: [], faltam }
  const pasta = pastaDoProblema(p.id)
  const r = notasDaBiblioteca(
    { id: p.id, pasta: 'problema', dominio: p.dominio, descricao: p.titulo, formulas, fichas: [...fichas.values()], avisos: 0 },
    dicionario,
    usaOperadores,
    { pasta, fonte: `TPTP v9.3.0: Problems/${p.id.slice(0, 3)}/${p.id}.p` },
  )
  const sabe = `${SABE[p.sabe].longo} (Status ${p.status} no TPTP${p.dificuldade != null ? `; dificuldade ${p.dificuldade}` : ''})`
  for (const n of r.notas) {
    const nome = n.id.slice(pasta.length + 1)
    if (!doProblema.has(nome)) continue
    if (doProblema.get(nome) === 'conjecture') {
      n.tags.push(`${ETIQUETA_TPTP}${p.sabe}`)
      n.texto = `${p.titulo}${p.ingles ? `\n${p.ingles}` : ''}\n\nO que se sabe: ${sabe}.`
    } else n.texto = `${p.dominio}: ${p.titulo}`
  }
  return { ...r, faltam }
}
