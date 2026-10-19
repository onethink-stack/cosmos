// Banco de provas: o que o motor já conferiu fica guardado, para não refazer.
//
// Cada conjunto de fórmulas (forma canônica, em qualquer ordem) guarda:
//   - "tem modelo": o cenário achado — vale para sempre (um contraexemplo é
//     definitivo, não importa o tamanho);
//   - "sem modelo até N objetos e K mundos": numa próxima consulta com N
//     maior, só os tamanhos novos são testados (N+1, N+2…), nunca os antigos.
// Assim a busca cresce em cima do que já foi provado, em vez de começar do 1.
//
// Guardado no IndexedDB (banco "caderno-provas", separado das notas), lido
// pelo worker do motor e pela linha principal. Sem IndexedDB, funciona só na
// memória (ou nem isso, nos testes).

import type { Formula } from '../logica/ast'
import { canonica } from '../logica/canonica'
import { resumo } from '../logica/resumo'
import type { Modelo } from './motor'
import { VERSAO_TRADUCAO_Z3 } from './z3'

/**
 * muda quando a semântica do motor (ou o formato da chave) muda: invalida o que
 * foi guardado antes. m2: a chave é um resumo do texto das fórmulas, não o texto.
 */
const VERSAO_MOTOR = 'm2'
const NOME_BANCO = 'caderno-provas'
const LOJA = 'provas'
/** respostas do Z3 (sat/unsat), pela chave da checagem */
const LOJA_Z3 = 'z3'
/** acima disso, as entradas usadas há mais tempo saem */
const MAX_ENTRADAS = 20_000
/** acima disso, as respostas do Z3 guardadas são apagadas (cada uma é pequena; é só um teto) */
const MAX_Z3 = 50_000
/**
 * As chaves das respostas do Z3 começam assim: formato da chave (h2) e versão da
 * tradução. As de formato ou tradução anterior são apagadas; nenhuma resposta de
 * outra versão é usada.
 */
export const PREFIXO_CHAVE_Z3 = `h2:${VERSAO_TRADUCAO_Z3}|`

export type Prova =
  /** K: mundos testados na busca que achou o modelo */
  | { chave: string; status: 'modelo'; n: number; modelo: Modelo; K: number; usadoEm: number }
  | { chave: string; status: 'sem-modelo'; N: number; K: number; usadoEm: number }

export interface EstatisticasBanco {
  entradas: number
  /** respostas inteiras vindas do banco */
  acertos: number
  /** respostas que aproveitaram parte do banco (só os tamanhos novos foram testados) */
  parciais: number
  /** respostas calculadas do zero */
  faltas: number
}

export interface BancoProvas {
  obter(chave: string): Prova | undefined
  guardar(p: Prova): void
  estatisticas: EstatisticasBanco
  limpar(): Promise<void>
}

let atual: BancoProvas | null = null

export const definirBanco = (b: BancoProvas | null) => {
  atual = b
}
export const bancoAtual = () => atual

/** Chave de um conjunto de fórmulas: a ordem e o nome das variáveis ligadas não importam. */
export function chaveProva(formulas: Formula[]): string {
  return `${VERSAO_MOTOR}|${resumo(formulas.map(canonica).sort().join(' ⊓ '))}`
}

/** Banco só na memória (sem IndexedDB). */
export function bancoNaMemoria(): BancoProvas {
  const m = new Map<string, Prova>()
  return {
    obter: (k) => m.get(k),
    guardar: (p) => void m.set(p.chave, p),
    estatisticas: { entradas: 0, acertos: 0, parciais: 0, faltas: 0 },
    limpar: async () => m.clear(),
  }
}

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result)
    r.onerror = () => falha(r.error)
  })
}

/**
 * Abre o banco. Se alguém pedir para apagá-lo ("Limpar o banco"), esta
 * conexão se fecha na hora (senão a exclusão fica esperando e trava quem
 * abrir o banco depois). `aoFechar`: avisado quando isso acontece.
 */
async function abrirDb(aoFechar?: () => void): Promise<IDBDatabase> {
  const abrir = indexedDB.open(NOME_BANCO, 1)
  abrir.onupgradeneeded = () => {
    for (const loja of [LOJA, LOJA_Z3])
      if (!abrir.result.objectStoreNames.contains(loja)) abrir.result.createObjectStore(loja, { keyPath: 'chave' })
  }
  const db = await pedido(abrir)
  db.onversionchange = () => {
    db.close()
    aoFechar?.()
  }
  return db
}

