import { useEffect, useState } from 'preact/hooks'
import { estado, useEstado } from '../dados/estado'
import { useMotorFundo } from '../dados/motorFundo'
import { salvarVerdade, useVerdades, type Ordem, type Verdade } from '../dados/verdades'
import { MotorNaoEncontrado } from './SegundoPlano'

/** de quanto em quanto tempo a tela pergunta o que o gerador achou */
const ATUALIZAR_A_CADA_MS = 5000

const Nota = ({ id }: { id: string }) => <a href={`#/nota/${encodeURIComponent(id)}`}>{estado.nota(id)?.titulo || 'Sem título'}</a>

const Notas = ({ ids }: { ids: string[] }) => (
  <>
    {ids.map((id, k) => (
      <>
        {k > 0 && (k === ids.length - 1 ? ' e ' : ', ')}
        <Nota id={id} />
      </>
    ))}
  </>
)

const milhares = (n: number) => n.toLocaleString('pt-BR')

/** O banco de verdades: os teoremas que o gerador do motor de fundo prova sem parar. */
export function Verdades() {
  useEstado()
  const v = useVerdades()
  const mf = useMotorFundo()
  const [busca, setBusca] = useState(v.busca)

  useEffect(() => {
    void v.enviar().then(() => v.atualizar())
    const id = setInterval(() => void v.atualizar(), ATUALIZAR_A_CADA_MS)
    return () => clearInterval(id)
  }, [mf.ativo])

  // a busca espera a pessoa parar de digitar
  useEffect(() => {
    if (busca === v.busca) return
    const id = setTimeout(() => v.definirBusca(busca), 400)
    return () => clearTimeout(id)
  }, [busca])

  const g = v.gerador
  return (
    <section class="verdades">
      <h2>Banco de verdades</h2>
      <p class="suave">
        O gerador parte das leis e fatos ativos, prova consequências e usa cada uma para provar outras — uma reação em cadeia que não para. Cada
        teorema aqui <b>vale com qualquer número de objetos</b> (é prova, não busca de cenário) e mostra de quais notas e de quais teoremas
        veio. Guardam-se só os novos e curtos: tautologias, repetições das leis e casos de um teorema mais geral ficam de fora. Se uma lei de
        origem mudar, os teoremas que dependiam dela saem.
      </p>

      {!mf.ativo ? (
        mf.conectado ? (
          <p class="aviso-texto">
            O gerador roda no motor de fundo do PC, que está ligado mas desligado aqui: ligue "Usar o motor de fundo" em Contradições → Capacidade
            do aparelho.
          </p>
        ) : (
          <MotorNaoEncontrado />
        )
      ) : (
        <Andamento g={g} total={v.total} />
      )}

      {mf.ativo && (
        <>
          <div class="verdades-controles">
            <label class="campo-rotulo">
              Ordem
              <select value={v.ordem} onChange={(e) => v.definirOrdem((e.target as HTMLSelectElement).value as Ordem)}>
                <option value="uteis">mais úteis (serviram para provar outros)</option>
                <option value="curtos">mais curtos</option>
                <option value="novos">mais novos</option>
              </select>
            </label>
            <label class="campo-rotulo">
              Buscar
              <input type="search" value={busca} placeholder="ex.: R(a" onInput={(e) => setBusca((e.target as HTMLInputElement).value)} />
            </label>
          </div>
          {v.erro && <p class="erro-texto">{v.erro}</p>}
          {v.itens.length ? (
            <ul class="lista-cadeia">
              {v.itens.map((t) => (
                <Teorema key={t.chave} t={t} />
              ))}
            </ul>
          ) : (
            g?.ligado && <p class="suave">{v.busca ? 'Nenhum teorema com esse trecho.' : 'Nenhum teorema ainda.'}</p>
          )}
          {v.itens.length < v.total && !v.busca && (
            <p class="suave">
              Mostrando {milhares(v.itens.length)} de {milhares(v.total)}. Use a busca para achar os outros.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function Andamento({ g, total }: { g: ReturnType<typeof useVerdades>['gerador']; total: number }) {
  if (!g) return <p class="suave">Perguntando ao motor de fundo…</p>
  if (!g.ligado) return <p class="suave">O gerador começa assim que o Caderno mandar as leis (alguns segundos).</p>
  const a = g.andamento
  return (
    <>
      {g.contradicao && (
        <div class="resultado res-conflito">
          <strong>As leis se contradizem (provado)</strong>
          <p>
            O gerador chegou à contradição a partir de <Notas ids={g.contradicao} />, e isso vale com qualquer número de objetos. Com leis
            contraditórias tudo "seguiria": o gerador parou. Veja o conflito em <a href="#/contradicoes">Contradições</a>.
          </p>
        </div>
      )}
      <p class="status-automatico suave" aria-live="polite">
        <b>Gerador:</b>{' '}
        {g.fim === 'esgotou'
          ? `esgotou — tudo até o tamanho máximo já foi gerado.`
          : g.fim === 'contradicao'
            ? 'parou na contradição.'
            : g.rodando
              ? `gerando${a ? ` (tamanho até ${a.peso}; ${milhares(a.escolhidas)} combinadas, ${milhares(a.esperando)} esperando)` : ''}…`
              : 'parado.'}{' '}
        {milhares(total)} teorema{total === 1 ? '' : 's'} no banco, a partir de {g.leis} lei{g.leis === 1 ? '' : 's'} e fato{g.leis === 1 ? '' : 's'}.
        {g.saturadoAte ? ` Tudo até o tamanho ${g.saturadoAte} já foi gerado.` : ''}
      </p>
      {!!g.ignoradas?.length && (
        <p class="suave">
          Fora do gerador (ele não lê lógica modal nem números; essas o motor finito e o Z3 conferem): <Notas ids={[...new Set(g.ignoradas.map((x) => x.nota))]} />.
        </p>
      )}
    </>
  )
}

function Teorema({ t }: { t: Verdade }) {
  const [salva, setSalva] = useState<string | null>(null)
  return (
    <li class="segue">
      ✓ <span class="formula-inline">{t.formula}</span>
      <div class="suave">
        ⇐ <Notas ids={t.apoio} />
        {t.pais.length > 0 && (
          <>
            {' '}
            · usa {t.pais.length === 1 ? 'o teorema' : 'os teoremas'}{' '}
            {t.pais.map((p, k) => (
              <>
                {k > 0 && '; '}
                <span class="formula-inline">{p.formula}</span>
              </>
            ))}
          </>
        )}
        {t.usos > 0 && ` · serviu para provar ${t.usos} outro${t.usos > 1 ? 's' : ''}`}
      </div>
      {salva ? (
        <span class="status-ok">
          ✓ <a href={`#/nota/${encodeURIComponent(salva)}`}>Nota criada</a>
        </span>
      ) : (
        <button type="button" class="mini" onClick={async () => setSalva((await salvarVerdade(t)).id)}>
          Salvar como nota
        </button>
      )}
    </li>
  )
}
