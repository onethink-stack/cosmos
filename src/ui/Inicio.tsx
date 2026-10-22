import { useEffect, useState } from 'preact/hooks'
import { PACOTE_COSMOS } from '../dados/pacoteCosmos'
import { conferirElosCosmos, type ConferenciaElosCosmos } from '../motor/elosCosmos'
import { textoCosmos, VerificacaoCosmos } from './VerificacaoCosmos'

const verificacao = conferirElosCosmos(PACOTE_COSMOS, PACOTE_COSMOS.fases)

export function ListaFasesCosmos({ outras = false }: { outras?: boolean }) {
  const [resultado, setResultado] = useState<ConferenciaElosCosmos | null>(null)
  useEffect(() => {
    let ativo = true
    void verificacao.then((conferencia) => { if (ativo) setResultado(conferencia) }).catch(() => {
      if (ativo) setResultado({ verificado: false, detalhe: 'Falha na verificação das assinaturas.', cabeca: null })
    })
    return () => { ativo = false }
  }, [])
  const fases = outras ? PACOTE_COSMOS.fases.slice(5) : PACOTE_COSMOS.fases
  return <section class="cosmos-log" aria-label={outras ? 'Fases F5–F8' : 'Fases F0–F8'}>
    <ol class="cosmos-log-fases">{fases.map((fase) => <li key={fase.id}>
      <details class="cosmos-log-fase">
        <summary>
          <span class="cosmos-log-id">{fase.id}</span>
          <span class="cosmos-log-nome">{fase.pessoa ? `${fase.pessoa} · ${fase.afirmacao}` : fase.afirmacao}{fase.id === 'F8' && ' · pendente'}</span>
          <span class={resultado?.verificado ? 'cosmos-log-ok' : 'cosmos-log-pendente'} role="status" title={resultado?.detalhe}>
            {resultado ? resultado.verificado ? '✓ verificada' : '✕ não verificada' : 'verificando…'}
          </span>
          <code class="cosmos-log-hash" title={fase.id === 'F8' ? PACOTE_COSMOS.resumo_final : fase.hash_teoria}>
            {(fase.id === 'F8' ? PACOTE_COSMOS.resumo_final : fase.hash_teoria).slice(0, 8)}
          </code>
        </summary>
        <div class="cosmos-log-detalhes cadeia-campos">
          <dl>{Object.entries(fase).map(([campo, valor]) => <div key={campo}><dt>{campo}</dt><dd>{textoCosmos(valor)}</dd></div>)}</dl>
          <VerificacaoCosmos fase={fase} />
        </div>
      </details>
    </li>)}</ol>
  </section>
}

export function CadeiaFases() {
  return <ListaFasesCosmos />
}

export function Inicio() {
  return <CadeiaFases />
}
