import { notaVazia } from './estado'
import type { Compartimento, EntradaDicionario, Grau, Nota, TipoSimbolo } from './tipos'

export const DIAS_LEMBRETE = 7
const DIA = 24 * 60 * 60 * 1000

export interface Backup {
  app: 'caderno-logico'
  versao: 1
  exportadoEm: string
  notas: Nota[]
  dicionario: EntradaDicionario[]
  config: { N?: number }
}

export function criarBackup(notas: Nota[], dicionario: EntradaDicionario[], N: number, agora = new Date()): Backup {
  return { app: 'caderno-logico', versao: 1, exportadoEm: agora.toISOString(), notas, dicionario, config: { N } }
}

export function nomeArquivo(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `caderno-logico-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}.json`
}

const COMPARTIMENTOS: Compartimento[] = ['lei', 'fato', 'visao']
const GRAUS: Grau[] = ['F', 'M', 'D']
const TIPOS: TipoSimbolo[] = ['constante', 'predicado', 'funcao']
const texto = (x: unknown, padrao = '') => (typeof x === 'string' ? x : padrao)

/** Lê e confere um backup. Campos faltando recebem valores padrão; itens inválidos são recusados. */
export function lerBackup(conteudo: string): { ok: true; backup: Backup; avisos: string[] } | { ok: false; erro: string } {
  let d: unknown
  try {
    d = JSON.parse(conteudo)
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' }
  }
  if (!d || typeof d !== 'object') return { ok: false, erro: 'Conteúdo inesperado.' }
  const o = d as Record<string, unknown>
  if (o.app !== 'caderno-logico') return { ok: false, erro: 'Este arquivo não é um backup do Caderno Lógico.' }
  if (typeof o.versao !== 'number' || o.versao > 1) return { ok: false, erro: `Versão de backup não suportada (${String(o.versao)}).` }
  if (!Array.isArray(o.notas) || !Array.isArray(o.dicionario)) return { ok: false, erro: 'Faltam as listas de notas ou do dicionário.' }

  const avisos: string[] = []
  const notas: Nota[] = []
  for (const [i, x] of (o.notas as unknown[]).entries()) {
    if (!x || typeof x !== 'object' || typeof (x as Nota).id !== 'string' || !(x as Nota).id) {
      avisos.push(`Nota ${i + 1} ignorada: sem identificador.`)
      continue
    }
    const n = x as Partial<Nota>
    const base = notaVazia()
    notas.push({
      id: n.id!,
      titulo: texto(n.titulo),
      texto: texto(n.texto),
      formulas: Array.isArray(n.formulas) ? n.formulas.filter((f): f is string => typeof f === 'string') : [],
      tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === 'string') : [],
      criadaEm: texto(n.criadaEm, base.criadaEm),
      atualizadaEm: texto(n.atualizadaEm, base.atualizadaEm),
      ativa: typeof n.ativa === 'boolean' ? n.ativa : true,
      compartimento: COMPARTIMENTOS.includes(n.compartimento as Compartimento) ? (n.compartimento as Compartimento) : 'lei',
      grau: GRAUS.includes(n.grau as Grau) ? (n.grau as Grau) : 'F',
      fonte: texto(n.fonte),
      data: texto(n.data),
      titular: texto(n.titular),
    })
  }

  const dicionario: EntradaDicionario[] = []
  const simbolos = new Set<string>()
  for (const [i, x] of (o.dicionario as unknown[]).entries()) {
    const e = x as Partial<EntradaDicionario>
    if (!e || typeof e.id !== 'string' || typeof e.simbolo !== 'string' || !e.simbolo || !TIPOS.includes(e.tipo as TipoSimbolo)) {
      avisos.push(`Ficha ${i + 1} do dicionário ignorada: incompleta.`)
      continue
    }
    if (simbolos.has(e.simbolo)) {
      avisos.push(`Ficha repetida para '${e.simbolo}' ignorada.`)
      continue
    }
    simbolos.add(e.simbolo)
    dicionario.push({
      id: e.id,
      simbolo: e.simbolo,
      termo: texto(e.termo, e.simbolo),
      tipo: e.tipo as TipoSimbolo,
      aridade: e.tipo === 'constante' ? 0 : Math.max(0, Math.floor(Number(e.aridade) || 0)),
      definicao: texto(e.definicao),
    })
  }

  const cfg = (o.config ?? {}) as { N?: unknown }
  const N = typeof cfg.N === 'number' && cfg.N >= 1 ? cfg.N : undefined
  return {
    ok: true,
    avisos,
    backup: { app: 'caderno-logico', versao: 1, exportadoEm: texto(o.exportadoEm), notas, dicionario, config: { N } },
  }
}

/** Mescla pelo id: itens do backup substituem os de mesmo id; os demais ficam. */
export function mesclarPorId<T extends { id: string }>(atuais: T[], novos: T[]): T[] {
  const m = new Map(atuais.map((x) => [x.id, x]))
  for (const x of novos) m.set(x.id, x)
  return [...m.values()]
}

/**
 * Mesclar fichas: pelo id e, para não ficar com duas fichas do mesmo símbolo,
 * a ficha do backup substitui a ficha atual de mesmo símbolo.
 */
export function mesclarDicionario(atuais: EntradaDicionario[], novos: EntradaDicionario[]): EntradaDicionario[] {
  const simbolosNovos = new Set(novos.map((e) => e.simbolo))
  const idsNovos = new Set(novos.map((e) => e.id))
  return [...atuais.filter((e) => !simbolosNovos.has(e.simbolo) && !idsNovos.has(e.id)), ...novos]
}

/** Deve mostrar o lembrete de backup? */
export function precisaLembrete(p: { agora: number; ultimoBackup?: number; adiadoAte?: number; primeiroUso: number; temDados: boolean }): boolean {
  if (!p.temDados) return false
  if (p.adiadoAte && p.agora < p.adiadoAte) return false
  const desde = p.ultimoBackup ?? p.primeiroUso
  return p.agora - desde >= DIAS_LEMBRETE * DIA
}

export function diasDesde(ms: number, agora = Date.now()): number {
  return Math.floor((agora - ms) / DIA)
}
