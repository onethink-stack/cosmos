import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'
import { lerJsonEstrito } from '../motor/registro'
import type { ConfiguracaoIntegracao, EstadoServico } from './contratos'
import { criarProvedorSimulado, type OpcoesProvedorSimulado } from './provedores-node'
import { criarExecutorSimulado, FalhaExecucao, type OpcoesExecucaoSimulada } from './execucao-node'
import { FalhaOrcamento } from './orcamento-node'
import { criarCatalogoFontes } from './fontes'
import { prepararContextoRag } from './contexto-rag'
import { FalhaRag } from './permissoes'
import { criarObservabilidadeP0, observarHttpP0 } from './observabilidade-node'
import { criarEstadoLocal, criarEstadoSemConfiguracao, validarConfiguracaoIntegracao, TETOS_P0 } from './politica'

export interface OpcoesApiIntegracoes {
  /** Configuração do processo confiável, nunca aceita no corpo de uma requisição. */
  origemPermitida: string
  ttlSessaoMs?: number
  prazoCorpoMs?: number
  maxBytesCorpo?: number
  maxConcorrencia?: number
  maxRequisicoesMinuto?: number
  simulacao?: OpcoesProvedorSimulado
  execucaoSimulada?: OpcoesExecucaoSimulada
  /** Fixtures fornecidas pelo processo confiável; sem leitura de arquivos ou URL. */
  fontesRag?: readonly unknown[]
}
export interface EnderecoApiIntegracoes { readonly host: '127.0.0.1'; readonly porta: number }
export interface SessaoIntegracoesLocal { readonly token: string; readonly validadeMs: number }

class FalhaHttp extends Error {
  constructor(readonly status: number, readonly codigo: string) { super(codigo) }
}
function limite(v: number, teto: number): number {
  if (!Number.isSafeInteger(v) || v < 1 || v > teto) throw new Error('Opção HTTP P0 inválida')
  return v
}
function origemLocal(valor: string): string {
  // IPv4 literal: esta versão não resolve localhost nem amplia o allowlist por DNS.
  if (typeof valor !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(valor)) throw new Error('Origem local P0 inválida')
  const u = new URL(valor)
  if (u.origin !== valor) throw new Error('Origem local P0 inválida')
  return valor
}
function unico(req: IncomingMessage, nome: string): string | undefined {
  let valor: string | undefined
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() !== nome) continue
    if (valor !== undefined) throw new FalhaHttp(400, 'cabecalho_duplicado')
    valor = req.rawHeaders[i + 1]
  }
  return valor
}
function lerCorpo(req: IncomingMessage, maximo: number, prazoMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = []
    let tamanho = 0, terminou = false
    const concluir = (erro?: FalhaHttp) => {
      if (terminou) return
      terminou = true
      clearTimeout(timer)
      req.off('data', data); req.off('end', end); req.off('aborted', aborted)
      // Mantém o listener de error até o request ser coletado: aborted pode ser
      // seguido de ECONNRESET, que não deve virar erro não tratado no processo.
      if (erro) { req.pause(); reject(erro); return }
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes))) }
      catch { reject(new FalhaHttp(400, 'utf8_invalido')) }
    }
    const data = (chunk: Buffer) => {
      tamanho += chunk.length
      if (tamanho > maximo) { concluir(new FalhaHttp(413, 'corpo_excedido')); return }
      partes.push(Buffer.from(chunk))
    }
    const end = () => concluir()
    const aborted = () => concluir(new FalhaHttp(400, 'corpo_interrompido'))
    // Prazo absoluto: enviar um byte por vez não renova a ocupação do serviço.
    const timer = setTimeout(() => concluir(new FalhaHttp(408, 'prazo_corpo_excedido')), prazoMs)
    req.on('data', data); req.once('end', end); req.once('aborted', aborted); req.once('error', aborted)
  })
}
function lerJsonLimitado(texto: string): unknown {
  let profundidade = 0, string = false, escape = false
  for (const ch of texto) {
    if (string) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') string = false
    } else if (ch === '"') string = true
    else if (ch === '{' || ch === '[') { if (++profundidade > 8) throw new FalhaHttp(413, 'profundidade_excedida') }
    else if (ch === '}' || ch === ']') profundidade--
  }
  try { return lerJsonEstrito(texto) }
  catch { throw new FalhaHttp(400, 'json_invalido') }
}

