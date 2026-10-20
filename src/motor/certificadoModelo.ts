// O modelo como certificado de um "não segue": quando um conjunto de fórmulas tem modelo, o modelo vai junto, com as
// tabelas completas, e quem confere não faz busca nenhuma. É o formato do lote cego Z3 2.

import type { Formula, Termo } from '../logica/ast'
import { Avaliador } from './avaliar'
import type { Modelo } from './motor'
import { falhasQuadro } from './quadro'

export interface CertificadoDeModelo {
  objetos: number
  mundos: number
  constantes: Record<string, number>
  funcoes: Record<string, [number, number[], number][]>
  predicados: Record<string, [number, number[]][]>
  pertence: [number, number, number][]
  acessos: Record<string, [number, number][]>
}

export const FORMATO_DO_CERTIFICADO =
  'O modelo é {"objetos": n, "mundos": k, "constantes": {nome: objeto}, "funcoes": {"nome/aridade": [[mundo, [argumentos], valor], …]}, "predicados": {"nome/aridade": [[mundo, [argumentos]], …]}, "pertence": [[mundo, x, y], …], "acessos": {titular: [[w, v], …]}}. ' +
  'Os objetos são 0 a n−1 e os mundos 0 a k−1; o mundo 0 é o real. ' +
  'constantes traz toda constante de objeto livre nas fórmulas expandidas, inclusive o nome de um índice que nenhum quantificador prende (o 1 de e_1, o i de eᵢ), e ∅ se ele aparece. ' +
  'funcoes traz, para cada função de objeto que aparece (a base de um índice também: e/1), uma linha para cada mundo e cada lista de argumentos, sem repetir. ' +
  'predicados traz, para cada predicado que aparece, só as listas verdadeiras; as outras são falsas. ' +
  'pertence traz os trios em que x ∈ y naquele mundo; os outros são falsos, e nenhum trio tem como y o objeto de ∅. ' +
  'acessos traz, para cada titular que aparece, os pares da relação, que tem de ser serial, transitiva e euclidiana. ' +
  'Quem confere o modelo checa a forma, o quadro KD45 de cada titular e se cada fórmula, na árvore expandida, vale no mundo 0 pela semântica t1. Não há busca nenhuma.'

interface Simbolos {
  constantes: Set<string>
  funcoes: Map<string, number>
  predicados: Map<string, number>
  titulares: Set<string>
  usaPertence: boolean
}

/** Os símbolos livres das fórmulas expandidas: constantes, funções, predicados, titulares e se ∈ aparece. */
function simbolos(fs: Formula[]): Simbolos {
  const s: Simbolos = { constantes: new Set(), funcoes: new Map(), predicados: new Map(), titulares: new Set(), usaPertence: false }
  const termo = (t: Termo, presas: Set<string>): void => {
    switch (t.k) {
      case 'nome':
        if (!presas.has(t.nome)) s.constantes.add(t.nome)
        return
      case 'app':
        s.funcoes.set(t.fn, t.args.length)
        for (const a of t.args) termo(a, presas)
        return
      case 'vazio':
        s.constantes.add('∅')
        return
      case 'inter':
      case 'uniao':
      case 'arit':
        termo(t.l, presas)
        termo(t.r, presas)
        return
      case 'neg':
        termo(t.t, presas)
        return
      default:
        return
    }
  }
  const formula = (f: Formula, presas: Set<string>): void => {
    switch (f.k) {
      case 'pred':
        s.predicados.set(f.nome, f.args.length)
        for (const a of f.args) termo(a, presas)
        return
      case 'rel':
        if (f.op === '∈' || f.op === '∉' || f.op === '⊆') s.usaPertence = true
        termo(f.l, presas)
        termo(f.r, presas)
        return
      case 'not':
      case 'nec':
      case 'pos':
        formula(f.f, presas)
        return
      case 'crenca':
        s.titulares.add(f.agente)
        formula(f.f, presas)
        return
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        formula(f.l, presas)
        formula(f.r, presas)
        return
      case 'forall':
      case 'exists':
        if (f.dom) termo(f.dom, presas)
        formula(f.corpo, new Set([...presas, f.v]))
        return
      default:
        return
    }
  }
  for (const f of fs) formula(f, new Set())
  return s
}

const SP = { pos: 0, end: 0 }
const nomeT = (nome: string): Termo => ({ k: 'nome', nome, ...SP })
const tuplas = (n: number, k: number): number[][] => (k === 0 ? [[]] : tuplas(n, k - 1).flatMap((t) => [...Array(n).keys()].map((d) => [...t, d])))
const argsEnv = (args: number[]) => new Map(args.map((d, i) => [`#${i}`, d]))
const argsT = (args: number[]) => args.map((_, i) => nomeT(`#${i}`))

