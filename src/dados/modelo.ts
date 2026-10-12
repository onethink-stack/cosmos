// Segundo modelo: as pastas escolhidas, a cópia das notas que o motor recebe
// e o "levar para o caderno" (o modelo nunca mexe no caderno sozinho).

import { useEffect, useReducer } from 'preact/hooks'
import { PREFIXO_ADOTADA, PREFIXO_INDUZIDA, type ItemModelo, type RelatorioModelo } from '../motor/modelo'
import { gravarConfig, lerConfig } from './db'
import { notaQueJaDiz } from './deduzida'
import { semMarcaDesativada } from './lacunas'
import { estado, notaVazia } from './estado'
import type { EntradaDicionario, Nota } from './tipos'

/** Uma execução do segundo modelo (a última fica guardada no aparelho). */
export interface ExecucaoModelo {
  motivo: string
  relatorio: RelatorioModelo | null
  erro: string | null
  ms: number
  terminada: boolean
  /** parou antes do fim: pelo usuário, por outro trabalho do motor, ou o app foi fechado */
  interrompida?: 'usuario' | 'outro' | 'fechado'
  /** quantas vezes seguidas foi recomeçada sem terminar */
  tentativas: number
  /** identifica as notas e as pastas; se mudar, o resultado está desatualizado */
  assinatura: string
  pastas: string[]
  quando: number
  /** a classificação da execução anterior (id → classe), para avisar só o que mudou */
  anterior?: Record<string, string>
}

/**
 * As notas que entram: as que têm alguma das pastas (tags) escolhidas; sem
 * pasta escolhida, todas. Os teoremas entram todos, mesmo desativados (o
 * modelo confere cada um). Vai só o que o motor usa (sem o texto).
 */
export function notasDoModelo(notas: Nota[], pastas: string[]): Nota[] {
  return notas
    .filter((n) => !pastas.length || n.tags.some((t) => pastas.includes(t)))
    .map((n) => ({ ...n, texto: '', fonte: '', ativa: n.ativa || n.compartimento === 'teorema' }))
}

/** Muda se uma nota que entra no modelo, as pastas ou o dicionário mudarem. */
export function assinaturaModelo(notas: Nota[], dicionario: EntradaDicionario[], pastas: string[], marcaDados = ''): string {
  return JSON.stringify([
    marcaDados,
    pastas,
    notas.map((n) => [n.id, n.ativa, n.compartimento, n.formulas, n.titular, n.grau]),
    dicionario.map((e) => [e.simbolo, e.tipo, e.aridade, !!e.numerico, e.argumentos ?? null]),
  ])
}

class ConfigModelo {
  /** pastas (tags) que entram; vazio = todas as notas */
  pastas: string[] = []
  /** rodar sozinho quando as notas dessas pastas mudarem */
  automatico = false
  /** usar os dados do mundo (leis induzidas, conferência das teses) */
  usarDados = true
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

  async carregar() {
    try {
      this.pastas = (await lerConfig<string[]>('modeloPastas')) ?? []
      this.automatico = (await lerConfig<boolean>('modeloAutomatico')) ?? false
      this.usarDados = (await lerConfig<boolean>('modeloUsarDados')) ?? true
    } catch {
      /* sem banco */
    }
    this.mudou()
  }

  alternarPasta(p: string) {
    this.definirPastas(this.pastas.includes(p) ? this.pastas.filter((x) => x !== p) : [...this.pastas, p].sort((a, b) => a.localeCompare(b)))
  }

  definirPastas(ps: string[]) {
    this.pastas = ps
    void gravarConfig('modeloPastas', ps).catch(() => {})
    this.mudou()
  }

  definirAutomatico(v: boolean) {
    this.automatico = v
    void gravarConfig('modeloAutomatico', v).catch(() => {})
    this.mudou()
  }

  definirUsarDados(v: boolean) {
    this.usarDados = v
    void gravarConfig('modeloUsarDados', v).catch(() => {})
    this.mudou()
  }
}

export const configModelo = new ConfigModelo()

