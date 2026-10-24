/** Catálogo público P1. Não contém configuração de saída ou credencial. */
export const MODELOS_GROQ = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'] as const
export type ModeloGroq = typeof MODELOS_GROQ[number]
export const LIMITES_GROQ = Object.freeze({ rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 })
export interface ConfiguracaoGroq { revisao: number; modelo: ModeloGroq; habilitada: boolean }
export type EstadoGroq = 'sem-configuracao' | 'local' | 'conectado' | 'invalido' | 'indisponivel' | 'sem-quota' | 'sem-configuracao-chave'
export interface SnapshotGroq {
  formato: 'cosmos-groq-p1-v1'
  configuracao: ConfiguracaoGroq | null
  estado: EstadoGroq
  testadoEmMs: number | null
  consumo: { pedidos: number; prompt_tokens: number; completion_tokens: number; reservasConservadoras: number; pendente: boolean }
}
export function dadosGroq(v: unknown, chaves: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('dados_invalidos')
  const keys = Reflect.ownKeys(v)
  if (keys.length !== chaves.length || keys.some(k => typeof k !== 'string' || !chaves.includes(k))) throw new Error('dados_invalidos')
  const r: Record<string, unknown> = Object.create(null)
  for (const k of chaves) {
    const d = Object.getOwnPropertyDescriptor(v, k)
    if (!d || !d.enumerable || !('value' in d)) throw new Error('dados_invalidos')
    r[k] = d.value
  }
  return r
}
export function validarConfigGroq(v: unknown): ConfiguracaoGroq {
  const c = dadosGroq(v, ['revisao', 'modelo', 'habilitada'])
  if (!Number.isSafeInteger(c.revisao) || (c.revisao as number) < 1 || !MODELOS_GROQ.includes(c.modelo as ModeloGroq) || typeof c.habilitada !== 'boolean') throw new Error('configuracao_invalida')
  return Object.freeze({ revisao: c.revisao as number, modelo: c.modelo as ModeloGroq, habilitada: c.habilitada })
}
export function validarSnapshotGroq(v: unknown): SnapshotGroq {
  const o = dadosGroq(v, ['formato', 'configuracao', 'estado', 'testadoEmMs', 'consumo'])
  const c = o.configuracao === null ? null : validarConfigGroq(o.configuracao)
  const u = dadosGroq(o.consumo, ['pedidos', 'prompt_tokens', 'completion_tokens', 'reservasConservadoras', 'pendente'])
  if (o.formato !== 'cosmos-groq-p1-v1' || !['sem-configuracao', 'local', 'conectado', 'invalido', 'indisponivel', 'sem-quota', 'sem-configuracao-chave'].includes(o.estado as string)
      || typeof u.pendente !== 'boolean') throw new Error('estado_invalido')
  for (const k of ['pedidos', 'prompt_tokens', 'completion_tokens', 'reservasConservadoras']) if (!Number.isSafeInteger(u[k]) || (u[k] as number) < 0) throw new Error('estado_invalido')
  if ((!c && o.estado !== 'sem-configuracao') || (c && o.estado === 'sem-configuracao')
      || (o.estado === 'conectado' && (!c?.habilitada || o.testadoEmMs === null))
      || (o.estado !== 'conectado' && o.testadoEmMs !== null)
      || (o.testadoEmMs !== null && (!Number.isSafeInteger(o.testadoEmMs) || (o.testadoEmMs as number) < 0 || (o.testadoEmMs as number) > Date.now()))) throw new Error('estado_invalido')
  return { formato: 'cosmos-groq-p1-v1', configuracao: c, estado: o.estado as EstadoGroq, testadoEmMs: o.testadoEmMs as number | null,
    consumo: { pedidos: u.pedidos as number, prompt_tokens: u.prompt_tokens as number, completion_tokens: u.completion_tokens as number,
      reservasConservadoras: u.reservasConservadoras as number, pendente: u.pendente } }
}
