import { useEffect } from 'preact/hooks'
import { avisos } from '../dados/avisos'
import { conselheiro } from '../dados/conselheiro'
import { corrigirConclusoes, corrigirNotasDasBibliotecas } from '../dados/correcoes'
import { estado, useEstado } from '../dados/estado'
import { historico } from '../dados/historico'
import { perguntas } from '../dados/perguntas'
import { tradutor } from '../dados/tradutor'
import { useVersao } from '../dados/versao'
import { verificacao } from '../dados/verificacao'
import { z3 } from '../dados/z3'
import { Backup } from './Backup'
import { Cadeia } from './Cadeia'
import { Dicionario } from './Dicionario'
import { EditorNota } from './EditorNota'
import { LembreteBackup } from './LembreteBackup'
import { ListaNotas } from './ListaNotas'
import { Historico } from './Historico'
import { Modelo } from './Modelo'
import { Mundo } from './Mundo'
import { PainelContradicoes } from './PainelContradicoes'
import { PerguntarPortugues } from './PerguntarPortugues'
import { Cacar } from './Cacar'
import { useRota } from './rotas'
import { AvisosNaTela, MotorOcupado } from './SegundoPlano'
import { Sistemas } from './Sistemas'
import { Verdades } from './Verdades'
import { Inicio, CadeiaFases } from './Inicio'

export function App() {
  const est = useEstado()
  const ver = useVersao()
  const rota = useRota()
  useEffect(() => {
    // depois de carregar: notas das bibliotecas com o defeito de escopo (já corrigido) são consertadas
    void estado
      .carregar()
      .then(() => corrigirNotasDasBibliotecas())
      .then(() => corrigirConclusoes())
      .then((r) => {
        const partes = [
          r.viraramTeorema && `${r.viraramTeorema} deduzida${r.viraramTeorema > 1 ? 's' : ''} (conferidas só até N objetos) deixaram de ser lei e viraram teorema`,
          r.copiasApagadas && `${r.copiasApagadas} cópia${r.copiasApagadas > 1 ? 's iguais foram apagadas' : ' igual foi apagada'}`,
          r.vindasDeVisao && `${r.vindasDeVisao} lei${r.vindasDeVisao > 1 ? 's gerais' : ' geral'} que vinha${r.vindasDeVisao > 1 ? 'm' : ''} de uma visão foi${r.vindasDeVisao > 1 ? 'ram' : ''} desativada${r.vindasDeVisao > 1 ? 's' : ''}`,
        ].filter(Boolean)
        if (partes.length) avisos.avisar('Caderno consertado', `${partes.join('; ')}. O motivo ficou escrito em cada nota.`, '#/notas')
      })
    void verificacao.carregarConfig()
    void historico.carregar()
    void tradutor.carregarConfig()
    void conselheiro.carregar()
    void perguntas.carregar()
    void z3.carregarConfig()
    void z3.carregarGuardados()
  }, [])

  const aba = rota.tela === 'nota' || rota.tela === 'nova' || rota.tela === 'sistemas' ? 'notas' : rota.tela === 'modelo' ? 'cadeia' : rota.tela

  return (
    <>
      <header class="topo">
        <div class="topo-dentro">
          <a href="#/inicio" class="marca" aria-label="COSMOS — início">
            <span class="marca-nome">COSMOS</span>
          </a>
          <MotorOcupado />
          <details class="indice-cosmos" key={rota.tela}>
          <summary>Índice <span aria-hidden="true">＋</span></summary>
          <nav aria-label="Navegação principal">
            <a href="#/notas" class={aba === 'notas' ? 'ativo' : ''}>
              Premissas · Notas
            </a>
            <a href="#/perguntar" class={aba === 'perguntar' ? 'ativo' : ''}>
              Perguntar
            </a>
            <a href="#/dicionario" class={aba === 'dicionario' ? 'ativo' : ''}>
              Dicionário
            </a>
            <a href="#/contradicoes" class={aba === 'contradicoes' ? 'ativo' : ''}>
              Contradições
            </a>
            <a href="#/cadeia" class={aba === 'cadeia' ? 'ativo' : ''}>
              Cadeia
            </a>
            <a href="#/mundo" class={aba === 'mundo' ? 'ativo' : ''}>
              Mundo
            </a>
            <a href="#/verdades" class={aba === 'verdades' ? 'ativo' : ''}>
              Verdades
            </a>
            <a href="#/cacar" class={aba === 'cacar' ? 'ativo' : ''}>
              Caçar falhas
            </a>
            <a href="#/historico" class={aba === 'historico' ? 'ativo' : ''}>
              Histórico
            </a>
            <a href="#/backup">Offline · Backup</a>
            <a href="#/sistemas">Sistemas prontos</a>
          </nav>
          </details>
        </div>
      </header>
      <AvisosNaTela />
      <main class={rota.tela === 'inicio' ? 'pagina-inicio' : rota.tela === 'notas' ? 'pagina-registros' : ''}>
        {est.erroBanco && <div class="faixa-erro">{est.erroBanco}</div>}
        {ver.nova && (
          <div class="faixa-versao">
            Há uma versão nova do Caderno. <button type="button" onClick={() => location.reload()}>Atualizar agora</button>
          </div>
        )}
        {rota.tela !== 'backup' && <LembreteBackup />}
        {!est.carregado ? (
          <p class="suave">Carregando…</p>
        ) : rota.tela === 'inicio' ? (
          <Inicio />
        ) : rota.tela === 'notas' ? (
          <ListaNotas />
        ) : rota.tela === 'nota' ? (
          <EditorNota key={rota.id} id={rota.id} />
        ) : rota.tela === 'nova' ? (
          <EditorNota key={`nova-${rota.compartimento}-${rota.visita}`} compartimento={rota.compartimento} />
        ) : rota.tela === 'dicionario' ? (
          <Dicionario />
        ) : rota.tela === 'backup' ? (
          <Backup />
        ) : rota.tela === 'sistemas' ? (
          <Sistemas />
        ) : rota.tela === 'cadeia' ? (
          <>
            <CadeiaFases />
            <details class="cadeia-ferramentas">
              <summary>Ferramentas de inferência do Caderno Lógico</summary>
              <Cadeia />
            </details>
          </>
        ) : rota.tela === 'modelo' ? (
          <Modelo />
        ) : rota.tela === 'mundo' ? (
          <Mundo />
        ) : rota.tela === 'historico' ? (
          <Historico />
        ) : rota.tela === 'verdades' ? (
          <Verdades />
        ) : rota.tela === 'perguntar' ? (
          <PerguntarPortugues />
        ) : rota.tela === 'cacar' ? (
          <Cacar key={rota.id ?? ''} id={rota.id} />
        ) : (
          <PainelContradicoes />
        )}
      </main>
      <footer class="rodape">
        Caderno Lógico © 2026 Gustavo Phadua Silva da Costa e os autores do Caderno Lógico. Software livre sob a AGPL-3.0 ou
        posterior, sem nenhuma garantia.{' '}
        <a href="https://github.com/onethink-stack/cosmos" target="_blank" rel="noopener">
          Código-fonte
        </a>{' '}
        ·{' '}
        <a href="https://github.com/onethink-stack/cosmos/blob/master/LICENCAS.md" target="_blank" rel="noopener">
          Licenças
        </a>
      </footer>
    </>
  )
}
