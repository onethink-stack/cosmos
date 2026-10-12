/// <reference lib="webworker" />
// O Z3 num worker só dele. Cada checagem deixa memória presa dentro do Z3
// (o contexto nunca é liberado, ~8,5 MB por checagem, num espaço fixo de
// 2 GB): na linha principal, depois de umas 230 checagens, o app quebrava.
// Aqui, quem usa o Z3 joga o worker fora de tempos em tempos (o que solta
// toda a memória dele) e cria outro; se o Z3 quebrar, só este worker cai.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { init } from 'z3-solver'
import type { Formula } from '../logica/ast'
import { checarZ3ComNucleo, type ResultadoZ3 } from './z3'

export type PedidoZ3 =
  /** `base`: endereço da pasta z3/ (o worker não sabe onde o app está) */
  | { tipo: 'iniciar'; base: string }
  | { tipo: 'checar'; id: number; formulas: Formula[]; tempoMs: number; numericos: string[]; grupos?: (number | null)[] }

export type RespostaZ3 =
  | { tipo: 'pronto' }
  | { tipo: 'erro'; msg: string }
  | { tipo: 'resultado'; id: number; resultado: ResultadoZ3; nucleo: number[] | null }
  | { tipo: 'falha'; id: number; msg: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope
let api: Promise<any> | null = null

async function carregar(base: string): Promise<any> {
  const url = (f: string) => new URL(f, base).href
  // o z3-built.js é um script clássico (define initZ3): num worker de módulo não há importScripts
  const r = await fetch(url('z3-built.js'))
  if (!r.ok) throw new Error(`não foi possível baixar o Z3 (${r.status})`)
  ;(globalThis as any).initZ3 = new Function(`${await r.text()}\nreturn initZ3`)()
  ;(globalThis as any).global ??= globalThis
  return init({ locateFile: (f: string) => url(f), mainScriptUrlOrBlob: url('z3-built.js') } as any)
}

ctx.onmessage = async (e: MessageEvent<PedidoZ3>) => {
  const m = e.data
  if (m.tipo === 'iniciar') {
    api ??= carregar(m.base)
    try {
      await api
      ctx.postMessage({ tipo: 'pronto' } satisfies RespostaZ3)
    } catch (x) {
      api = null
      ctx.postMessage({ tipo: 'erro', msg: (x as Error).message } satisfies RespostaZ3)
    }
    return
  }
  try {
    if (!api) throw new Error('o Z3 não foi iniciado')
    const { resultado, nucleo } = await checarZ3ComNucleo(await api, m.formulas, m.tempoMs, new Set(m.numericos), m.grupos)
    ctx.postMessage({ tipo: 'resultado', id: m.id, resultado, nucleo } satisfies RespostaZ3)
  } catch (x) {
    ctx.postMessage({ tipo: 'falha', id: m.id, msg: (x as Error).message || 'o Z3 falhou' } satisfies RespostaZ3)
  }
}
