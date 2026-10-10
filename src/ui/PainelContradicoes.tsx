import { useMemo } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { preparar } from '../dados/premissas'
import { assinatura, K_MAXIMO, montarTarefas, N_MAXIMO, useVerificacao } from '../dados/verificacao'
import { ConfirmarNomes } from './ConfirmarNomes'
import { FormulaExibida } from './FormulaExibida'
import { useZ3 } from '../dados/z3'
import { Descobrir } from './Descobrir'
import { Perguntar } from './Perguntar'
import { ResultadoVerificacao } from './ResultadoVerificacao'

export function PainelContradicoes() {
  const est = useEstado()
  const ver = useVerificacao()
  const p = useMemo(() => preparar(est.notas, est.dicionario), [est.notas, est.dicionario])
  const { tarefas } = useMemo(() => montarTarefas(est.notas, est.dicionario), [est.notas, est.dicionario])

  const rodar = () => {
    ver.esquecer(tarefas.map((t) => t.chave))
    ver.iniciar(tarefas, est.dicionario)
  }

  return (
    <section>
      <h2>Premissas</h2>
      <p>
        {p.premissas.length} fórmula{p.premissas.length === 1 ? '' : 's'} de notas ativas em <b>Lei</b> e <b>Fato</b>.
        {p.visoes.size > 0 && (
          <>
            {' '}
            Visões de mundo ({[...p.visoes.keys()].join(', ')}) são checadas à parte, cada titular como conjunto próprio — nunca como premissas
            gerais.
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

      {!p.pronto && (
        <>
          <h2>Nomes sem ficha</h2>
          <ConfirmarNomes propostas={p.semFicha} />
        </>
      )}

      <h2>Motor de contradição</h2>
      <div class="barra-acoes">
        <label class="aridade">
          N (máx. de objetos)
          <input type="number" min={1} max={N_MAXIMO} value={ver.N} onChange={(e) => ver.definirN(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label class="aridade" title="Usado só quando há □, ◇ ou B[…]">
          Mundos (modal)
          <input type="number" min={1} max={K_MAXIMO} value={ver.K} onChange={(e) => ver.definirK(Number((e.target as HTMLInputElement).value))} />
        </label>
        {ver.ocupado === 'verificar' ? (
          <button type="button" onClick={() => ver.cancelar()}>
            Cancelar
          </button>
        ) : (
          <button type="button" class="primario" disabled={!p.pronto} onClick={rodar}>
            Verificar tudo
          </button>
        )}
      </div>
      <AlternarZ3 />
      {!p.pronto && <p class="erro-texto">O motor só roda depois que todos os nomes acima tiverem ficha confirmada.</p>}
      <p class="suave">
        Método da versão 1: procura um modelo com 1, 2, … até N objetos. Achar um modelo prova que as fórmulas são compatíveis. Não achar até N
        indica provável contradição, mas não é prova absoluta.
      </p>

      {ver.ocupado === 'verificar' && ver.rodando && (
        <div class="resultado res-rodando" aria-live="polite">
          <span class="girando" aria-hidden="true" /> {tarefas.find((t) => t.chave === ver.rodando!.chave)?.rotulo}: {ver.rodando.msg}…
        </div>
      )}

      {tarefas.map((t) => {
        const r = ver.resultados.get(t.chave)
        if (!r) return null
        return (
          <>
            <h3>{t.rotulo}</h3>
            <ResultadoVerificacao
              r={r}
              notas={est.notas}
              grupos={t.grupos}
              desatualizado={r.assinatura !== assinatura(t, est.dicionario, ver.limites)}
            />
          </>
        )
      })}

      <Perguntar tarefas={tarefas} pronto={p.pronto} />
      <Descobrir tarefas={tarefas} pronto={p.pronto} />
    </section>
  )
}

function AlternarZ3() {
  const z = useZ3()
  if (__MODO_ARQUIVO__) return null
  return (
    <p class="linha-z3">
      <label class="alternar">
        <input type="checkbox" checked={z.ativo} onChange={() => z.definirAtivo(!z.ativo)} />
        Confirmar com o Z3 (prova sem limite de tamanho)
      </label>{' '}
      <a href="#/backup" class="suave">
        {z.guardado ? 'guardado no aparelho' : 'baixar para usar offline'}
      </a>
    </p>
  )
}
