export type TipoSimbolo = 'constante' | 'predicado' | 'funcao'

export interface EntradaDicionario {
  id: string
  /** nome por extenso, ex. "conjunto universo" */
  termo: string
  /** como aparece nas fórmulas, ex. "A" */
  simbolo: string
  tipo: TipoSimbolo
  aridade: number
  definicao: string
}

export type Compartimento = 'lei' | 'fato' | 'visao'

/** F = estabelecido · M = mapeamento não medido · D = decisão */
export type Grau = 'F' | 'M' | 'D'

export interface Nota {
  id: string
  titulo: string
  texto: string
  /** Fórmulas como o usuário escreveu. Numa visão, cada φ vale como B_titular(φ). */
  formulas: string[]
  tags: string[]
  criadaEm: string
  atualizadaEm: string
  ativa: boolean
  compartimento: Compartimento
  // Os campos de todos os compartimentos ficam guardados, para trocar de
  // compartimento sem perder o que já foi preenchido.
  grau: Grau
  fonte: string
  data: string
  titular: string
}

export const NOME_COMPARTIMENTO: Record<Compartimento, string> = { lei: 'Lei', fato: 'Fato', visao: 'Visão de mundo' }

export const NOME_GRAU: Record<Grau, string> = {
  F: 'estabelecido',
  M: 'mapeamento não medido',
  D: 'decisão',
}

export const NOME_TIPO: Record<TipoSimbolo, string> = { constante: 'constante', predicado: 'predicado', funcao: 'função' }
