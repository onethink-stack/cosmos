import { createServer, request } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { criarApiIntegracoes } from '../src/integracoes/api-node'
import { criarPonteIntegracoes } from '../src/integracoes/ponte-node'
import { criarClienteIntegracoes } from '../src/interfaces/integracoes-cliente'
import { FORMATO_CONFIGURACAO_INTEGRACAO } from '../src/integracoes/contratos'
import { TETOS_P0 } from '../src/integracoes/politica'

const config = (revisao = 1) => ({ formato: FORMATO_CONFIGURACAO_INTEGRACAO, id: 'ui-local', revisao,
  provedor: 'simulado', destino: 'sem-rede', modelo: 'resposta-simulada-v1', habilitada: true,
  limites: { ...TETOS_P0 }, permissoes: { envioRemoto: false, fontesPrivadas: false } })
async function ambiente(fn: (c: { origem: string; porta: number; api: ReturnType<typeof criarApiIntegracoes>; ponte: ReturnType<typeof criarPonteIntegracoes>; token: string; cliente: ReturnType<typeof criarClienteIntegracoes> }) => Promise<void>) {
  let ponte: ReturnType<typeof criarPonteIntegracoes> | undefined
  const server = createServer((req, res) => ponte!.tratar(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const porta = (server.address() as { port: number }).port, origem = `http://127.0.0.1:${porta}`
  const api = criarApiIntegracoes({ origemPermitida: origem })
  try {
    const endereco = await api.iniciar(), token = api.emitirSessaoLocal().token
    ponte = criarPonteIntegracoes({ origem, portaApi: endereco.porta, token })
    // Node não produz os headers que o navegador fornece automaticamente.
    const buscar: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...init?.headers, Origin: origem, 'Sec-Fetch-Site': 'same-origin' } })
    await fn({ origem, porta, api, ponte, token, cliente: criarClienteIntegracoes(origem, buscar) })
  } finally {
    ponte?.encerrar(); await api.encerrar()
    await new Promise<void>((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeAllConnections() })
  }
}
function requisicao(porta: number, origem: string, p: { caminho?: string; metodo?: string; headers?: Record<string, string | string[] | undefined>; corpo?: string } = {}): Promise<{ status: number; texto: string; cors: string | string[] | undefined }> {
  const headers = Object.fromEntries(Object.entries({ Origin: origem, 'X-Cosmos-P0': '1', ...p.headers }).filter(([, v]) => v !== undefined)) as Record<string, string | string[]>
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: porta, path: p.caminho ?? '/cosmos/__p0/estado', method: p.metodo ?? 'GET', headers, agent: false }, res => {
      const partes: Buffer[] = []; res.on('data', b => partes.push(Buffer.from(b)))
      res.on('error', reject); res.on('end', () => resolve({ status: res.statusCode!, texto: Buffer.concat(partes).toString('utf8'), cors: res.headers['access-control-allow-origin'] }))
    })
    req.on('error', reject); req.end(p.corpo)
  })
}

