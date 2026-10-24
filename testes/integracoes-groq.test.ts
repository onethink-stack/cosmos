import { createServer, request } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { criarApiIntegracoes } from '../src/integracoes/api-node'
import { criarPonteIntegracoes } from '../src/integracoes/ponte-node'
import { criarAdaptadorGroq, validarPedidoGroq } from '../src/integracoes/provedores/groq'
import { MODELOS_GROQ, validarSnapshotGroq } from '../src/integracoes/groq-contratos'
import { criarClienteGroq } from '../src/interfaces/groq-cliente'
import { criarControleGroq } from '../src/integracoes/groq-node'

const CHAVE = 'CHAVE-GROQ-FICTICIA-APENAS-TESTE'
const pedido = () => ({ model: MODELOS_GROQ[0], messages: [{ role: 'user', content: 'teste publico' }], max_tokens: 128, temperature: 0 })
const config = (revisao = 1, habilitada = true) => ({ revisao, modelo: MODELOS_GROQ[0], habilitada })
const resposta = (conteudo = 'ok') => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: conteudo, reasoning: 'NAO-REPASSE' } }],
  usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }, extra: CHAVE }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': CHAVE } })

describe('Groq: catálogo fechado, validação e transporte fixo', () => {
  it.each(MODELOS_GROQ)('aceita somente ID oficial %s', model => expect(validarPedidoGroq({ ...pedido(), model }).model).toBe(model))
  it.each([
    { model: 'gpt-oss-120b' }, { model: 'https://evil.invalid' }, { messages: [] }, { messages: Array(21).fill({ role: 'user', content: 'x' }) },
    { messages: [{ role: 'tool', content: 'x' }] }, { messages: [{ role: 'user', content: 'x', tool_calls: [] }] },
    { max_tokens: 0 }, { max_tokens: 8193 }, { max_tokens: 1.5 }, { temperature: -1 }, { temperature: 1.1 }, { temperature: Infinity },
    { tools: [] }, { stream: true }, { messages: [{ role: 'user', content: '\ud800' }] }, { messages: [{ role: 'user', content: 'x'.repeat(16384) }] },
  ])('recusa corpo fora da política %#', mudanca => expect(() => validarPedidoGroq({ ...pedido(), ...mudanca })).toThrow('invalido'))
  it('recusa getters, prototype e lacunas sem executar getter', () => {
    const getter = vi.fn(() => 'segredo'), p = pedido()
    Object.defineProperty(p, 'model', { get: getter })
    expect(() => validarPedidoGroq(p)).toThrow(); expect(getter).not.toHaveBeenCalled()
    expect(() => validarPedidoGroq(Object.assign(Object.create({ herdado: true }), pedido()))).toThrow()
    expect(() => validarPedidoGroq({ ...pedido(), messages: new Array(2) })).toThrow()
  })
  it('constrói só destino/headers próprios, sem redirect, retry, credenciais do browser ou extensões upstream', async () => {
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(resposta())
    const r = await criarAdaptadorGroq({ chave: () => CHAVE, buscar })(pedido())
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(buscar.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' } })
    expect(r).toEqual({ conteudo: 'ok', usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 } })
    expect(JSON.stringify(r)).not.toContain(CHAVE); expect(JSON.stringify(r)).not.toContain('NAO-REPASSE')
  })
  it('chave ausente ou com controle não chama rede', async () => {
    const buscar = vi.fn<typeof fetch>()
    for (const chave of [undefined, 'ruim\r\nchave']) await expect(criarAdaptadorGroq({ chave: () => chave, buscar })(pedido())).rejects.toThrow('sem-configuracao-chave')
    expect(buscar).not.toHaveBeenCalled()
  })
  it.each([401, 403, 429, 500])('sanitiza erro %s sem corpo/chave e não repete', async status => {
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(new Response(CHAVE, { status }))
    await expect(criarAdaptadorGroq({ chave: () => CHAVE, buscar })(pedido())).rejects.toMatchObject({ codigo: status === 429 ? 'sem-quota' : status < 500 ? 'invalido' : 'indisponivel' })
    expect(buscar).toHaveBeenCalledTimes(1)
  })
  it('limita stream sem Content-Length a 128 KiB e cancela leitor', async () => {
    const cancelar = vi.fn()
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(131073)) }, cancel: cancelar }), { headers: { 'Content-Type': 'application/json' } }))
    await expect(criarAdaptadorGroq({ chave: () => CHAVE, buscar })(pedido())).rejects.toMatchObject({ status: 502 })
    expect(cancelar).toHaveBeenCalled()
  })
  it('deadline abrange fetch e leitura do corpo, mesmo mock que ignore sinal', async () => {
    const nunca = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
    await expect(criarAdaptadorGroq({ chave: () => CHAVE, buscar: nunca, prazoMs: 15 })(pedido())).rejects.toMatchObject({ status: 504 })
    const cancelar = vi.fn()
    const lento = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ cancel: cancelar }), { headers: { 'Content-Type': 'application/json' } }))
    await expect(criarAdaptadorGroq({ chave: () => CHAVE, buscar: lento, prazoMs: 15 })(pedido())).rejects.toMatchObject({ status: 504 })
    expect(cancelar).toHaveBeenCalled()
  })
  it('abort prévio não envia requisição e prazo só pode reduzir 20s', async () => {
    const buscar = vi.fn<typeof fetch>(), c = new AbortController(); c.abort()
    await expect(criarAdaptadorGroq({ chave: () => CHAVE, buscar })(pedido(), c.signal)).rejects.toThrow()
    expect(buscar).not.toHaveBeenCalled()
    for (const prazoMs of [0, 20001, Infinity, 1.5]) expect(() => criarAdaptadorGroq({ chave: () => CHAVE, prazoMs })).toThrow()
  })
  it.each([
    () => new Response('<html>erro</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('{"choices":[{"message":{"content":"ok"}}]}', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response('{"choices":[{"message":{"content":"ok"}}],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":9}}', { headers: { 'Content-Type': 'application/json' } }),
    () => resposta(CHAVE),
  ])('recusa resposta incompatível/usage inválido/reflexo de credencial %#', async fabricar => {
    await expect(criarAdaptadorGroq({ chave: () => CHAVE, buscar: vi.fn<typeof fetch>().mockResolvedValue(fabricar()) })(pedido())).rejects.toMatchObject({ status: 502 })
  })
})

