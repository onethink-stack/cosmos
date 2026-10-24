import { useState } from 'preact/hooks'
import { ATORES_DEMO, criarSimulacao, travarOferta, liquidarCenario, reembolsarCenario, saldoSimulado, type EstadoDemo } from '../../v3/escrowSimulado'
const hashTexto = async (texto: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))), b => b.toString(16).padStart(2, '0')).join('')

export function SimuladorTrava({ oferta, estado, atualizar, agora, definirAgora, permitirReinicio = true }: {
  oferta: { id: string; formula: string; valor: string }; estado: EstadoDemo; atualizar: (s: EstadoDemo) => void; agora: number; definirAgora: (n: number) => void; permitirReinicio?: boolean
}) {
  const [erro, setErro] = useState('')
  const [taxa, setTaxa] = useState(String(estado.parametros.queimaBps))
  const [ocupado, setOcupado] = useState(false)
  const atual = estado.ofertas.filter(o => o.id.startsWith(oferta.id + '-')).at(-1)
  const [solicitante, provedor] = ATORES_DEMO
  const executar = async (acao: () => void | Promise<void>) => {
    setErro(''); setOcupado(true)
    try { await acao() } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  return <section class="v3-simulator" aria-label="Simulador de trava de oferta">
    <div class="v3-section-title"><h3>Trava de oferta</h3><span>SOMENTE TESTE</span></div>
    <div class="v3-sim-balances"><div><span>Solicitante</span><strong>{String(saldoSimulado(estado, solicitante))}</strong></div><div><span>Provedor</span><strong>{String(saldoSimulado(estado, provedor))}</strong></div><div><span>Queimado</span><strong>{String(estado.queimado)}</strong></div></div>
    <p class="v3-muted">Unidades fictícias de cenário; não são moeda ou saldo de carteira. Estado apenas na memória desta página.</p>
    {permitirReinicio && <div class="v3-sim-config"><label>Queima (pontos-base)<input aria-label="Queima em pontos-base" type="number" min="0" max="10000" step="1" value={taxa} onInput={e => setTaxa(e.currentTarget.value)} /></label><button disabled={ocupado} onClick={() => void executar(() => { atualizar(criarSimulacao({ queimaBps: Number(taxa), maxOfertas: 20 })); definirAgora(0) })}>Reiniciar fixture</button></div>}
    <div class="v3-sim-actions">
      <button disabled={ocupado || !!atual} class="v3-primary" onClick={() => void executar(async () => {
        const hashProblema = await hashTexto('CENARIO-DE-TESTE\n' + oferta.formula)
        atualizar(travarOferta(estado, { id: `${oferta.id}-${estado.ofertas.length + 1}`, solicitante, valor: BigInt(oferta.valor), entradas: estado.utxos.filter(u => u.dono === solicitante && u.trava === null).map(u => u.id), expira: agora + 14 * 86400000, hashProblema }, agora))
      })}>1. Simular trava de {oferta.valor}</button>
      <button disabled={ocupado || atual?.estado !== 'aberta'} onClick={() => void executar(async () => {
        if (!atual) return
        atualizar(liquidarCenario(estado, { fonte: 'fixture-simulada', oferta: atual.id, provedor, hashProblema: atual.hashProblema, hashCertificado: await hashTexto('CERTIFICADO-SIMULADO\n' + atual.id), resultadoSimulado: 'valido' }, agora))
      })}>2. Simular certificado aceito</button>
      <button disabled={ocupado || atual?.estado !== 'aberta'} onClick={() => void executar(() => {
        if (!atual) return
        definirAgora(atual.expira)
        atualizar(reembolsarCenario(estado, atual.id, solicitante, atual.expira))
      })}>Simular expiração + reembolso</button>
    </div>
    {atual && <p class="v3-sim-state" role="status">Estado: {atual.estado} · queima fixada: {atual.queimaBps} bps · relógio de cenário: {agora} ms</p>}
    {erro && <p role="alert" class="v3-amber">{erro}</p>}
    <p class="v3-muted">“Certificado aceito” é uma fixture simulada, sem execução Carcara. Arquivos inspecionados na outra tela não liberam essa trava.</p>
  </section>
}
