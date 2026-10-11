// Wikidata: base pública de fatos já estruturados. Daqui saem tabelas (uma
// linha por item) para a tela Mundo: números já convertidos para o SI e
// relações entre itens. Só as consultas saem do aparelho — nada do caderno.

const API = 'https://www.wikidata.org/w/api.php'
const SPARQL = 'https://query.wikidata.org/sparql'
/** itens por tabela (a consulta fica rápida e a tabela, legível) */
export const MAX_ITENS = 300

export interface Classe {
  id: string
  rotulo: string
  descricao: string
}

export interface Propriedade {
  id: string
  rotulo: string
  tipo: 'quantidade' | 'item'
  /** em quantos itens da amostra aparece */
  usos: number
}

/** Uma tabela pronta para importar. */
export interface TabelaWikidata {
  nome: string
  fonte: string
  cabecalho: string[]
  linhas: (string | null)[][]
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`o Wikidata respondeu ${r.status}${r.status === 429 ? ' (muitas consultas; espere um pouco)' : ''}`)
  return r.json() as Promise<T>
}

async function sparql(consulta: string): Promise<Record<string, { value: string }>[]> {
  const d = await json<{ results: { bindings: Record<string, { value: string }>[] } }>(SPARQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query: consulta }).toString(),
  })
  return d.results.bindings
}

const qid = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1)

/** Classes com esse nome (ex.: "planeta", "elemento químico", "filósofo"). */
export async function buscarClasses(texto: string): Promise<Classe[]> {
  const p = new URLSearchParams({ action: 'wbsearchentities', search: texto, language: 'pt', uselang: 'pt', type: 'item', limit: '8', format: 'json', origin: '*' })
  const d = await json<{ search: { id: string; label?: string; description?: string }[] }>(`${API}?${p}`)
  return d.search.map((s) => ({ id: s.id, rotulo: s.label ?? s.id, descricao: s.description ?? '' }))
}

/** Os itens (até MAX_ITENS) que casam com o padrão SPARQL sobre ?item. */
export async function itensDe(padrao: string): Promise<string[]> {
  const bs = await sparql(`SELECT DISTINCT ?item WHERE { ${padrao} } LIMIT ${MAX_ITENS}`)
  return bs.map((b) => qid(b.item.value))
}

export const padraoDaClasse = (classe: string) => `?item wdt:P31 wd:${classe} .`

/** Rótulos (em português, ou inglês) de itens e propriedades. */
async function rotulos(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 50) {
    const p = new URLSearchParams({ action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'labels', languages: 'pt|en', format: 'json', origin: '*' })
    const d = await json<{ entities: Record<string, { labels?: Record<string, { value: string }> }> }>(`${API}?${p}`)
    for (const [id, e] of Object.entries(d.entities)) m.set(id, e.labels?.pt?.value ?? e.labels?.en?.value ?? id)
  }
  return m
}

/** As propriedades mais usadas numa amostra dos itens (números e relações com outros itens). */
export async function propriedadesDe(itens: string[]): Promise<Propriedade[]> {
  const amostra = itens.slice(0, 50)
  if (!amostra.length) return []
  const p = new URLSearchParams({ action: 'wbgetentities', ids: amostra.join('|'), props: 'claims', format: 'json', origin: '*' })
  const d = await json<{ entities: Record<string, { claims?: Record<string, { mainsnak: { datatype?: string } }[]> }> }>(`${API}?${p}`)
  const conta = new Map<string, { tipo: Propriedade['tipo']; usos: number }>()
  for (const e of Object.values(d.entities))
    for (const [pid, cs] of Object.entries(e.claims ?? {})) {
      const dt = cs[0]?.mainsnak.datatype
      const tipo = dt === 'quantity' ? 'quantidade' : dt === 'wikibase-item' ? 'item' : null
      if (!tipo) continue
      const x = conta.get(pid) ?? { tipo, usos: 0 }
      x.usos++
      conta.set(pid, x)
    }
  const top = [...conta.entries()].sort((a, b) => b[1].usos - a[1].usos).slice(0, 20)
  const nomes = await rotulos(top.map(([pid]) => pid))
  return top.map(([id, x]) => ({ id, rotulo: nomes.get(id) ?? id, tipo: x.tipo, usos: x.usos }))
}

/**
 * A tabela: uma linha por item, uma coluna por propriedade. Números
 * convertidos para a unidade do SI (os que não convertem ficam vazios);
 * vários valores de uma relação, separados por " | ".
 */