type OpcoesReq = { rota?: string; metodo?: string; corpo?: unknown; headers?: Record<string, string | string[] | undefined> }
async function ambiente(fn: (c: { chamar: (o?: OpcoesReq) => Promise<{ status: number; texto: string; headers: Record<string, unknown> }>; api: ReturnType<typeof criarApiIntegracoes>; buscar: ReturnType<typeof vi.fn<typeof fetch>>; ponte: ReturnType<typeof criarPonteIntegracoes>; origem: string; cliente: ReturnType<typeof criarClienteGroq> }) => Promise<void>, opcoes: { chave?: () => string | undefined; buscar?: ReturnType<typeof vi.fn<typeof fetch>>; prazoMs?: number } = {}) {
  let ponte: ReturnType<typeof criarPonteIntegracoes> | undefined
  const server = createServer((q, r) => ponte!.tratar(q, r))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port, origem = `http://127.0.0.1:${port}`
  const api = criarApiIntegracoes({ origemPermitida: origem })
  const buscar = opcoes.buscar ?? vi.fn<typeof fetch>().mockImplementation(async () => resposta())
  const chamar = (o: OpcoesReq = {}) => new Promise<{ status: number; texto: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const corpo = o.corpo === undefined ? undefined : typeof o.corpo === 'string' ? o.corpo : JSON.stringify(o.corpo)
    const headers = Object.fromEntries(Object.entries({ Origin: origem, 'X-Cosmos-P0': '1', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...o.headers }).filter(([, v]) => v !== undefined))
    const req = request({ hostname: '127.0.0.1', port, path: `/cosmos/__p0/${o.rota ?? 'groq/estado'}`, method: o.metodo ?? 'GET', headers, agent: false }, res => {
      const b: Buffer[] = []; res.on('data', p => b.push(p)); res.on('error', reject)
      res.on('end', () => resolve({ status: res.statusCode!, texto: Buffer.concat(b).toString('utf8'), headers: res.headers }))
    }); req.on('error', reject); req.end(corpo)
  })
  try {
    const endereco = await api.iniciar(), token = api.emitirSessaoLocal().token
    ponte = criarPonteIntegracoes({ origem, portaApi: endereco.porta, token, groq: { chave: opcoes.chave ?? (() => CHAVE), buscar, prazoMs: opcoes.prazoMs } })
    const browser: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: origem, 'Sec-Fetch-Site': 'same-origin' } })
    await fn({ chamar, api, buscar, ponte, origem, cliente: criarClienteGroq(origem, browser) })
  } finally {
    ponte?.encerrar(); await api.encerrar()
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() })
  }
}

