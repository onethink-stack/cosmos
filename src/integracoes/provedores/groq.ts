import { dadosGroq, MODELOS_GROQ, type ModeloGroq } from '../groq-contratos'

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
export class ErroGroq extends Error {
  constructor(readonly status: number, readonly codigo: 'invalido' | 'indisponivel' | 'sem-quota' | 'sem-configuracao-chave' = 'indisponivel') { super(codigo) }
}
export interface PedidoGroq { model: ModeloGroq; messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; max_tokens: number; temperature: number }
const inteiro = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
function texto(v: unknown): v is string {
  if (typeof v !== 'string') return false
  // UTF-8 deve ser reversível; não substituir surrogate isolado silenciosamente.
  return Buffer.from(v, 'utf8').toString('utf8') === v
}
export function validarPedidoGroq(v: unknown): PedidoGroq {
  try {
    const o = dadosGroq(v, ['model', 'messages', 'max_tokens', 'temperature'])
    if (!MODELOS_GROQ.includes(o.model as ModeloGroq) || !inteiro(o.max_tokens) || (o.max_tokens as number) < 1 || (o.max_tokens as number) > 8192
        || typeof o.temperature !== 'number' || !Number.isFinite(o.temperature) || o.temperature < 0 || o.temperature > 1
        || !Array.isArray(o.messages) || o.messages.length < 1 || o.messages.length > 20
        || Reflect.ownKeys(o.messages).length !== o.messages.length + 1) throw new Error()
    const messages: PedidoGroq['messages'] = []
    for (let i = 0; i < o.messages.length; i++) {
      const d = Object.getOwnPropertyDescriptor(o.messages, String(i))
      if (!d || !('value' in d)) throw new Error()
      const m = dadosGroq(d.value, ['role', 'content'])
      if (!['system', 'user', 'assistant'].includes(m.role as string) || !texto(m.content) || !m.content.length) throw new Error()
      messages.push({ role: m.role as PedidoGroq['messages'][number]['role'], content: m.content })
    }
    const pedido = { model: o.model as ModeloGroq, messages, max_tokens: o.max_tokens as number, temperature: o.temperature }
    if (Buffer.byteLength(JSON.stringify(pedido)) > 16384) throw new Error()
    return pedido
  } catch { throw new ErroGroq(400, 'invalido') }
}

/** Injeções são exclusivas do processo/teste confiável, nunca vindas do HTTP.
 * Sem ferramentas, streaming, SDK, redirects, retry ou retenção de prompts.
 */
export function criarAdaptadorGroq(opcoes: { chave: () => string | undefined; buscar?: typeof fetch; prazoMs?: number }) {
  const prazo = opcoes.prazoMs ?? 20000
  if (!Number.isSafeInteger(prazo) || prazo < 1 || prazo > 20000) throw new ErroGroq(400, 'invalido')
  const buscar = opcoes.buscar ?? fetch
  return async (entrada: unknown, signal?: AbortSignal) => {
    const p = validarPedidoGroq(entrada)
    let chave: string | undefined
    try { chave = opcoes.chave() } catch { throw new ErroGroq(503, 'sem-configuracao-chave') }
    if (!chave || !/^[\x21-\x7e]{8,512}$/.test(chave)) throw new ErroGroq(503, 'sem-configuracao-chave')
    const controle = new AbortController(), cancelar = () => controle.abort()
    if (signal?.aborted) throw new ErroGroq(503)
    signal?.addEventListener('abort', cancelar, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    // Race cobre inclusive transporte de teste que ignore AbortSignal; fetch real
    // também aborta o socket/leitor. Deadline inclui headers e corpo completo.
    const interrompido = new Promise<never>((_, reject) => {
      controle.signal.addEventListener('abort', () => reject(new ErroGroq(504)), { once: true })
      timer = setTimeout(cancelar, prazo)
    })
    let leitor: ReadableStreamDefaultReader<Uint8Array> | undefined
    try {
      return await Promise.race([interrompido, (async () => {
        const r = await buscar(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-store' },
          body: JSON.stringify(p), signal: controle.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' })
        if (controle.signal.aborted) { void r.body?.cancel().catch(() => {}); throw new ErroGroq(504) }
        if (!r.ok) {
          void r.body?.cancel().catch(() => {})
          throw new ErroGroq(r.status === 429 ? 429 : [400, 401, 403, 404].includes(r.status) ? 400 : 503,
            r.status === 429 ? 'sem-quota' : r.status === 401 || r.status === 403 || r.status === 400 || r.status === 404 ? 'invalido' : 'indisponivel')
        }
        if (r.redirected || !r.headers.get('content-type')?.startsWith('application/json') || !r.body || Number(r.headers.get('content-length') ?? 0) > 131072) {
          void r.body?.cancel().catch(() => {}); throw new ErroGroq(502)
        }
        leitor = r.body.getReader()
        const partes: Uint8Array[] = []; let n = 0
        for (;;) {
          const b = await leitor.read()
          if (b.done) break
          n += b.value.length
          if (n > 131072) throw new ErroGroq(502)
          partes.push(b.value)
        }
        const bruto = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)))
        // Retorno reconstruído: não repassa headers, request IDs, raciocínio,
        // mensagens de erro, tool_calls ou extensões arbitrárias do provedor.
        const content = bruto?.choices?.[0]?.message?.content
        const u = bruto?.usage
        if (!texto(content) || content.includes(chave!) || !u || !inteiro(u.prompt_tokens) || !inteiro(u.completion_tokens) || !inteiro(u.total_tokens)
            || u.prompt_tokens > 131072 || u.completion_tokens > p.max_tokens || u.total_tokens !== u.prompt_tokens + u.completion_tokens) throw new ErroGroq(502)
        return { conteudo: content, usage: { prompt_tokens: u.prompt_tokens as number, completion_tokens: u.completion_tokens as number, total_tokens: u.total_tokens as number } }
      })()])
    } catch (e) { throw e instanceof ErroGroq ? e : new ErroGroq(503) }
    finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancelar)
      controle.abort(); void leitor?.cancel().catch(() => {})
      chave = undefined
    }
  }
}
