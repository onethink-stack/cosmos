// Tabelas coladas ou abertas pelo usuário (CSV, TSV, planilha copiada): lê,
// adivinha o tipo de cada coluna e dá a cada uma um símbolo do caderno — o
// do dicionário, quando já existe um com aquele nome (assim "mi" na tabela é
// a mesma massa mi das leis).

import { ehCharDeNome, lex } from '../logica/lexer'
import { lerBooleano, lerNumero, valoresDaCelula, type ColunaDados, type ConjuntoDados, type TipoColuna } from '../motor/dados'
import type { EntradaDicionario } from './tipos'

export const MAX_LINHAS = 5000
export const MAX_COLUNAS = 60

/** Lê CSV/TSV (separador adivinhado: tabulação, ponto e vírgula ou vírgula; aspas como no Excel). */
export function lerTabela(texto: string): { cabecalho: string[]; linhas: (string | null)[][] } {
  const t = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const primeira = t.split('\n').find((l) => l.trim()) ?? ''
  const conta = (c: string) => primeira.split(c).length - 1
  const sep = conta('\t') ? '\t' : conta(';') > conta(',') ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let celula = ''
  let aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"'
        i++
      } else if (c === '"') aspas = false
      else celula += c
    } else if (c === '"' && !celula.trim()) aspas = true
    else if (c === sep) {
      linha.push(celula)
      celula = ''
    } else if (c === '\n') {
      linha.push(celula)
      linhas.push(linha)
      linha = []
      celula = ''
    } else celula += c
  }
  if (celula || linha.length) {
    linha.push(celula)
    linhas.push(linha)
  }
  const cheias = linhas.filter((l) => l.some((x) => x.trim()))
  const cabecalho = (cheias[0] ?? []).slice(0, MAX_COLUNAS).map((x, j) => x.trim() || `coluna ${j + 1}`)
  return {
    cabecalho,
    linhas: cheias.slice(1, MAX_LINHAS + 1).map((l) => cabecalho.map((_, j) => (l[j]?.trim() ? l[j].trim() : null))),
  }
}

const sem = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** Um símbolo válido na linguagem a partir de um texto: "período orbital" → periodoOrbital / PeriodoOrbital. */
export function nomeSimbolo(texto: string, maiuscula: boolean): string {
  const palavras = texto
    .replace(/\[[^\]]*\]/g, ' ') // [unidade] não entra no nome
    .normalize('NFC')
    .split(/\s+|[^\p{L}\p{N}]+/u)
    .map((p) => [...p].filter((c) => ehCharDeNome(c)).join(''))
    .filter(Boolean)
  let s = palavras.map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('') || 'coluna'
  if (/^\p{N}/u.test(s)) s = `n${s}`
  s = (maiuscula ? s[0].toUpperCase() : s[0].toLowerCase()) + s.slice(1)
  if (s === 'B') s = 'Bb' // B[…] é crença
  const { tokens } = lex(s)
  return tokens.length === 2 && tokens[0].t === 'nome' ? s : maiuscula ? 'Coluna' : 'coluna'
}

/** O tipo mais provável de cada coluna. */
export function inferirTipos(cabecalho: string[], linhas: (string | null)[][]): TipoColuna[] {
  const tipos: TipoColuna[] = cabecalho.map((_, j) => {
    const vals = linhas.map((l) => l[j]).filter((x): x is string => x !== null)
    if (!vals.length) return 'ignorar'
    if (vals.every((v) => lerBooleano(v) !== null)) return 'booleano'
    if (vals.every((v) => lerNumero(v) !== null)) return 'numero'
    return 'categoria' // decidido abaixo: nome, objeto, categoria ou ignorar
  })
  // a coluna de nomes: a primeira de texto com valores (quase) todos diferentes
  const textos = tipos.map((t, j) => (t === 'categoria' ? j : -1)).filter((j) => j >= 0)
  const distintos = (j: number) => new Set(linhas.map((l) => l[j]).filter(Boolean)).size
  const preenchidas = (j: number) => linhas.filter((l) => l[j]).length
  const iNome = textos.find((j) => distintos(j) >= 0.9 * preenchidas(j))
  if (iNome !== undefined) tipos[iNome] = 'nome'
  const nomes = new Set(iNome !== undefined ? linhas.map((l) => l[iNome]).filter(Boolean) : [])
  for (const j of textos) {
    if (j === iNome) continue
    const vals = linhas.map((l) => l[j]).filter((x): x is string => !!x)
    const citados = vals.flatMap(valoresDaCelula)
    const deObjetos = citados.filter((v) => nomes.has(v)).length
    if (citados.length && deObjetos >= 0.5 * citados.length) tipos[j] = 'objeto'
    else if (vals.some((v) => valoresDaCelula(v).length > 1)) tipos[j] = 'objeto'
    else if (distintos(j) <= Math.min(12, Math.max(2, linhas.length / 2))) tipos[j] = 'categoria'
    else tipos[j] = 'ignorar'
  }
  return tipos
}

