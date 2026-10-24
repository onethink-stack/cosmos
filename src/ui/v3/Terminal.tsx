import { useEffect, useRef, useState } from 'preact/hooks'
import { PACOTE_COSMOS } from '../../dados/pacoteCosmos'
import { MODULOS_V3, OFERTAS_DEMO, REGISTROS_PUBLICOS, TESTES_REDE, pesquisarPublicos } from '../../v3/catalogo'
import { criarSimulacao } from '../../v3/escrowSimulado'
import { SimuladorTrava } from './SimuladorTrava'
import moedaCosmos from '../icons/cosmos-moeda-oficial.png'

type Modulo = typeof MODULOS_V3[number]
const curto = (s: string) => `${s.slice(0, 8)}…${s.slice(-4)}`

function Pesquisa({ compacta = false }: { compacta?: boolean }) {
  const [consulta, setConsulta] = useState('')
  const encontrados = pesquisarPublicos(consulta)
  return <section class={`v3-search ${compacta ? 'compact' : ''}`}>
    <label class="v3-search-input"><span aria-hidden="true">⌕</span><input aria-label="Pesquisar registros públicos" value={consulta} onInput={e => setConsulta(e.currentTarget.value)} placeholder="Fórmula, hash, domínio, autor…" /><kbd>↵</kbd></label>
    <div class="v3-search-caption"><span>CATÁLOGO PÚBLICO</span><span>{encontrados.length.toString().padStart(2, '0')} registros</span></div>
    {!consulta && <p class="v3-muted">As fichas v1 não contêm fórmula formal. Pesquise metadados ou hash.</p>}
    <div class="v3-results">{encontrados.map(r => <a href="#/cadeia" key={r.id}><span class="v3-result-id">{r.id}</span><div><strong>{r.titulo}</strong><small>{r.dominio} <i>·</i> {r.estado}</small><code>{curto(r.hash)}</code></div><span>↗</span></a>)}</div>
    {!encontrados.length && <div class="v3-empty">Nenhum registro encontrado.<p>A busca não gera afirmações nem consulta notas privadas.</p></div>}
  </section>
}

