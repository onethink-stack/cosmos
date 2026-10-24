import { describe, expect, it } from 'vitest'
import { request, type ClientRequest, type IncomingHttpHeaders } from 'node:http'
import { setTimeout as esperar } from 'node:timers/promises'
import { criarApiIntegracoes, type OpcoesApiIntegracoes } from '../src/integracoes/api-node'
import { iniciarServidorIntegracoes } from '../src/integracoes/servidor-node'
import { FORMATO_CONFIGURACAO_INTEGRACAO } from '../src/integracoes/contratos'
import { TETOS_P0 } from '../src/integracoes/politica'
import { createHash } from 'node:crypto'

const ORIGEM = 'http://127.0.0.1:4174'
const ESTADO = '/integracoes/p0/estado', CONFIG = '/integracoes/p0/configuracao'
const config = (revisao = 1) => ({ formato: FORMATO_CONFIGURACAO_INTEGRACAO, id: 'teste-local', revisao, provedor: 'simulado', destino: 'sem-rede', modelo: 'resposta-simulada-v1', habilitada: true, limites: { ...TETOS_P0 }, permissoes: { envioRemoto: false, fontesPrivadas: false } })
type Api = ReturnType<typeof criarApiIntegracoes>
interface Contexto { api: Api; porta: number; token: string }
interface Resposta { status: number; headers: IncomingHttpHeaders; texto: string }
interface Pedido {
  caminho?: string; metodo?: string; headers?: Record<string, string | string[] | undefined>
  corpo?: string | Buffer; escrever?: (req: ClientRequest) => void
}
function enviar(c: Contexto, p: Pedido = {}): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const headers = Object.fromEntries(Object.entries({ Origin: ORIGEM, Authorization: `Bearer ${c.token}`, ...p.headers }).filter(([, valor]) => valor !== undefined)) as Record<string, string | string[]>
    const req = request({ hostname: '127.0.0.1', port: c.porta, method: p.metodo ?? 'GET', path: p.caminho ?? ESTADO, headers, agent: false }, res => {
      const chunks: Buffer[] = []
      res.on('data', b => chunks.push(Buffer.from(b)))
      res.on('error', reject)
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, texto: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    if (p.escrever) p.escrever(req)
    else req.end(p.corpo)
  })
}
async function comApi(fn: (c: Contexto) => Promise<void>, opcoes: Partial<OpcoesApiIntegracoes> = {}) {
  const api = criarApiIntegracoes({ origemPermitida: ORIGEM, ...opcoes })
  try {
    const endereco = await api.iniciar()
    expect(endereco.host).toBe('127.0.0.1')
    await fn({ api, porta: endereco.porta, token: api.emitirSessaoLocal().token })
  } finally { await api.encerrar() }
}
const put = (c: Contexto, valor: unknown) => enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, corpo: JSON.stringify(valor) })

describe('P0 tarefa 7: diagnóstico restrito ao processo confiável', () => {
  it('registra resultado e uso uma vez por execução, sem conteúdo, ids, token ou hash', async () => comApi(async c => {
    await put(c, { ...config(), id: 'registro-sigiloso' })
    const pedido = { ...execPedido('pedido-sigiloso'), entrada: 'CONTEUDO-SIGILOSO-FICTICIO' }
    await postJson(c, EXECUTAR, pedido); await postJson(c, EXECUTAR, pedido)
    await postJson(c, CONTEXTO_RAG, { pergunta: 'PERGUNTA-SIGILOSA-FICTICIA' })
    await enviar(c, { caminho: `/integracoes/p0/fontes/fonte-sigilosa/1/${'a'.repeat(64)}` })
    await enviar(c, { caminho: '/integracoes/p0/estado?token=QUERY-SIGILOSA' })
    const d = c.api.diagnosticoLocal(), texto = JSON.stringify(d)
    expect(d.eventos.filter(r => r.evento.tipo === 'execucao')).toHaveLength(1)
    expect(d.eventos.some(r => r.evento.tipo === 'rag' && r.evento.estado === 'inconclusivo')).toBe(true)
    expect(d.eventos.some(r => r.evento.tipo === 'http' && r.evento.operacao === 'fonte' && r.evento.status === 404)).toBe(true)
    for (const segredo of [c.token, 'registro-sigiloso', 'pedido-sigiloso', pedido.entrada, 'PERGUNTA-SIGILOSA-FICTICIA', 'fonte-sigilosa', 'a'.repeat(64), 'QUERY-SIGILOSA']) expect(texto).not.toContain(segredo)
    expect((await enviar(c, { caminho: '/integracoes/p0/diagnostico' })).status).toBe(404)
  }))
  it('recusa de autenticação é diagnóstica, sem refletir headers ou exceções', async () => comApi(async c => {
    await enviar(c, { headers: { Authorization: 'Bearer CREDENCIAL-FICTICIA' } })
    const d = c.api.diagnosticoLocal()
    expect(d.eventos.some(r => r.evento.tipo === 'http' && r.evento.status === 401 && r.evento.resultado === 'recusado')).toBe(true)
    expect(JSON.stringify(d)).not.toContain('CREDENCIAL-FICTICIA')
    c.api.revogarSessaoLocal()
    expect(c.api.diagnosticoLocal().eventos.some(r => r.evento.tipo === 'servico' && r.evento.estado === 'sessao-revogada')).toBe(true)
  }))
  it('HTTP 200 não oculta timeout simulado nem duplica medição no replay', async () => comApi(async c => {
    await put(c, { ...config(), limites: { ...TETOS_P0, prazoMs: 10 } })
    await postJson(c, EXECUTAR, execPedido()); await postJson(c, EXECUTAR, execPedido())
    const execucoes = c.api.diagnosticoLocal().eventos.filter(r => r.evento.tipo === 'execucao')
    expect(execucoes).toHaveLength(1)
    expect(execucoes[0].evento).toMatchObject({ estado: 'prazo-excedido', medicao: 'limite-conservador', reservado: 23, debitado: 23 })
  }, { execucaoSimulada: { atrasoMs: 100 } }))
})

