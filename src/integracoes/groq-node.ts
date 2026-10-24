import type { IncomingMessage, ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'
import { criarAdaptadorGroq, ErroGroq, validarPedidoGroq } from './provedores/groq'
import { LIMITES_GROQ, validarConfigGroq, type ConfiguracaoGroq, type EstadoGroq, type SnapshotGroq } from './groq-contratos'

/** Estado P1 separado do P0. Só memória, quotas locais conservadoras e UMA
 * chamada de cada vez. Não é medidor global da conta nem promessa de gratuidade.
 * Não lê .env; resolver é fornecido apenas pelo processo confiável.
 */
export function criarControleGroq(opcoes: { chave: () => string | undefined; sessaoValida: () => Promise<boolean>; buscar?: typeof fetch; prazoMs?: number }) {
  const executar = criarAdaptadorGroq(opcoes)
  let config: ConfiguracaoGroq | null = null, estado: EstadoGroq = 'sem-configuracao', testadoEmMs: number | null = null
  let encerrado = false, pendente: AbortController | null = null, pedidos = 0, prompt = 0, completion = 0, reservas = 0
  const minutos: { em: number; reservado: number }[] = []
  let inicioDia = performance.now(), pedidosDia = 0, debitoDia = 0
  let admissaoInicio = performance.now(), admissoes = 0, ativos = 0
  const controles = new Set<AbortController>()
  function snapshot(): SnapshotGroq {
    return { formato: 'cosmos-groq-p1-v1', configuracao: config ? { ...config } : null, estado, testadoEmMs,
      consumo: { pedidos, prompt_tokens: prompt, completion_tokens: completion, reservasConservadoras: reservas, pendente: !!pendente } }
  }
  function cancelar() { pendente?.abort(); testadoEmMs = null }
  function encerrar() {
    if (encerrado) return
    encerrado = true; cancelar(); config = null; estado = 'sem-configuracao'
    for (const c of controles) c.abort()
  }
  const expira = setTimeout(encerrar, 15 * 60 * 1000); expira.unref()
  const enviar = (res: ServerResponse, status: number, v: unknown) => {
    if (res.destroyed || res.writableEnded) return
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close' })
    res.end(JSON.stringify(v))
  }
  async function tratar(req: IncomingMessage, res: ServerResponse, rota: string) {
    const c = new AbortController(); controles.add(c)
    const close = () => { if (!res.writableFinished) c.abort() }
    res.once('close', close)
    let entrou = false
    try {
      const sessaoInicial = await opcoes.sessaoValida()
      if (encerrado || !sessaoInicial) { encerrar(); throw new ErroGroq(401) }
      if (c.signal.aborted) throw new ErroGroq(503)
      const baseConfiguracao = config
      const agora = performance.now()
      if (agora - admissaoInicio >= 60000) { admissaoInicio = agora; admissoes = 0 }
      if (ativos >= 2 || admissoes >= 60) throw new ErroGroq(429, 'sem-quota')
      ativos++; admissoes++; entrou = true
      let corpo: unknown
      if (req.method === 'PUT' || rota === 'groq') {
        // Prazo absoluto do upload, não apenas inatividade do socket.
        corpo = await new Promise((resolve, reject) => {
          const partes: Buffer[] = []; let bytes = 0
          const falhar = () => { limpar(); reject(new ErroGroq(408)) }
          const timer = setTimeout(falhar, 5000)
          const limpar = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', falhar); req.off('aborted', falhar); c.signal.removeEventListener('abort', falhar) }
          const data = (b: Buffer) => {
            bytes += b.length
            if (bytes > 16384) { limpar(); req.pause(); reject(new ErroGroq(413, 'invalido')); return }
            partes.push(b)
          }
          const end = () => {
            limpar()
            try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)))) }
            catch { reject(new ErroGroq(400, 'invalido')) }
          }
          req.on('data', data); req.once('end', end); req.once('error', falhar); req.once('aborted', falhar); c.signal.addEventListener('abort', falhar, { once: true })
        })
      }
      const sessaoAposCorpo = await opcoes.sessaoValida()
      if (encerrado || c.signal.aborted || !sessaoAposCorpo) throw new ErroGroq(401)
      if (req.method === 'GET') { enviar(res, 200, snapshot()); return }
      if (rota === 'groq/configuracao') {
        let novo: ConfiguracaoGroq
        try { novo = validarConfigGroq(corpo) } catch { throw new ErroGroq(400, 'invalido') }
        if (config && JSON.stringify(novo) === JSON.stringify(config)) { enviar(res, 200, snapshot()); return }
        if (config !== baseConfiguracao) throw new ErroGroq(409, 'invalido')
        if (novo.revisao !== (config?.revisao ?? 0) + 1) throw new ErroGroq(409, 'invalido')
        cancelar(); config = novo; estado = 'local'; enviar(res, 200, snapshot()); return
      }
      const atual = config
      if (!atual?.habilitada) throw new ErroGroq(409, 'invalido')
      if (pendente) throw new ErroGroq(429, 'sem-quota')
      const teste = rota === 'groq/testar'
      const p = validarPedidoGroq(teste ? { model: atual.modelo, messages: [{ role: 'user', content: 'ping: ok' }], max_tokens: 256, temperature: 0 } : corpo)
      if (p.model !== atual.modelo) throw new ErroGroq(409, 'invalido')
      // Só confere presença, sem devolver valor ou chamar provedor ao salvar.
      let presente = false
      try { presente = !!opcoes.chave() } catch { /* erro sanitizado abaixo */ }
      if (!presente) { estado = 'sem-configuracao-chave'; testadoEmMs = null; throw new ErroGroq(503, 'sem-configuracao-chave') }
      const n = performance.now()
      if (n - inicioDia >= 86400000) { inicioDia = n; pedidosDia = 0; debitoDia = 0 }
      while (minutos.length && n - minutos[0].em >= 60000) minutos.shift()
      // Entrada por bytes + margem por mensagem é reserva, NÃO tokenizer real.
      const reserva = Buffer.byteLength(JSON.stringify(p.messages)) + p.messages.length * 64 + 256 + p.max_tokens
      if (pedidosDia >= LIMITES_GROQ.rpd || minutos.length >= LIMITES_GROQ.rpm || debitoDia + reserva > LIMITES_GROQ.tpd
          || minutos.reduce((s, m) => s + m.reservado, 0) + reserva > LIMITES_GROQ.tpm) {
        estado = 'sem-quota'; testadoEmMs = null; throw new ErroGroq(429, 'sem-quota')
      }
      pendente = c; testadoEmMs = null; estado = 'local'
      const medicao = { em: n, reservado: reserva }; minutos.push(medicao)
      pedidos++; pedidosDia++; debitoDia += reserva; reservas += reserva
      let conferindo = false
      const monitor = setInterval(() => {
        if (conferindo) return
        conferindo = true
        void opcoes.sessaoValida().then(valida => { if (!valida) c.abort() }, () => c.abort()).finally(() => { conferindo = false })
      }, 1000)
      try {
        const r = await executar(p, c.signal)
        // Reconciliação real mesmo se revisão/sessão mudou após envio: o custo já ocorreu.
        prompt += r.usage.prompt_tokens; completion += r.usage.completion_tokens
        reservas -= reserva; debitoDia += r.usage.total_tokens - reserva; medicao.reservado = r.usage.total_tokens
        const sessaoFinal = await opcoes.sessaoValida()
        // Conferir geração/cancelamento DEPOIS do await: outra gravação pode
        // acontecer durante a própria validação da capacidade.
        if (encerrado || c.signal.aborted || config !== atual || !sessaoFinal) throw new ErroGroq(409)
        if (teste) { estado = 'conectado'; testadoEmMs = Date.now() }
        if (pendente === c) pendente = null
        enviar(res, 200, teste ? snapshot() : { ...r, formato: 'cosmos-groq-resposta-p1-v1' })
      } catch (e) {
        const erro = e instanceof ErroGroq ? e : new ErroGroq(503)
        if (config === atual && !encerrado) { estado = erro.codigo === 'sem-configuracao-chave' ? 'sem-configuracao-chave' : erro.codigo === 'sem-quota' ? 'sem-quota' : erro.codigo === 'invalido' ? 'invalido' : 'indisponivel'; testadoEmMs = null }
        throw erro
      } finally { clearInterval(monitor); if (pendente === c) pendente = null }
    } catch (e) {
      const erro = e instanceof ErroGroq ? e : new ErroGroq(503)
      enviar(res, erro.status, { erro: erro.codigo })
    } finally {
      controles.delete(c); res.off('close', close); if (entrou) ativos--
    }
  }
  return Object.freeze({ tratar, encerrar() { clearTimeout(expira); encerrar() } })
}
