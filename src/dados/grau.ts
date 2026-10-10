// Grau herdado: uma conclusão vale tanto quanto a nota mais fraca de onde ela
// vem. F (estabelecido) só se tudo de onde vem é F. Dependendo de uma decisão
// (D), vale "dada a decisão". Dependendo de um mapeamento não medido (M), fica
// à espera de medição — é o mais fraco: a lógica não mede nada.
//
// Leis têm o grau escolhido na nota; fatos contam como estabelecidos (têm
// fonte); teoremas e consequências herdam pela cadeia.

import { NOME_GRAU, type Grau, type Nota } from './tipos'

export interface GrauHerdado {
  grau: Grau
  /** notas (leis) que puxam o grau para baixo, por grau */
  por: { M: string[]; D: string[] }
}

const FORCA: Record<Grau, number> = { F: 2, D: 1, M: 0 }

/** "x" ou "x:0" (fórmula de teorema) → id da nota */
const notaDe = (id: string) => {
  const k = id.lastIndexOf(':')
  return k > 0 && /^\d+$/.test(id.slice(k + 1)) ? id.slice(0, k) : id
}

/** Grau próprio de uma nota-premissa (null = não conta: visão, teorema). */
export function grauDaNota(n: Nota | undefined): Grau | null {
  if (!n) return null
  if (n.compartimento === 'lei') return n.grau
  if (n.compartimento === 'fato') return 'F'
  return null
}

/**
 * Grau de uma conclusão a partir das notas de onde vem. `teoremas`: graus já
 * herdados por teoremas usados como apoio (a cadeia). Sem nenhuma premissa
 * com grau (ex.: vale sempre), é F.
 */
export function grauHerdado(ids: string[], notas: Nota[], teoremas: Map<string, GrauHerdado> = new Map()): GrauHerdado {
  const r: GrauHerdado = { grau: 'F', por: { M: [], D: [] } }
  const juntar = (g: Grau, quem: string[]) => {
    if (FORCA[g] < FORCA[r.grau]) r.grau = g
    if (g !== 'F') for (const q of quem) if (!r.por[g].includes(q)) r.por[g].push(q)
  }
  for (const id of ids) {
    const t = teoremas.get(id)
    if (t) {
      juntar(t.grau, [])
      t.por.M.forEach((q) => juntar('M', [q]))
      t.por.D.forEach((q) => juntar('D', [q]))
      continue
    }
    const g = grauDaNota(notas.find((n) => n.id === notaDe(id)))
    if (g) juntar(g, [notaDe(id)])
  }
  return r
}

export const descreverGrau = (g: GrauHerdado) =>
  g.grau === 'F' ? `F · ${NOME_GRAU.F}` : g.grau === 'D' ? 'D · depende de decisão' : 'M · depende de mapeamento não medido'
