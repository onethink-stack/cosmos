// O gerador de teoremas do motor de fundo, numa thread só dele: deriva
// consequências das leis e fatos sem parar (src/motor/saturacao.ts). Quando
// tudo até um tamanho já foi gerado (saturou), aumenta o tamanho e continua,
// até o máximo; os teoremas novos vão para o servidor assim que saem.

import { parentPort } from 'node:worker_threads'
import type { EntradaDicionario } from '../src/dados/tipos'
import { analisar, type Grupo } from '../src/motor/motor'
import { Gerador, OPCOES_GERADOR, type EventoGerador } from '../src/motor/saturacao'

export type PedidoGerador = { tipo: 'iniciar'; grupos: Grupo[]; dicionario: EntradaDicionario[]; emitidos: string[] } | { tipo: 'parar' }

export type RespostaGerador =
  | { tipo: 'ignoradas'; ignoradas: { nota: string; motivo: string }[] }
  | { tipo: 'eventos'; eventos: EventoGerador[] }
  | { tipo: 'estado'; peso: number; escolhidas: number; geradas: number; esperando: number; guardadas: number }
  | { tipo: 'saturou'; peso: number }
  | { tipo: 'fim'; motivo: 'contradicao' | 'esgotou' }

/** tamanho (peso) em que começa, quanto cresce a cada vez que satura, e até onde vai */
const PESO_INICIAL = OPCOES_GERADOR.pesoMax
const PASSO_PESO = 4
const PESO_FINAL = 40

let vez = 0
const enviar = (r: RespostaGerador) => parentPort!.postMessage(r)

parentPort!.on('message', (m: PedidoGerador) => {
  vez++
  if (m.tipo === 'iniciar') void rodar(m, vez)
})

async function rodar(m: Extract<PedidoGerador, { tipo: 'iniciar' }>, minhaVez: number) {
  const notas = m.grupos.map((g) => ({ id: g.id, formulas: analisar(g.formulas, m.dicionario).map((i) => i.expandida) })).filter((n) => n.formulas.length)
  const ocupados = new Set(m.dicionario.map((e) => e.simbolo))
  const emitidos = new Set(m.emitidos)
  let avisou = false
  let ultimoEstado = 0
  for (let peso = PESO_INICIAL; peso <= PESO_FINAL; peso += PASSO_PESO) {
    const g = new Gerador(notas, ocupados, { ...OPCOES_GERADOR, pesoMax: peso }, emitidos)
    if (!avisou) enviar({ tipo: 'ignoradas', ignoradas: g.ignoradas })
    avisou = true
    while (!g.saturado && !g.contradicao) {
      if (minhaVez !== vez) return
      const eventos = g.passo(50)
      if (eventos.length) enviar({ tipo: 'eventos', eventos })
      if (Date.now() - ultimoEstado > 1000) {
        ultimoEstado = Date.now()
        const e = g.estatisticas
        enviar({ tipo: 'estado', peso: g.pesoAtual, escolhidas: e.escolhidas, geradas: e.geradas, esperando: e.esperando, guardadas: e.guardadas })
      }
      // deixa chegar um pedido novo (as leis mudaram) entre um bloco e outro
      await new Promise((ok) => setImmediate(ok))
    }
    if (minhaVez !== vez) return
    if (g.contradicao) {
      // (uma lei que já é contradição sozinha não passa pelos eventos)
      enviar({ tipo: 'eventos', eventos: [{ tipo: 'contradicao', apoio: g.contradicao.filter((o) => !o.startsWith('#')) }] })
      enviar({ tipo: 'fim', motivo: 'contradicao' })
      return
    }
    enviar({ tipo: 'saturou', peso })
  }
  enviar({ tipo: 'fim', motivo: 'esgotou' })
}
