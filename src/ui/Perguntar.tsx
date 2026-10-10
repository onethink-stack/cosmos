import { useMemo, useState } from 'preact/hooks'
import { salvarDeduzida } from '../dados/deduzida'
import { estado, useEstado } from '../dados/estado'
import type { Nota } from '../dados/tipos'
import { assinatura, useVerificacao, type ResultadoDaPergunta } from '../dados/verificacao'
import type { Diag } from '../logica/ast'
import { validar } from '../logica/validador'
import type { Tarefa } from '../motor/tarefas'
import { EditorFormulas } from './EditorFormulas'
import { FormulaExibida } from './FormulaExibida'
import { limiteTexto, tamanhoTexto } from '../motor/avaliar'
import type { Grupo } from '../motor/motor'
import { ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { ArvorePassos, formulasDosGrupos, ModeloVisual } from './ResultadoVerificacao'

// mantém o que foi digitado ao trocar de tela
let formulaSalva = ''
let chaveSalva = 'geral'

export function Perguntar({ tarefas, pronto }: { tarefas: Tarefa[]; pronto: boolean }) {
  const est = useEstado()
  const ver = useVerificacao()
  const [formula, setFormulaLocal] = useState(formulaSalva)
  const [chave, setChaveLocal] = useState(tarefas.some((t) => t.chave === chaveSalva) ? chaveSalva : 'geral')
  const setFormula = (f: string) => setFormulaLocal((formulaSalva = f))
  const setChave = (c: string) => setChaveLocal((chaveSalva = c))

  const tarefa = tarefas.find((t) => t.chave === chave) ?? tarefas[0]
  const v = useMemo(() => validar(formula, est.dicionario, { exigirFichas: true }), [formula, est.dicionario])
  const semFicha = v.diags.some((d) => d.codigo === 'E12' || d.codigo === 'E13')
  const podePerguntar = pronto && !!formula.trim() && v.ok && !!v.ast && !semFicha && !ver.perguntando

  const criarFicha = async (f: NonNullable<Diag['ficha']>) => {
    if (estado.dicionario.some((e) => e.simbolo === f.simbolo)) return
    await estado.salvarEntradas({ id: '', termo: f.simbolo, simbolo: f.simbolo, tipo: f.tipo, aridade: f.aridade, definicao: '' })
  }

  const perguntar = () => {
    if (podePerguntar && tarefa) ver.perguntar(tarefa, formula.trim(), est.dicionario)
  }

  const r = ver.pergunta
  const tarefaDoResultado = r && tarefas.find((t) => t.chave === r.chave)
  const desatualizado = !!r && (!tarefaDoResultado || r.assinatura !== assinatura(tarefaDoResultado, est.dicionario, ver.limites, r.formula))

  return (
    <section class="perguntar">
      <h2>Perguntar</h2>
      <p class="suave">Escreva uma fórmula e veja se ela segue das suas notas ativas, se é contradita por elas, ou nenhum dos dois.</p>

      {tarefas.length > 1 && (
        <label class="campo-rotulo">
          Perguntar a partir de
          <select value={tarefa?.chave} onChange={(e) => setChave((e.target as HTMLSelectElement).value)}>
            {tarefas.map((t) => (
              <option value={t.chave}>{t.rotulo}</option>
            ))}
          </select>
        </label>
      )}

      <EditorFormulas
        formulas={[formula]}
        onChange={([f]) => setFormula(f ?? '')}
        dicionario={est.dicionario}
        onCriarFicha={criarFicha}
        unica={{ rotulo: 'Fórmula da pergunta', onEnter: perguntar }}
      />

      <div class="barra-acoes">
        {ver.perguntando ? (
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
          <button type="button" class="primario" disabled={(!!ver.ocupado && ver.ocupado !== 'perguntar') || !podePerguntar} onClick={perguntar}>
            Segue das notas?
          </button>
        )}
      </div>
      {!pronto && <p class="erro-texto">Confirme os nomes sem ficha (acima) antes de perguntar.</p>}
      {pronto && semFicha && <p class="aviso-texto">A pergunta usa nomes sem ficha no dicionário. Crie a ficha ou corrija o nome.</p>}

      {r && !ver.perguntando && (
        <RespostaPergunta r={r} notas={est.notas} desatualizado={desatualizado} grupos={tarefaDoResultado?.grupos ?? []} />
      )}
    </section>
  )
}

function RespostaPergunta({
  r,
  notas,
  desatualizado,
  grupos,
}: {
  r: ResultadoDaPergunta
  notas: Nota[]
  desatualizado: boolean
  grupos: Grupo[]
}) {
  const [salva, setSalva] = useState<string | null>(null)
  const titulo = (id: string) => notas.find((n) => n.id === id)
  const listaNotas = (ids: string[]) => (
    <ul class="lista-conflito">
      {ids
        .map(titulo)
        .filter((n): n is Nota => !!n)
        .map((n) => (
          <li>
            <a href={`#/nota/${encodeURIComponent(n.id)}`}>{n.titulo || 'Sem título'}</a>
            {n.formulas
              .filter((f) => f.trim())
              .map((f) => (
                <FormulaExibida texto={f} />
              ))}
          </li>
        ))}
    </ul>
  )
  const meta = (
    <div class="suave res-meta">
      {r.rotulo} · N = {r.N}
      {r.ms > 0 && ` · ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}`}
      {desatualizado && <span class="selo aviso"> desatualizado — as notas mudaram</span>}
    </div>
  )
  const cabeca = (
    <p>
      <span class="formula-inline">{r.formula}</span>
    </p>
  )

  const salvarComoNota = async (ids: string[]) => {
    const nova = await salvarDeduzida(r.formula, r.chave, ids, r.N)
    setSalva(nova.id)
  }

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
    case 'segue':
      return (
        <div class="resultado res-ok">
          <strong>✓ Segue{res.notas.length ? ' das suas notas' : ' sempre'}</strong>
          {cabeca}
          {res.notas.length ? (
            <>
              <p>
                Em todo cenário com até {limiteTexto(res.N, res.K)} onde estas notas valem, a fórmula também vale. Notas necessárias ({res.notas.length}) — sem
                qualquer uma delas, deixa de seguir:
              </p>
              {listaNotas(res.notas)}
            </>
          ) : (
            <p>Vale em todo cenário com até {limiteTexto(res.N, res.K)}, sem depender de nenhuma nota.</p>
          )}
          <p class="suave">Não é prova absoluta: um cenário maior ainda poderia ser exceção. O Z3 pode provar de vez.</p>
          {!desatualizado && <ConfirmacaoZ3 tipo="segue" formulas={formulasDosGrupos(grupos, res.notas)} negar={r.formula} />}
          {res.notas.length > 0 &&
            (salva ? (
              <p class="status-ok">
                ✓ Nota criada. <a href={`#/nota/${encodeURIComponent(salva)}`}>Abrir</a>
              </p>
            ) : (
              <button type="button" onClick={() => salvarComoNota(res.notas)}>
                Salvar como nota
              </button>
            ))}
          {meta}
        </div>
      )
    case 'contradiz':
      return (
        <div class="resultado res-conflito">
          <strong>✗ Suas notas contradizem esta fórmula</strong>
          {cabeca}
          <p>Em nenhum cenário com até {limiteTexto(res.N, res.K)} as notas valem junto com ela: segue a negação. Notas responsáveis:</p>
          {listaNotas(res.notas)}
          {!desatualizado && <ConfirmacaoZ3 tipo="contradiz" formulas={[...formulasDosGrupos(grupos, res.notas), r.formula]} />}
          <details class="explicacao">
            <summary>Ver um cenário das suas notas, onde ela falha</summary>
            <ArvorePassos p={res.mundo.passos} />
            <ModeloVisual m={res.mundo.modelo} />
          </details>
          {meta}
        </div>
      )
    case 'nao-segue':
      return (
        <div class="resultado res-aviso">
          <strong>Não segue</strong>
          {cabeca}
          <p>
            Há um cenário com {tamanhoTexto(res.mundo.n, res.mundo.modelo.mundos)} onde todas as suas notas valem e a fórmula falha. E ela também não é
            contradita: as notas não decidem a questão.
          </p>
          <ArvorePassos p={res.mundo.passos} />
          <details class="explicacao">
            <summary>Ver esse cenário</summary>
            <ModeloVisual m={res.mundo.modelo} />
          </details>
          {meta}
        </div>
      )
    case 'premissas-contraditorias':
      return (
        <div class="resultado res-conflito">
          <strong>As notas já se contradizem</strong>
          {cabeca}
          <p>
            Este conjunto não tem modelo até {res.N} objetos. Com notas contraditórias, qualquer fórmula "seguiria" — a resposta não diria nada.
            Resolva o conflito primeiro (botão "Verificar tudo", acima).
          </p>
          {meta}
        </div>
      )
    case 'grande-demais':
      return (
        <div class="resultado res-aviso">
          <strong>Grande demais para a versão 1</strong>
          <p>Com {res.n} objetos o problema passou do limite de tamanho. Diminua N ou simplifique a pergunta.</p>
          {meta}
        </div>
      )
    case 'formula-invalida':
      return (
        <div class="resultado res-erro">
          <strong>Fórmula inválida</strong>
          {meta}
        </div>
      )
  }
}
