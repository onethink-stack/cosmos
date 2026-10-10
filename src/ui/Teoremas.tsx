import { useEffect, useState } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import type { FormulaDeNota } from '../dados/premissas'
import { assinatura, useVerificacao } from '../dados/verificacao'
import { limiteTexto } from '../motor/avaliar'
import type { Grupo } from '../motor/motor'
import type { Tarefa } from '../motor/tarefas'
import { ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { LeisQueFaltam } from './LeisQueFaltam'
import { ArvorePassos, formulasDosGrupos, ModeloVisual } from './ResultadoVerificacao'

const idDe = (f: FormulaDeNota) => `${f.notaId}:${f.indice}`

/** Confere se cada fórmula das notas de teorema segue das leis e fatos ativos. */
export function Teoremas({ teoremas, geral, pronto }: { teoremas: FormulaDeNota[]; geral: Tarefa; pronto: boolean }) {
  const est = useEstado()
  const ver = useVerificacao()
  const ocupado = ver.ocupado === 'teoremas'
  const notasTeorema = est.notas.filter((n) => n.compartimento === 'teorema' && n.ativa)
  const semFormula = notasTeorema.filter((n) => !n.formulas.some((f) => f.trim())).length
  // leis e fatos desativados entram como candidatas na busca da lei que falta
  const inativas: Grupo[] = est.notas
    .filter((n) => !n.ativa && (n.compartimento === 'lei' || n.compartimento === 'fato') && n.formulas.some((f) => f.trim()))
    .map((n) => ({ id: n.id, rotulo: n.titulo || 'Sem título', formulas: n.formulas.filter((f) => f.trim()) }))
  // depois de aprovar uma lei, confere os teoremas de novo (com as notas já atualizadas)
  const [reconferir, setReconferir] = useState(false)
  useEffect(() => {
    if (reconferir && pronto && !ver.ocupado && teoremas.length) {
      setReconferir(false)
      conferir()
    }
  })
  if (!notasTeorema.length) return null

  const titulo = (id: string) => est.notas.find((n) => n.id === id)?.titulo || 'Sem título'
  const conferir = () =>
    ver.conferirTeoremas(
      geral,
      teoremas.map((t) => ({ id: idDe(t), formula: t.texto })),
      est.dicionario,
    )

  return (
    <section class="teoremas">
      <h2>Teoremas</h2>
      <p class="suave">
        Notas de teorema não são premissas: aqui o app confere se cada fórmula delas segue das leis e fatos ativos.
        {semFormula > 0 && ` ${semFormula} nota${semFormula > 1 ? 's' : ''} de teorema só com texto (sem fórmula) não entra${semFormula > 1 ? 'm' : ''} na conferência.`}
      </p>
      <div class="barra-acoes">
        {ocupado ? (
          <>
            <span class="girando" aria-hidden="true" />
            <span class="suave" aria-live="polite">
              {ver.rodando?.msg ?? 'conferindo'}…
            </span>
            <button type="button" onClick={() => ver.cancelar()}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" class="primario" disabled={!pronto || !teoremas.length || !!ver.ocupado} onClick={conferir}>
            Conferir {teoremas.length} teorema{teoremas.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {ver.erroTeoremas && <p class="erro-texto">Falha no motor: {ver.erroTeoremas}</p>}

      <ul class="lista-teoremas">
        {teoremas.map((t) => {
          const r = ver.teoremas.get(idDe(t))
          const desatualizado = !!r && r.assinatura !== assinatura(geral, est.dicionario, ver.limites, t.texto)
          const res = r?.resultado
          const classe = res ? (res.tipo === 'segue' ? 'segue' : res.tipo === 'contradiz' ? 'contradiz' : res.tipo === 'nao-segue' ? 'nao-segue' : '') : ''
          return (
            <li class={classe}>
              <a href={`#/nota/${encodeURIComponent(t.notaId)}`}>{titulo(t.notaId)}</a>
              <div class="formula-inline">{t.texto}</div>
              {!res ? (
                <div class="suave">ainda não conferido</div>
              ) : (
                <>
                  {res.tipo === 'segue' && (
                    <div>
                      <span class="estado-teorema">✓ Segue</span>{' '}
                      {res.notas.length ? (
                        <span class="suave">
                          de{' '}
                          {res.notas.map((id, k) => (
                            <>
                              {k > 0 && ', '}
                              <a href={`#/nota/${encodeURIComponent(id)}`}>{titulo(id)}</a>
                            </>
                          ))}{' '}
                          (cenários até {limiteTexto(res.N, res.K)})
                        </span>
                      ) : (
                        <span class="suave">sempre, sem depender de nota</span>
                      )}
                      {!desatualizado && <ConfirmacaoZ3 tipo="segue" formulas={formulasDosGrupos(geral.grupos, res.notas)} negar={t.texto} />}
                    </div>
                  )}
                  {res.tipo === 'nao-segue' && (
                    <div>
                      <span class="estado-teorema erro-texto">✗ Não segue das leis e fatos</span>
                      <p class="suave">Há um cenário em que todas as leis e fatos valem e esta fórmula falha:</p>
                      <ArvorePassos p={res.mundo.passos} />
                      <details class="explicacao">
                        <summary>Ver esse cenário</summary>
                        <ModeloVisual m={res.mundo.modelo} />
                      </details>
                      {!desatualizado && <ConfirmacaoZ3 tipo="segue" formulas={formulasDosGrupos(geral.grupos)} negar={t.texto} />}
                      {!desatualizado && (
                        <LeisQueFaltam t={t} id={idDe(t)} geral={geral} inativas={inativas} pronto={pronto} onAprovada={() => setReconferir(true)} />
                      )}
                    </div>
                  )}
                  {res.tipo === 'contradiz' && (
                    <div>
                      <span class="estado-teorema erro-texto">✗ As leis e fatos contradizem este teorema</span>
                      <p class="suave">
                        Notas responsáveis:{' '}
                        {res.notas.map((id, k) => (
                          <>
                            {k > 0 && ', '}
                            <a href={`#/nota/${encodeURIComponent(id)}`}>{titulo(id)}</a>
                          </>
                        ))}
                      </p>
                    </div>
                  )}
                  {res.tipo === 'premissas-contraditorias' && <div class="erro-texto">As leis e fatos já se contradizem: resolva isso primeiro.</div>}
                  {res.tipo === 'grande-demais' && <div class="aviso-texto">Grande demais para o motor finito (o Z3, se ligado, pode decidir).</div>}
                  {res.tipo === 'formula-invalida' && <div class="erro-texto">Fórmula inválida.</div>}
                  <div class="suave res-meta">
                    {r!.ms < 1000 ? `${r!.ms} ms` : `${(r!.ms / 1000).toFixed(1)} s`}
                    {desatualizado && <span class="selo aviso"> desatualizado — as notas mudaram</span>}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
