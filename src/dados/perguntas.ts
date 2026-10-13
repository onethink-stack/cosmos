// A conversa da aba "Perguntar": traduz a pergunta (português → fórmula),
// responde com o motor finito e o Z3, e guarda as últimas perguntas. Fica
// fora da tela: trocar de aba não perde a pergunta em andamento.

import { useEffect, useReducer } from 'preact/hooks'
import { montarTarefas, tarefaDoContexto } from '../motor/tarefas'
import { gravarConfig, lerConfig } from './db'
import { estado } from './estado'
import { candidatosDeQuem, perguntaPara, responder, type Resposta, type Veredito } from './resposta'
import { tradutor, type TraducaoFeita } from './tradutor'
import { verificacao } from './verificacao'

/** quantos nomes, no máximo, uma pergunta de "quem" testa */
export const MAX_CANDIDATOS = 30
const MAX_RECENTES = 20

export interface RespostaDeQuem {
  /** símbolos dos nomes testados, na ordem */
  candidatos: string[]
  feitos: { simbolo: string; resposta: Resposta }[]
  /** quantos nomes ficaram de fora (passou do máximo) */
  deFora: number
}

export interface Conversa {
  id: number
  texto: string
  /** conjunto perguntado: "geral" ou "visao:<titular>" */
  chave: string
  etapa: 'traduzindo' | 'respondendo' | 'pronto' | 'erro'
  traducao?: TraducaoFeita
  resposta?: Resposta
  quem?: RespostaDeQuem
  /** o que está sendo feito agora */
  msg?: string
  erro?: string
  quando: number
}

export interface Recente {
  texto: string
  chave: string
  formula: string
  veredito: Veredito | 'quem'
  quando: number
  /** a fórmula foi corrigida pelo usuário (refazer usa ela, sem traduzir de novo) */
  corrigida?: boolean
}

class Perguntas {
  atual: Conversa | null = null
  recentes: Recente[] = []
  private proximo = 0
  private abortar: AbortController | null = null
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

  async carregar() {
    try {
      this.recentes = (await lerConfig<Recente[]>('perguntasRecentes')) ?? []
    } catch {
      /* sem banco */
    }
    this.avisar()
  }

  get ocupada() {
    return !!this.atual && (this.atual.etapa === 'traduzindo' || this.atual.etapa === 'respondendo')
  }

  private mudar(id: number, m: Partial<Conversa>) {
    if (this.atual?.id !== id) return false
    this.atual = { ...this.atual, ...m }
    this.avisar()
    return true
  }

  private lembrar(r: Recente) {
    this.recentes = [r, ...this.recentes.filter((x) => !(x.texto === r.texto && x.chave === r.chave))].slice(0, MAX_RECENTES)
    void gravarConfig('perguntasRecentes', this.recentes).catch(() => {})
  }

  esquecerRecentes() {
    this.recentes = []
    void gravarConfig('perguntasRecentes', []).catch(() => {})
    this.avisar()
  }

  /** Para a pergunta em andamento. */
  cancelar() {
    if (!this.ocupada) return
    this.abortar?.abort()
    if (verificacao.ocupado === 'perguntar') verificacao.cancelar(false)
    this.mudar(this.atual!.id, { etapa: 'erro', erro: 'Pergunta cancelada.', msg: undefined })
  }

  /**
   * Pergunta em português (ou uma fórmula). `formula`: a tradução já
   * conferida pelo usuário (pula o tradutor).
   */
  async perguntar(texto: string, chave: string, formula?: string) {
    this.cancelar()
    const id = ++this.proximo
    const abortar = (this.abortar = new AbortController())
    this.atual = { id, texto, chave, etapa: formula ? 'respondendo' : 'traduzindo', quando: Date.now() }
    this.avisar()

    const { tarefas, pronto } = montarTarefas(estado.notas, estado.dicionario)
    if (!pronto) {
      this.mudar(id, { etapa: 'erro', erro: 'Há nomes nas notas sem ficha no dicionário: confirme-os em Contradições antes de perguntar.' })
      return
    }
    const tarefa = tarefaDoContexto(tarefas, chave)
    const dicionario = estado.dicionario

    const traducao: TraducaoFeita = formula
      ? { ok: true, tipo: 'sim-ou-nao', formula, por: 'voce' }
      : await tradutor.traduzir(texto, dicionario, abortar.signal)
    if (!this.mudar(id, { traducao })) return
    if (!traducao.ok) {
      this.mudar(id, { etapa: 'erro' })
      return
    }
    if (!tarefa.grupos.length) {
      this.mudar(id, { etapa: 'erro', erro: 'Não há notas ativas neste conjunto: não há de onde responder.' })
      return
    }
    this.mudar(id, { etapa: 'respondendo', msg: 'pensando' })
    const aviso = (msg: string) => void this.mudar(id, { msg })

    if (traducao.tipo === 'sim-ou-nao') {
      const resposta = await responder(traducao.formula, tarefa, dicionario, aviso)
      if (!this.mudar(id, { etapa: 'pronto', resposta, msg: undefined })) return
      this.lembrar({ texto, chave, formula: traducao.formula, veredito: resposta.veredito, quando: Date.now(), ...(formula ? { corrigida: true } : {}) })
      return
    }

    // "quem": a mesma pergunta para cada nome que aparece nas notas
    const todos = candidatosDeQuem(tarefa, dicionario)
    const candidatos = todos.slice(0, MAX_CANDIDATOS).map((e) => e.simbolo)
    const quem: RespostaDeQuem = { candidatos, feitos: [], deFora: todos.length - candidatos.length }
    this.mudar(id, { quem })
    for (const [k, simbolo] of candidatos.entries()) {
      const nome = dicionario.find((e) => e.simbolo === simbolo)?.termo || simbolo
      if (!this.mudar(id, { msg: `testando ${nome} (${k + 1} de ${candidatos.length})` })) return
      const resposta = await responder(perguntaPara(traducao.formula, traducao.variavel, simbolo, dicionario), tarefa, dicionario)
      if (this.atual?.id !== id) return
      quem.feitos.push({ simbolo, resposta })
      this.mudar(id, { quem: { ...quem, feitos: [...quem.feitos] } })
    }
    if (!this.mudar(id, { etapa: 'pronto', msg: undefined })) return
    this.lembrar({ texto, chave, formula: traducao.formula, veredito: 'quem', quando: Date.now() })
  }
}

export const perguntas = new Perguntas()

export function usePerguntas(): Perguntas {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => perguntas.assinar(() => forcar(undefined)), [])
  return perguntas
}
