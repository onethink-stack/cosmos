import { estado } from '../dados/estado'
import type { GrauHerdado } from '../dados/grau'

const Nomes = ({ ids }: { ids: string[] }) => (
  <>
    {ids.map((id, k) => (
      <>
        {k > 0 && (k === ids.length - 1 ? ' e ' : ', ')}
        <a href={`#/nota/${encodeURIComponent(id)}`}>{estado.nota(id)?.titulo || 'Sem título'}</a>
      </>
    ))}
  </>
)

/**
 * Grau herdado: F só se tudo de onde vem é estabelecido; senão, diz de quais
 * decisões (D) e mapeamentos não medidos (M) a conclusão depende.
 */
export function SeloGrau({ g }: { g: GrauHerdado }) {
  if (g.grau === 'F') return <div class="grau-herdado g-F">F · estabelecido (tudo de onde vem é estabelecido)</div>
  return (
    <div class={`grau-herdado g-${g.grau}`}>
      {g.grau === 'M' ? 'M · depende de mapeamento não medido' : 'D · depende de decisão'}
      {g.por.M.length > 0 && (
        <>
          {' '}
          — não medido: <Nomes ids={g.por.M} />
        </>
      )}
      {g.por.D.length > 0 && (
        <>
          {' '}
          — decisão: <Nomes ids={g.por.D} />
        </>
      )}
    </div>
  )
}
