import { useMemo } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { preparar } from '../dados/premissas'
import { ConfirmarNomes } from './ConfirmarNomes'
import { FormulaExibida } from './FormulaExibida'

export function PainelContradicoes() {
  const est = useEstado()
  const p = useMemo(() => preparar(est.notas, est.dicionario), [est.notas, est.dicionario])

  return (
    <section>
      <h2>Premissas</h2>
      <p>
        {p.premissas.length} fórmula{p.premissas.length === 1 ? '' : 's'} de notas ativas em <b>Lei</b> e <b>Fato</b>.
        {p.visoes.size > 0 && (
          <>
            {' '}
            Visões de mundo ({[...p.visoes.keys()].join(', ')}) são checadas à parte, cada titular por si.
          </>
        )}
      </p>

      {p.comErro.length > 0 && (
        <>
          <h2>Fórmulas com erro (ficam de fora)</h2>
          <ul class="lista-simples">
            {p.comErro.map((f) => (
              <li>
                <a href={`#/nota/${encodeURIComponent(f.notaId)}`}>{f.titulo || 'Sem título'}</a>
                <FormulaExibida texto={f.texto} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Nomes sem ficha</h2>
      <ConfirmarNomes propostas={p.semFicha} />

      <h2>Motor de contradição</h2>
      {p.pronto ? (
        <p class="suave">Todos os nomes estão confirmados. O motor de contradição chega na etapa 4.</p>
      ) : (
        <p class="erro-texto">O motor só roda depois que todos os nomes acima tiverem ficha confirmada.</p>
      )}
    </section>
  )
}
