// O banco de verdades: os teoremas que o gerador do motor de fundo prova a
// partir das leis e fatos ativos, sem parar (servidor/gerador-worker.ts). O
// app manda as leis para lá sempre que elas mudam e mostra o que vai saindo.
// Cada teorema vale para qualquer número de objetos (é prova), e só enquanto
// as leis de onde ele vem não mudarem.

import { useEffect, useReducer } from 'preact/hooks'
import { prepararCadeia } from './cadeia'
import { notaQueJaDiz } from './deduzida'
import { estado, notaVazia } from './estado'
import { ENDERECO_MOTOR, motorFundo } from './motorFundo'
import type { Nota } from './tipos'

export interface Verdade {
  chave: string
  formula: string
  /** tamanho (símbolos) */
  peso: number
  /** quantos passos desde as leis */
  prof: number
  /** notas de onde vem */
  apoio: string[]
  /** teoremas do banco de onde veio */
  pais: { chave: string; formula: string }[]
  /** quantas vezes serviu para provar outro */
  usos: number
  criado: number
}

export interface EstadoGerador {
  ligado: boolean
  rodando?: boolean
  leis?: number
  andamento?: { peso: number; escolhidas: number; geradas: number; esperando: number; guardadas: number } | null
  saturadoAte?: number | null
  fim?: 'contradicao' | 'esgotou' | null
  contradicao?: string[] | null
  ignoradas?: { nota: string; motivo: string }[]
}

export type Ordem = 'uteis' | 'curtos' | 'novos'

/** espera as notas pararem de mudar antes de mandar as leis de novo */
const ESPERA_MS = 4000

class Verdades {
  gerador: EstadoGerador | null = null
  itens: Verdade[] = []
  total = 0
  ordem: Ordem = 'uteis'
  busca = ''
  erro: string | null = null
  carregando = false
  private enviada = ''
  private espera: ReturnType<typeof setTimeout> | null = null
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  /** as leis e fatos ativos (o mesmo conjunto da reação em cadeia) */
  private leis() {
    const geral = prepararCadeia(estado.notas, estado.dicionario).pedido.contextos.find((c) => c.chave === 'geral')
    return { grupos: geral?.grupos ?? [], dicionario: estado.dicionario }
  }

  /** As notas mudaram (ou o motor de fundo ligou): manda as leis de novo, se mudaram. */
  agendarEnvio() {
    if (this.espera) clearTimeout(this.espera)
    this.espera = setTimeout(() => void this.enviar(), ESPERA_MS)
  }

  /** o motor de fundo desligou: na volta, as leis são mandadas de novo */
  esquecerEnvio() {
    this.enviada = ''
  }

  async enviar() {
    if (!motorFundo.ativo || !estado.carregado) return
    const { grupos, dicionario } = this.leis()
    const assinatura = JSON.stringify([grupos, dicionario.map((e) => [e.simbolo, e.tipo, e.aridade])])
    if (assinatura === this.enviada) return
    try {
      const r = await fetch(`${ENDERECO_MOTOR}/gerador`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupos, dicionario }) })
      if (r.ok) this.enviada = assinatura
    } catch {
      /* o motor de fundo desligou: manda quando voltar */
    }
  }

  /** Busca o andamento do gerador e os teoremas (na ordem e com a busca escolhidas). */
  async atualizar() {
    if (!motorFundo.ativo) {
      this.gerador = null
      this.avisar()
      return
    }
    this.carregando = true
    try {
      const q = new URLSearchParams({ ordem: this.ordem, limite: '300', busca: this.busca })
      const r = await fetch(`${ENDERECO_MOTOR}/verdades?${q}`, { cache: 'no-store' })
      const j = (await r.json()) as { gerador: EstadoGerador; total: number; itens: Verdade[] }
      this.gerador = j.gerador
      this.itens = j.itens
      this.total = j.total
      this.erro = null
    } catch (e) {
      this.erro = `o motor de fundo não respondeu (${(e as Error).message})`
    }
    this.carregando = false
    this.avisar()
  }

  definirOrdem(o: Ordem) {
    this.ordem = o
    void this.atualizar()
  }

  definirBusca(b: string) {
    this.busca = b
    void this.atualizar()
  }
}

export const verdades = new Verdades()

export function useVerdades(): Verdades {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => verdades.assinar(() => forcar(undefined)), [])
  return verdades
}

/** Guarda um teorema do banco como nota (teorema provado, com as notas de onde vem). */
export function salvarVerdade(v: Verdade): Promise<Nota> {
  const ja = notaQueJaDiz(v.formula, 'teorema', '')
  if (ja) return Promise.resolve(ja)
  const titulos = v.apoio.map((id) => estado.nota(id)?.titulo || 'Sem título').join(', ')
  return estado.salvarNota({
    ...notaVazia('teorema'),
    titulo: `Provado: ${v.formula}`,
    formulas: [v.formula],
    tags: ['gerado'],
    texto: `Provado em ${new Date().toLocaleDateString('pt-BR')} pelo gerador do motor de fundo, a partir de: ${titulos}. Vale com qualquer número de objetos (é prova, não busca de cenário).`,
  })
}
