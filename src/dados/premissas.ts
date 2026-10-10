import { deduzirFichas, type PropostaFicha } from '../logica/nomes'
import { validar } from '../logica/validador'
import type { EntradaDicionario, Nota } from './tipos'

export interface FormulaDeNota {
  notaId: string
  titulo: string
  indice: number
  texto: string
}

export interface Preparo {
  /** fórmulas válidas das notas ativas de lei e fato */
  premissas: FormulaDeNota[]
  /** fórmulas válidas das visões ativas, agrupadas por titular */
  visoes: Map<string, FormulaDeNota[]>
  /** fórmulas de notas ativas com erro: ficam de fora do motor */
  comErro: FormulaDeNota[]
  /** nomes das notas ativas ainda sem ficha confirmada */
  semFicha: PropostaFicha[]
  /** o motor só roda quando todos os nomes estão confirmados */
  pronto: boolean
}

export function preparar(notas: Nota[], dicionario: EntradaDicionario[]): Preparo {
  const premissas: FormulaDeNota[] = []
  const visoes = new Map<string, FormulaDeNota[]>()
  const comErro: FormulaDeNota[] = []
  const todas: { texto: string; notaId: string }[] = []

  for (const n of notas) {
    if (!n.ativa) continue
    n.formulas.forEach((texto, indice) => {
      if (!texto.trim()) return
      const f = { notaId: n.id, titulo: n.titulo, indice, texto }
      if (!validar(texto, dicionario).ok) {
        comErro.push(f)
        return
      }
      todas.push({ texto, notaId: n.id })
      if (n.compartimento === 'visao') {
        const t = n.titular.trim() || '(sem titular)'
        visoes.set(t, [...(visoes.get(t) ?? []), f])
      } else premissas.push(f)
    })
  }
  const semFicha = deduzirFichas(todas, dicionario)
  return { premissas, visoes, comErro, semFicha, pronto: semFicha.length === 0 }
}
