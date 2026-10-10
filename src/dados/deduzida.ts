import { estado, notaVazia } from './estado'
import { descreverGrau, grauHerdado } from './grau'
import type { Nota } from './tipos'

/**
 * Cria uma nota com uma fórmula que segue de outras notas. Num conjunto de
 * visão ("visao:<titular>"), a nota nasce como visão do mesmo titular.
 */
export function salvarDeduzida(formula: string, chave: string, origem: string[], N: number): Promise<Nota> {
  const visao = chave.startsWith('visao:') ? chave.slice('visao:'.length) : null
  const titulos = origem.map((id) => estado.nota(id)?.titulo || 'Sem título').join(', ')
  const g = grauHerdado(origem, estado.notas)
  return estado.salvarNota({
    ...notaVazia(visao ? 'visao' : 'lei'),
    titulo: `Deduzida: ${formula}`,
    formulas: [formula],
    titular: visao ?? '',
    grau: g.grau,
    tags: ['deduzida'],
    texto: `Deduzida em ${new Date().toLocaleDateString('pt-BR')} a partir de: ${titulos}. Verdadeira em todos os cenários com até ${N} objetos em que essas notas valem.\nGrau herdado: ${descreverGrau(g)} (o mais fraco das notas de origem).`,
  })
}
