import outras from '../dados/cadeia-outras-F5-F8.json'
import { textoCosmos, VerificacaoCosmos } from './VerificacaoCosmos'

export function OutrasFases() {
  return <section class="cadeia-fases" aria-labelledby="outras-titulo">
    <p class="cadeia-rubrica">COSMOS / PRÓXIMAS ETAPAS</p>
    <h1 id="outras-titulo">Outras fases</h1>
    <p>F5–F8 · etapas adicionais à cadeia F0–F4.</p>
    <p>F6 inicia multi-pessoa; F7 propõe conferir o selo; F8 propõe publicar no IPFS. Nenhum conteúdo foi publicado no IPFS.</p>
    <ol class="cadeia-etapas">{outras.fases.map((fase) => <li key={fase.id} class="cadeia-etapa">
      <div class="cadeia-indice"><span>{fase.id}</span><small>{fase.situacao}</small></div>
      <article><div class="cadeia-etapa-topo"><span>{fase.tipo}</span><span>{fase.estado}</span></div>
        <h2>{fase.afirmacao}</h2><p>{textoCosmos(fase.pessoa)}</p>
        {fase.campo && <p>{textoCosmos(fase.campo)}</p>}
        <details class="cadeia-campos"><summary>Ver os 13 campos <span aria-hidden="true">＋</span></summary>
          <dl>{Object.entries(fase).map(([chave, valor]) => <div key={chave}><dt>{chave}</dt><dd>{textoCosmos(valor)}</dd></div>)}</dl>
          <VerificacaoCosmos fase={fase} />
        </details>
      </article>
    </li>)}</ol>
  </section>
}