/** O certificado de um modelo achado pelo motor, para estas fórmulas (expandidas). */
export function certificadoDoModelo(m: Modelo, fs: Formula[]): CertificadoDeModelo {
  const s = simbolos(fs)
  const av = new Avaliador(m)
  const W = [...Array(m.mundos ?? 1).keys()]
  const ordem = (a: [string, number], b: [string, number]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])
  const constantes: Record<string, number> = {}
  for (const c of [...s.constantes].sort()) constantes[c] = av.valor(c === '∅' ? { k: 'vazio', ...SP } : nomeT(c), new Map(), 0)
  const funcoes: Record<string, [number, number[], number][]> = {}
  for (const [fn, k] of [...s.funcoes].sort(ordem)) {
    funcoes[`${fn}/${k}`] = W.flatMap((w) =>
      tuplas(m.n, k).map((args): [number, number[], number] => [w, args, av.valor({ k: 'app', fn, args: argsT(args), subscrito: false, ...SP }, argsEnv(args), w)]),
    )
  }
  const predicados: Record<string, [number, number[]][]> = {}
  for (const [p, k] of [...s.predicados].sort(ordem)) {
    predicados[`${p}/${k}`] = W.flatMap((w) =>
      tuplas(m.n, k)
        .filter((args) => av.avaliar({ k: 'pred', nome: p, args: argsT(args), ...SP }, argsEnv(args), w))
        .map((args): [number, number[]] => [w, args]),
    )
  }
  const pertence: [number, number, number][] = []
  for (const w of W)
    for (const [x, y] of tuplas(m.n, 2))
      if (av.avaliar({ k: 'rel', op: '∈', l: nomeT('#0'), r: nomeT('#1'), ...SP }, argsEnv([x, y]), w)) pertence.push([w, x, y])
  const acessos: Record<string, [number, number][]> = {}
  for (const a of [...s.titulares].sort()) acessos[a] = W.flatMap((w) => av.possiveis(a, w).map((v): [number, number] => [w, v]))
  return { objetos: m.n, mundos: W.length, constantes, funcoes, predicados, pertence, acessos }
}

/** As falhas do certificado para estas fórmulas expandidas (lista vazia = o modelo vale). Não faz busca nenhuma. */
export function falhasDoCertificado(c: any, fs: Formula[]): string[] {
  const n = c?.objetos
  const K = c?.mundos
  if (!Number.isInteger(n) || n < 1) return ['objetos']
  if (!Number.isInteger(K) || K < 1) return ['mundos']
  const ehObj = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < n
  const ehMundo = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < K
  const s = simbolos(fs)
  const falhas: string[] = []
  for (const nome of s.constantes) if (!ehObj(c.constantes?.[nome])) falhas.push(`sem a constante ${nome}`)
  for (const [fn, k] of s.funcoes) {
    const linhas = c.funcoes?.[`${fn}/${k}`]
    if (!Array.isArray(linhas)) {
      falhas.push(`sem a função ${fn}/${k}`)
      continue
    }
    const vistas = new Set<string>()
    for (const l of linhas) {
      const [w, args, v] = Array.isArray(l) ? l : []
      if (!ehMundo(w) || !Array.isArray(args) || args.length !== k || !args.every(ehObj) || !ehObj(v)) {
        falhas.push(`linha inválida em ${fn}/${k}: ${JSON.stringify(l)}`)
        continue
      }
      const chave = `${w}|${args.join(',')}`
      if (vistas.has(chave)) falhas.push(`linha repetida em ${fn}/${k}: ${chave}`)
      vistas.add(chave)
    }
    if (vistas.size !== K * n ** k) falhas.push(`tabela incompleta de ${fn}/${k}`)
  }
  for (const [p, k] of s.predicados) {
    const linhas = c.predicados?.[`${p}/${k}`]
    if (!Array.isArray(linhas)) {
      falhas.push(`sem o predicado ${p}/${k}`)
      continue
    }
    for (const l of linhas) {
      const [w, args] = Array.isArray(l) ? l : []
      if (!ehMundo(w) || !Array.isArray(args) || args.length !== k || !args.every(ehObj)) falhas.push(`linha inválida em ${p}/${k}: ${JSON.stringify(l)}`)
    }
  }
  if (!Array.isArray(c.pertence)) falhas.push('sem pertence')
  else
    for (const t of c.pertence) {
      const [w, x, y] = Array.isArray(t) ? t : []
      if (!ehMundo(w) || !ehObj(x) || !ehObj(y)) falhas.push(`trio inválido em pertence: ${JSON.stringify(t)}`)
      else if (s.constantes.has('∅') && y === c.constantes?.['∅']) falhas.push(`${x} pertence a ∅ no mundo ${w}`)
    }
  for (const a of s.titulares) {
    const pares = c.acessos?.[a]
    if (!Array.isArray(pares)) falhas.push(`sem os acessos de ${a}`)
    else for (const par of pares) if (!Array.isArray(par) || par.length !== 2 || !ehMundo(par[0]) || !ehMundo(par[1])) falhas.push(`par inválido de ${a}: ${JSON.stringify(par)}`)
  }
  if (falhas.length) return falhas
  const m: Modelo = {
    n,
    mundos: K,
    constantes: Object.entries(c.constantes as Record<string, number>).map(([nome, valor]) => ({ nome, valor })),
    funcoes: [...s.funcoes].map(([fn, k]) => ({ nome: fn, tabela: (c.funcoes[`${fn}/${k}`] as [number, number[], number][]).map(([w, args, valor]) => ({ args, valor, w })) })),
    predicados: [...s.predicados].map(([p, k]) => ({ nome: p, aridade: k, verdadeiros: (c.predicados[`${p}/${k}`] as [number, number[]][]).map(([w, args]) => ({ args, w })) })),
    pertence: (c.pertence as [number, number, number][]).map(([w, x, y]): [number, number, number] => [x, y, w]),
    acessos: [...s.titulares].map((a) => ({ agente: a, pares: c.acessos[a] as [number, number][] })),
  }
  for (const q of falhasQuadro(m, [...s.titulares])) falhas.push(`quadro de ${q.agente} não é ${q.propriedade} (${q.mundos.join(', ')})`)
  if (falhas.length) return falhas
  const av = new Avaliador(m)
  fs.forEach((f, i) => {
    if (!av.avaliar(f, new Map(), 0)) falhas.push(`a fórmula ${i + 1} é falsa no mundo 0`)
  })
  return falhas
}