describe('Groq: ponta a ponta com API P0, ponte real e provedor mockado', () => {
  it('salvar não envia; testar usa ping fixo, usage real, sem chave no browser; desativar preserva consumo', async () => ambiente(async c => {
    expect((await c.cliente.carregar()).estado).toBe('sem-configuracao')
    expect((await c.cliente.salvar(config())).estado).toBe('local'); expect(c.buscar).not.toHaveBeenCalled()
    const s = await c.cliente.testar()
    expect(s).toMatchObject({ estado: 'conectado', consumo: { pedidos: 1, prompt_tokens: 8, completion_tokens: 2, reservasConservadoras: 0, pendente: false } })
    expect(JSON.parse(c.buscar.mock.calls[0][1]!.body as string).messages).toEqual([{ role: 'user', content: 'ping: ok' }])
    expect(JSON.stringify(s)).not.toContain(CHAVE)
    expect((await c.cliente.salvar(config(2, false)))).toMatchObject({ estado: 'local', testadoEmMs: null, consumo: { pedidos: 1 } })
    expect((await c.chamar({ rota: 'groq/testar', metodo: 'POST' })).status).toBe(409)
    expect(c.buscar).toHaveBeenCalledTimes(1)
  }))
  it('same-origin, Host, marcador, cookie, autorização e duplicatas barrados antes de rede', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    for (const headers of [
      { Origin: 'https://evil.invalid' }, { Host: 'localhost:80' }, { Origin: [c.origem, c.origem] }, { 'X-Cosmos-P0': ['1', '1'] },
      { Authorization: 'Bearer NAO-ACEITAR' }, { Cookie: 'NAO-ACEITAR' }, { 'X-Forwarded-Host': 'evil.invalid' },
      { 'X-Cosmos-P0': undefined }, { Origin: undefined }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Content-Type': ['application/json', 'application/json'] },
    ]) expect((await c.chamar({ rota: 'groq', metodo: 'POST', corpo: pedido(), headers })).status).toBeGreaterThanOrEqual(400)
    expect(c.buscar).not.toHaveBeenCalled()
  }))
  it('somente paths/métodos fechados, sem CORS nem diagnóstico público', async () => ambiente(async c => {
    for (const rota of ['groq?url=https://evil.invalid', 'groq/diagnostico', 'groq/https://evil.invalid', 'diagnostico']) expect((await c.chamar({ rota })).status).toBe(404)
    expect((await c.chamar({ rota: 'groq', metodo: 'OPTIONS' })).status).toBe(405)
    const r = await c.chamar()
    expect(r.headers['access-control-allow-origin']).toBeUndefined(); expect(r.headers['cache-control']).toBe('no-store')
  }))
  it('recusa tamanho, compressão, corpo inválido e modelo diferente da revisão salva', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    for (const corpo of ['x'.repeat(16385), '{', { ...pedido(), extra: 'x' }, { ...pedido(), model: MODELOS_GROQ[1] }]) expect((await c.chamar({ rota: 'groq', metodo: 'POST', corpo })).status).toBeGreaterThanOrEqual(400)
    expect((await c.chamar({ rota: 'groq', metodo: 'POST', corpo: pedido(), headers: { 'Content-Encoding': 'gzip' } })).status).toBe(415)
    expect(c.buscar).not.toHaveBeenCalled()
  }))
  it('sem chave: salvar permanece local, teste falha sem rede e estado explica ausência', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    expect((await c.chamar({ rota: 'groq/testar', metodo: 'POST' })).status).toBe(503)
    expect((await c.cliente.carregar()).estado).toBe('sem-configuracao-chave'); expect(c.buscar).not.toHaveBeenCalled()
  }, { chave: () => undefined }))
  it('replay de configuração é idempotente; revisão divergente é 409 e não testa', async () => ambiente(async c => {
    await c.cliente.salvar(config()); await c.cliente.salvar(config())
    expect((await c.chamar({ rota: 'groq/configuracao', metodo: 'PUT', corpo: config(3) })).status).toBe(409)
    expect(c.buscar).not.toHaveBeenCalled()
  }))
  it('expiração/revogação da capacidade P0 barra também Groq', async () => ambiente(async c => {
    await c.cliente.salvar(config()); c.api.revogarSessaoLocal()
    expect((await c.chamar({ rota: 'groq/testar', metodo: 'POST' })).status).toBe(401); expect(c.buscar).not.toHaveBeenCalled()
  }))
  it('cancelar por desativação aborta requisição pendente e não publica conectado atrasado', async () => {
    let sinal: AbortSignal | undefined, iniciou!: () => void
    const inicio = new Promise<void>(r => { iniciou = r })
    const buscar = vi.fn<typeof fetch>().mockImplementation(async (_, init) => { sinal = init?.signal as AbortSignal; iniciou(); return new Promise(() => {}) })
    await ambiente(async c => {
      await c.cliente.salvar(config())
      const teste = c.chamar({ rota: 'groq/testar', metodo: 'POST' }); await inicio
      expect((await c.cliente.salvar(config(2, false))).estado).toBe('local')
      expect((await teste).status).toBeGreaterThanOrEqual(400); expect(sinal?.aborted).toBe(true)
      expect((await c.cliente.carregar())).toMatchObject({ estado: 'local', testadoEmMs: null, consumo: { pedidos: 1 } })
    }, { buscar })
  })
  it('20s só reduzidos em teste: timeout não repete nem libera reserva sem usage', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    expect((await c.chamar({ rota: 'groq/testar', metodo: 'POST' })).status).toBe(504)
    const s = await c.cliente.carregar()
    expect(s.estado).toBe('indisponivel'); expect(s.consumo.reservasConservadoras).toBeGreaterThan(0)
    expect(s.consumo.prompt_tokens).toBe(0); expect(c.buscar).toHaveBeenCalledTimes(1)
  }, { buscar: vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {})), prazoMs: 15 }))
  it('limite TPM conserva reserva e recusa 8192 sem chamar API', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    expect((await c.chamar({ rota: 'groq', metodo: 'POST', corpo: { ...pedido(), max_tokens: 8192 } })).status).toBe(429)
    expect((await c.cliente.carregar())).toMatchObject({ estado: 'sem-quota', testadoEmMs: null })
    expect(c.buscar).not.toHaveBeenCalled()
  }))
  it('429 mantém reserva conservadora e invalida teste anterior, sem inventar usage', async () => {
    const buscar = vi.fn<typeof fetch>().mockResolvedValueOnce(resposta()).mockResolvedValueOnce(new Response(CHAVE, { status: 429 }))
    await ambiente(async c => {
      await c.cliente.salvar(config()); await c.cliente.testar()
      expect((await c.chamar({ rota: 'groq/testar', metodo: 'POST' })).status).toBe(429)
      expect(await c.cliente.carregar()).toMatchObject({ estado: 'sem-quota', testadoEmMs: null, consumo: { pedidos: 2, prompt_tokens: 8, completion_tokens: 2 } })
      expect((await c.cliente.carregar()).consumo.reservasConservadoras).toBeGreaterThan(0)
    }, { buscar })
  })
  it('revogação durante chamada aborta até a próxima conferência e nunca publica resultado', async () => {
    let iniciou!: () => void, sinal: AbortSignal | undefined
    const inicio = new Promise<void>(r => { iniciou = r })
    const buscar = vi.fn<typeof fetch>().mockImplementation(async (_, init) => { sinal = init?.signal as AbortSignal; iniciou(); return new Promise(() => {}) })
    await ambiente(async c => {
      await c.cliente.salvar(config())
      const r = c.chamar({ rota: 'groq/testar', metodo: 'POST' }); await inicio; c.api.revogarSessaoLocal()
      expect((await r).status).toBeGreaterThanOrEqual(400); expect(sinal?.aborted).toBe(true)
    }, { buscar })
  })
  it('concorrência real é uma execução, sem duplicar envio ou zerar quota ao editar', async () => {
    let iniciou!: () => void
    const inicio = new Promise<void>(r => { iniciou = r })
    const buscar = vi.fn<typeof fetch>().mockImplementation(async () => { iniciou(); return new Promise(() => {}) })
    await ambiente(async c => {
      await c.cliente.salvar(config())
      const r = c.chamar({ rota: 'groq/testar', metodo: 'POST' }); await inicio
      expect((await c.chamar({ rota: 'groq/testar', metodo: 'POST' })).status).toBe(429)
      await c.cliente.salvar(config(2, false)); await r
      expect((await c.cliente.carregar()).consumo.pedidos).toBe(1); expect(c.buscar).toHaveBeenCalledTimes(1)
    }, { buscar })
  })
  it('conclusão explícita reconstrói retorno e não inclui metadados/chaves/headers do provedor', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    const r = await c.chamar({ rota: 'groq', metodo: 'POST', corpo: pedido() })
    expect(r.status).toBe(200); expect(JSON.parse(r.texto)).toMatchObject({ conteudo: 'ok', usage: { total_tokens: 10 } })
    expect(r.texto).not.toContain(CHAVE); expect(r.headers['set-cookie']).toBeUndefined()
    expect(JSON.stringify(c.ponte.diagnosticoLocal())).not.toContain('teste publico')
  }))
})