/** Backend independente, em memória, sem credenciais externas e sem saída de rede.
 * Nenhum listener ou arquivo é aberto ao importar. Não importa o servidor/ledger v2.
 * A autenticação é capacidade efêmera da instância, não identidade ou assinatura.
 * Pareamento da T6 é feito pela ponte server-only: não expor emitirSessaoLocal
 * como endpoint, token em URL, armazenamento web ou log.
 */
export function criarApiIntegracoes(opcoes: OpcoesApiIntegracoes) {
  const observabilidade = criarObservabilidadeP0()
  const execucoesObservadas = new WeakSet<Promise<unknown>>()
  const provedor = criarProvedorSimulado(opcoes.simulacao)
  // Valida opções confiáveis antes de abrir listener. Não inicia execução.
  const execucaoSimulada = Object.freeze({ ...opcoes.execucaoSimulada })
  criarExecutorSimulado(execucaoSimulada).encerrar()
  const catalogoRag = criarCatalogoFontes(opcoes.fontesRag)
  const origem = origemLocal(opcoes.origemPermitida)
  const ttl = limite(opcoes.ttlSessaoMs ?? 900000, 900000)
  const prazo = limite(opcoes.prazoCorpoMs ?? 5000, 10000)
  const maxBytes = limite(opcoes.maxBytesCorpo ?? TETOS_P0.maxBytesEntrada, TETOS_P0.maxBytesEntrada)
  const maxAtivas = limite(opcoes.maxConcorrencia ?? 2, 4)
  const maxMinuto = limite(opcoes.maxRequisicoesMinuto ?? 60, 120)
  let configuracao: Readonly<ConfiguracaoIntegracao> | null = null
  let geracaoConfiguracao = 0
  let estadoTestado: Readonly<EstadoServico> | null = null
  let testeAtivo: AbortController | null = null
  function invalidarTeste() { estadoTestado = null; testeAtivo?.abort() }
  const estadoAtual = () => configuracao ? estadoTestado ?? criarEstadoLocal(configuracao) : criarEstadoSemConfiguracao()
  let sessao: { digest: Buffer; expira: number; executor: ReturnType<typeof criarExecutorSimulado>; timer: ReturnType<typeof setTimeout> } | null = null
  let endereco: Readonly<EnderecoApiIntegracoes> | null = null
  let iniciando = false, encerrando = false, ativas = 0
  let janela = performance.now(), pedidos = 0
  const digest = (token: string) => createHash('sha256').update(token, 'ascii').digest()
  const revogarSessaoLocal = () => {
    invalidarTeste()
    if (sessao) {
      clearTimeout(sessao.timer); sessao.executor.encerrar(); sessao.digest.fill(0)
      observabilidade.registrar({ tipo: 'servico', canal: 'api', estado: 'sessao-revogada' })
    }
    sessao = null
  }
  function invalidarConfiguracao() { invalidarTeste(); sessao?.executor.cancelarTodos() }
  function emitirSessaoLocal(): Readonly<SessaoIntegracoesLocal> {
    if (!endereco || encerrando) throw new Error('Serviço local não iniciado')
    revogarSessaoLocal()
    const token = randomBytes(32).toString('hex')
    const timer = setTimeout(revogarSessaoLocal, ttl)
    timer.unref()
    sessao = { digest: digest(token), expira: performance.now() + ttl, executor: criarExecutorSimulado(execucaoSimulada), timer }
    observabilidade.registrar({ tipo: 'servico', canal: 'api', estado: 'sessao-emitida' })
    return Object.freeze({ token, validadeMs: ttl })
  }
  function autenticar(req: IncomingMessage) {
    const auth = unico(req, 'authorization')
    if (!auth || !/^Bearer [a-f0-9]{64}$/.test(auth) || !sessao) throw new FalhaHttp(401, 'sessao_invalida')
    if (performance.now() >= sessao.expira) { revogarSessaoLocal(); throw new FalhaHttp(401, 'sessao_invalida') }
    const recebido = digest(auth.slice(7))
    const valido = timingSafeEqual(recebido, sessao.digest)
    recebido.fill(0)
    if (!valido) throw new FalhaHttp(401, 'sessao_invalida')
  }
  function resposta(res: ServerResponse, status: number, body: unknown) {
    if (res.destroyed || res.writableEnded) return
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer', 'Connection': 'close',
    })
    res.end(JSON.stringify(body))
  }
  async function tratar(req: IncomingMessage, res: ServerResponse) {
    observarHttpP0(observabilidade, 'api', req.url, res)
    let admitida = false
    try {
      if (!endereco || req.socket.remoteAddress !== '127.0.0.1') throw new FalhaHttp(403, 'acesso_local_obrigatorio')
      if (unico(req, 'host') !== `127.0.0.1:${endereco.porta}`) throw new FalhaHttp(403, 'host_recusado')
      if (unico(req, 'origin') !== origem) throw new FalhaHttp(403, 'origem_recusada')
      if (req.rawHeaders.some((v, i) => i % 2 === 0 && (v.toLowerCase() === 'forwarded' || v.toLowerCase().startsWith('x-forwarded-')))) throw new FalhaHttp(400, 'proxy_nao_suportado')
      const site = unico(req, 'sec-fetch-site')
      if (site && !['same-origin', 'same-site'].includes(site)) throw new FalhaHttp(403, 'contexto_recusado')
      const agora = performance.now()
      if (agora - janela >= 60000) { janela = agora; pedidos = 0 }
      if (++pedidos > maxMinuto) throw new FalhaHttp(429, 'limite_http_excedido')
      autenticar(req)
      if (unico(req, 'expect')) throw new FalhaHttp(417, 'expect_nao_suportado')
      if (!['GET', 'PUT', 'DELETE', 'POST'].includes(req.method ?? '')) throw new FalhaHttp(405, 'metodo_recusado')
      const metodos: Record<string, readonly string[]> = {
        '/integracoes/p0/estado': ['GET'], '/integracoes/p0/configuracao': ['GET', 'PUT', 'DELETE'],
        '/integracoes/p0/testar': ['POST'], '/integracoes/p0/orcamento': ['GET'],
        '/integracoes/p0/executar': ['POST'], '/integracoes/p0/cancelar': ['POST'],
        '/integracoes/p0/contexto-rag': ['POST'],
      }
      const referenciaFonte = /^\/integracoes\/p0\/fontes\/([a-z][a-z0-9-]{0,47})\/([1-9][0-9]{0,15})\/([a-f0-9]{64})$/.exec(req.url ?? '')
      const permitidos = Object.hasOwn(metodos, req.url ?? '') ? metodos[req.url!] : referenciaFonte ? ['GET'] : null
      if (!permitidos) throw new FalhaHttp(404, 'rota_inexistente')
      if (!permitidos.includes(req.method!)) throw new FalhaHttp(405, 'metodo_recusado')
      if (ativas >= maxAtivas) throw new FalhaHttp(429, 'concorrencia_excedida')
      ativas++; admitida = true
      const tamanho = unico(req, 'content-length')
      const transferencia = unico(req, 'transfer-encoding')
      if (['/integracoes/p0/executar', '/integracoes/p0/cancelar', '/integracoes/p0/contexto-rag'].includes(req.url!)) {
        const tipo = unico(req, 'content-type')
        if (!tipo || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(tipo) || unico(req, 'content-encoding')) throw new FalhaHttp(415, 'tipo_corpo_recusado')
        if (tamanho !== undefined && (!/^\d+$/.test(tamanho) || !Number.isSafeInteger(Number(tamanho)) || Number(tamanho) > maxBytes)) throw new FalhaHttp(413, 'corpo_excedido')
        const geracao = geracaoConfiguracao
        const pedido = lerJsonLimitado(await lerCorpo(req, maxBytes, prazo))
        autenticar(req)
        const executor = sessao!.executor
        if (req.url === '/integracoes/p0/cancelar') {
          if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido) || Object.keys(pedido).length !== 1 || !Object.hasOwn(pedido, 'id')) throw new FalhaHttp(400, 'pedido_invalido')
          const id = (pedido as { id: unknown }).id
          if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new FalhaHttp(400, 'pedido_invalido')
          resposta(res, 200, { simulado: true, encontrado: executor.cancelar(id) }); return
        }
        if (geracao !== geracaoConfiguracao) throw new FalhaHttp(409, 'conflito_revisao')
        if (!configuracao) throw new FalhaHttp(409, 'sem_configuracao')
        if (req.url === '/integracoes/p0/contexto-rag') {
          const contexto = prepararContextoRag(configuracao, pedido, catalogoRag)
          observabilidade.registrar({ tipo: 'rag', estado: contexto.estado })
          resposta(res, 200, contexto); return
        }
        const resultado = executor.executar(configuracao, pedido)
        const observarExecucao = !execucoesObservadas.has(resultado)
        execucoesObservadas.add(resultado)
        // O pedido já foi validado pelo executor, sem executar getters.
        const id = (pedido as { id: string }).id
        const desconectou = () => { if (!res.writableEnded) executor.cancelar(id) }
        res.once('close', desconectou)
        try {
          const final = await resultado
          if (observarExecucao) observabilidade.registrar({ tipo: 'execucao', estado: final.estado,
            medicao: final.uso.medicao, reservado: final.uso.reservado, debitado: final.uso.debitado })
          autenticar(req)
          if (geracao !== geracaoConfiguracao) throw new FalhaHttp(409, 'execucao_obsoleta')
          resposta(res, 200, final)
        } finally { res.off('close', desconectou) }
        return
      }
      if (req.method !== 'PUT') {
        if (transferencia || (tamanho !== undefined && tamanho !== '0')) throw new FalhaHttp(400, 'corpo_nao_permitido')
        if (referenciaFonte) {
          if (!configuracao) throw new FalhaHttp(409, 'sem_configuracao')
          const versao = Number(referenciaFonte[2])
          const fonte = Number.isSafeInteger(versao) ? catalogoRag.obter(configuracao, referenciaFonte[1], versao, referenciaFonte[3]) : null
          if (!fonte) throw new FalhaHttp(404, 'fonte_inexistente')
          resposta(res, 200, { simulado: true, fonte }); return
        }
        if (req.method === 'POST') {
          if (!configuracao) throw new FalhaHttp(409, 'sem_configuracao')
          if (!configuracao.habilitada) throw new FalhaHttp(409, 'configuracao_desativada')
          if (testeAtivo) throw new FalhaHttp(429, 'teste_em_andamento')
          const geracao = geracaoConfiguracao, controle = new AbortController()
          testeAtivo = controle
          const desconectou = () => { if (!res.writableEnded) controle.abort() }
          res.once('close', desconectou)
          try {
            const resultado = await provedor.testar(configuracao, controle.signal)
            if ('teste' in resultado && resultado.teste) observabilidade.registrar({ tipo: 'teste', estado: resultado.teste.resultado })
            autenticar(req)
            if (geracao !== geracaoConfiguracao || controle.signal.aborted) throw new FalhaHttp(409, 'teste_obsoleto')
            estadoTestado = resultado
            resposta(res, 200, resultado)
          } catch (erro) {
            autenticar(req)
            if (controle.signal.aborted || geracao !== geracaoConfiguracao) throw new FalhaHttp(409, 'teste_obsoleto')
            throw erro
          } finally { res.off('close', desconectou); if (testeAtivo === controle) testeAtivo = null }
          return
        }
        if (req.method === 'DELETE') { invalidarConfiguracao(); configuracao = null; geracaoConfiguracao++; resposta(res, 200, criarEstadoSemConfiguracao()); return }
        if (req.url === '/integracoes/p0/orcamento') {
          resposta(res, 200, { simulado: true, criterio: 'bytes-utf8-simulados', ...sessao!.executor.estado() }); return
        }
        resposta(res, 200, req.url === '/integracoes/p0/estado'
          ? estadoAtual()
          : { configuracao })
        return
      }
      const tipo = unico(req, 'content-type')
      if (!tipo || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(tipo) || unico(req, 'content-encoding')) throw new FalhaHttp(415, 'tipo_corpo_recusado')
      if (tamanho !== undefined && (!/^\d+$/.test(tamanho) || !Number.isSafeInteger(Number(tamanho)) || Number(tamanho) > maxBytes)) throw new FalhaHttp(413, 'corpo_excedido')
      const geracaoInicial = geracaoConfiguracao
      const valor = lerJsonLimitado(await lerCorpo(req, maxBytes, prazo))
      let nova: Readonly<ConfiguracaoIntegracao>
      try { nova = validarConfiguracaoIntegracao(valor) }
      catch { throw new FalhaHttp(400, 'configuracao_invalida') }
      // O corpo pode demorar: sessão expirada/rotacionada durante a leitura não grava.
      autenticar(req)
      if (geracaoConfiguracao !== geracaoInicial && JSON.stringify(nova) !== JSON.stringify(configuracao)) throw new FalhaHttp(409, 'conflito_revisao')
      if (!configuracao && nova.revisao !== 1) throw new FalhaHttp(409, 'revisao_inicial_invalida')
      if (configuracao) {
        if (JSON.stringify(nova) === JSON.stringify(configuracao)) { resposta(res, 200, estadoAtual()); return }
        if (nova.id !== configuracao.id || nova.revisao !== configuracao.revisao + 1) throw new FalhaHttp(409, 'conflito_revisao')
      }
      invalidarConfiguracao()
      configuracao = nova
      geracaoConfiguracao++
      resposta(res, 200, criarEstadoLocal(configuracao))
    } catch (erro) {
      const e = erro instanceof FalhaHttp ? erro : erro instanceof FalhaOrcamento ? new FalhaHttp(429, erro.codigo)
        : erro instanceof FalhaExecucao ? new FalhaHttp(erro.codigo === 'pedido_invalido' ? 400 : 409, erro.codigo)
        : erro instanceof FalhaRag ? new FalhaHttp(erro.codigo === 'rag_desativado' ? 409 : 400, erro.codigo) : new FalhaHttp(500, 'falha_interna')
      if (e.status === 405) res.setHeader('Allow', ['/integracoes/p0/estado', '/integracoes/p0/orcamento'].includes(req.url ?? '') || req.url?.startsWith('/integracoes/p0/fontes/') ? 'GET' : ['/integracoes/p0/testar', '/integracoes/p0/executar', '/integracoes/p0/cancelar', '/integracoes/p0/contexto-rag'].includes(req.url ?? '') ? 'POST' : 'GET, PUT, DELETE')
      resposta(res, e.status, { erro: e.codigo })
    } finally { if (admitida) ativas-- }
  }
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => { void tratar(req, res) })
  server.requestTimeout = 10000; server.headersTimeout = 5000; server.keepAliveTimeout = 1; server.maxConnections = 8
  server.on('checkContinue', (req, res) => { void tratar(req, res) })
  server.on('checkExpectation', (req, res) => { void tratar(req, res) })
  server.on('upgrade', (_req, socket) => { socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n') })
  server.on('connect', (_req, socket) => { socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n') })
  server.on('clientError', (_erro, socket) => {
    observabilidade.registrar({ tipo: 'servico', canal: 'api', estado: 'protocolo-recusado' })
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
  })
  return Object.freeze({
    emitirSessaoLocal, revogarSessaoLocal, diagnosticoLocal: observabilidade.consultar,
    async iniciar(porta = 0): Promise<Readonly<EnderecoApiIntegracoes>> {
      if (!Number.isSafeInteger(porta) || porta < 0 || porta > 65535) throw new Error('Porta local inválida')
      if (endereco || iniciando || encerrando) throw new Error('Ciclo de vida do serviço inválido')
      iniciando = true
      try {
        await new Promise<void>((resolve, reject) => {
          const erro = (e: Error) => { server.off('listening', pronto); reject(e) }
          const pronto = () => { server.off('error', erro); resolve() }
          server.once('error', erro); server.once('listening', pronto); server.listen(porta, '127.0.0.1')
        })
        const a = server.address()
        if (!a || typeof a === 'string' || a.address !== '127.0.0.1') throw new Error('Bind local inválido')
        endereco = Object.freeze({ host: '127.0.0.1', porta: a.port })
        observabilidade.registrar({ tipo: 'servico', canal: 'api', estado: 'iniciado' })
        return endereco
      } finally { iniciando = false }
    },
    async encerrar(): Promise<void> {
      if (iniciando || encerrando) throw new Error('Ciclo de vida do serviço inválido')
      encerrando = true
      revogarSessaoLocal(); endereco = null; configuracao = null; geracaoConfiguracao++
      try {
        if (server.listening) await new Promise<void>((resolve, reject) => {
          server.close(e => e ? reject(e) : resolve()); server.closeAllConnections()
        })
      } finally {
        encerrando = false
        observabilidade.registrar({ tipo: 'servico', canal: 'api', estado: 'encerrado' })
      }
    },
  })
}
