// Especificação: quanta memória o motor finito precisaria para conferir o seu
// caderno com N objetos. O motor transforma as fórmulas num problema de
// cláusulas; o número de cláusulas cresce como uma potência de N (cada
// quantificador aninhado multiplica por N). Aqui o crescimento é medido no
// próprio caderno (com 5 e 8 objetos) e projetado para N maiores.

import { Aterrador, GrandeDemais } from '../motor/aterrar'
import type { Formula } from '../logica/ast'
import { analisar, nao } from '../motor/motor'
import { prepararCadeia } from './cadeia'
import { BYTES_POR_CLAUSULA, LIMITE_NAVEGADOR, MEMORIA_ABA } from './perfil'
import type { EntradaDicionario, Nota } from './tipos'

export interface LinhaEspecificacao {
  N: number
  clausulas: number
  memoria: number
  /** cabe na memória de uma aba do navegador */
  cabe: boolean
}

export interface Especificacao {
  /** as cláusulas crescem como N elevado a este expoente */
  expoente: number
  /** maior N que ainda cabe no navegador */
  maiorN: number
  linhas: LinhaEspecificacao[]
}

const contar = (fs: Formula[], n: number): number => {
  try {
    const at = new Aterrador(n, 50_000_000, 1)
    for (const f of fs) at.afirmar(f)
    return at.cnf().clausulas.length
  } catch (e) {
    if (e instanceof GrandeDemais) return Infinity
    throw e
  }
}

/** Mede o caderno (leis e fatos com cada teorema negado; o pior caso manda) e projeta. */
export function estimarEspecificacao(notas: Nota[], dicionario: EntradaDicionario[], Ns = [10, 20, 30, 50, 100, 200, 500, 1000]): Especificacao | null {
  const { pedido } = prepararCadeia(notas, dicionario)
  const conjuntos: Formula[][] = []
  for (const c of pedido.contextos) {
    const premissas = analisar(c.grupos.flatMap((g) => g.formulas), dicionario).map((x) => x.expandida)
    if (premissas.length) conjuntos.push(premissas)
    for (const t of c.teoremas) {
      const [phi] = analisar([t.formula], dicionario)
      if (phi) conjuntos.push([...premissas, nao(phi.expandida)])
    }
  }
  if (!conjuntos.length) return null
  // o conjunto que mais cresce define a especificação
  let pior = { c5: 0, c8: 0 }
  for (const fs of conjuntos) {
    const c8 = contar(fs, 8)
    if (c8 > pior.c8) pior = { c5: contar(fs, 5), c8 }
  }
  if (!pior.c8 || !Number.isFinite(pior.c8)) return null
  const expoente = pior.c5 > 0 ? Math.log(pior.c8 / pior.c5) / Math.log(8 / 5) : 2
  const clausulas = (n: number) => pior.c8 * (n / 8) ** expoente
  const teto = Math.min(LIMITE_NAVEGADOR, MEMORIA_ABA / BYTES_POR_CLAUSULA)
  return {
    expoente,
    maiorN: Math.max(8, Math.floor(8 * (teto / pior.c8) ** (1 / expoente))),
    linhas: Ns.map((N) => {
      const c = clausulas(N)
      return { N, clausulas: c, memoria: c * BYTES_POR_CLAUSULA, cabe: c <= teto }
    }),
  }
}

/** "1,2 GB", "350 TB" */
export function memoriaTexto(bytes: number): string {
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']
  let i = 0
  while (bytes >= 1000 && i < unidades.length - 1) {
    bytes /= 1000
    i++
  }
  return `${bytes.toLocaleString('pt-BR', { maximumFractionDigits: bytes < 10 ? 1 : 0 })} ${unidades[i]}`
}

/** "2,4 milhões", "1,3 trilhão" */
export function quantidadeTexto(n: number): string {
  const nomes: [number, string, string][] = [
    [1e12, 'trilhão', 'trilhões'],
    [1e9, 'bilhão', 'bilhões'],
    [1e6, 'milhão', 'milhões'],
    [1e3, 'mil', 'mil'],
  ]
  for (const [v, um, varios] of nomes)
    if (n >= v) {
      const x = n / v
      return `${x.toLocaleString('pt-BR', { maximumFractionDigits: x < 10 ? 1 : 0 })} ${x < 2 ? um : varios}`
    }
  return Math.round(n).toLocaleString('pt-BR')
}
