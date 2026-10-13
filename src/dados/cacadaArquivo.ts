// Alvos da caçada em arquivo: para levar de um aparelho a outro (vários
// notebooks caçando juntos) e para o backup. Ao importar, um alvo que já
// existe fica com a versão mais nova, e os achados dos dois lados se somam.

import type { Achado, Alvo, EstadoAchado, PromessaAlvo, RegraAlvo } from './cacada'

export interface PacoteDeAlvos {
  app: 'caderno-logico'
  tipo: 'alvos-da-cacada'
  versao: 1
  exportadoEm: string
  alvos: Alvo[]
}

const texto = (x: unknown) => (typeof x === 'string' ? x : '')
const ESTADOS: EstadoAchado[] = ['pista', 'faltava-regra', 'no-codigo', 'poc', 'reportado', 'descartado']

function regra(x: unknown): RegraAlvo | null {
  const o = x as RegraAlvo
  if (!o || typeof o.id !== 'string' || typeof o.formula !== 'string') return null
  return { id: o.id, titulo: texto(o.titulo), formula: o.formula, fonte: texto(o.fonte), ativa: o.ativa !== false }
}

function promessa(x: unknown): PromessaAlvo | null {
  const o = x as PromessaAlvo
  if (!o || typeof o.id !== 'string' || typeof o.formula !== 'string') return null
  return { id: o.id, titulo: texto(o.titulo), citacao: texto(o.citacao), formula: o.formula, fonte: texto(o.fonte) }
}

function achado(x: unknown): Achado | null {
  const o = x as Achado
  const m = o?.mundo
  if (!o || typeof o.id !== 'string' || typeof o.promessaId !== 'string' || !m || typeof m.n !== 'number' || !m.modelo || !m.passos) return null
  return {
    id: o.id,
    promessaId: o.promessaId,
    quando: typeof o.quando === 'number' ? o.quando : 0,
    promessa: texto(o.promessa),
    regras: Array.isArray(o.regras) ? o.regras.filter((r) => r && typeof r.formula === 'string').map((r) => ({ id: texto(r.id), titulo: texto(r.titulo), formula: r.formula, fonte: texto(r.fonte) })) : [],
    mundo: m,
    estado: ESTADOS.includes(o.estado) ? o.estado : 'pista',
    anotacao: texto(o.anotacao),
    poc: texto(o.poc),
  }
}

/** Um alvo lido de fora (backup, arquivo de outro aparelho), com os itens malformados deixados de fora; null se nem o mínimo há. */
export function alvoSaneado(x: unknown): Alvo | null {
  const o = x as Alvo
  if (!o || typeof o.id !== 'string' || typeof o.nome !== 'string' || !Array.isArray(o.regras) || !Array.isArray(o.promessas)) return null
  const agora = new Date(0).toISOString()
  return {
    id: o.id,
    nome: o.nome,
    programa: texto(o.programa),
    escopo: texto(o.escopo),
    regras: o.regras.map(regra).filter((r): r is RegraAlvo => !!r),
    promessas: o.promessas.map(promessa).filter((p): p is PromessaAlvo => !!p),
    achados: Array.isArray(o.achados) ? o.achados.map(achado).filter((a): a is Achado => !!a) : [],
    ...(typeof o.treino === 'string' ? { treino: o.treino } : {}),
    ...(typeof o.modelo === 'string' ? { modelo: o.modelo } : {}),
    criadoEm: texto(o.criadoEm) || agora,
    atualizadoEm: texto(o.atualizadoEm) || agora,
  }
}

export function pacoteDeAlvos(alvos: Alvo[], agora = new Date()): PacoteDeAlvos {
  return { app: 'caderno-logico', tipo: 'alvos-da-cacada', versao: 1, exportadoEm: agora.toISOString(), alvos }
}

/** Lê um arquivo de alvos (o pacote, ou um backup inteiro do caderno: usa os alvos dele). */
export function lerPacoteDeAlvos(conteudo: string): { ok: true; alvos: Alvo[]; ignorados: number } | { ok: false; erro: string } {
  let d: unknown
  try {
    d = JSON.parse(conteudo)
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' }
  }
  const o = d as { app?: unknown; alvos?: unknown }
  if (o?.app !== 'caderno-logico' || !Array.isArray(o.alvos)) return { ok: false, erro: 'O arquivo não tem alvos da caçada (nem é um backup do Caderno com alvos).' }
  const alvos = o.alvos.map(alvoSaneado).filter((a): a is Alvo => !!a)
  return { ok: true, alvos, ignorados: o.alvos.length - alvos.length }
}

export interface Mescla {
  alvos: Alvo[]
  /** alvos que não existiam aqui */
  novos: number
  /** alvos que existiam e ficaram com a versão de fora (mais nova) */
  atualizados: number
  /** achados de fora que se somaram */
  achadosNovos: number
}

/**
 * Junta os alvos de fora aos daqui. Mesmo id: fica a versão mais nova
 * (regras, promessas, nome…), e os achados dos dois lados se somam (no mesmo
 * achado, vale o da versão mais nova).
 */
export function mesclarAlvos(atuais: Alvo[], deFora: Alvo[]): Mescla {
  const r: Mescla = { alvos: [...atuais], novos: 0, atualizados: 0, achadosNovos: 0 }
  for (const f of deFora) {
    const i = r.alvos.findIndex((a) => a.id === f.id)
    if (i < 0) {
      r.alvos.unshift(f)
      r.novos++
      r.achadosNovos += f.achados.length
      continue
    }
    const aqui = r.alvos[i]
    const foraMaisNovo = f.atualizadoEm > aqui.atualizadoEm
    const [base, outro] = foraMaisNovo ? [f, aqui] : [aqui, f]
    const ids = new Set(base.achados.map((x) => x.id))
    const somados = outro.achados.filter((x) => !ids.has(x.id))
    r.achadosNovos += f.achados.filter((x) => !aqui.achados.some((y) => y.id === x.id)).length
    r.alvos[i] = { ...base, achados: [...base.achados, ...somados].sort((a, b) => b.quando - a.quando) }
    if (foraMaisNovo) r.atualizados++
  }
  return r
}
