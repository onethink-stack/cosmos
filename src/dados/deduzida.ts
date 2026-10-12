import { expandir } from '../logica/acucar'
import { canonica } from '../logica/canonica'
import { validar } from '../logica/validador'
import { estado, notaVazia } from './estado'
import { descreverGrau, grauHerdado } from './grau'
import type { Compartimento, Nota } from './tipos'

/** a fórmula na forma canônica (a mesma para "A ≠ K" e "¬(A = K)", ou com outros nomes de variáveis) */
export function forma(formula: string): string {
  const ast = validar(formula, estado.dicionario).ast
  return ast ? canonica(expandir(ast)) : formula.trim()
}

/**
 * A nota que já diz exatamente isto, no mesmo compartimento e do mesmo
 * titular: salvar de novo criaria uma cópia (cada rodada repetia as deduzidas).
 */
export function notaQueJaDiz(formula: string, compartimento: Compartimento, titular: string): Nota | undefined {
  const f = forma(formula)
  return estado.notas.find(
    (n) => n.compartimento === compartimento && n.titular.trim() === titular && n.formulas.filter((x) => x.trim()).length === 1 && forma(n.formulas.find((x) => x.trim())!) === f,
  )
}

/**
 * Cria uma nota com uma fórmula que segue de outras notas (num conjunto de
 * visão, "visao:<titular>", ela é do mesmo titular).
 *
 * Só o que foi PROVADO (o Z3, para qualquer número de objetos) pode virar lei:
 * o que o motor finito conferiu só até N objetos vira TEOREMA — conferido a
 * cada rodada, nunca usado como premissa. (Um "segue até N" usado como lei
 * contaminaria tudo o que viesse dele: há fórmulas que valem em todo cenário
 * finito e falham num infinito.) Se a mesma nota já existe, ela é devolvida.
 */
export function salvarDeduzida(formula: string, chave: string, origem: string[], N: number, provado = false): Promise<Nota> {
  const visao = chave.startsWith('visao:') ? chave.slice('visao:'.length) : null
  const compartimento: Compartimento = provado ? (visao ? 'visao' : 'lei') : 'teorema'
  const titular = visao ?? ''
  const ja = notaQueJaDiz(formula, compartimento, titular)
  if (ja) return Promise.resolve(ja)
  const titulos = origem.map((id) => estado.nota(id)?.titulo || 'Sem título').join(', ')
  const g = grauHerdado(origem, estado.notas)
  const como = provado
    ? 'Provada para qualquer número de objetos (Z3) a partir de'
    : `Verdadeira em todos os cenários com até ${N} objetos em que valem`
  const papel = provado
    ? ''
    : '\nFica como teorema: é conferida a cada rodada, e não entra como premissa — só uma prova para qualquer tamanho (o Z3) a tornaria lei.'
  return estado.salvarNota({
    ...notaVazia(compartimento),
    titulo: `Deduzida: ${formula}`,
    formulas: [formula],
    titular,
    grau: g.grau,
    tags: ['deduzida'],
    texto: `Deduzida em ${new Date().toLocaleDateString('pt-BR')}. ${como}: ${titulos}.${papel}\nGrau herdado: ${descreverGrau(g)} (o mais fraco das notas de origem).`,
  })
}
