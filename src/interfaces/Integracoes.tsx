/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BarraJanela, Icone } from './Janela'
import { Button } from './ui/button'
import { FORMATO_CONFIGURACAO_INTEGRACAO, type LimitesIntegracao } from '../integracoes/contratos'
import { TETOS_P0, validarConfiguracaoIntegracao } from '../integracoes/politica'
import { criarClienteIntegracoes, ErroIntegracoes, type SnapshotIntegracoes } from './integracoes-cliente'
import './integracoes.css'
import { GroqIntegracao } from './GroqIntegracao'

const campos: readonly [keyof LimitesIntegracao, string][] = [
  ['maxTokensSessao', 'Unidades por sessão'], ['maxTokensSaida', 'Teto de saída por pedido'],
  ['maxRequisicoesSessao', 'Pedidos por sessão'], ['requisicoesPorMinuto', 'Pedidos por minuto'],
  ['prazoMs', 'Prazo por execução (ms)'], ['maxBytesEntrada', 'Entrada máxima (bytes)'],
]
const mensagens = {
  'sem-servico': 'Serviço local não iniciado. Use a instância dedicada abaixo; o site público não conecta ao aparelho.',
  'sessao-expirada': 'A sessão local expirou ou foi revogada. Reinicie a instância pelo comando local.',
  conflito: 'A configuração mudou em outra ação. Atualize o estado antes de tentar novamente.',
  limite: 'Limite local de requisições atingido. Aguarde antes de tentar novamente.',
  indisponivel: 'O serviço local não respondeu. Confira a instância e atualize o estado.',
  invalido: 'Não foi possível validar a configuração ou a resposta. Confira os limites e atualize o estado.',
}
export function Integracoes({ navigation }: { navigation: ReactNode }) {
  const [provedorSelecionado, setProvedorSelecionado] = useState('simulado')
  const cliente = useMemo(() => { try { return criarClienteIntegracoes(window.location.origin) } catch { return null } }, [])
  const [snapshot, setSnapshot] = useState<SnapshotIntegracoes | null>(null)
  const [limites, setLimites] = useState({ ...TETOS_P0 })
  const [ocupacao, setOcupacao] = useState(''), [aviso, setAviso] = useState(''), [erro, setErro] = useState('')
  const [alterado, setAlterado] = useState(false)
  const ativo = useRef<AbortController | null>(null), vivo = useRef(false)
  async function operar(nome: string, acao: (signal: AbortSignal) => Promise<SnapshotIntegracoes>) {
    if (ativo.current) return
    const controle = new AbortController()
    ativo.current = controle
    setOcupacao(nome); setErro(''); setAviso('')
    try {
      const s = await acao(controle.signal)
      if (!vivo.current) return
      setSnapshot(s); setLimites({ ...(s.configuracao?.limites ?? TETOS_P0) }); setAlterado(false)
      setAviso(nome === 'Salvar' ? 'Configuração salva somente na memória. Salvar não executa teste.' : nome === 'Testar' ? 'Teste do adaptador simulado concluído. Nenhum provedor real foi consultado.' : nome === 'Desativar' ? 'Integração desativada. O orçamento da sessão foi preservado.' : 'Estado local atualizado.')
    } catch (e) {
      if (!vivo.current || controle.signal.aborted) return
      // Nunca manter resultado "conectado" visível após erro de transporte/sessão.
      setSnapshot(null)
      setErro(mensagens[e instanceof ErroIntegracoes ? e.tipo : 'invalido'])
    } finally {
      if (ativo.current === controle) ativo.current = null
      if (vivo.current) setOcupacao('')
    }
  }
  const atualizar = () => { if (cliente) void operar('Atualizar', signal => cliente.carregar(signal)); else setErro(mensagens['sem-servico']) }
  useEffect(() => {
    vivo.current = true
    atualizar()
    return () => { vivo.current = false; ativo.current?.abort(); ativo.current = null }
  }, [cliente])
  const c = snapshot?.configuracao, estado = snapshot?.servico
  const ultimoTeste = estado && 'teste' in estado ? estado.teste : null
  const rotulos = { local: 'Local · sem teste nesta revisão', conectado: 'Conectado · simulado', invalido: 'Inválido · simulado', indisponivel: 'Indisponível · simulado', 'sem-quota': 'Sem quota · simulado', 'sem-configuracao': 'Sem configuração' }
  function salvar() {
    if (!cliente || !snapshot) return
    const proposta = { formato: FORMATO_CONFIGURACAO_INTEGRACAO, id: c?.id ?? 'assistente-local', revisao: c ? c.revisao + 1 : 1,
      provedor: 'simulado', destino: 'sem-rede', modelo: 'resposta-simulada-v1', habilitada: true,
      limites, permissoes: { envioRemoto: false, fontesPrivadas: false } }
    try { validarConfiguracaoIntegracao(proposta) }
    catch { setErro('Limites inválidos: use inteiros positivos dentro dos tetos. A saída por pedido não pode exceder o orçamento da sessão.'); return }
    void operar('Salvar', signal => cliente.salvar(proposta, signal))
  }
  return <div className="product-root integracoes-app reference-app"><BarraJanela />
    <div className="integracoes-shell"><aside className="integracoes-sidebar"><a className="integracoes-brand" href="#/i-ai">Cosmos</a><span>CONFIGURAÇÕES</span><nav aria-label="Configurações Cosmos"><a href="#/integracoes" aria-current="page"><Icone nome="settings" />Integrações</a><a href="#/conta"><Icone nome="shield" />Conta e carteira local</a></nav><div>{navigation}</div></aside>
      <main className="integracoes-main"><header className="integracoes-heading"><div><p>CONFIGURAÇÕES / INTEGRAÇÕES</p><h1>Integrações locais</h1><p>Configure, teste e acompanhe o serviço local. Cada ação tem um resultado explícito.</p></div><span className="integracoes-badge">{provedorSelecionado === 'simulado' ? 'P0 · SOMENTE SIMULAÇÃO' : 'P1 · GROQ REAL'}</span></header><label className="integracoes-provider">Provedor<select value={provedorSelecionado} onChange={e => setProvedorSelecionado(e.target.value)}><option value="simulado">Simulado · P0 sem rede</option><option value="groq">Groq · P1 envio externo explícito</option></select></label>{provedorSelecionado === 'groq' && <GroqIntegracao />}<div hidden={provedorSelecionado !== 'simulado'}>
        <div className="integracoes-status" role="status" aria-live="polite"><i className={snapshot ? 'disponivel' : ''} /><strong>{ocupacao ? `${ocupacao}…` : !snapshot ? 'Serviço local indisponível' : !c ? 'Sem configuração' : !c.habilitada ? 'Desativado' : rotulos[estado!.estado]}</strong><span>{ultimoTeste ? `Último teste: ${new Date(ultimoTeste.executadoEmMs).toLocaleString('pt-BR')}. Resultado daquele instante.` : 'Salvar uma configuração não comprova conexão.'}</span><Button variant="outline" onClick={atualizar} disabled={!!ocupacao}>Atualizar estado</Button></div>
        {erro && <div className="integracoes-alert" role="alert">{erro}</div>}{aviso && <p className="integracoes-notice" role="status">{aviso}</p>}
        {!snapshot && <section className="integracoes-setup"><Icone nome="tools" /><div><h2>Inicie a instância local</h2><p>No terminal da pasta do projeto, execute:</p><code>node scripts/integracoes-p0.mjs</code><p>Depois abra <a href="http://127.0.0.1:4175/cosmos/#/integracoes">127.0.0.1:4175 · Integrações</a>. A sessão fica no servidor; nenhuma chave deve ser colada nesta tela.</p></div></section>}
        <div className="integracoes-grid"><section className="integracoes-card"><header><Icone nome="tools" /><div><h2>Adaptador de teste</h2><p>Catálogo fechado · sem endpoints externos</p></div></header><dl className="integracoes-details"><div><dt>Provedor</dt><dd>Simulado</dd></div><div><dt>Modelo</dt><dd>resposta-simulada-v1</dd></div><div><dt>Destino</dt><dd>Sem rede</dd></div><div><dt>Credencial de API</dt><dd>Não aplicável</dd></div><div><dt>Revisão salva</dt><dd>{c?.revisao ?? '—'}</dd></div></dl>
          <form onSubmit={e => { e.preventDefault(); salvar() }}><fieldset disabled={!snapshot || !!ocupacao}><legend>Orçamento e limites locais</legend><p>Unidades estimadas por bytes UTF-8. Sem preço, cobrança ou saldo financeiro.</p><div className="integracoes-fields">{campos.map(([chave, label]) => <label key={chave}>{label}<input type="number" min="1" max={TETOS_P0[chave]} step="1" required value={Number.isFinite(limites[chave]) ? limites[chave] : ''} onChange={e => { setLimites(l => ({ ...l, [chave]: Number(e.target.value) })); setAlterado(true) }} /><small>Teto P0: {TETOS_P0[chave].toLocaleString('pt-BR')}</small></label>)}</div><p>Concorrência: 1 execução. Editar estes campos não altera o serviço até salvar.</p><Button type="submit">{c && !c.habilitada ? 'Salvar e ativar simulação' : 'Salvar configuração'}</Button></fieldset></form>
          <div className="integracoes-actions"><Button variant="outline" disabled={!c?.habilitada || !!ocupacao || alterado} onClick={() => { if (cliente && c) void operar('Testar', signal => cliente.testar(c, signal)) }}>Testar simulação</Button><Button variant="ghost" disabled={!c?.habilitada || !!ocupacao} onClick={() => { if (cliente && c) void operar('Desativar', signal => cliente.salvar({ ...c, revisao: c.revisao + 1, habilitada: false }, signal)) }}>Desativar</Button></div>{alterado && <p className="integracoes-hint">Há alterações locais. Salve antes de testar a nova revisão.</p>}
        </section><div className="integracoes-secondary"><section className="integracoes-card"><header><Icone nome="shield" /><div><h2>Permissões</h2><p>Restrições aplicadas no backend</p></div></header><ul className="integracoes-permissions"><li><span>Acesso à rede externa</span><b>Bloqueado</b></li><li><span>Fontes privadas</span><b>Bloqueadas</b></li><li><span>Credenciais do provedor</span><b>Não aplicável</b></li><li><span>Token de sessão</span><b>Somente no servidor</b></li><li><span>Carteira / seed</span><b>Fora do escopo</b></li></ul><p>A conta local e as chaves históricas são independentes deste serviço. Não envie seed, senha ou chave privada.</p></section>
          <section className="integracoes-card"><header><Icone nome="file" /><div><h2>Consumo desta sessão</h2><p>Contabilidade simulada · somente memória</p></div></header><dl className="integracoes-details">{[['Pedidos aceitos', snapshot?.consumo.pedidos], ['Execuções ativas', snapshot?.consumo.ativos], ['Unidades reservadas', snapshot?.consumo.unidadesReservadas], ['Unidades debitadas', snapshot?.consumo.unidadesDebitas]].map(([n, v]) => <div key={n}><dt>{n}</dt><dd>{v ?? '—'}</dd></div>)}</dl><p>Mudar a configuração ou desativar não zera o consumo. O teste de conexão não gera conteúdo nem debita unidades.</p></section>
          <section className="integracoes-card integracoes-scope"><h2>O que está conectado?</h2><p>Somente o adaptador simulado. IA remota, mercado real e diretório /comprovados/ permanecem sem configuração. O catálogo RAG padrão está vazio.</p><p>“Conectado · simulado” registra um teste local; não significa provedor real disponível continuamente.</p></section></div></div>
        </div><footer>Cosmos · serviço local efêmero · P0 e P1 separados · sem operação financeira</footer>
      </main></div></div>
}