export function useConfigModelo(): ConfigModelo {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => configModelo.assinar(() => forcar(undefined)), [])
  return configModelo
}

/** Uma mudança que o modelo propõe para o caderno. */
export interface MudancaCaderno {
  tipo: 'criar' | 'ativar' | 'desativar'
  nota: Nota
  motivo: string
}

/**
 * O que muda no caderno se o resultado for levado: leis adotadas viram notas,
 * premissas ativadas e desativadas mudam de estado, teoremas refutados são
 * desativados e teoremas desativados que agora seguem são ativados.
 */
export function mudancasParaOCaderno(rel: RelatorioModelo, notas: Nota[]): MudancaCaderno[] {
  const ms: MudancaCaderno[] = []
  const porNota = new Map<string, ItemModelo[]>()
  for (const it of rel.itens) if (it.notaId) porNota.set(it.notaId, [...(porNota.get(it.notaId) ?? []), it])
  for (const m of rel.notas) {
    const itens = porNota.get(m.id) ?? []
    const motivo = itens[0]?.explicacao ?? ''
    if (m.id.startsWith(PREFIXO_ADOTADA) || m.id.startsWith(PREFIXO_INDUZIDA)) {
      if (m.ativa) ms.push({ tipo: 'criar', nota: m, motivo })
      continue
    }
    const real = notas.find((n) => n.id === m.id)
    if (!real) continue
    if (real.compartimento === 'teorema') {
      const refutado = itens.find((i) => i.classe === 'refutado')
      if (refutado && real.ativa) ms.push({ tipo: 'desativar', nota: real, motivo: refutado.explicacao })
      else if (!refutado && !real.ativa && itens.length && itens.every((i) => i.classe === 'provado'))
        ms.push({ tipo: 'ativar', nota: real, motivo: 'segue das leis' })
      continue
    }
    if (real.ativa !== m.ativa) ms.push({ tipo: m.ativa ? 'ativar' : 'desativar', nota: real, motivo })
  }
  return ms
}

/** Etiquetas de uma nota criada pelo modelo: as pastas do modelo (para ela entrar na próxima vez) e #segundo-modelo. */
const etiquetas = (pastas: string[]) => [...new Set([...pastas, 'segundo-modelo'])]

/** Leva as mudanças para o caderno (cada nota tocada ganha uma linha dizendo por quê). */
export async function levarParaOCaderno(ms: MudancaCaderno[], pastas: string[]) {
  const data = new Date().toLocaleDateString('pt-BR')
  for (const m of ms) {
    if (m.tipo === 'criar') {
      const induzida = m.nota.id.startsWith(PREFIXO_INDUZIDA)
      await estado.salvarNota({ ...m.nota, id: '', tags: induzida ? [...new Set([...etiquetas(pastas), ...m.nota.tags])] : etiquetas(pastas) })
      continue
    }
    const atual = estado.nota(m.nota.id)
    if (!atual) continue
    const linha = `— ${m.tipo === 'ativar' ? 'Ativada' : 'Desativada'} pelo segundo modelo em ${data}: ${m.motivo} —`
    await estado.salvarNota({
      ...atual,
      ativa: m.tipo === 'ativar',
      titulo: m.tipo === 'ativar' ? semMarcaDesativada(atual.titulo) : atual.titulo,
      texto: [atual.texto.trim(), linha].filter(Boolean).join('\n\n'),
    })
  }
}

/** Escreve uma consequência descoberta como teorema do caderno (no conjunto de onde veio). */
export function escreverComoTeorema(it: ItemModelo, pastas: string[]): Promise<Nota> {
  const titular = it.chave.startsWith('visao:') ? it.chave.slice('visao:'.length) : ''
  const ja = notaQueJaDiz(it.formula, 'teorema', titular)
  if (ja) return Promise.resolve(ja)
  return estado.salvarNota({
    ...notaVazia('teorema'),
    titulo: it.titulo,
    formulas: [it.formula],
    titular,
    tags: etiquetas(pastas),
    texto: `Descoberta pelo segundo modelo em ${new Date().toLocaleDateString('pt-BR')}: ${it.explicacao}.`,
  })
}
