import type { TipoSimbolo } from '../dados/tipos'

// Árvore sintática das fórmulas. Toda posição é índice (UTF-16) no texto original.

export interface Span {
  pos: number
  end: number
}

export type Termo =
  | ({ k: 'nome'; nome: string } & Span)
  | ({ k: 'app'; fn: string; args: Termo[]; subscrito: boolean } & Span)
  | ({ k: 'inter' | 'uniao'; l: Termo; r: Termo } & Span)
  | ({ k: 'vazio' } & Span)

export type Rel = '=' | '≠' | '∈' | '∉' | '⊆'

export type Conectivo = 'and' | 'or' | 'imp' | 'iff'

export type Formula =
  | ({ k: 'pred'; nome: string; args: Termo[] } & Span)
  | ({ k: 'rel'; op: Rel; l: Termo; r: Termo } & Span)
  | ({ k: 'not'; f: Formula } & Span)
  /** □φ: necessário (vale em todo mundo) · ◇φ: possível (vale em algum mundo) */
  | ({ k: 'nec' | 'pos'; f: Formula } & Span)
  /** B[agente] φ: o agente acredita que φ (lógica doxástica KD45) */
  | ({ k: 'crenca'; agente: string; f: Formula } & Span)
  | ({ k: Conectivo; l: Formula; r: Formula } & Span)
  | ({
      k: 'forall' | 'exists'
      v: string
      vPos: number
      dom?: Termo
      corpo: Formula
      /** o corpo começa com "(" mas continua depois do ")" que o fecha (posição desse ")") — ver E14 */
      parentesesEnganoso?: number
    } & Span)
  | ({ k: 'const'; valor: boolean } & Span)

export type Codigo =
  | 'E0' // erro de sintaxe genérico
  | 'E1' // operador sem operando
  | 'E2' // termo usado como fórmula (ex.: ¬A)
  | 'E3' // fórmulas lado a lado sem conectivo
  | 'E4' // quantificador sobre constante do dicionário
  | 'E5' // variável quantificada de novo dentro do escopo
  | 'E6' // variável livre
  | 'E7' // parênteses desbalanceados
  | 'E8' // símbolo desconhecido
  | 'E9' // contradição imediata t ≠ t
  | 'E10' // nome usado de modos incompatíveis (constante/função/predicado, aridade)
  | 'E11' // ⋂ ou ⋃ em posição não suportada
  | 'E12' // aviso: nome sem ficha no dicionário
  | 'E13' // aviso: nome sem ficha parecido com um nome do dicionário ("você quis dizer…?")
  | 'E14' // aviso: o escopo do quantificador passa do ")" que parecia fechá-lo

export interface Diag extends Span {
  codigo: Codigo
  nivel: 'erro' | 'aviso'
  msg: string
  /** E13: nome do dicionário sugerido no lugar deste */
  sugestao?: string
  /** E12/E13: ficha deduzida pelo uso, pronta para criar */
  ficha?: { simbolo: string; tipo: TipoSimbolo; aridade: number }
}

export const SPAN0: Span = { pos: 0, end: 0 }