describe('P0 UI/transporte e ponte com API real simulada', () => {
  it('diagnóstico da ponte fica local, sem token, cookie, paths ou endpoint público', async () => ambiente(async c => {
    await requisicao(c.porta, c.origem)
    await requisicao(c.porta, c.origem, { headers: { Cookie: 'COOKIE-SIGILOSO-FICTICIO' } })
    await requisicao(c.porta, c.origem, { caminho: '/cosmos/__p0/estado?token=QUERY-SIGILOSA' })
    expect((await requisicao(c.porta, c.origem, { caminho: '/cosmos/__p0/diagnostico' })).status).toBe(404)
    const d = c.ponte.diagnosticoLocal(), texto = JSON.stringify(d)
    expect(d.eventos.some(r => r.evento.tipo === 'http' && r.evento.canal === 'ponte' && r.evento.resultado === 'recusado')).toBe(true)
    for (const segredo of [c.token, 'COOKIE-SIGILOSO-FICTICIO', 'QUERY-SIGILOSA', '/cosmos/__p0']) expect(texto).not.toContain(segredo)
  }))
  it('salvar não conecta; testar é explícito; nova revisão e desativar invalidam teste', async () => ambiente(async ({ cliente }) => {
    const inicial = await cliente.carregar()
    expect(inicial.configuracao).toBeNull(); expect(inicial.servico.estado).toBe('sem-configuracao')
    const salvo = await cliente.salvar(config())
    expect(salvo.servico).toMatchObject({ estado: 'local', teste: null })
    const testado = await cliente.testar(salvo.configuracao!)
    expect(testado.servico).toMatchObject({ estado: 'conectado', teste: { simulado: true, configuracaoRevisao: 1 } })
    const editado = await cliente.salvar(config(2))
    expect(editado.servico).toMatchObject({ estado: 'local', teste: null })
    const desativado = await cliente.salvar({ ...config(3), habilitada: false })
    expect(desativado.configuracao!.habilitada).toBe(false)
    await expect(cliente.testar(desativado.configuracao!)).rejects.toThrow('invalido')
    expect(desativado.consumo).toMatchObject({ pedidos: 0, unidadesDebitas: 0 })
  }))
  it('não devolve a capacidade para o navegador e não abre CORS', async () => ambiente(async c => {
    const r = await requisicao(c.porta, c.origem)
    expect(r.status).toBe(200); expect(r.texto).not.toContain(c.token); expect(r.cors).toBeUndefined()
    expect((await requisicao(c.porta, c.origem, { headers: { Authorization: `Bearer ${c.token}` } })).status).toBe(400)
  }))
  it('recusa origem cruzada, Host diferente, cookie e cabeçalho não simples ausente', async () => ambiente(async c => {
    for (const headers of [
      { Origin: 'https://example.invalid' }, { Host: `localhost:${c.porta}` }, { Cookie: 'sessao=ficticia' },
      { 'X-Cosmos-P0': undefined }, { 'Sec-Fetch-Site': 'cross-site' }, { 'X-Forwarded-For': '127.0.0.1' },
    ]) expect((await requisicao(c.porta, c.origem, { headers })).status).toBeGreaterThanOrEqual(400)
  }))
  it('GET sem Origin só aceita Fetch Metadata e Referer exatos', async () => ambiente(async c => {
    expect((await requisicao(c.porta, c.origem, { headers: { Origin: undefined } })).status).toBe(403)
    expect((await requisicao(c.porta, c.origem, { headers: { Origin: undefined, 'Sec-Fetch-Site': 'same-origin', Referer: `${c.origem}/cosmos/` } })).status).toBe(200)
    expect((await requisicao(c.porta, c.origem, { headers: { Origin: undefined, 'Sec-Fetch-Site': 'same-origin', Referer: 'https://example.invalid/' } })).status).toBe(403)
  }))
  it('recusa cabeçalhos duplicados e não encaminha caminhos, queries ou destinos arbitrários', async () => ambiente(async c => {
    expect((await requisicao(c.porta, c.origem, { headers: { Origin: [c.origem, c.origem] } })).status).toBe(400)
    for (const caminho of ['/cosmos/__p0/estado?token=NAO-REFLETIR', '/cosmos/__p0/http://example.invalid', '/cosmos/__p0/../v2/elos', '/cosmos/__p0/sessao']) {
      const r = await requisicao(c.porta, c.origem, { caminho })
      expect(r.status).toBe(404); expect(r.texto).not.toContain('NAO-REFLETIR')
    }
    expect((await requisicao(c.porta, c.origem, { metodo: 'OPTIONS' })).status).toBe(405)
  }))
  it('recusa compressão, corpo excedido e corpo em GET', async () => ambiente(async c => {
    const caminho = '/cosmos/__p0/configuracao'
    expect((await requisicao(c.porta, c.origem, { caminho, metodo: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, corpo: '{}' })).status).toBe(415)
    expect((await requisicao(c.porta, c.origem, { caminho, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, corpo: 'x'.repeat(16385) })).status).toBe(413)
    expect((await requisicao(c.porta, c.origem, { headers: { 'Content-Length': '2' }, corpo: '{}' })).status).toBe(400)
  }))
  it('sessão revogada não é renovada por endpoint ou pela ponte', async () => ambiente(async c => {
    await c.cliente.salvar(config())
    c.api.revogarSessaoLocal()
    await expect(c.cliente.carregar()).rejects.toThrow('sessao-expirada')
    expect((await requisicao(c.porta, c.origem, { caminho: '/cosmos/__p0/sessao' })).status).toBe(404)
  }))
  it('ponte encerrada recusa acesso e opções não admitem destino público', async () => ambiente(async c => {
    c.ponte.encerrar()
    expect((await requisicao(c.porta, c.origem)).status).toBe(503)
    expect(() => criarPonteIntegracoes({ origem: 'https://example.invalid', portaApi: 80, token: c.token })).toThrow()
  }))
})

describe('Cliente UI: respostas e falhas são sanitizadas', () => {
  it('origem pública/localhost/file não dispara fetch', () => {
    const buscar = vi.fn()
    for (const origem of ['https://onethink-stack.github.io', 'http://localhost:4175', 'file://', 'http://127.0.0.1:4175/']) expect(() => criarClienteIntegracoes(origem, buscar)).toThrow('sem-servico')
    expect(buscar).not.toHaveBeenCalled()
  })
  it('HTML do Vite não vira sucesso e erros não expõem corpo ou mensagem', async () => {
    for (const r of [new Response('<html>SEGREDO-FICTICIO</html>', { headers: { 'Content-Type': 'text/html' } }), new Response('SEGREDO-FICTICIO', { status: 503 })]) {
      const c = criarClienteIntegracoes('http://127.0.0.1:4175', vi.fn().mockResolvedValue(r))
      await expect(c.carregar()).rejects.toThrow('sem-servico')
    }
    const c = criarClienteIntegracoes('http://127.0.0.1:4175', vi.fn().mockRejectedValue(new Error('SEGREDO-FICTICIO')))
    await expect(c.carregar()).rejects.toThrow('indisponivel')
  })
  it('usa credenciais omitidas, redirect error e apenas header de pareamento não secreto', async () => {
    const buscar = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
    const c = criarClienteIntegracoes('http://127.0.0.1:4175', buscar)
    await expect(c.carregar()).rejects.toThrow('sessao-expirada')
    expect(buscar.mock.calls[0][0]).toBe('http://127.0.0.1:4175/cosmos/__p0/configuracao')
    expect(buscar.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { 'X-Cosmos-P0': '1' } })
    expect(buscar.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
  it('limita resposta e valida snapshot antes de declará-lo pronto', async () => {
    const grande = new Response('x'.repeat(32769), { headers: { 'Content-Type': 'application/json' } })
    await expect(criarClienteIntegracoes('http://127.0.0.1:4175', vi.fn().mockResolvedValue(grande)).carregar()).rejects.toThrow('invalido')
    const falso = new Response('{"configuracao":null,"token":"NAO-REFLETIR"}', { headers: { 'Content-Type': 'application/json' } })
    await expect(criarClienteIntegracoes('http://127.0.0.1:4175', vi.fn().mockResolvedValue(falso)).carregar()).rejects.toThrow('invalido')
  })
})
