import { useState } from 'preact/hooks'
import { useRota } from './rotas'
import { CadeiaFases } from './Inicio'
import { OutrasFases } from './OutrasFases'
import { MODULOS_V3 } from '../v3/catalogo'
import { Hub, Indice, ModuloPublico } from './v3/Terminal'
import moedaCosmos from './icons/cosmos-moeda-oficial.png'
import { LaboratorioV4 } from './v4/Laboratorio'

/** Entrada v3 isolada: dados públicos, sem carregar motor ou banco privado legado. */
export function CosmosApp() {
  const rota = useRota()
  const [menu, setMenu] = useState(false)
  const modulo = MODULOS_V3.find(m => m.tela === rota.tela)
  const hub = rota.tela === 'hub'
  return <div class={`v3-app${hub ? ' terminal-theme' : ''}`}>
    <aside class={`v3-sidebar ${menu ? 'v3-menu-open' : ''}`}>
      <a class="v3-brand" href="#/lab" aria-label="Cosmos início"><img class="v3-brand-coin" src={moedaCosmos} alt="Moeda oficial COSMOS" width="64" height="64" /><span>COSMOS WORKSPACE</span></a>
      <button class="v3-menu-toggle" onClick={() => setMenu(!menu)} aria-expanded={menu}>Menu {menu ? '−' : '+'}</button>
      <nav aria-label="Índice Cosmos" onClick={() => setMenu(false)}>
        <a href="#/i-ai"><span>i</span> Cosmos — Conversa</a>
        <a href="#/lab"><span>∴</span> Cosmos Labs</a>
        <a href="#/terminal"><span>▥</span> Terminal COSMOS</a>
        <a href="#/conta"><span>◇</span> Conta local</a>
        <a href="#/integracoes"><span>⚙</span> Integrações locais</a>
        <a class={hub ? 'active' : ''} href="#/hub"><span>◫</span> Hub <small>01</small></a>
        <a class={rota.tela === 'indice' ? 'active' : ''} href="#/indice"><span>⊞</span> Índice <small>12</small></a>
        <a class={rota.tela === 'laboratorio' ? 'active' : ''} href="#/laboratorio"><span>◇</span> Cofre de teste V4 <small>LOCAL</small></a>
        {['Conhecimento', 'Verificação', 'Rede'].map(grupo => <div class="v3-nav-group" key={grupo}>
          <p>{grupo}</p>{MODULOS_V3.filter(m => m.grupo === grupo).map(m => <a key={m.tela} class={rota.tela === m.tela ? 'active' : ''} href={`#/${m.tela}`}><span>{m.simbolo}</span>{m.nome}</a>)}
        </div>)}
      </nav>
      <div class="v3-sidebar-bottom"><span class="v3-led" /> Ambiente local <code>502426c</code><p>Integridade · autoria · evidência</p></div>
    </aside>
    <div class="v3-workspace">
      <header class="v3-topbar"><div>COSMOS <span>/</span> {hub ? 'HUB' : rota.tela === 'laboratorio' ? 'LABORATÓRIO V4' : modulo?.nome ?? 'Índice'}</div><div class="v3-top-actions"><span class="v3-demo-tag">PRÉVIA LOCAL</span><span class="v3-network"><i /> rede não conectada</span><a href="#/backup">↗ Exportar</a></div></header>
      <main class="v3-main">
        {rota.tela === 'laboratorio' ? <LaboratorioV4 /> : hub ? <Hub /> : rota.tela === 'indice' ? <Indice /> : rota.tela === 'cadeia' || rota.tela === 'outras' ? <>
          <div class="v3-heading"><div><p class="v3-eyebrow">REGISTROS HISTÓRICOS · V1</p><h1>Cadeia pessoal<span>.</span></h1><p>Fases originais, sem migração ou alteração de hashes.</p></div><a class="v3-button" href="#/certificados">Conferência de certificados ↗</a></div>
          {rota.tela === 'outras' ? <OutrasFases /> : <CadeiaFases />}
        </> : modulo ? <ModuloPublico modulo={modulo} /> : <Indice />}
      </main>
      <footer class="v3-footer"><span>Σ COSMOS <b>502426c</b></span><span>OTS pendente <i>·</i> âncora externa pendente</span><span><a href="https://github.com/onethink-stack/cosmos/blob/master/LICENCAS.md">AGPL-3.0+ / CC BY 4.0</a></span></footer>
    </div>
  </div>
}