export async function tabelaDe(nome: string, itens: string[], props: Propriedade[], aoProgredir?: (msg: string) => void): Promise<TabelaWikidata> {
  const valores = itens.map((i) => `wd:${i}`).join(' ')
  aoProgredir?.('buscando os nomes dos itens')
  const nomes = new Map<string, string>()
  for (const b of await sparql(`SELECT ?item ?itemLabel WHERE { VALUES ?item { ${valores} } SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". } }`))
    nomes.set(qid(b.item.value), b.itemLabel?.value ?? qid(b.item.value))
  // nomes repetidos ganham o código do item
  const vistos = new Map<string, number>()
  for (const n of nomes.values()) vistos.set(n, (vistos.get(n) ?? 0) + 1)
  const nomeDe = (id: string) => {
    const n = nomes.get(id) ?? id
    return (vistos.get(n) ?? 0) > 1 ? `${n} (${id})` : n
  }
  const colunas: Map<string, string[]>[] = []
  const cabecalho = ['nome']
  for (const [k, p] of props.entries()) {
    aoProgredir?.(`buscando “${p.rotulo}” (${k + 1}/${props.length})`)
    const m = new Map<string, string[]>()
    if (p.tipo === 'item') {
      const consulta = `SELECT ?item ?v ?vLabel WHERE { VALUES ?item { ${valores} } ?item wdt:${p.id} ?v . SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". } }`
      for (const b of await sparql(consulta)) {
        const id = qid(b.item.value)
        const v = nomes.has(qid(b.v.value)) ? nomeDe(qid(b.v.value)) : (b.vLabel?.value ?? qid(b.v.value))
        const lista = m.get(id) ?? []
        if (!lista.includes(v)) lista.push(v)
        m.set(id, lista)
      }
      cabecalho.push(p.rotulo)
      colunas.push(m)
      continue
    }
    // números: o valor como veio (com a unidade) e o convertido para o SI
    const consulta = `SELECT ?item ?bruto ?u ?si WHERE { VALUES ?item { ${valores} } ?item p:${p.id} ?st . ?st psv:${p.id} ?vn . ?vn wikibase:quantityAmount ?bruto ; wikibase:quantityUnit ?u . OPTIONAL { ?st psn:${p.id}/wikibase:quantityAmount ?si } }`
    const porItem = new Map<string, { bruto: string; u: string; si?: string }>()
    for (const b of await sparql(consulta)) {
      const id = qid(b.item.value)
      if (!porItem.has(id)) porItem.set(id, { bruto: b.bruto.value, u: qid(b.u.value), si: b.si?.value })
    }
    const vals = [...porItem.values()]
    const contagem = new Map<string, number>()
    for (const v of vals) contagem.set(v.u, (contagem.get(v.u) ?? 0) + 1)
    const unidade = [...contagem].sort((x, y) => y[1] - x[1])[0]?.[0]
    // número puro (unidade "1"): como veio
    const semUnidade = unidade === 'Q199'
    // o convertido serve se existe e não virou zero (números muito pequenos viram 0 na conversão)
    const siBom = vals.filter((v) => v.si !== undefined && (Number(v.si) !== 0 || Number(v.bruto) === 0)).length >= 0.8 * vals.length
    let titulo = p.rotulo
    for (const [id, v] of porItem) {
      if (semUnidade) m.set(id, [v.bruto])
      else if (siBom && v.si !== undefined) m.set(id, [v.si])
      else if (!siBom && v.u === unidade) m.set(id, [v.bruto])
    }
    if (!semUnidade)
      titulo = siBom ? `${p.rotulo} [SI]` : `${p.rotulo} [${(await rotulos(unidade ? [unidade] : [])).get(unidade ?? '') ?? unidade}]`
    cabecalho.push(titulo)
    colunas.push(m)
  }
  const linhas = itens.map((id) => [nomeDe(id), ...colunas.map((m) => (m.get(id)?.length ? m.get(id)!.join(' | ') : null))])
  const temNumeros = props.some((p) => p.tipo === 'quantidade')
  return {
    nome,
    fonte: `Wikidata (${new Date().toLocaleDateString('pt-BR')}): ${nome}${temNumeros ? ' — a unidade de cada número está no nome da coluna, entre colchetes' : ''}`,
    cabecalho,
    linhas,
  }
}

/** Consultas prontas. */
export const PRONTAS: { nome: string; padrao: string; props: Propriedade[] }[] = [
  {
    nome: 'Planetas do Sistema Solar',
    padrao: '?item wdt:P397 wd:Q525 ; wdt:P31/wdt:P279* wd:Q634 .',
    props: [
      { id: 'P2067', rotulo: 'massa', tipo: 'quantidade', usos: 0 },
      { id: 'P2120', rotulo: 'raio', tipo: 'quantidade', usos: 0 },
      { id: 'P2146', rotulo: 'período orbital', tipo: 'quantidade', usos: 0 },
      { id: 'P31', rotulo: 'é um', tipo: 'item', usos: 0 },
    ],
  },
  {
    nome: 'Elementos químicos',
    padrao: '?item wdt:P31 wd:Q11344 .',
    props: [
      { id: 'P1086', rotulo: 'número atômico', tipo: 'quantidade', usos: 0 },
      { id: 'P2067', rotulo: 'massa', tipo: 'quantidade', usos: 0 },
      { id: 'P279', rotulo: 'subclasse de', tipo: 'item', usos: 0 },
    ],
  },
  {
    nome: 'Filósofos e quem os influenciou',
    padrao: '?item wdt:P106 wd:Q4964182 ; wikibase:sitelinks ?sl . FILTER(?sl > 90)',
    props: [
      { id: 'P737', rotulo: 'influenciado por', tipo: 'item', usos: 0 },
      { id: 'P135', rotulo: 'movimento', tipo: 'item', usos: 0 },
    ],
  },
]