export interface RespostaZ3Guardada {
  chave: string
  resultado: 'sat' | 'unsat'
  ms: number
  /** as notas (índices) que a prova usou, quando foram marcadas */
  nucleo?: number[]
}

/** Respostas do Z3 guardadas no aparelho (unknown não é guardado: pode dar certo noutra vez). */
export async function lerZ3Guardados(): Promise<RespostaZ3Guardada[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await abrirDb()
  try {
    // as de formato ou tradução anterior saem sem serem lidas
    await pedido(db.transaction(LOJA_Z3, 'readwrite').objectStore(LOJA_Z3).delete(IDBKeyRange.upperBound(PREFIXO_CHAVE_Z3, true)))
    if ((await pedido(db.transaction(LOJA_Z3).objectStore(LOJA_Z3).count())) > MAX_Z3) {
      await pedido(db.transaction(LOJA_Z3, 'readwrite').objectStore(LOJA_Z3).clear())
      return []
    }
    const todas = (await pedido(db.transaction(LOJA_Z3).objectStore(LOJA_Z3).getAll())) as RespostaZ3Guardada[]
    // de uma versão mais nova (o app voltou para uma anterior): ficam lá, mas não valem aqui
    return todas.filter((r) => r.chave.startsWith(PREFIXO_CHAVE_Z3))
  } finally {
    db.close()
  }
}

let dbZ3: Promise<IDBDatabase> | null = null
export function guardarZ3(r: RespostaZ3Guardada) {
  if (typeof indexedDB === 'undefined') return
  dbZ3 ??= abrirDb(() => (dbZ3 = null))
  void dbZ3.then((db) => db.transaction(LOJA_Z3, 'readwrite').objectStore(LOJA_Z3).put(r)).catch(() => (dbZ3 = null))
}

/** Abre o banco guardado no aparelho e carrega tudo na memória. */
export async function abrirBancoProvas(): Promise<BancoProvas> {
  if (typeof indexedDB === 'undefined') return bancoNaMemoria()
  // apagado de fora: daqui em diante fica só na memória
  let aberto = true
  const db = await abrirDb(() => (aberto = false))
  // as de versões antigas (no formato antigo, a chave era o texto inteiro das fórmulas) saem sem serem lidas
  await pedido(db.transaction(LOJA, 'readwrite').objectStore(LOJA).delete(IDBKeyRange.upperBound(`${VERSAO_MOTOR}|`, true))).catch(() => {})
  const todas = (await pedido(db.transaction(LOJA).objectStore(LOJA).getAll())) as Prova[]
  const m = new Map<string, Prova>()
  for (const p of todas) if (p.chave.startsWith(`${VERSAO_MOTOR}|`)) m.set(p.chave, p)
  const estatisticas: EstatisticasBanco = { entradas: m.size, acertos: 0, parciais: 0, faltas: 0 }

  const enxugar = () => {
    if (m.size <= MAX_ENTRADAS || !aberto) return
    const velhas = [...m.values()].sort((a, b) => a.usadoEm - b.usadoEm).slice(0, Math.ceil(MAX_ENTRADAS / 10))
    const loja = db.transaction(LOJA, 'readwrite').objectStore(LOJA)
    for (const p of velhas) {
      m.delete(p.chave)
      loja.delete(p.chave)
    }
  }

  return {
    obter: (k) => {
      const p = m.get(k)
      if (p) p.usadoEm = Date.now()
      return p
    },
    guardar: (p) => {
      m.set(p.chave, p)
      estatisticas.entradas = m.size
      if (!aberto) return
      try {
        db.transaction(LOJA, 'readwrite').objectStore(LOJA).put(p)
      } catch {
        /* sem gravar: fica na memória */
      }
      enxugar()
    },
    estatisticas,
    limpar: async () => {
      m.clear()
      estatisticas.entradas = 0
      if (!aberto) return
      await pedido(db.transaction(LOJA, 'readwrite').objectStore(LOJA).clear())
      await pedido(db.transaction(LOJA_Z3, 'readwrite').objectStore(LOJA_Z3).clear())
    },
  }
}