export function Hub() {
  const [selecionada, setSelecionada] = useState<typeof OFERTAS_DEMO[number] | null>(null)
  const [dominio, setDominio] = useState('Todos')
  const [indice, setIndice] = useState(0)
  const [simulacao, setSimulacao] = useState(() => criarSimulacao())
  const [agora, setAgora] = useState(0)
  const modal = useRef<HTMLElement>(null)
  const retornoFoco = useRef<HTMLElement | null>(null)
  const abrirOferta = (oferta: typeof OFERTAS_DEMO[number]) => { retornoFoco.current = document.activeElement as HTMLElement | null; setSelecionada(oferta) }
  useEffect(() => {
    if (!selecionada) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setSelecionada(null) }
      if (e.key !== 'Tab') return
      const itens = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)') ?? [])
      const primeiro = itens[0], ultimo = itens.at(-1)
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus() }
    }
    document.addEventListener('keydown', teclado)
    return () => { document.body.style.overflow = anterior; document.removeEventListener('keydown', teclado); if (retornoFoco.current?.isConnected) retornoFoco.current.focus() }
  }, [selecionada])
  const ofertas = OFERTAS_DEMO.filter(o => dominio === 'Todos' || o.dominio === dominio)
  const fluxo = Array.from({ length: 7 }, (_, i) => ({ fase: REGISTROS_PUBLICOS[(i + indice) % REGISTROS_PUBLICOS.length], oferta: OFERTAS_DEMO[i % OFERTAS_DEMO.length] }))
  return <>
    <div class="v3-heading"><div><p class="v3-eyebrow"><span class="v3-led" /> TERMINAL DE CONHECIMENTO</p><h1 class="v3-title-with-coin"><img src={moedaCosmos} alt="" width="48" height="48" />Hub<span>.</span></h1><p>Registros verificáveis. Ofertas e pesquisa em um só lugar.</p></div><button class="v3-primary" onClick={() => abrirOferta(OFERTAS_DEMO[0])}>＋ Simular oferta</button></div>
    <section class="v3-metrics" aria-label="Estado do ambiente">
      <div><span>REGISTROS PÚBLICOS</span><strong>09<small>F0 — F8</small></strong><p>Pacote histórico disponível</p></div>
      <div><span>OFERTAS DE EXEMPLO</span><strong>03<small>DEMO</small></strong><p>Nenhuma oferta publicada</p></div>
      <div><span>EMISSÃO / TRADES REAIS</span><strong>—<small>INATIVO</small></strong><p>Sem carteira conectada</p></div>
      <div><span>RESUMO DA CADEIA</span><strong class="v3-metric-hash">4bd9026d<span>↗</span></strong><p>SHA-256 · selo 502426c</p></div>
    </section>
    <div class="v3-market">
      <section class="v3-panel v3-flow"><header><h2><span class="v3-led" /> Fluxo de atividade</h2><span class="v3-chip">DEMO</span></header><div class="v3-panel-sub">Eventos ilustrativos · sem rede</div>
        <div class="v3-feed">{simulacao.eventos.slice(-7).reverse().map(e => <article key={`sim-${e.id}`}><div class="v3-feed-top"><span>↗ {e.tipo} / simulação</span><small>#{String(e.id).padStart(4, '0')}</small></div><div class="v3-feed-trade"><code>{e.oferta}</code><span>→</span><strong>{String(e.valor)}<small> un. teste</small></strong></div><div class="v3-feed-bottom"><span>{e.destino}</span><i>queima: {String(e.queima)}</i></div></article>)}{!simulacao.eventos.length && fluxo.map(({ fase, oferta }, i) => <article key={`${fase.id}-${i}`}><div class="v3-feed-top"><span>↗ registro / exemplo</span><small>#{String(indice + i + 1).padStart(4, '0')}</small></div><div class="v3-feed-trade"><code>{fase.hash.slice(0, 6)}…</code><span>→</span><strong>{oferta.valor}<small> un. teste</small></strong></div><div class="v3-feed-formula">{oferta.formula}</div><div class="v3-feed-bottom"><span>{oferta.dominio}</span><i>DEMO</i></div></article>)}</div>
        <button class="v3-feed-next" onClick={() => setIndice(indice + 1)}>Atualizar exemplos <span>↻</span></button>
      </section>
      <section class="v3-offers"><div class="v3-section-title"><h2>Ofertas ativas <span>03</span></h2><span>PRÉVIA DE INTERFACE</span></div>
        <div class="v3-filter-bar"><button class={dominio === 'Todos' ? 'selected' : ''} onClick={() => setDominio('Todos')}>Todas</button><button class={dominio === 'Lógica proposicional' ? 'selected' : ''} onClick={() => setDominio('Lógica proposicional')}>Lógica</button><button class={dominio === 'Álgebra' ? 'selected' : ''} onClick={() => setDominio('Álgebra')}>Álgebra</button><span>Recentes ↓</span></div>
        {ofertas.map(o => <article class="v3-offer" key={o.id}><div class="v3-offer-meta"><span><i /> {o.dominio}</span><code>{o.id}</code></div><p class="v3-offer-formula">{o.formula}</p><h3>{o.nome}</h3><p class="v3-offer-description">Entregar demonstração vinculada ao problema exato, com certificado conferível.</p><div class="v3-proof-chip">◇ {o.nivel}</div><div class="v3-offer-bottom"><div><strong>{o.valor}<span> un. teste</span></strong><small>prazo ilustrativo: {o.prazo}</small></div><button onClick={() => abrirOferta(o)}>Ver oferta <span>↗</span></button></div></article>)}
        <p class="v3-market-note">Ofertas e valores ilustrativos. Não representam UTXOs, saldos ou contratos ativos.</p>
      </section>
      <aside class="v3-research"><section class="v3-panel"><header><h2>Pesquisar conhecimento</h2><span>⌕</span></header><Pesquisa compacta /></section>
        <section class="v3-proof-status"><span class="v3-eyebrow">CAMADA DE CONFIANÇA</span><h3>Uma assinatura.<br />Escopos distintos.</h3><div><span>SHA-256 / Ed25519</span><b>verificáveis</b></div><div><span>Alethe / Carcara</span><b class="v3-amber">não conectado</b></div><div><span>Bitcoin / OTS</span><b class="v3-amber">pendente</b></div><a href="#/certificados">Ver certificados ↗</a></section>
      </aside>
    </div>
    {selecionada && <div class="v3-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSelecionada(null) }}><section ref={modal} class="v3-modal" role="dialog" aria-modal="true" aria-labelledby="v3-oferta-titulo"><button class="v3-modal-close" aria-label="Fechar oferta" onClick={() => setSelecionada(null)} autoFocus>×</button><p class="v3-eyebrow">{selecionada.id} · EXEMPLO DE INTERFACE</p><h2 id="v3-oferta-titulo">{selecionada.nome}</h2><p class="v3-offer-formula">{selecionada.formula}</p><div class="v3-notice">Nenhuma oferta publicada ou moeda real. Abaixo há somente uma máquina de estados de teste, sem identidade ou consenso de rede.</div><SimuladorTrava oferta={selecionada} estado={simulacao} atualizar={setSimulacao} agora={agora} definirAgora={setAgora} /><a href="#/certificados" onClick={() => setSelecionada(null)}>Inspecionar arquivos de certificado ↗</a></section></div>}
  </>
}

export function Indice() {
  const [grupo, setGrupo] = useState('Todos')
  return <><div class="v3-heading"><div><p class="v3-eyebrow">ESPAÇO DE TRABALHO</p><h1 class="v3-title-with-coin"><img src={moedaCosmos} alt="" width="48" height="48" />Índice<span>.</span></h1><p>Do registro público à conferência de evidências.</p></div><span class="v3-outline-tag">12 MÓDULOS</span></div><div class="v3-filter-bar">{['Todos', 'Conhecimento', 'Verificação', 'Rede'].map(g => <button class={grupo === g ? 'selected' : ''} onClick={() => setGrupo(g)} key={g}>{g}</button>)}</div><div class="v3-module-grid">{MODULOS_V3.filter(m => grupo === 'Todos' || m.grupo === grupo).map(m => <a class="v3-module-card" href={`#/${m.tela}`} key={m.tela}><div><span>{m.simbolo}</span><code>{m.numero} / {m.grupo}</code></div><h2>{m.nome}</h2><p>{m.descricao}</p><span class="v3-module-arrow">↗</span></a>)}</div></>
}

function ArquivosCertificado() {
  const [arquivos, setArquivos] = useState<{ nome: string; hash: string; bytes: number }[]>([])
  const [erro, setErro] = useState('')
  const ler = async (files: FileList | null) => {
    setErro('')
    try {
      if (!files || files.length > 2) throw new Error('Selecione até dois arquivos: prova Alethe e problema SMT-LIB.')
      const infos = []
      for (const f of Array.from(files)) {
        if (f.size > 1048576) throw new Error('Cada arquivo deve ter no máximo 1 MiB.')
        const bytes = await f.arrayBuffer()
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
        infos.push({ nome: f.name, hash, bytes: f.size })
      }
      setArquivos(infos)
    } catch (e) { setArquivos([]); setErro((e as Error).message) }
  }
  return <section class="v3-certificate-box"><span class="v3-outline-tag">INSPEÇÃO LOCAL</span><h2>Prova + problema original</h2><p>Selecione os arquivos para calcular seus hashes. A inspeção de bytes não executa Carcara e não confirma a prova.</p><label class="v3-dropzone">↥<strong>Selecionar .alethe e .smt2</strong><span>Até dois arquivos · 1 MiB por arquivo · sem upload</span><input type="file" multiple accept=".alethe,.smt2" onChange={e => void ler(e.currentTarget.files)} /></label>{erro && <p role="alert" class="v3-amber">{erro}</p>}{arquivos.map(a => <div class="v3-file-info" key={a.nome}><strong>{a.nome}</strong><span>{a.bytes} bytes</span><code>{a.hash}</code><small>Hash calculado · prova não verificada</small></div>)}<div class="v3-notice">Carcara não está conectado nesta interface. Nenhum arquivo é marcado como “provado”.</div></section>
}

function exportarPublico() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(PACOTE_COSMOS, null, 2) + '\n'], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = 'cosmos-502426c.json'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ModuloPublico({ modulo }: { modulo: Modulo }) {
  const [selecionados, setSelecionados] = useState<string[]>([])
  const testes = modulo.tela === 'mundo' || modulo.tela === 'cacar'
  return <><div class="v3-heading"><div><p class="v3-eyebrow">{modulo.grupo.toUpperCase()} / {modulo.numero}</p><h1>{modulo.nome}<span>.</span></h1><p>{modulo.descricao}</p></div><a class="v3-button" href="#/indice">Todos os módulos ↗</a></div>
    {modulo.tela === 'certificados' ? <ArquivosCertificado /> : modulo.tela === 'backup' ? <section class="v3-certificate-box"><span class="v3-eyebrow">PACOTE PÚBLICO ASSINADO</span><h2>Nove fases. Um arquivo.</h2><p>Exporta apenas F0–F8, chave pública, elos e resumo. Não acessa notas, carteira ou chave privada.</p><code class="v3-full-hash">{PACOTE_COSMOS.resumo_final}</code><button class="v3-primary" onClick={exportarPublico}>↓ Exportar pacote público</button><div class="v3-notice">Essa exportação não é backup de carteira. O backup cifrado do cofre e dos dados locais está em Conta local. Esta exportação contém somente as fases públicas históricas.</div></section>
    : testes ? <><div class="v3-node-grid">{['A', 'B', 'C'].map(n => <div key={n}><span class="v3-node-icon">◎</span><strong>Notebook {n}</strong><small>Não conectado</small><code>estado: não observado</code></div>)}</div><section class="v3-checklist"><div class="v3-section-title"><h2>Plano de testes</h2><span>{selecionados.length}/{TESTES_REDE.length} SELECIONADOS</span></div><p class="v3-muted">Seleção para planejamento, não registro de teste executado.</p>{TESTES_REDE.map(t => <label key={t.id}><input type="checkbox" checked={selecionados.includes(t.id)} onChange={() => setSelecionados(selecionados.includes(t.id) ? selecionados.filter(id => id !== t.id) : [...selecionados, t.id])} /><code>{t.id}</code><div><strong>{t.nome}</strong><span>{t.criterio}</span></div></label>)}</section></>
    : modulo.tela === 'dicionario' ? <div class="v3-module-grid">{[['φ', 'Pessoa / símbolo', 'Notação, não identidade humana verificada.'], ['⊢', 'Consequência', 'Exige problema e certificado vinculados.'], ['ℤ[√2]', 'Aritmética exata', 'Coeficientes inteiros seguros; não é hash.'], ['SHA-256', 'Integridade', 'Compromisso dos bytes, não verdade.'], ['Ed25519', 'Autoria', 'Posse de chave, não pessoa única.'], ['OTS', 'Anterioridade', 'Confirmação Bitcoin ainda pendente.']].map(([s, n, d]) => <article class="v3-module-card" key={s}><span class="v3-word-symbol">{s}</span><h2>{n}</h2><p>{d}</p></article>)}</div>
    : modulo.tela === 'sistemas' ? <div class="v3-system-list">{[['Catálogo público', '9 registros históricos', 'Disponível'], ['Cadeia SHA / Ed25519', 'Verificação local dos elos', 'Disponível'], ['Alethe / Carcara', 'Executável e integração ainda necessários', 'Não conectado'], ['Acesso / autoria', 'Desbloqueio local com bloqueio por inatividade; sem login de servidor', 'Local disponível'], ['Carteira HD de teste', 'Cofre cifrado, derivação e assinatura de perfil disponíveis em V4 local', 'Teste local'], ['Transferências / ledger', 'Ledger local assinado com saldo, sequência e controle de concorrência; sem rede pública', 'Teste local'], ['Backup de carteira', 'Conta local exporta e restaura backup cifrado; exportação pública é separada', 'Teste local'], ['Rede / consenso', 'Sem sincronização de ledger entre aparelhos conectada à interface', 'Pendente'], ['Hub econômico', 'Ofertas e ordens sem ativos ou mercado externo', 'Demonstração']].map(([n, d, s]) => <article key={n}><span class="v3-led" /><div><h2>{n}</h2><p>{d}</p></div><span class="v3-outline-tag">{s}</span></article>)}</div>
    : <div class="v3-module-content"><section class="v3-panel"><header><h2>{modulo.tela === 'perguntar' ? 'Pesquisa antes da interpretação' : modulo.tela === 'historico' ? 'Registros por fase histórica' : 'Catálogo público verificável'}</h2><span>09</span></header><Pesquisa /></section><aside class="v3-proof-status"><p class="v3-eyebrow">ESCOPO DO MÓDULO</p><h3>{modulo.tela === 'contradicoes' ? 'Sem certificado, inconclusivo.' : 'Origem antes de conclusão.'}</h3><p>{modulo.tela === 'perguntar' ? 'A pesquisa só recupera registros. Nenhum modelo de IA está configurado para responder ou gerar axiomas.' : 'Estas são fichas históricas v1. Não foram reinterpretadas como provas formais ou fatos científicos.'}</p><a href="#/certificados">Inspecionar certificado ↗</a><a href="#/cadeia">Abrir cadeia assinada ↗</a></aside></div>}
  </>
}