const CONTEXTO_RAG = '/integracoes/p0/contexto-rag'
const fonteRag = (conteudo = 'energia conservação', id = 'energia', versao = 1) => ({
  id, versao, visibilidade: 'publica', estado: 'ativa', titulo: 'Fixture RAG', conteudo,
  hashSha256: createHash('sha256').update(conteudo, 'utf8').digest('hex'),
})
describe('P0 tarefa 5: contexto RAG e citações sob fronteira local', () => {
  it('catálogo vazio se abstém e não chama executor nem debita tokens', async () => comApi(async c => {
    expect((await postJson(c, CONTEXTO_RAG, { pergunta: 'energia' })).status).toBe(409)
    await put(c, config())
    const r = await postJson(c, CONTEXTO_RAG, { pergunta: 'energia' })
    expect(r.status).toBe(200)
    expect(JSON.parse(r.texto)).toMatchObject({ estado: 'inconclusivo', motivo: 'sem-fonte-suficiente', documentos: [], simulado: true })
    expect(await consultarOrcamento(c)).toMatchObject({ pedidos: 0, unidadesDebitas: 0 })
  }))
  it('citação abre conteúdo e hash exatos; não expõe conteúdo privado', async () => comApi(async c => {
    await put(c, config())
    const r = await postJson(c, CONTEXTO_RAG, { pergunta: 'energia' }), contexto = JSON.parse(r.texto)
    expect(contexto.documentos).toHaveLength(1)
    const d = contexto.documentos[0], aberta = await enviar(c, { caminho: d.href })
    expect(aberta.status).toBe(200)
    const f = JSON.parse(aberta.texto).fonte
    expect(f.conteudo.slice(d.inicio, d.fim)).toBe(d.trecho)
    expect(createHash('sha256').update(f.conteudo, 'utf8').digest('hex')).toBe(d.hashSha256)
    expect(r.texto + aberta.texto).not.toContain('PRIVADO-NAO-REFLETIR')
    expect(r.texto + aberta.texto).not.toContain(c.token)
    expect((await enviar(c, { caminho: d.href, headers: { Authorization: undefined } })).status).toBe(401)
    expect((await enviar(c, { caminho: d.href, headers: { Origin: 'http://example.invalid' } })).status).toBe(403)
  }, { fontesRag: [fonteRag(), { ...fonteRag('PRIVADO-NAO-REFLETIR energia', 'sigiloso'), visibilidade: 'privada' }] }))
  it('fonte privada, ausente, hash incorreto e versão antiga retornam mesmo 404', async () => comApi(async c => {
    await put(c, config())
    const antiga = fonteRag(), privada = fonteRag('SEGREDO', 'sigiloso')
    const referencias = [
      `/integracoes/p0/fontes/${antiga.id}/1/${antiga.hashSha256}`,
      `/integracoes/p0/fontes/sigiloso/1/${privada.hashSha256}`,
      `/integracoes/p0/fontes/ausente/1/${antiga.hashSha256}`,
      `/integracoes/p0/fontes/energia/2/${'0'.repeat(64)}`,
    ]
    const respostas = await Promise.all(referencias.map(caminho => enviar(c, { caminho })))
    expect(respostas.every(r => r.status === 404)).toBe(true)
    expect(new Set(respostas.map(r => r.texto)).size).toBe(1)
    expect((await enviar(c, { caminho: referencias[0] + '?token=segredo' })).status).toBe(404)
  }, { fontesRag: [fonteRag(), fonteRag('energia atual', 'energia', 2), { ...fonteRag('SEGREDO', 'sigiloso'), visibilidade: 'privada' }] }))
  it('recusa permissões/URLs do cliente, tipos e métodos sem refletir valores', async () => comApi(async c => {
    await put(c, config())
    const r = await postJson(c, CONTEXTO_RAG, { pergunta: 'energia', endpoint: 'http://example.invalid/NAO-REFLETIR', fontesPrivadas: true })
    expect(r.status).toBe(400); expect(r.texto).not.toContain('NAO-REFLETIR')
    expect((await enviar(c, { caminho: CONTEXTO_RAG })).headers.allow).toBe('POST')
    expect((await enviar(c, { caminho: CONTEXTO_RAG, metodo: 'POST', headers: { 'Content-Type': 'text/plain' }, corpo: 'energia' })).status).toBe(415)
    expect((await enviar(c, { caminho: CONTEXTO_RAG, metodo: 'POST', headers: { 'Content-Type': 'application/json' }, corpo: '{"pergunta":"energia","pergunta":"outro"}' })).status).toBe(400)
    expect((await postJson(c, CONTEXTO_RAG, { pergunta: 'x'.repeat(2049) })).status).toBe(400)
    expect((await enviar(c, { caminho: CONTEXTO_RAG, metodo: 'POST', headers: { Authorization: undefined } })).status).toBe(401)
  }))
  it('configuração desativada impede contexto e abertura de fontes', async () => comApi(async c => {
    await put(c, { ...config(), habilitada: false })
    expect((await postJson(c, CONTEXTO_RAG, { pergunta: 'energia' })).status).toBe(409)
    const f = fonteRag()
    expect((await enviar(c, { caminho: `/integracoes/p0/fontes/${f.id}/1/${f.hashSha256}` })).status).toBe(409)
  }, { fontesRag: [fonteRag()] }))
  it('mudança de revisão durante corpo impede contexto obsoleto', async () => comApi(async c => {
    await put(c, config())
    let pendente!: ClientRequest
    const r = enviar(c, { caminho: CONTEXTO_RAG, metodo: 'POST', headers: { 'Content-Type': 'application/json' }, escrever: req => { pendente = req; req.write('{') } })
    await esperar(40)
    await put(c, config(2))
    pendente.end('"pergunta":"energia"}')
    expect((await r).status).toBe(409)
  }, { fontesRag: [fonteRag()] }))
})

