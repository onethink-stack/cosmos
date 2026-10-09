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
  | ({ k: Conectivo; l: Formula; r: Formula } & Span)
  | ({ k: 'forall' | 'exists'; v: string; vPos: number; dom?: Termo; corpo: Formula } & Span)
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

export interface Diag extends Span {
  codigo: Codigo
  nivel: 'erro' | 'aviso'
  msg: string
}

export const SPAN0: Span = { pos: 0, end: 0 }
