// Conferência do quadro de um modelo vindo de fora (arquivo, outro aparelho).
// O motor só constrói modelos em que a relação de cada agente é KD45 (serial,
// transitiva, euclidiana), mas quem recebe um modelo pronto não pode supor
// isso: com um agente sem nenhum mundo acessível, o avaliador dá B[a] (P ∧ ¬P)
// como verdadeira.

import type { Modelo } from './motor'

export type PropriedadeQuadro = 'mundos' | 'serial' | 'transitiva' | 'euclidiana'

export interface FalhaQuadro {
  agente: string
  propriedade: PropriedadeQuadro
  /** a testemunha: (w) sem acesso; (w, v, u) para transitiva e euclidiana; o par fora do modelo */
  mundos: number[]
}

const indice = (x: unknown, K: number): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < K

/**
 * As falhas do quadro de `m` (lista vazia = KD45): para cada agente, a primeira
 * testemunha de cada propriedade que falha. `agentes` acrescenta quem aparece
 * nas fórmulas sem relação no modelo (relação vazia não é serial).
 */
export function falhasQuadro(m: Modelo, agentes: string[] = []): FalhaQuadro[] {
  const K = m?.mundos
  if (!Number.isInteger(K) || K < 1) return [{ agente: '', propriedade: 'mundos', mundos: [] }]
  const W = [...Array(K).keys()]
  const rel = new Map<string, Set<number>[]>()
  const falhas: FalhaQuadro[] = []
  for (const r of Array.isArray(m.acessos) ? m.acessos : []) {
    const agente = typeof r?.agente === 'string' ? r.agente : ''
    const suc = rel.get(agente) ?? W.map(() => new Set<number>())
    rel.set(agente, suc)
    for (const par of Array.isArray(r?.pares) ? r.pares : []) {
      const [w, v] = Array.isArray(par) ? par : []
      if (!indice(w, K) || !indice(v, K)) falhas.push({ agente, propriedade: 'mundos', mundos: [w, v].filter((x) => typeof x === 'number') })
      else suc[w].add(v)
    }
  }
  for (const a of agentes) if (!rel.has(a)) rel.set(a, W.map(() => new Set<number>()))

  for (const [agente, suc] of rel) {
    const semAcesso = W.find((w) => suc[w].size === 0)
    if (semAcesso !== undefined) falhas.push({ agente, propriedade: 'serial', mundos: [semAcesso] })
    transitiva: for (const w of W)
      for (const v of suc[w])
        for (const u of suc[v])
          if (!suc[w].has(u)) {
            falhas.push({ agente, propriedade: 'transitiva', mundos: [w, v, u] })
            break transitiva
          }
    euclidiana: for (const w of W)
      for (const v of suc[w])
        for (const u of suc[w])
          if (!suc[v].has(u)) {
            falhas.push({ agente, propriedade: 'euclidiana', mundos: [w, v, u] })
            break euclidiana
          }
  }
  return falhas
}