describe('Groq: cliente sem capacidade/segredo e snapshot verificado', () => {
  it('origens públicas/localhost não fazem fetch', () => {
    const buscar = vi.fn()
    for (const origem of ['https://example.invalid', 'http://localhost:4175', 'file://']) expect(() => criarClienteGroq(origem, buscar)).toThrow()
    expect(buscar).not.toHaveBeenCalled()
  })
  it('snapshot com chave extra ou conectado sem teste é recusado', () => {
    const s = { formato: 'cosmos-groq-p1-v1', configuracao: config(), estado: 'local', testadoEmMs: null, consumo: { pedidos: 0, prompt_tokens: 0, completion_tokens: 0, reservasConservadoras: 0, pendente: false } }
    expect(() => validarSnapshotGroq(s)).not.toThrow()
    expect(() => validarSnapshotGroq({ ...s, token: CHAVE })).toThrow()
    expect(() => validarSnapshotGroq({ ...s, estado: 'conectado' })).toThrow()
  })
  it('cliente nunca recebe ou envia Authorization/storage e limita resposta', async () => {
    const buscar = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(131073), { headers: { 'Content-Type': 'application/json' } }))
    await expect(criarClienteGroq('http://127.0.0.1:4175', buscar).carregar()).rejects.toThrow('invalido')
    expect(buscar.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { 'X-Cosmos-P0': '1' } })
    expect(buscar.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization')
  })
})

