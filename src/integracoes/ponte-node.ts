import { request, type IncomingMessage, type ServerResponse } from 'node:http'
import { criarObservabilidadeP0, observarHttpP0 } from './observabilidade-node'
import { criarControleGroq } from './groq-node'

const PREFIXO = '/cosmos/__p0/'
const ROTAS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  estado: ['GET'], configuracao: ['GET', 'PUT', 'DELETE'], testar: ['POST'], orcamento: ['GET'],
  executar: ['POST'], cancelar: ['POST'], 'contexto-rag': ['POST'],
  groq: ['POST'], 'groq/configuracao': ['GET', 'PUT'], 'groq/estado': ['GET'], 'groq/testar': ['POST'],
})
function unico(req: IncomingMessage, nome: string) {
  const valores = req.rawHeaders.filter((_, i) => i % 2 === 0).filter(h => h.toLowerCase() === nome)
  if (valores.length > 1) throw new Error()
  return req.headers[nome]
}

/** Ponte de desenvolvimento explicitamente criada pelo processo confiável.
 * Capacidade fica somente aqui; navegador autoriza-se pela origem local dedicada
 * e cabeçalho não simples. Não é login, nem proteção contra XSS/malware local.
 * Sem destino/URL/headers arbitrários, cookies, redirecionamento ou bootstrap.
 */
export function criarPonteIntegracoes(opcoes: { origem: string; portaApi: number; token: string;
  groq?: { chave: () => string | undefined; buscar?: typeof fetch; prazoMs?: number } }) {
  const { origem, portaApi, token } = opcoes
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origem) || new URL(origem).origin !== origem
      || !Number.isSafeInteger(portaApi) || portaApi < 1 || portaApi > 65535 || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Ponte local inválida')
  let encerrada = false
  // Confere a capacidade atual no P0; não cria nem renova sessão por HTTP.
  const sessaoValida = () => new Promise<boolean>(resolve => {
    const r = request({ hostname: '127.0.0.1', port: portaApi, path: '/integracoes/p0/estado', method: 'GET',
      agent: false, maxHeaderSize: 8192, headers: { Origin: origem, Authorization: `Bearer ${token}` } }, s => {
      const ok = s.statusCode === 200; s.resume(); resolve(ok)
    })
    r.setTimeout(1500, () => { r.destroy(); resolve(false) }); r.on('error', () => resolve(false)); r.end()
  })
  const groq = opcoes.groq ? criarControleGroq({ ...opcoes.groq, sessaoValida }) : null
  const observabilidade = criarObservabilidadeP0()
  observabilidade.registrar({ tipo: 'servico', canal: 'ponte', estado: 'iniciado' })
  return Object.freeze({
    diagnosticoLocal: observabilidade.consultar,
    encerrar() {
      if (!encerrada) observabilidade.registrar({ tipo: 'servico', canal: 'ponte', estado: 'encerrado' })
      encerrada = true
      groq?.encerrar()
    },
    tratar(req: IncomingMessage, res: ServerResponse) {
      // Não rotular tráfego real P1 como diagnóstico "simulado" do P0.
      if (!req.url?.startsWith('/cosmos/__p0/groq')) observarHttpP0(observabilidade, 'ponte', req.url, res)
      const recusar = (status: number) => {
        if (res.destroyed || res.writableEnded) return
        if (res.headersSent) { res.destroy(); return }
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' })
        res.end(JSON.stringify({ erro: 'ponte_local_indisponivel' }))
      }
      try {
        if (encerrada) { recusar(503); return }
        if (req.socket.remoteAddress !== '127.0.0.1' || unico(req, 'host') !== new URL(origem).host) { recusar(403); return }
        if (req.rawHeaders.some((h, i) => i % 2 === 0 && (h.toLowerCase() === 'forwarded' || h.toLowerCase().startsWith('x-forwarded-')))
            || unico(req, 'authorization') !== undefined || unico(req, 'cookie') !== undefined) { recusar(400); return }
        if (unico(req, 'x-cosmos-p0') !== '1') { recusar(403); return }
        const recebido = unico(req, 'origin'), site = unico(req, 'sec-fetch-site'), referer = unico(req, 'referer')
        if (site !== undefined && site !== 'same-origin') { recusar(403); return }
        // GET same-origin pode omitir Origin no navegador; nesse caso exige Fetch
        // Metadata + Referer da origem exata. POST/PUT/DELETE sempre exigem Origin.
        if (recebido !== origem && !(req.method === 'GET' && recebido === undefined && site === 'same-origin'
            && typeof referer === 'string' && new URL(referer).origin === origem)) { recusar(403); return }
        const caminho = req.url?.startsWith(PREFIXO) ? req.url.slice(PREFIXO.length) : ''
        const fonte = /^fontes\/[a-z][a-z0-9-]{0,47}\/[1-9][0-9]{0,15}\/[a-f0-9]{64}$/.test(caminho)
        const metodos = Object.hasOwn(ROTAS, caminho) ? ROTAS[caminho] : fonte ? ['GET'] : null
        if (!metodos) { recusar(404); return }
        if (!metodos.includes(req.method ?? '')) { recusar(405); return }
        const tipo = unico(req, 'content-type'), tamanho = unico(req, 'content-length')
        if (unico(req, 'content-encoding') || unico(req, 'expect')) { recusar(415); return }
        if (tamanho !== undefined && (typeof tamanho !== 'string' || !/^\d+$/.test(tamanho) || Number(tamanho) > 16384)) { recusar(413); return }
        const temCorpo = req.method === 'PUT' || (req.method === 'POST' && caminho !== 'testar' && caminho !== 'groq/testar')
        if (temCorpo && (typeof tipo !== 'string' || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(tipo))) { recusar(415); return }
        if (!temCorpo && (req.headers['transfer-encoding'] || (tamanho !== undefined && tamanho !== '0'))) { recusar(400); return }
        if (caminho === 'groq' || caminho.startsWith('groq/')) {
          if (!groq) { recusar(503); return }
          void groq.tratar(req, res, caminho)
          return
        }
        const proxy = request({ hostname: '127.0.0.1', port: portaApi, path: `/integracoes/p0/${caminho}`, method: req.method,
          headers: { Origin: origem, Authorization: `Bearer ${token}`, ...(temCorpo ? { 'Content-Type': 'application/json' } : {}) },
          agent: false, maxHeaderSize: 8192,
        }, resposta => {
          // Nenhum header arbitrário do upstream (Set-Cookie/Location etc.) retorna.
          res.writeHead(resposta.statusCode ?? 503, { 'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' })
          let bytes = 0
          resposta.on('data', (b: Buffer) => {
            bytes += b.length
            if (bytes > 32768) { proxy.destroy(); res.destroy(); return }
            res.write(b)
          })
          resposta.on('end', () => res.end())
          resposta.on('error', () => res.destroy())
        })
        let bytes = 0
        req.on('data', (b: Buffer) => {
          bytes += b.length
          if (bytes > 16384) { proxy.destroy(); recusar(413); req.pause(); return }
          if (!proxy.destroyed) proxy.write(b)
        })
        req.once('end', () => proxy.end())
        req.once('error', () => proxy.destroy())
        req.once('aborted', () => proxy.destroy())
        const timer = setTimeout(() => { proxy.destroy(); recusar(408) }, temCorpo ? 15000 : 12000)
        proxy.on('error', () => recusar(503))
        res.once('close', () => { clearTimeout(timer); proxy.destroy() })
      } catch { recusar(400) }
    },
  })
}
