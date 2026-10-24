import { useEffect, useRef, useState } from 'preact/hooks'
import { criarCofreTeste, derivarEnderecoTeste, lerCofreTeste, assinarPerfilLocal, verificarPerfilLocal, type CofreTeste, type EnderecoTeste, type PerfilAssinado } from '../../v4/carteira'
import { iniciarLocalnetTeste, somenteHostLocal, type LocalnetTeste } from '../../v4/localnet'
import { SimuladorTrava } from '../v3/SimuladorTrava'

const STORAGE = 'cosmos:v4:cofre-teste'
export function LaboratorioV4() {
  const [cofre, setCofre] = useState<CofreTeste | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [endereco, setEndereco] = useState<EnderecoTeste | null>(null)
  const [perfil, setPerfil] = useState<PerfilAssinado | null>(null)
  const [rede, setRede] = useState<LocalnetTeste | null>(null)
  const [agora, setAgora] = useState(0)
  const [supply, setSupply] = useState('1000000')
  const [queima, setQueima] = useState('500')
  const senha = useRef<HTMLInputElement>(null), apelido = useRef<HTMLInputElement>(null), indice = useRef<HTMLInputElement>(null)
  const local = somenteHostLocal(location.hostname)
  useEffect(() => {
    if (!local) return
    try { const salvo = localStorage.getItem(STORAGE); if (salvo) setCofre(lerCofreTeste(salvo)) }
    catch { setErro('Cofre local indisponível ou inválido; não foi substituído por um cofre vazio.') }
    return () => { if (senha.current) senha.current.value = '' }
  }, [local])
  const executar = async (acao: (segredo: string) => Promise<void>) => {
    setErro(''); setOcupado(true)
    const segredo = senha.current?.value ?? ''
    try { if (!local) throw new Error('Laboratório permitido somente em loopback'); await acao(segredo) }
    catch { setErro('Operação recusada. Confira senha, cofre e parâmetros de teste. Nenhum segredo foi registrado.') }
    finally { if (senha.current) senha.current.value = ''; setOcupado(false) }
  }
  if (!local) return <section class="v3-certificate-box"><h1>V4 local</h1><p>Abra por localhost ou 127.0.0.1. Geração e desbloqueio estão desabilitados nesta origem.</p></section>
  return <>
    <div class="v3-heading"><div><p class="v3-eyebrow">V4 / LABORATÓRIO ISOLADO</p><h1>Identidade + HD<span>.</span></h1><p>Teste local. Sem rede pública, custódia ou ativos financeiros.</p></div><span class="v3-outline-tag">LOCALNET SIMULADA</span></div>
    <div class="v3-notice"><a href="#/conta">Conta, backup e transferências locais →</a> Este laboratório mantém o cenário V4 isolado. Selo local comprova autoria sob chave; não comprova identidade civil nem pessoa única. A chave Ed25519 histórica não é acessada.</div>
    <section class="v3-certificate-box"><h2>Cofre de teste no aparelho</h2><p>Seed nova de 256 bits, sem importação ou exibição. AES-256-GCM + PBKDF2-SHA256, 600.000 iterações. Somente o cofre cifrado fica no armazenamento desta origem.</p>
      <form onSubmit={e => e.preventDefault()} autoComplete="off" class="v4-form">
        <label>Senha exclusiva de teste (12–256 caracteres)<input ref={senha} type="password" minLength={12} maxLength={256} autoComplete="new-password" aria-label="Senha exclusiva de teste" /></label>
        <label>Índice do endereço<input ref={indice} type="number" min="0" max="2147483647" step="1" defaultValue="0" aria-label="Índice do endereço" /></label>
        <label>Apelido local sem dados pessoais<input ref={apelido} maxLength={40} defaultValue="pessoa-teste" aria-label="Apelido local" /></label>
        <div class="v4-actions"><button disabled={ocupado || !!cofre} onClick={() => void executar(async segredo => {
          if (localStorage.getItem(STORAGE) !== null) throw new Error('Cofre já existe')
          const novo = await criarCofreTeste(segredo)
          // Persistência antes de qualquer derivação; nunca escrever seed ou chave em claro.
          // Web Lock serializa criação entre abas compatíveis da mesma origem.
          if (!navigator.locks) throw new Error('Web Locks indisponível')
          await navigator.locks.request(STORAGE, () => {
            if (localStorage.getItem(STORAGE) !== null) throw new Error('Cofre já existe')
            localStorage.setItem(STORAGE, JSON.stringify(novo)); setCofre(novo)
          })
        })}>Gerar cofre novo de teste</button>
          <button disabled={ocupado || !cofre} onClick={() => void executar(async segredo => { if (cofre) setEndereco(await derivarEnderecoTeste(cofre, segredo, Number(indice.current?.value))) })}>Derivar endereço público</button>
          <button disabled={ocupado || !cofre} onClick={() => void executar(async segredo => { if (cofre) setPerfil(await assinarPerfilLocal(cofre, segredo, apelido.current?.value ?? '')) })}>Assinar perfil local</button>
        </div>
      </form>
      <p role="status">Cofre: {cofre ? 'cifrado e salvo localmente' : 'ainda não criado'}{ocupado ? ' · operação em curso' : ''}</p>
      <p class="v3-muted">Backup cifrado e restauração estão em Conta local. Não há exportação de seed em claro. Perder senha e backup pode perder o acesso. Segredos em memória JavaScript não têm garantia de apagamento completo.</p>
      <p class="v3-muted">Perfil personalizado: m/44'/1'/0'/0/x + P2WPKH tb1q. Não é o caminho convencional BIP84 e não representa saldo Bitcoin. Não use carteira real.</p>
      {endereco && <div class="v3-file-info"><strong>Endereço público de teste</strong><code>{endereco.caminho}</code><code class="v3-full-hash">{endereco.endereco}</code><code class="v3-full-hash">{endereco.pubkey}</code></div>}
      {perfil && <div class="v3-file-info"><strong>{verificarPerfilLocal(perfil) ? '✓ Assinatura do perfil válida sob chave' : 'Perfil inválido'}</strong><span>{perfil.perfil.apelido} · secp256k1 · índice 0</span><code class="v3-full-hash">{perfil.perfil.endereco}</code><small>Não é identidade civil, atestado anti-Sybil ou assinatura da emissão.</small></div>}
      {erro && <p role="alert" class="v3-amber">{erro}</p>}
    </section>
    <section class="v3-certificate-box"><h2>Genesis da localnet simulada</h2><p>Um ledger em memória, sem Bitcoin Core, mineração, RPC ou consenso distribuído. Unidades vão para o ator fictício demo:solicitante; não são saldo da carteira HD. Recarregar descarta o ledger.</p>
      <div class="v4-form"><label>Supply de teste (inteiro, máximo 1 bilhão)<input aria-label="Supply de teste" type="text" inputMode="numeric" disabled={!!rede} value={supply} onInput={e => setSupply(e.currentTarget.value)} /></label><label>Queima em pontos-base<input aria-label="Queima da localnet" type="number" min="0" max="10000" step="1" disabled={!!rede} value={queima} onInput={e => setQueima(e.currentTarget.value)} /></label></div>
      <button disabled={ocupado || !perfil || !!rede} onClick={() => { try {
        if (!perfil || !/^[1-9][0-9]{0,9}$/.test(supply)) throw new Error('Supply inválido')
        setRede(iniciarLocalnetTeste(perfil, BigInt(supply), Number(queima))); setErro('')
      } catch { setErro('Genesis recusado: confira perfil, supply e queima.') } }}>Mint do genesis desta sessão</button>
      {rede && <><p role="status">Genesis: {rede.genesis.supply} unidades de teste · sem valor financeiro</p><code class="v3-full-hash">{rede.hashGenesis}</code><SimuladorTrava permitirReinicio={false} oferta={{ id: 'V4-DEMO', formula: 'φ ⊢ ψ', valor: '80' }} estado={rede.estado} atualizar={estado => setRede({ ...rede, estado })} agora={agora} definirAgora={setAgora} /></>}
    </section>
  </>
}
