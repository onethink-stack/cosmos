import { useState } from 'preact/hooks'
import { salvarDeduzida } from '../dados/deduzida'
import { useEstado } from '../dados/estado'
import type { Nota } from '../dados/tipos'
import { assinatura, useVerificacao, type ResultadoDaDescoberta } from '../dados/verificacao'
import { limiteTexto } from '../motor/avaliar'
import type { Grupo } from '../motor/motor'
import { ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { formulasDosGrupos } from './ResultadoVerificacao'
import type { Tarefa } from '../motor/tarefas'

let chaveSalva = 'geral'

export function Descobrir({ tarefas, pronto }: { tarefas: Tarefa[]; pronto: boolean }) {
  const est = useEstado()
  const ver = useVerificacao()
  const [chave, setChaveLocal] = useState(tarefas.some((t) => t.chave === chaveSalva) ? chaveSalva : 'geral')
  const setChave = (c: string) => setChaveLocal((chaveSalva = c))
  const tarefa = tarefas.find((t) => t.chave === chave) ?? tarefas[0]
  const ocupado = ver.ocupado === 'descobrir'

  const r = ver.descoberta
  const tarefaDoResultado = r && tarefas.find((t) => t.chave === r.chave)
  const desatualizado = !!r && (!tarefaDoResultado || r.assinatura !== assinatura(tarefaDoResultado, est.dicionario, ver.limites))

  return (
    <section class="descobrir">
      <h2>Descobrir consequências</h2>
      <p class="suave">
        Procura consequências simples das notas ativas: igualdades e diferenças entre constantes, quem pertence a quem, inclusões, "não é vazio",
        predicados e valores de função. Fórmulas gerais (com quantificadores) continuam sendo uma pergunta, acima.
      </p>
      {tarefas.length > 1 && (
        <label class="campo-rotulo">
          A partir de
          <select value={tarefa?.chave} onChange={(e) => setChave((e.target as HTMLSelectElement).value)}>
            {tarefas.map((t) => (
              <option value={t.chave}>{t.rotulo}</option>
            ))}
          </select>
        </label>
      )}
      <div class="barra-acoes">
        {ocupado ? (
          <>
            <span class="girando" aria-hidden="true" />
            <span class="suave" aria-live="polite">
              {ver.rodando?.msg ?? 'pensando'}…
            </span>
            <button type="button" onClick={() => ver.cancelar()}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" class="primario" disabled={!pronto || !tarefa} onClick={() => tarefa && ver.descobrir(tarefa, est.dicionario)}>
            Descobrir consequências
          </button>
        )}
      </div>
      {!pronto && <p class="erro-texto">Confirme os nomes sem ficha (acima) antes.</p>}
      {r && !ocupado && <ListaDescobertas r={r} notas={est.notas} desatualizado={desatualizado} grupos={tarefaDoResultado?.grupos ?? []} />}
    </section>
  )
}

function ListaDescobertas({
  r,
  notas,
  desatualizado,
  grupos,
}: {
  r: ResultadoDaDescoberta
  notas: Nota[]
  desatualizado: boolean
  grupos: Grupo[]
}) {
  const [salvas, setSalvas] = useState<Record<string, string>>({})
  const meta = (
    <div class="suave res-meta">
      {r.rotulo} · N = {r.N}
      {r.ms > 0 && ` · ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}`}
      {desatualizado && <span class="selo aviso"> desatualizado — as notas mudaram</span>}
    </div>
  )
  if (r.erro)
    return (
      <div class="resultado res-erro">
        <strong>Falha no motor</strong>
        <p>{r.erro}</p>
        {meta}
      </div>
    )
  const res = r.resultado!
  switch (res.tipo) {
    case 'vazio':
      return <p class="suave">Não há fórmulas válidas em notas ativas deste conjunto.</p>
    case 'premissas-contraditorias':
      return (
        <div class="resultado res-conflito">
          <strong>As notas já se contradizem</strong>
          <p>Com notas contraditórias, tudo "seguiria". Resolva o conflito primeiro (botão "Verificar tudo", acima).</p>
          {meta}
        </div>
      )
    case 'grande-demais':
      return (
        <div class="resultado res-aviso">
          <strong>Grande demais para a versão 1</strong>
          <p>Com {res.n} objetos o problema passou do limite de tamanho. Diminua N.</p>
          {meta}
        </div>
      )
    case 'consequencias': {
      const titulo = (id: string) => notas.find((n) => n.id === id)?.titulo || 'Sem título'
      return (
        <div class={`resultado ${res.itens.length ? 'res-ok' : ''}`}>
          <strong>
            {res.itens.length
              ? `${res.itens.length} consequência${res.itens.length > 1 ? 's' : ''} encontrada${res.itens.length > 1 ? 's' : ''}`
              : 'Nenhuma consequência simples nova'}
          </strong>
          <p class="suave">
            Testei {res.testadas} candidata{res.testadas === 1 ? '' : 's'}.
            {res.jaNasNotas > 0 && ` ${res.jaNasNotas} já estava${res.jaNasNotas > 1 ? 'm' : ''} escrita${res.jaNasNotas > 1 ? 's' : ''} nas notas.`}
            {res.incertas > 0 && ` ${res.incertas} ficaram sem resposta (grandes demais).`}
            {res.truncado && ' Havia candidatas demais; só as primeiras foram testadas.'}
          </p>
          {res.itens.length > 0 && (
            <ul class="lista-descobertas">
              {res.itens.map((c) => (
                <li>
                  <div class="formula-inline">{c.formula}</div>
                  <div>{c.descricao}</div>
                  <div class="suave">
                    {c.notas.length ? (
                      <>
                        de{' '}
                        {c.notas.map((id, k) => (
                          <>
                            {k > 0 && ', '}
                            <a href={`#/nota/${encodeURIComponent(id)}`}>{titulo(id)}</a>
                          </>
                        ))}
                      </>
                    ) : (
                      'vale sem depender de nota'
                    )}
                  </div>
                  {!desatualizado && <ConfirmacaoZ3 tipo="segue" formulas={formulasDosGrupos(grupos, c.notas)} negar={c.formula} />}
                  {salvas[c.formula] ? (
                    <span class="status-ok">
                      ✓ <a href={`#/nota/${encodeURIComponent(salvas[c.formula])}`}>Nota criada</a>
                    </span>
                  ) : (
                    <button
                      type="button"
                      class="mini"
                      onClick={async () => {
                        const n = await salvarDeduzida(c.formula, r.chave, c.notas, res.N)
                        setSalvas((s) => ({ ...s, [c.formula]: n.id }))
                      }}
                    >
                      Salvar como nota
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p class="suave">Cada uma vale em todos os cenários com até {limiteTexto(res.N, res.K)} onde as notas valem.</p>
          {meta}
        </div>
      )
    }
  }
}
