import { useEffect } from 'preact/hooks'
import { estado, useEstado } from '../dados/estado'
import { carregarSistema, sistema } from '../dados/sistemas'
import { verificacao } from '../dados/verificacao'
import { z3 } from '../dados/z3'
import { Backup } from './Backup'
import { Dicionario } from './Dicionario'
import { EditorNota } from './EditorNota'
import { LembreteBackup } from './LembreteBackup'
import { ListaNotas } from './ListaNotas'
import { PainelContradicoes } from './PainelContradicoes'
import { useRota } from './rotas'
import { Sistemas } from './Sistemas'

/** Caderno novo: carrega o sistema pronto escolhido como padrão. */
async function iniciar() {
  await estado.carregar()
  if (estado.primeiraVez && !estado.notas.length) {
    const s = sistema(estado.sistemaPadrao)
    if (s) await carregarSistema(s)
  }
}

export function App() {
  const est = useEstado()
  const rota = useRota()
  useEffect(() => {
    void iniciar()
    void verificacao.carregarConfig()
    void z3.carregarConfig()
  }, [])

  const aba = rota.tela === 'nota' || rota.tela === 'nova' || rota.tela === 'sistemas' ? 'notas' : rota.tela

  return (
    <>
      <header class="topo">
        <div class="topo-dentro">
          <a href="#/notas" class="marca">
            Caderno Lógico
          </a>
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
          </nav>
        </div>
      </header>
      <main>
        {est.erroBanco && <div class="faixa-erro">{est.erroBanco}</div>}
        {rota.tela !== 'backup' && <LembreteBackup />}
        {!est.carregado ? (
          <p class="suave">Carregando…</p>
        ) : rota.tela === 'notas' ? (
          <ListaNotas />
        ) : rota.tela === 'nota' ? (
          <EditorNota key={rota.id} id={rota.id} />
        ) : rota.tela === 'nova' ? (
          <EditorNota key={`nova-${rota.compartimento}`} compartimento={rota.compartimento} />
        ) : rota.tela === 'dicionario' ? (
          <Dicionario />
        ) : rota.tela === 'backup' ? (
          <Backup />
        ) : rota.tela === 'sistemas' ? (
          <Sistemas />
        ) : (
          <PainelContradicoes />
        )}
      </main>
    </>
  )
}
