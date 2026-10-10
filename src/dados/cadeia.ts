// Monta a reação em cadeia a partir das notas: um conjunto para as leis e
// fatos e um para cada titular de visão (com os teoremas de cada um), e a
// lista do que fica de fora (e por quê).

import type { ContextoCadeia, PedidoCadeia } from '../motor/cadeia'
import type { Grupo } from '../motor/motor'
import { montarTarefas, tarefaDoContexto } from '../motor/tarefas'
import { preparar } from './premissas'
import type { EntradaDicionario, Nota } from './tipos'

/** Leis e fatos desativados (ou visões desativadas do titular): candidatos na busca da lei que falta. */
export function inativasDoContexto(notas: Nota[], chave: string): Grupo[] {
  const titular = chave.startsWith('visao:') ? chave.slice('visao:'.length) : null
  return notas
    .filter((n) => !n.ativa && n.formulas.some((f) => f.trim()))
    .filter((n) => (titular ? n.compartimento === 'visao' && n.titular.trim() === titular : n.compartimento === 'lei' || n.compartimento === 'fato'))
    .map((n) => ({ id: n.id, rotulo: n.titulo || 'Sem título', formulas: n.formulas.filter((f) => f.trim()) }))
}

export function pedidoDaCadeia(notas: Nota[], dicionario: EntradaDicionario[]): PedidoCadeia {
  const p = preparar(notas, dicionario)
  const { tarefas } = montarTarefas(notas, dicionario)
  const chaves = ['geral', ...tarefas.filter((t) => t.chave.startsWith('visao:')).map((t) => t.chave)]
  for (const t of p.teoremas) if (t.contexto && !chaves.includes(t.contexto)) chaves.push(t.contexto)
  const contextos: ContextoCadeia[] = chaves
    .map((chave) => {
      const t = tarefaDoContexto(tarefas, chave)
      return {
        chave,
        rotulo: t.rotulo,
        grupos: t.grupos,
        teoremas: p.teoremas
          .filter((f) => (f.contexto ?? 'geral') === chave)
          .map((f) => ({ id: `${f.notaId}:${f.indice}`, notaId: f.notaId, rotulo: f.titulo || 'Sem título', formula: f.texto })),
      }
    })
    .filter((c) => c.grupos.length || c.teoremas.length)
  // uma visão desativada só serve de candidata no próprio conjunto; aqui vão as leis e fatos
  return { contextos, inativas: inativasDoContexto(notas, 'geral') }
}

/** O pedido da cadeia e se os nomes estão todos confirmados (o motor só roda assim). */
export function prepararCadeia(notas: Nota[], dicionario: EntradaDicionario[]): { pedido: PedidoCadeia; pronto: boolean } {
  return { pedido: pedidoDaCadeia(notas, dicionario), pronto: preparar(notas, dicionario).pronto }
}

export interface ForaDaCadeia {
  /** teoremas ativos só com texto */
  teoremasSemFormula: Nota[]
  /** leis e fatos ativos só com texto */
  leisSemFormula: Nota[]
  /** teoremas desativados (com fórmula) */
  teoremasDesativados: Nota[]
  /** fórmulas com erro em notas ativas */
  comErro: { notaId: string; texto: string }[]
}

export function foraDaCadeia(notas: Nota[], dicionario: EntradaDicionario[]): ForaDaCadeia {
  const semFormula = (n: Nota) => !n.formulas.some((f) => f.trim())
  return {
    teoremasSemFormula: notas.filter((n) => n.ativa && n.compartimento === 'teorema' && semFormula(n)),
    leisSemFormula: notas.filter((n) => n.ativa && (n.compartimento === 'lei' || n.compartimento === 'fato') && semFormula(n)),
    teoremasDesativados: notas.filter((n) => !n.ativa && n.compartimento === 'teorema' && !semFormula(n)),
    comErro: preparar(notas, dicionario).comErro.map((f) => ({ notaId: f.notaId, texto: f.texto })),
  }
}
