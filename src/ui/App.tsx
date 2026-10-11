import { useEffect } from 'preact/hooks'
import { corrigirNotasDasBibliotecas } from '../dados/correcoes'
import { estado, useEstado } from '../dados/estado'
import { useVersao } from '../dados/versao'
import { verificacao } from '../dados/verificacao'
import { z3 } from '../dados/z3'
import { Backup } from './Backup'
import { Cadeia } from './Cadeia'
import { Dicionario } from './Dicionario'
import { EditorNota } from './EditorNota'
import { LembreteBackup } from './LembreteBackup'
import { ListaNotas } from './ListaNotas'
import { Modelo } from './Modelo'
import { Mundo } from './Mundo'
import { PainelContradicoes } from './PainelContradicoes'
import { useRota } from './rotas'
import { AvisosNaTela, MotorOcupado } from './SegundoPlano'
import { Sistemas } from './Sistemas'

export function App() {
  const est = useEstado()
  const ver = useVersao()
  const rota = useRota()
  useEffect(() => {
    // depois de carregar: notas das bibliotecas com o defeito de escopo (já corrigido) são consertadas
    void estado.carregar().then(() => corrigirNotasDasBibliotecas())
    void verificacao.carregarConfig()
    void z3.carregarConfig()
    void z3.carregarGuardados()
  }, [])

  const aba = rota.tela === 'nota' || rota.tela === 'nova' || rota.tela === 'sistemas' ? 'notas' : rota.tela === 'modelo' ? 'cadeia' : rota.tela

  return (
    <>
      <header class="topo">
        <div class="topo-dentro">
          <a href="#/notas" class="marca">
            Caderno Lógico
          </a>
          <MotorOcupado />
          <a href="#/backup" class={`link-backup${aba === 'backup' ? ' ativo' : ''}`}>
            Offline · Backup
          </a>
          <nav>
            <a href="#/notas" class={aba === 'notas' ? 'ativo' : ''}>
              Notas
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
          </nav>
        </div>
      </header>
      <AvisosNaTela />
      <main>
        {est.erroBanco && <div class="faixa-erro">{est.erroBanco}</div>}
        {ver.nova && (
          <div class="faixa-versao">
            Há uma versão nova do Caderno. <button type="button" onClick={() => location.reload()}>Atualizar agora</button>
          </div>
        )}
        {rota.tela !== 'backup' && <LembreteBackup />}
        {!est.carregado ? (
          <p class="suave">Carregando…</p>
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
          <Cadeia />
        ) : rota.tela === 'modelo' ? (
          <Modelo />
        ) : rota.tela === 'mundo' ? (
          <Mundo />
        ) : (
          <PainelContradicoes />
        )}
      </main>
    </>
  )
}