it('revisão muda na conferência final: resultado antigo nunca conecta a nova configuração', async () => {
  let chamadas = 0, chegou!: () => void, liberar!: () => void
  const aguardando = new Promise<void>(r => { chegou = r }), liberado = new Promise<void>(r => { liberar = r })
  const controle = criarControleGroq({ chave: () => CHAVE, buscar: vi.fn<typeof fetch>().mockImplementation(async () => resposta()),
    sessaoValida: async () => { if (++chamadas === 5) { chegou(); await liberado }; return true } })
  const server = createServer((q, r) => { void controle.tratar(q, r, q.url!.slice(1)) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    await fetch(`${url}/groq/configuracao`, { method: 'PUT', body: JSON.stringify(config()) })
    const r = fetch(`${url}/groq/testar`, { method: 'POST' }); await aguardando
    await fetch(`${url}/groq/configuracao`, { method: 'PUT', body: JSON.stringify(config(2, false)) })
    liberar(); expect((await r).status).toBeGreaterThanOrEqual(400)
    const atual = await (await fetch(`${url}/groq/estado`)).json()
    expect(atual).toMatchObject({ estado: 'local', configuracao: { revisao: 2, habilitada: false }, testadoEmMs: null })
  } finally {
    liberar(); controle.encerrar()
    await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections() })
  }
})
