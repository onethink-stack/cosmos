// Sistemas prontos: conjuntos de notas e fichas que vêm dentro do app.
// Cada nota e ficha tem um id fixo, então carregar de novo atualiza (não duplica).

import { mesclarDicionario, mesclarPorId } from './backup'
import { estado } from './estado'
import type { EntradaDicionario, Nota } from './tipos'

export interface Sistema {
  id: string
  nome: string
  descricao: string
  /** notas do sistema (datas preenchidas na hora de carregar) */
  notas: (agora: string) => Nota[]
  dicionario: EntradaDicionario[]
}

/** id especial: começar um caderno sem nenhum sistema */
export const NENHUM = 'nenhum'
export const SISTEMA_PADRAO = 'nenhum'

// Nenhum sistema com conteúdo público: os sistemas pessoais entram cifrados (ver cifrado/).
export const SISTEMAS: Sistema[] = []

export const sistema = (id: string) => SISTEMAS.find((s) => s.id === id)

/** Ids das notas do sistema que estão no caderno. */
export function notasPresentes(s: Sistema, notas: Nota[]): Nota[] {
  const ids = new Set(s.notas('').map((n) => n.id))
  return notas.filter((n) => ids.has(n.id))
}

/**
 * Coloca o sistema no caderno. As notas e fichas do sistema voltam ao
 * original (mesmo id); o resto do caderno fica como está.
 */
export async function carregarSistema(s: Sistema) {
  const agora = new Date().toISOString()
  const novas = s.notas(agora).map((n) => {
    // preserva a data de criação de quem já estava no caderno
    const antiga = estado.nota(n.id)
    return antiga ? { ...n, criadaEm: antiga.criadaEm } : n
  })
  await estado.substituirTudo(mesclarPorId(estado.notas, novas), mesclarDicionario(estado.dicionario, s.dicionario))
}

/** Tira do caderno as notas do sistema (as fichas ficam, podem ser usadas por outras notas). */
export async function removerSistema(s: Sistema) {
  const ids = new Set(s.notas('').map((n) => n.id))
  await estado.substituirTudo(
    estado.notas.filter((n) => !ids.has(n.id)),
    estado.dicionario,
  )
}