describe('P0 tarefa 2: fronteira HTTP local independente', () => {
  it('construção não inicia listener nem emite sessão', async () => {
    const api = criarApiIntegracoes({ origemPermitida: ORIGEM })
    expect(() => api.emitirSessaoLocal()).toThrow()
    await api.encerrar()
  })
  it('valida origem e limites antes de iniciar', () => {
    for (const origemPermitida of ['*', 'null', 'https://example.invalid', 'http://localhost:4174', ORIGEM + '/', 'http://127.0.0.1:99999']) expect(() => criarApiIntegracoes({ origemPermitida })).toThrow()
    for (const n of [0, -1, .5, NaN, Infinity, 4294967295]) {
      expect(() => criarApiIntegracoes({ origemPermitida: ORIGEM, ttlSessaoMs: n })).toThrow()
      expect(() => criarApiIntegracoes({ origemPermitida: ORIGEM, prazoCorpoMs: n })).toThrow()
    }
  })
  it('estado autenticado não inclui token, credencial ou CORS aberto', async () => comApi(async c => {
    const r = await enviar(c)
    expect(r.status).toBe(200)
    expect(JSON.parse(r.texto).estado).toBe('sem-configuracao')
    expect(r.texto).not.toContain(c.token)
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
    expect(r.headers['cache-control']).toBe('no-store')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
  }))
  it('recusa sessão ausente, incorreta e token em query string', async () => comApi(async c => {
    expect((await enviar(c, { headers: { Authorization: undefined } })).status).toBe(401)
    expect((await enviar(c, { headers: { Authorization: `Bearer ${'0'.repeat(64)}` } })).status).toBe(401)
    const r = await enviar(c, { caminho: `${ESTADO}?token=${c.token}`, headers: { Authorization: undefined } })
    expect(r.status).toBe(401); expect(r.texto).not.toContain(c.token)
  }))
  it('recusa Host adulterado ou alias localhost', async () => comApi(async c => {
    for (const Host of ['example.invalid', `localhost:${c.porta}`, '127.0.0.1:1']) expect((await enviar(c, { headers: { Host } })).status).toBe(403)
  }))
  it('recusa Origin ausente, null, outro host ou porta', async () => comApi(async c => {
    for (const Origin of [undefined, 'null', 'https://example.invalid', 'http://127.0.0.1:4175', 'http://localhost:4174']) expect((await enviar(c, { headers: { Origin } })).status).toBe(403)
  }))
  it('recusa Origin e Authorization duplicados', async () => comApi(async c => {
    expect((await enviar(c, { headers: { Origin: [ORIGEM, ORIGEM] } })).status).toBe(400)
    expect((await enviar(c, { headers: { Authorization: [`Bearer ${c.token}`, `Bearer ${c.token}`] } })).status).toBe(400)
  }))
  it('recusa proxy e contexto cross-site', async () => comApi(async c => {
    expect((await enviar(c, { headers: { Forwarded: 'for=127.0.0.1' } })).status).toBe(400)
    expect((await enviar(c, { headers: { 'X-Forwarded-Host': 'x' } })).status).toBe(400)
    expect((await enviar(c, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
  }))
  it('não expõe bootstrap, proxy ou métodos adicionais', async () => comApi(async c => {
    for (const caminho of ['/integracoes/p0/sessao', '/v2/elos', '/integracoes/p0/estado?url=http://example.invalid']) expect((await enviar(c, { caminho })).status).toBe(404)
    const r = await enviar(c, { metodo: 'OPTIONS' })
    expect(r.status).toBe(405); expect(r.headers.allow).toBe('GET')
  }))
  it('salva apenas em memória e nunca declara conexão', async () => comApi(async c => {
    const r = await put(c, config())
    expect(r.status).toBe(200); expect(JSON.parse(r.texto).estado).toBe('local'); expect(JSON.parse(r.texto).teste).toBeNull()
    const obtida = await enviar(c, { caminho: CONFIG })
    expect(JSON.parse(obtida.texto).configuracao).toEqual(config())
    expect(JSON.parse((await enviar(c)).texto).estado).toBe('local')
  }))
  it('repetição é estável e conflito de revisão não sobrescreve', async () => comApi(async c => {
    expect((await put(c, config(2))).status).toBe(409)
    expect((await put(c, config())).status).toBe(200)
    expect((await put(c, config())).status).toBe(200)
    expect((await put(c, { ...config(), habilitada: false })).status).toBe(409)
    expect((await put(c, config(3))).status).toBe(409)
    expect((await put(c, config(2))).status).toBe(200)
  }))
  it('DELETE volta a sem configuração', async () => comApi(async c => {
    await put(c, config())
    const r = await enviar(c, { caminho: CONFIG, metodo: 'DELETE' })
    expect(r.status).toBe(200); expect(JSON.parse(r.texto).estado).toBe('sem-configuracao')
    expect(JSON.parse((await enviar(c, { caminho: CONFIG })).texto).configuracao).toBeNull()
  }))
  it('recusa tipo, compressão, UTF-8 inválido e corpo em GET', async () => comApi(async c => {
    expect((await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'text/plain' }, corpo: '{}' })).status).toBe(415)
    expect((await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, corpo: '{}' })).status).toBe(415)
    expect((await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, corpo: Buffer.from([255]) })).status).toBe(400)
    expect((await enviar(c, { headers: { 'Content-Length': '2' }, corpo: '{}' })).status).toBe(400)
  }))
  it('recusa JSON duplicado, inseguro, segredo e URL sem refletir conteúdo', async () => comApi(async c => {
    const entradas = [JSON.stringify(config()).replace('"id":"teste-local"', '"id":"teste-local","id":"outro"'), '{"n":9007199254740993}', JSON.stringify({ ...config(), apiKey: 'SEGREDO-FICTICIO' }), JSON.stringify({ ...config(), endpoint: 'http://example.invalid/SEGREDO-FICTICIO' })]
    for (const corpo of entradas) {
      const r = await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, corpo })
      expect(r.status).toBe(400); expect(r.texto).not.toContain('SEGREDO-FICTICIO'); expect(r.texto).not.toContain('9007199254740993')
    }
  }))
  it('limita profundidade antes de recursão no parser', async () => comApi(async c => {
    const r = await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, corpo: '['.repeat(100) + '0' + ']'.repeat(100) })
    expect(r.status).toBe(413)
  }))
  it('limita tamanho declarado e chunked', async () => comApi(async c => {
    expect((await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': '16385' } })).status).toBe(413)
    expect((await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, escrever: req => { req.write(' '.repeat(9000)); req.end(' '.repeat(9000)) } })).status).toBe(413)
  }))
  it('limita pedidos por janela HTTP', async () => comApi(async c => {
    expect((await enviar(c)).status).toBe(200); expect((await enviar(c)).status).toBe(200); expect((await enviar(c)).status).toBe(429)
  }, { maxRequisicoesMinuto: 2 }))
  it('expiração e revogação invalidam sessão', async () => {
    await comApi(async c => { await esperar(40); expect((await enviar(c)).status).toBe(401) }, { ttlSessaoMs: 10 })
    await comApi(async c => { c.api.revogarSessaoLocal(); expect((await enviar(c)).status).toBe(401) })
  })
  it('rotação da sessão invalida a anterior', async () => comApi(async c => {
    const nova = c.api.emitirSessaoLocal().token
    expect(nova).not.toBe(c.token); expect((await enviar(c)).status).toBe(401)
    expect((await enviar({ ...c, token: nova })).status).toBe(200)
  }))
  it('prazo de corpo é absoluto e libera capacidade após recusa', async () => comApi(async c => {
    const r = await enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, escrever: req => { req.write('{') } })
    expect(r.status).toBe(408); expect((await enviar(c)).status).toBe(200)
  }, { prazoCorpoMs: 60, maxConcorrencia: 1 }))
  it('limita concorrência e recusa gravação após rotação durante leitura', async () => comApi(async c => {
    let pendente!: ClientRequest
    const resultado = enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, escrever: req => { pendente = req; req.write('{') } })
    await esperar(40)
    expect((await enviar(c)).status).toBe(429)
    const nova = c.api.emitirSessaoLocal().token
    pendente.end(JSON.stringify(config()).slice(1))
    expect((await resultado).status).toBe(401)
    expect(JSON.parse((await enviar({ ...c, token: nova })).texto).estado).toBe('sem-configuracao')
  }, { maxConcorrencia: 1 }))
  it('DELETE durante leitura impede recriação por PUT antigo', async () => comApi(async c => {
    let pendente!: ClientRequest
    const resultado = enviar(c, { caminho: CONFIG, metodo: 'PUT', headers: { 'Content-Type': 'application/json' }, escrever: req => { pendente = req; req.write('{') } })
    await esperar(40)
    expect((await enviar(c, { caminho: CONFIG, metodo: 'DELETE' })).status).toBe(200)
    pendente.end(JSON.stringify(config()).slice(1))
    expect((await resultado).status).toBe(409)
    expect(JSON.parse((await enviar(c)).texto).estado).toBe('sem-configuracao')
  }))
  it('duas gravações concorrentes divergentes não sobrescrevem a mesma revisão', async () => comApi(async c => {
    const resultados = await Promise.all([put(c, config()), put(c, { ...config(), habilitada: false })])
    expect(resultados.map(r => r.status).sort()).toEqual([200, 409])
    const salva = JSON.parse((await enviar(c, { caminho: CONFIG })).texto).configuracao
    expect(salva.revisao).toBe(1)
    expect(typeof salva.habilitada).toBe('boolean')
  }))
  it('encerramento descarta configuração e sessão antes de reiniciar a instância', async () => comApi(async c => {
    await put(c, config())
    await c.api.encerrar()
    const novoEndereco = await c.api.iniciar()
    const novo = { ...c, porta: novoEndereco.porta, token: c.api.emitirSessaoLocal().token }
    expect((await enviar({ ...novo, token: c.token })).status).toBe(401)
    expect(JSON.parse((await enviar(novo)).texto).estado).toBe('sem-configuracao')
  }))
  it('entrypoint explícito usa loopback e encerramento revoga capacidade', async () => {
    const servico = await iniciarServidorIntegracoes({ origemPermitida: ORIGEM })
    try {
      expect(servico.endereco.host).toBe('127.0.0.1'); expect(servico.sessao.token).toMatch(/^[a-f0-9]{64}$/)
      expect((await enviar({ api: {} as Api, porta: servico.endereco.porta, token: servico.sessao.token })).status).toBe(200)
    } finally { await servico.encerrar() }
    expect(() => servico.emitirSessaoLocal()).toThrow()
  })
})

