// Perfil do aparelho: até onde a reação em cadeia pode aprofundar (objetos,
// mundos, tamanho do problema e tempo). Medido no motor: o que pesa é o
// tempo das provas de "segue" (um teorema com extensionalidade levou 4 s com
// 8 objetos, 24 s com 12, 63 s com 14 e 160 s com 17 num PC; num celular,
// de 3 a 5 vezes mais). A memória usada fica abaixo de 0,5 GB.

import { useEffect, useReducer } from 'preact/hooks'
import type { LimitesAprimoramento } from '../motor/cadeia'
import { gravarConfig, lerConfig } from './db'

export type IdPerfil = 'automatico' | 'celular-simples' | 'celular' | 'pc8' | 'pc16' | 'exp200' | 'exp500' | 'exp1000'

export interface Perfil {
  id: Exclude<IdPerfil, 'automatico'>
  nome: string
  /** nível em que cada rodada começa (rápido, para mostrar resultados logo) */
  Ninicial: number
  Kinicial: number
  /** até onde o aprimoramento automático vai */
  limites: LimitesAprimoramento
}

const MIN = 60_000

/**
 * Maior problema (cláusulas) que cabe com folga na memória que o navegador dá
 * a uma aba (perto de 4 GB num PC de 64 bits, bem menos no celular), contando
 * o resolvedor. Medido: 1,9 milhão de cláusulas ocupam ~0,65 GB só para montar.
 */
export const LIMITE_NAVEGADOR = 5_000_000
/** bytes de memória por cláusula, montagem + resolvedor (medido, arredondado para cima) */
export const BYTES_POR_CLAUSULA = 700
/** memória que o navegador costuma dar a uma aba num PC de 64 bits */
export const MEMORIA_ABA = 4e9

export const PERFIS: Perfil[] = [
  {
    id: 'celular-simples',
    nome: 'Celular simples (até 3 GB)',
    Ninicial: 5,
    Kinicial: 2,
    limites: { N: 8, K: 3, limite: 500_000, tempoChecagemMs: 15_000, orcamentoMs: 2 * MIN },
  },
  {
    id: 'celular',
    nome: 'Celular (4 GB ou mais)',
    Ninicial: 6,
    Kinicial: 3,
    limites: { N: 10, K: 4, limite: 1_000_000, tempoChecagemMs: 30_000, orcamentoMs: 5 * MIN },
  },
  {
    id: 'pc8',
    nome: 'PC com 8 GB',
    Ninicial: 8,
    Kinicial: 3,
    limites: { N: 14, K: 5, limite: 3_000_000, tempoChecagemMs: 90_000, orcamentoMs: 20 * MIN },
  },
  {
    id: 'pc16',
    nome: 'PC com 16 GB ou mais',
    Ninicial: 8,
    Kinicial: 3,
    limites: { N: 18, K: 6, limite: LIMITE_NAVEGADOR, tempoChecagemMs: 5 * MIN, orcamentoMs: 60 * MIN },
  },
  // Experimentais: deixam o aprimoramento tentar ir longe, por horas, guardando
  // cada tamanho vencido no banco de provas (continua de onde parou). O teto
  // real é a memória que o navegador dá a uma aba: ver a especificação.
  {
    id: 'exp200',
    nome: 'Experimental: até 200 objetos',
    Ninicial: 8,
    Kinicial: 3,
    limites: { N: 200, K: 6, limite: LIMITE_NAVEGADOR, tempoChecagemMs: 30 * MIN, orcamentoMs: 8 * 60 * MIN },
  },
  {
    id: 'exp500',
    nome: 'Experimental: até 500 objetos',
    Ninicial: 8,
    Kinicial: 3,
    limites: { N: 500, K: 6, limite: LIMITE_NAVEGADOR, tempoChecagemMs: 60 * MIN, orcamentoMs: 24 * 60 * MIN },
  },
  {
    id: 'exp1000',
    nome: 'Experimental: até 1000 objetos',
    Ninicial: 8,
    Kinicial: 3,
    limites: { N: 1000, K: 6, limite: LIMITE_NAVEGADOR, tempoChecagemMs: 2 * 60 * MIN, orcamentoMs: 72 * 60 * MIN },
  },
]

/** O maior de todos (limite dos campos de N e K). */
export const N_ABSOLUTO = Math.max(...PERFIS.map((p) => p.limites.N))
export const K_ABSOLUTO = Math.max(...PERFIS.map((p) => p.limites.K))

/**
 * Teto dos campos N e K de Contradições (Verificar, Perguntar…): lá não há
 * limite de tempo, então um N enorme travaria a tela. Só a reação em cadeia,
 * que tem prazo, vai além.
 */
export const N_MANUAL = 30

/** Adivinha o aparelho pela memória e pelos núcleos que o navegador informa. */
export function detectarPerfil(): Perfil['id'] {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & {
    deviceMemory?: number
    userAgentData?: { mobile?: boolean }
  }
  const ua = nav.userAgent ?? ''
  const movel = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(ua)
  const memoria = nav.deviceMemory // em GB, arredondado; os navegadores informam no máximo 8
  const nucleos = nav.hardwareConcurrency ?? 4
  if (movel) return memoria !== undefined && memoria < 4 ? 'celular-simples' : 'celular'
  if (memoria !== undefined && memoria < 6) return 'celular'
  return nucleos >= 12 ? 'pc16' : 'pc8'
}

class EstadoPerfil {
  escolhido: IdPerfil = 'automatico'
  /** depois de cada rodada, aprofundar sozinho até o limite do perfil */
  aprimorar = true
  /** rodar a reação em cadeia sozinha quando as notas mudam */
  automatico = true
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private mudou() {
    this.ouvintes.forEach((f) => f())
  }

  async carregarConfig() {
    try {
      this.escolhido = (await lerConfig<IdPerfil>('perfil')) ?? 'automatico'
      this.aprimorar = (await lerConfig<boolean>('aprimorar')) ?? true
      this.automatico = (await lerConfig<boolean>('automatico')) ?? true
    } catch {
      /* sem banco */
    }
    this.mudou()
  }

  /** o perfil em uso (o detectado, no automático) */
  get atual(): Perfil {
    const id = this.escolhido === 'automatico' ? detectarPerfil() : this.escolhido
    return PERFIS.find((p) => p.id === id) ?? PERFIS[1]
  }

  escolher(id: IdPerfil) {
    this.escolhido = id
    void gravarConfig('perfil', id).catch(() => {})
    this.mudou()
  }

  definirAutomatico(v: boolean) {
    this.automatico = v
    void gravarConfig('automatico', v).catch(() => {})
    this.mudou()
  }

  definirAprimorar(v: boolean) {
    this.aprimorar = v
    void gravarConfig('aprimorar', v).catch(() => {})
    this.mudou()
  }
}

export const perfil = new EstadoPerfil()

export function usePerfil(): EstadoPerfil {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => perfil.assinar(() => forcar(undefined)), [])
  return perfil
}

/** "8 a 14 objetos, até 5 mundos; cada checagem até 90 s; aprimoramento até 20 min" */
export function descreverPerfil(p: Perfil): string {
  const t = (ms: number) => (ms >= 2 * MIN ? `${Math.round(ms / MIN)} min` : `${Math.round(ms / 1000)} s`)
  return `começa com ${p.Ninicial} objetos e aprofunda até ${p.limites.N}; até ${p.limites.K} mundos; cada checagem até ${t(p.limites.tempoChecagemMs)}; aprimoramento até ${t(p.limites.orcamentoMs)} por rodada`
}
