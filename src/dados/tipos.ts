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
