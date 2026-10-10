import { useEffect, useState } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import type { FormulaDeNota } from '../dados/premissas'
import { assinatura, useVerificacao } from '../dados/verificacao'
import { limiteTexto } from '../motor/avaliar'
import { inativasDoContexto } from '../dados/cadeia'
import { tarefaDoContexto, type Tarefa } from '../motor/tarefas'
import { ConferenciaNumerica, ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { LeisQueFaltam } from './LeisQueFaltam'
import { SeloGrau } from './SeloGrau'
import { grauHerdado } from '../dados/grau'
import { ArvorePassos, formulasDosGrupos, ModeloVisual } from './ResultadoVerificacao'

const idDe = (f: FormulaDeNota) => `${f.notaId}:${f.indice}`

/** Confere se cada fórmula das notas de teorema segue das leis e fatos ativos (ou da visão do titular). */
export function Teoremas({ teoremas, tarefas, pronto }: { teoremas: FormulaDeNota[]; tarefas: Tarefa[]; pronto: boolean }) {
  const est = useEstado()
  const ver = useVerificacao()
  const ocupado = ver.ocupado === 'teoremas'
  const notasTeorema = est.notas.filter((n) => n.compartimento === 'teorema' && n.ativa)
  const semFormula = notasTeorema.filter((n) => !n.formulas.some((f) => f.trim())).length
  const tarefaDe = (t: FormulaDeNota) => tarefaDoContexto(tarefas, t.contexto ?? 'geral')
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
  const conferir = () => {
    const usadas = new Map(teoremas.map((t) => [t.contexto ?? 'geral', tarefaDe(t)]))
    ver.conferirTeoremas(
      [...usadas.values()],
      teoremas.map((t) => ({ id: idDe(t), formula: t.texto, contexto: t.contexto ?? 'geral' })),
      est.dicionario,
    )
  }

  return (
    <section class="teoremas">
      <h2>Teoremas</h2>
      <p class="suave">
        Notas de teorema não são premissas: aqui o app confere se cada fórmula delas segue das leis e fatos ativos (ou, se a nota tem
        titular, da visão desse titular). Para bater tudo com tudo, use a <a href="#/cadeia">Reação em cadeia</a>.
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
          const geral = tarefaDe(t)
          const r = ver.teoremas.get(idDe(t))
          const desatualizado = !!r && r.assinatura !== assinatura(geral, est.dicionario, ver.limites, t.texto)
          const res = r?.resultado
          const classe = res ? (res.tipo === 'segue' ? 'segue' : res.tipo === 'contradiz' ? 'contradiz' : res.tipo === 'nao-segue' ? 'nao-segue' : '') : ''
          return (
            <li class={classe}>
              <a href={`#/nota/${encodeURIComponent(t.notaId)}`}>{titulo(t.notaId)}</a>
              {geral.chave !== 'geral' && <span class="selo">contra a {geral.rotulo.toLowerCase()}</span>}
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
                      {geral.chave === 'geral' && <SeloGrau g={grauHerdado(res.notas, est.notas)} />}
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
                        <LeisQueFaltam
                          t={t}
                          id={idDe(t)}
                          geral={geral}
                          inativas={inativasDoContexto(est.notas, geral.chave)}
                          pronto={pronto}
                          onAprovada={() => setReconferir(true)}
                        />
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
                  {res.tipo === 'aritmetica' && (
                    <div>
                      <span class="estado-teorema">🔢 Com números</span> <span class="suave">— conferido pelo Z3</span>
                      {!desatualizado && (
                        <ConferenciaNumerica grupos={geral.grupos} formula={t.texto} inativas={inativasDoContexto(est.notas, geral.chave)} />
                      )}
                    </div>
                  )}
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