const EXECUTAR = '/integracoes/p0/executar', ORCAMENTO = '/integracoes/p0/orcamento', CANCELAR = '/integracoes/p0/cancelar'
const execPedido = (id = 'p1') => ({ id, entrada: 'abc', maxTokensSaida: 20 })
const postJson = (c: Contexto, caminho: string, valor: unknown) => enviar(c, { caminho, metodo: 'POST', headers: { 'Content-Type': 'application/json' }, corpo: JSON.stringify(valor) })
const consultarOrcamento = async (c: Contexto) => JSON.parse((await enviar(c, { caminho: ORCAMENTO })).texto)
describe('P0 tarefa 4: orçamento e execução pela fronteira autenticada', () => {
  it('salvar/testar conexão não executa conteúdo; execução e replay debitam uma vez', async () => comApi(async c => {
    expect((await enviar(c, { caminho: EXECUTAR })).status).toBe(405)
    expect((await postJson(c, EXECUTAR, execPedido())).status).toBe(409)
    await put(c, config()); await testar(c)
    expect((await consultarOrcamento(c)).pedidos).toBe(0)
    const r = await postJson(c, EXECUTAR, execPedido())
    expect(r.status).toBe(200)
    expect(JSON.parse(r.texto)).toMatchObject({ estado: 'concluida', simulado: true, uso: { debitado: 18 } })
    expect((await postJson(c, EXECUTAR, execPedido())).texto).toBe(r.texto)
    expect(await consultarOrcamento(c)).toMatchObject({ pedidos: 1, ativos: 0, unidadesReservadas: 0, unidadesDebitas: 18 })
    const conflito = await postJson(c, EXECUTAR, { ...execPedido(), entrada: 'NAO-REFLETIR' })
    expect(conflito.status).toBe(409); expect(conflito.texto).not.toContain('NAO-REFLETIR')
  }))
  it('duplicatas concorrentes compartilham resultado; outro id respeita concorrência', async () => comApi(async c => {
    await put(c, config())
    const a = postJson(c, EXECUTAR, execPedido()), b = postJson(c, EXECUTAR, execPedido())
    await esperar(40)
    expect(await consultarOrcamento(c)).toMatchObject({ pedidos: 1, ativos: 1, unidadesReservadas: 23 })
    expect((await postJson(c, EXECUTAR, execPedido('p2'))).status).toBe(429)
    const [ra, rb] = await Promise.all([a, b])
    expect(ra.status).toBe(200); expect(rb.texto).toBe(ra.texto)
    expect((await consultarOrcamento(c)).pedidos).toBe(1)
  }, { maxConcorrencia: 4, execucaoSimulada: { atrasoMs: 300 } }))
  it('cancelar reconcilia, não reexecuta em replay e não reflete token', async () => comApi(async c => {
    await put(c, config())
    const pendente = postJson(c, EXECUTAR, execPedido())
    await esperar(40)
    const r = await postJson(c, CANCELAR, { id: 'p1' })
    expect(r.status).toBe(200); expect(r.texto).not.toContain(c.token)
    const final = await pendente
    expect(JSON.parse(final.texto)).toMatchObject({ estado: 'cancelada', uso: { debitado: 23, medicao: 'limite-conservador' } })
    expect((await postJson(c, EXECUTAR, execPedido())).texto).toBe(final.texto)
    expect(await consultarOrcamento(c)).toMatchObject({ pedidos: 1, ativos: 0, unidadesReservadas: 0, unidadesDebitas: 23 })
  }, { execucaoSimulada: { atrasoMs: 300 } }))
  it('nova revisão e DELETE não zeram orçamento de sessão', async () => comApi(async c => {
    await put(c, config())
    expect((await postJson(c, EXECUTAR, execPedido())).status).toBe(200)
    const nova = { ...config(2), limites: { ...TETOS_P0, maxTokensSaida: 10, maxTokensSessao: 20 } }
    await put(c, nova)
    expect((await postJson(c, EXECUTAR, { ...execPedido('p2'), maxTokensSaida: 10 })).status).toBe(429)
    await enviar(c, { caminho: CONFIG, metodo: 'DELETE' })
    expect((await consultarOrcamento(c)).unidadesDebitas).toBe(18)
    await put(c, { ...nova, revisao: 1 })
    expect((await postJson(c, EXECUTAR, { ...execPedido('p3'), maxTokensSaida: 10 })).status).toBe(429)
  }))
  it('DELETE durante execução cancela e recusa publicação obsoleta', async () => comApi(async c => {
    await put(c, config())
    const pendente = postJson(c, EXECUTAR, execPedido())
    await esperar(40)
    await enviar(c, { caminho: CONFIG, metodo: 'DELETE' })
    expect((await pendente).status).toBe(409)
    expect(await consultarOrcamento(c)).toMatchObject({ ativos: 0, unidadesReservadas: 0, unidadesDebitas: 23 })
  }, { execucaoSimulada: { atrasoMs: 300 } }))
  it('rotação cancela execução antiga; orçamento novo só nasce por função confiável', async () => comApi(async c => {
    await put(c, config())
    const pendente = postJson(c, EXECUTAR, execPedido())
    await esperar(40)
    const token = c.api.emitirSessaoLocal().token
    expect((await pendente).status).toBe(401)
    expect((await enviar(c, { caminho: ORCAMENTO })).status).toBe(401)
    expect(await consultarOrcamento({ ...c, token })).toMatchObject({ pedidos: 0, ativos: 0, unidadesDebitas: 0 })
  }, { execucaoSimulada: { atrasoMs: 300 } }))
  it('expiração interrompe execução pendente sem esperar atraso do adaptador', async () => comApi(async c => {
    expect((await put(c, config())).status).toBe(200)
    const pendente = postJson(c, EXECUTAR, execPedido())
    await esperar(40)
    expect((await consultarOrcamento(c)).ativos).toBe(1)
    expect((await pendente).status).toBe(401)
  }, { ttlSessaoMs: 300, execucaoSimulada: { atrasoMs: 600 } }))
  it('timeout de execução é explícito e libera concorrência', async () => comApi(async c => {
    await put(c, { ...config(), limites: { ...TETOS_P0, prazoMs: 10 } })
    expect(JSON.parse((await postJson(c, EXECUTAR, execPedido())).texto).estado).toBe('prazo-excedido')
    expect(await consultarOrcamento(c)).toMatchObject({ ativos: 0, unidadesReservadas: 0, unidadesDebitas: 23 })
  }, { execucaoSimulada: { atrasoMs: 100 } }))
  it('desconexão da execução reconcilia e libera capacidade sem sucesso tardio', async () => comApi(async c => {
    await put(c, config())
    let pedidoHttp!: ClientRequest
    const desconectado = new Promise<void>(resolve => {
      pedidoHttp = request({ hostname: '127.0.0.1', port: c.porta, path: EXECUTAR, method: 'POST', headers: { Origin: ORIGEM, Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, agent: false })
      pedidoHttp.on('error', () => resolve()); pedidoHttp.on('close', () => resolve())
      pedidoHttp.end(JSON.stringify(execPedido()))
    })
    await esperar(40)
    expect((await consultarOrcamento(c)).ativos).toBe(1)
    pedidoHttp.destroy(); await desconectado
    await esperar(40)
    expect(await consultarOrcamento(c)).toMatchObject({ ativos: 0, unidadesReservadas: 0, unidadesDebitas: 23 })
    expect(JSON.parse((await postJson(c, EXECUTAR, execPedido())).texto).estado).toBe('cancelada')
  }, { execucaoSimulada: { atrasoMs: 300 } }))
  it('recusa segredo, JSON duplicado, método, Origin e sessão sem executar', async () => comApi(async c => {
    await put(c, config())
    const r = await postJson(c, EXECUTAR, { ...execPedido(), seed: 'NAO-REFLETIR' })
    expect(r.status).toBe(400); expect(r.texto).not.toContain('NAO-REFLETIR')
    expect((await enviar(c, { caminho: EXECUTAR, metodo: 'POST', headers: { 'Content-Type': 'application/json' }, corpo: '{"id":"a","id":"b"}' })).status).toBe(400)
    expect((await postJson(c, CANCELAR, { id: 'p1', endpoint: 'http://example.invalid' })).status).toBe(400)
    expect((await enviar(c, { caminho: ORCAMENTO, headers: { Authorization: undefined } })).status).toBe(401)
    expect((await enviar(c, { caminho: ORCAMENTO, headers: { Origin: 'http://example.invalid' } })).status).toBe(403)
    expect((await enviar(c, { caminho: CANCELAR, metodo: 'DELETE' })).status).toBe(405)
    expect((await consultarOrcamento(c)).pedidos).toBe(0)
  }))
})

const testar = (c: Contexto) => enviar(c, { caminho: '/integracoes/p0/testar', metodo: 'POST' })
describe('P0 tarefa 3: teste explícito simulado sob a fronteira HTTP', () => {
  it('exige POST sem corpo, configuração habilitada e sessão', async () => comApi(async c => {
    expect((await testar(c)).status).toBe(409)
    expect((await enviar(c, { caminho: '/integracoes/p0/testar' })).status).toBe(405)
    await put(c, { ...config(), habilitada: false })
    expect((await testar(c)).status).toBe(409)
    expect((await enviar(c, { caminho: '/integracoes/p0/testar', metodo: 'POST', headers: { Authorization: undefined } })).status).toBe(401)
    expect((await enviar(c, { caminho: '/integracoes/p0/testar', metodo: 'POST', headers: { 'Content-Length': '2' }, corpo: '{}' })).status).toBe(400)
  }))
  for (const resultado of ['ok', 'invalido', 'indisponivel', 'sem-quota', 'falha'] as const) {
    it(`publica apenas diagnóstico simulado fechado: ${resultado}`, async () => comApi(async c => {
      await put(c, config())
      const r = await testar(c), estado = JSON.parse(r.texto)
      expect(r.status).toBe(200)
      expect(estado.estado).toBe(resultado === 'ok' ? 'conectado' : resultado === 'falha' ? 'indisponivel' : resultado)
      expect(estado.teste).toMatchObject({ simulado: true, escopo: 'adaptador-simulado', configuracaoId: 'teste-local', configuracaoRevisao: 1 })
      expect(estado.teste.executadoEmMs).toBeLessThanOrEqual(Date.now())
      expect(r.texto).not.toContain(c.token)
      expect(JSON.parse((await enviar(c)).texto)).toEqual(estado)
      expect(JSON.parse((await put(c, config())).texto)).toEqual(estado)
      await put(c, config(2))
      expect(JSON.parse((await enviar(c)).texto).teste).toBeNull()
    }, { simulacao: { resultado } }))
  }
  it('prazo produz indisponível e libera o próximo teste', async () => comApi(async c => {
    await put(c, { ...config(), limites: { ...TETOS_P0, prazoMs: 10 } })
    expect(JSON.parse((await testar(c)).texto).estado).toBe('indisponivel')
    expect((await testar(c)).status).toBe(200)
  }, { simulacao: { atrasoMs: 100 } }))
  it('DELETE cancela teste e impede ressurreição do estado', async () => comApi(async c => {
    await put(c, config())
    const pendente = testar(c)
    await esperar(40)
    expect((await testar(c)).status).toBe(429)
    await enviar(c, { caminho: CONFIG, metodo: 'DELETE' })
    expect((await pendente).status).toBe(409)
    expect(JSON.parse((await enviar(c)).texto).estado).toBe('sem-configuracao')
  }, { simulacao: { atrasoMs: 300 } }))
  it('revisão nova cancela resultado antigo', async () => comApi(async c => {
    await put(c, config())
    const pendente = testar(c)
    await esperar(40)
    await put(c, config(2))
    expect((await pendente).status).toBe(409)
    expect(JSON.parse((await enviar(c)).texto)).toMatchObject({ estado: 'local', configuracaoRevisao: 2, teste: null })
  }, { simulacao: { atrasoMs: 300 } }))
  it('rotação cancela teste sem conceder estado conectado à sessão nova', async () => comApi(async c => {
    await put(c, config())
    const pendente = testar(c)
    await esperar(40)
    const token = c.api.emitirSessaoLocal().token
    expect((await pendente).status).toBe(401)
    expect(JSON.parse((await enviar({ ...c, token })).texto).estado).toBe('local')
  }, { simulacao: { atrasoMs: 300 } }))
  it('não aceita cenário, URL, chave ou conteúdo na rota de teste', async () => comApi(async c => {
    await put(c, config())
    const r = await enviar(c, { caminho: '/integracoes/p0/testar', metodo: 'POST', headers: { 'Content-Length': '58' }, corpo: '{"endpoint":"http://example.invalid/NAO-REFLETIR"}' })
    expect(r.status).toBe(400); expect(r.texto).not.toContain('NAO-REFLETIR')
    expect(JSON.parse((await enviar(c)).texto).teste).toBeNull()
    expect((await enviar(c, { caminho: '/integracoes/p0/testar?resultado=ok', metodo: 'POST' })).status).toBe(404)
  }))
  it('desconexão cancela espera e libera a exclusão mútua', async () => comApi(async c => {
    await put(c, config())
    let pedido!: ClientRequest
    const desconectado = new Promise<void>(resolve => {
      pedido = request({ hostname: '127.0.0.1', port: c.porta, path: '/integracoes/p0/testar', method: 'POST', headers: { Origin: ORIGEM, Authorization: `Bearer ${c.token}` }, agent: false })
      pedido.on('error', () => resolve()); pedido.on('close', () => resolve()); pedido.end()
    })
    await esperar(40)
    expect((await testar(c)).status).toBe(429)
    pedido.destroy(); await desconectado
    await esperar(40)
    expect(JSON.parse((await enviar(c)).texto).teste).toBeNull()
    expect((await testar(c)).status).toBe(200)
  }, { simulacao: { atrasoMs: 300 } }))
})
