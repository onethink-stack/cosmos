import { validarConfigGroq, validarSnapshotGroq, type ConfiguracaoGroq } from '../integracoes/groq-contratos'
import { ErroIntegracoes } from './integracoes-cliente'

export function criarClienteGroq(origem: string, buscar: typeof fetch = fetch) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origem) || new URL(origem).origin !== origem) throw new ErroIntegracoes('sem-servico')
  async function requisicao(rota: 'estado' | 'configuracao' | 'testar', metodo: 'GET' | 'PUT' | 'POST', corpo?: unknown, signal?: AbortSignal) {
    const controle = new AbortController(), abortar = () => controle.abort()
    if (signal?.aborted) controle.abort()
    else signal?.addEventListener('abort', abortar, { once: true })
    const timer = setTimeout(abortar, 24000)
    try {
      const r = await buscar(`${origem}/cosmos/__p0/groq/${rota}`, { method: metodo,
        headers: { 'X-Cosmos-P0': '1', Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: controle.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin' })
      if (!r.ok) throw new ErroIntegracoes(r.status === 401 ? 'sessao-expirada' : r.status === 409 ? 'conflito' : r.status === 429 ? 'limite' : r.status === 400 ? 'invalido' : 'sem-servico')
      if (!r.body || !r.headers.get('content-type')?.startsWith('application/json')) throw new ErroIntegracoes('invalido')
      const leitor = r.body.getReader(), partes: Uint8Array[] = []; let n = 0
      try {
        for (;;) {
          const b = await leitor.read(); if (b.done) break
          n += b.value.length; if (n > 131072) { await leitor.cancel(); throw new ErroIntegracoes('invalido') }
          partes.push(b.value)
        }
      } finally { leitor.releaseLock() }
      const bytes = new Uint8Array(n); let pos = 0
      for (const b of partes) { bytes.set(b, pos); pos += b.length }
      return validarSnapshotGroq(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    } catch (e) { throw e instanceof ErroIntegracoes ? e : new ErroIntegracoes('indisponivel') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abortar) }
  }
  return Object.freeze({
    carregar: (s?: AbortSignal) => requisicao('estado', 'GET', undefined, s),
    salvar: (c: ConfiguracaoGroq, s?: AbortSignal) => requisicao('configuracao', 'PUT', validarConfigGroq(c), s),
    testar: (s?: AbortSignal) => requisicao('testar', 'POST', undefined, s),
  })
}
