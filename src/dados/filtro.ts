import { usosDeNomes } from '../logica/termos'
import { validar } from '../logica/validador'
import type { Compartimento, EntradaDicionario, Grau, Nota } from './tipos'

export interface Filtro {
  busca: string
  compartimento: Compartimento | null
  grau: Grau | null
  tag: string | null
}

export const FILTRO_VAZIO: Filtro = { busca: '', compartimento: null, grau: null, tag: null }

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function todasAsTags(notas: Nota[]): string[] {
  return [...new Set(notas.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b))
}

/**
 * Busca em título, texto, tags, fórmulas, titular e fonte. Se a busca casar
 * com o termo por extenso de uma ficha do dicionário (ex.: "amigo"), também
 * encontra as notas cujas fórmulas usam o símbolo dela.
 */
export function filtrarNotas(notas: Nota[], f: Filtro, dicionario: EntradaDicionario[]): Nota[] {
  const q = normalizar(f.busca.trim())
  const simbolos = q
    ? new Set(dicionario.filter((e) => normalizar(e.termo).includes(q) || normalizar(e.simbolo) === q).map((e) => e.simbolo))
    : new Set<string>()

  const usaSimbolo = (n: Nota) =>
    simbolos.size > 0 &&
    n.formulas.some((txt) => {
      // checagem rápida antes de analisar a fórmula
      if (![...simbolos].some((s) => txt.includes(s))) return false
      const { ast } = validar(txt, dicionario)
      if (!ast) return false
      return usosDeNomes(ast).some((u) => simbolos.has(u.nome))
    })

  return notas.filter((n) => {
    if (f.compartimento && n.compartimento !== f.compartimento) return false
    if (f.grau && (n.compartimento !== 'lei' || n.grau !== f.grau)) return false
    if (f.tag && !n.tags.includes(f.tag)) return false
    if (!q) return true
    const campos = [n.titulo, n.texto, n.titular, n.fonte, ...n.tags, ...n.formulas].map(normalizar)
    return campos.some((c) => c.includes(q)) || usaSimbolo(n)
  })
}