/** A ficha do dicionário que já serve para esta coluna (mesmo nome e tipo compatível). */
function fichaExistente(titulo: string, tipo: TipoColuna, dicionario: EntradaDicionario[]): EntradaDicionario | undefined {
  const alvo = sem(titulo.replace(/\[[^\]]*\]/g, ''))
  if (!alvo) return undefined
  const combina = (e: EntradaDicionario) =>
    tipo === 'numero'
      ? e.tipo === 'constante' && !!e.numerico
      : tipo === 'booleano'
        ? e.tipo === 'predicado' && e.aridade === 1
        : tipo === 'objeto'
          ? e.tipo === 'predicado' && e.aridade === 2
          : false
  return dicionario.find((e) => combina(e) && (sem(e.simbolo) === alvo || sem(e.termo) === alvo))
}

/**
 * Monta o conjunto de dados: tipos adivinhados (ou os dados) e um símbolo
 * para cada coluna (e para cada valor de uma categoria).
 */
export function montarConjunto(
  base: { id: string; nome: string; fonte: string; pasta: string; tolerancia?: number },
  cabecalho: string[],
  linhas: (string | null)[][],
  dicionario: EntradaDicionario[],
  tipos: TipoColuna[] = inferirTipos(cabecalho, linhas),
): ConjuntoDados {
  const usados = new Set(dicionario.map((e) => e.simbolo))
  const livre = (s: string) => {
    let r = s
    for (let k = 2; usados.has(r); k++) r = `${s}${k}`
    usados.add(r)
    return r
  }
  const colunas: ColunaDados[] = cabecalho.map((titulo, j) => {
    const tipo = tipos[j]
    if (tipo === 'nome' || tipo === 'ignorar') return { titulo, tipo, simbolo: '' }
    if (tipo === 'categoria') {
      const valores: Record<string, string> = {}
      for (const v of new Set(linhas.map((l) => l[j]).filter((x): x is string => !!x))) {
        const proprio = nomeSimbolo(v, true)
        valores[v] = usados.has(proprio) ? livre(nomeSimbolo(`${titulo} ${v}`, true)) : livre(proprio)
      }
      return { titulo, tipo, simbolo: '', valores }
    }
    const existente = fichaExistente(titulo, tipo, dicionario)
    if (existente) return { titulo, tipo, simbolo: existente.simbolo }
    return { titulo, tipo, simbolo: livre(nomeSimbolo(titulo, tipo !== 'numero')) }
  })
  return { ...base, criadoEm: new Date().toISOString(), tolerancia: base.tolerancia ?? 0.02, colunas, linhas }
}

/** Fichas do dicionário que faltam para os símbolos das colunas (os objetos não precisam: entram quando alguém os usa). */
export function fichasDoConjunto(c: ConjuntoDados, dicionario: EntradaDicionario[]): EntradaDicionario[] {
  const tem = new Set(dicionario.map((e) => e.simbolo))
  const novas: EntradaDicionario[] = []
  const nova = (e: Omit<EntradaDicionario, 'id' | 'definicao'>) => {
    if (tem.has(e.simbolo)) return
    tem.add(e.simbolo)
    novas.push({ ...e, id: '', definicao: `Da tabela “${c.nome}” (${c.fonte}).` })
  }
  for (const col of c.colunas) {
    if (col.tipo === 'booleano') nova({ termo: col.titulo, simbolo: col.simbolo, tipo: 'predicado', aridade: 1 })
    if (col.tipo === 'objeto') nova({ termo: col.titulo, simbolo: col.simbolo, tipo: 'predicado', aridade: 2 })
    if (col.tipo === 'numero') nova({ termo: col.titulo, simbolo: col.simbolo, tipo: 'constante', aridade: 0, numerico: true })
    if (col.tipo === 'categoria' && col.valores)
      for (const [v, p] of Object.entries(col.valores)) nova({ termo: `${col.titulo}: ${v}`, simbolo: p, tipo: 'predicado', aridade: 1 })
  }
  return novas
}
