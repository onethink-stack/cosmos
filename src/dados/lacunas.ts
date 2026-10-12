// Aprovar uma lei sugerida para fechar um teorema: vira nota de lei (ou, se
// veio de uma nota desativada, ativa a nota), com o texto explicando por quê.

import type { PassoExplicacao } from '../motor/avaliar'
import { limiteTexto, tamanhoTexto } from '../motor/avaliar'
import type { LeiSugerida } from '../motor/lacunas'
import { notaQueJaDiz } from './deduzida'
import { estado, notaVazia } from './estado'
import type { Nota } from './tipos'

const PROFUNDIDADE = 5
const MAX_LINHAS = 14

/** A árvore de explicação em linhas de texto ("F fórmula — motivo"), recuadas. */
export function passosEmTexto(p: PassoExplicacao): string {
  const linhas: string[] = []
  const ir = (q: PassoExplicacao, nivel: number) => {
    if (linhas.length >= MAX_LINHAS) return
    linhas.push(`${'   '.repeat(nivel)}• ${q.valor ? 'V' : 'F'}  ${q.formula} — ${q.motivo}`)
    if (nivel < PROFUNDIDADE) q.filhos.forEach((f) => ir(f, nivel + 1))
  }
  ir(p, 0)
  return linhas.join('\n')
}

const titulo = (id: string) => estado.nota(id)?.titulo || 'Sem título'

/** Texto que explica a lei: o que diz, por que faltava e o que ela fecha. */
export function textoDaLei(s: LeiSugerida, teorema: string, N: number, K: number): string {
  const data = new Date().toLocaleDateString('pt-BR')
  const usadas = s.notas.map(titulo)
  const partes = [
    `Lei proposta pelo app em ${data} e aprovada para fechar o teorema “${teorema}”.`,
    `O que diz: ${s.leitura}.`,
    `Por que faltava: sem ela, existe um cenário (${tamanhoTexto(s.n)}) em que todas as leis e fatos ativos valem e o teorema falha. ` +
      `Nesse cenário, esta lei é falsa — é exatamente o que ela proíbe:\n${passosEmTexto(s.porque)}\n` +
      `(d₁, d₂… são os objetos desse cenário de teste.)`,
    `O que ela fecha: com ela, o teorema segue de ${usadas.length ? `${usadas.join(', ')} e desta lei` : 'só desta lei'}` +
      ` (conferido em todos os cenários com até ${limiteTexto(N, K)}).`,
    `Ela não contradiz as leis e fatos que já estavam ativos.`,
  ]
  if (s.equivalente)
    partes.push('Atenção: dadas as outras leis, esta lei equivale ao próprio teorema. Aprová-la é o mesmo que assumir o teorema como lei.')
  return partes.join('\n\n')
}

/** "Extensionalidade (sugestão — desativada)" ativada: o "— desativada" sai do título */
export const semMarcaDesativada = (titulo: string) => titulo.replace(/\s*[—-]\s*desativada\)/i, ')').replace(/\s*\(desativada\)/i, '')

/**
 * Aprova a sugestão: cria a nota de lei (numa visão, nota da mesma visão), ou
 * ativa a nota desativada de onde ela veio.
 */
export async function aprovarLei(s: LeiSugerida, teorema: string, N: number, K: number, chave = 'geral'): Promise<Nota> {
  const titular = chave.startsWith('visao:') ? chave.slice('visao:'.length) : null
  const texto = textoDaLei(s, teorema, N, K)
  // a nota de onde a sugestão veio, ou uma que já diz o mesmo (aprovar de novo não cria cópia)
  const existente = (s.notaId ? estado.nota(s.notaId) : undefined) ?? notaQueJaDiz(s.formula, titular ? 'visao' : 'lei', titular ?? '')
  if (existente)
    return estado.salvarNota({
      ...existente,
      ativa: true,
      titulo: semMarcaDesativada(existente.titulo),
      texto: [existente.texto.trim(), '— Ativada pela busca de leis que faltam —', texto].filter(Boolean).join('\n\n'),
    })
  return estado.salvarNota({
    ...notaVazia(titular ? 'visao' : 'lei'),
    titular: titular ?? '',
    titulo: s.nome,
    formulas: [s.formula],
    grau: 'D',
    tags: ['sugerida'],
    texto,
  })
}
