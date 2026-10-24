/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react'
import { MODELOS_GROQ, type ModeloGroq, type SnapshotGroq } from '../integracoes/groq-contratos'
import { criarClienteGroq } from './groq-cliente'
import { Button } from './ui/button'

export function GroqIntegracao() {
  const cliente = useMemo(() => { try { return criarClienteGroq(window.location.origin) } catch { return null } }, [])
  const [snapshot, setSnapshot] = useState<SnapshotGroq | null>(null)
  const [modelo, setModelo] = useState<ModeloGroq>('openai/gpt-oss-120b')
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('')
  const vivo = useRef(false), ativo = useRef<AbortController | null>(null)
  async function operar(acao: (s: AbortSignal) => Promise<SnapshotGroq>) {
    if (ativo.current) return
    const c = new AbortController(); ativo.current = c; setOcupado(true); setErro('')
    try {
      const s = await acao(c.signal)
      if (vivo.current && !c.signal.aborted) { setSnapshot(s); if (s.configuracao) setModelo(s.configuracao.modelo) }
    } catch {
      if (vivo.current && !c.signal.aborted) {
        setSnapshot(null)
        setErro('A ação não foi confirmada. Confira a sessão, GROQ_API_KEY no processo Node e a quota da conta. Recarregue o estado; nenhuma tentativa é repetida automaticamente.')
        // Só consulta estado: não repete ping nem geração após falha. Um estado
        // antigo conectado nunca é mantido como fallback de erro de transporte.
        try { const atual = await cliente?.carregar(c.signal); if (atual && vivo.current && !c.signal.aborted) setSnapshot(atual) } catch { /* permanece indisponível */ }
      }
    } finally { if (ativo.current === c) { ativo.current = null; if (vivo.current) setOcupado(false) } }
  }
  useEffect(() => {
    vivo.current = true
    if (cliente) void operar(s => cliente.carregar(s))
    return () => { vivo.current = false; ativo.current?.abort(); ativo.current = null }
  }, [cliente])
  const c = snapshot?.configuracao, u = snapshot?.consumo
  const rotulos = { 'sem-configuracao': 'Sem configuração', local: 'Local · ainda não testado', conectado: 'Conectado · Groq real', invalido: 'Inválido', indisponivel: 'Indisponível', 'sem-quota': 'Sem quota', 'sem-configuracao-chave': 'Chave ausente no processo' }
  return <section className="integracoes-card"><header><div><h2>Groq · P1</h2><p>Provedor real · envio externo somente ao testar ou executar</p></div></header>
    <p>Inicie explicitamente com <code>node scripts/integracoes-p0.mjs --groq</code>. A variável GROQ_API_KEY deve existir apenas no processo Node confiável. Não cole chaves nesta tela.</p>
    <div className="integracoes-status" role="status"><strong>{ocupado ? 'Processando…' : snapshot ? c && !c.habilitada ? 'Desativado' : rotulos[snapshot.estado] : 'P1 indisponível nesta instância'}</strong></div>
    {erro && <p role="alert" className="integracoes-alert">{erro}</p>}
    <div className="integracoes-fields"><label>Provedor<select disabled value="groq"><option>groq</option></select></label><label>Modelo<select aria-label="Modelo Groq" disabled={ocupado} value={modelo} onChange={e => setModelo(e.target.value as ModeloGroq)}>{MODELOS_GROQ.map(m => <option key={m} value={m}>{m}</option>)}</select></label></div>
    <div className="integracoes-actions">
      <Button variant="outline" disabled={!cliente || ocupado} onClick={() => { if (cliente) void operar(s => cliente.carregar(s)) }}>Atualizar Groq</Button>
      <Button disabled={!cliente || !snapshot || ocupado} onClick={() => { if (cliente) void operar(s => cliente.salvar({ revisao: (c?.revisao ?? 0) + 1, modelo, habilitada: true }, s)) }}>Salvar Groq</Button>
      <Button variant="outline" disabled={!c?.habilitada || modelo !== c.modelo || ocupado} onClick={() => { if (cliente) void operar(s => cliente.testar(s)) }}>Testar Groq · envia “ping: ok”</Button>
      <Button variant="ghost" disabled={!c?.habilitada || ocupado} onClick={() => { if (cliente && c) void operar(s => cliente.salvar({ ...c, revisao: c.revisao + 1, habilitada: false }, s)) }}>Desativar Groq</Button>
    </div>
    <p>Salvar mantém a revisão somente em memória, sem consultar o provedor. Testar envia dados à Groq e consome quota. O teste não comprova disponibilidade contínua nem verdade da resposta.</p>
    <p>{snapshot?.testadoEmMs ? `Último teste: ${new Date(snapshot.testadoEmMs).toLocaleString('pt-BR')}.` : 'Nenhum teste confirmado nesta revisão.'}</p>
    <dl className="integracoes-details"><div><dt>Pedidos admitidos nesta sessão</dt><dd>{u?.pedidos ?? '—'}</dd></div><div><dt>Tokens de entrada · usage real</dt><dd>{u?.prompt_tokens ?? '—'}</dd></div><div><dt>Tokens de saída · usage real</dt><dd>{u?.completion_tokens ?? '—'}</dd></div><div><dt>Reservas sem medição confirmada</dt><dd>{u?.reservasConservadoras ?? '—'}</dd></div></dl>
    <p>Referência Free: 30 pedidos/min · 1.000/dia · 8.000 tokens/min · 200.000/dia. <a href="https://console.groq.com/docs/rate-limits" target="_blank" rel="noreferrer">Limites oficiais</a> variam por conta/modelo; o app não identifica seu plano nem garante custo zero. Configure uma chave de conta Free. Contadores locais voláteis não incluem outros apps; reiniciar não restaura a quota do provedor. Limites locais conservadores podem recusar pedidos de 8.192 tokens.</p>
    <p>Sem fontes privadas, carteira, seed, ferramentas, RAG remoto ou conexão automática à conversa. Nenhum conteúdo de teste é exibido ou gravado.</p>
  </section>
}
