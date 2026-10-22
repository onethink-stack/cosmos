import { CadeiaFases } from './Inicio'
import { OutrasFases } from './OutrasFases'
import { useRota } from './rotas'
import { VOCAB_COSMOS } from '../dados/vocabularioCosmos'

/** Entrada isolada: sem banco de notas, bibliotecas de axiomas ou motor Z3. */
export function CosmosApp() {
  const rota = useRota()
  return (
    <>
      <header class="topo"><div class="topo-dentro">
        <a href="#/cadeia" class="marca" aria-label="Cosmos 502426c"><span class="marca-nome">COSMOS</span></a>
        <div class="cosmos-acessos">
          {rota.tela === 'cadeia' && <span class="cosmos-selo-discreto">selo {VOCAB_COSMOS.selo}</span>}
          <nav class="cosmos-navegacao" aria-label="Navegação"><a href="#/cadeia">F0–F4</a> · <a href="#/outras">F5–F8</a> · <a href="#/notas">Notas</a></nav>
        </div>
      </div></header>
      <main>{rota.tela === 'outras' ? <OutrasFases /> : <CadeiaFases />}</main>
      <footer class="rodape">COSMOS · Cadeia F0–F8 · {!__MODO_ARQUIVO__ && <><a href="./cosmos-502426c.json" download>Baixar F0–F8 assinadas</a> · </>}<a href="https://github.com/onethink-stack/cosmos">Código-fonte · AGPL-3.0 ou posterior</a></footer>
    </>
  )
}
