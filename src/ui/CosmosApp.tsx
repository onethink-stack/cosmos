import { CadeiaFases } from './Inicio'

/** Entrada isolada: sem banco de notas, bibliotecas de axiomas ou motor Z3. */
export function CosmosApp() {
  return (
    <>
      <header class="topo"><div class="topo-dentro">
        <a href="#/inicio" class="marca"><span class="marca-nome">COSMOS</span></a>
        <nav aria-label="Navegação"><a href="#/inicio">Início</a> · <a href="#/notas">Caderno Lógico</a></nav>
      </div></header>
      <main><CadeiaFases /></main>
      <footer class="rodape">COSMOS · Cadeia F0–F4 · <a href="https://github.com/onethink-stack/cosmos">Código-fonte · AGPL-3.0 ou posterior</a></footer>
    </>
  )
}
