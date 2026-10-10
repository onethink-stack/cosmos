import { useMemo, useState } from 'preact/hooks'
import { foraDaCadeia, formulasDoApoio, inativasDoContexto, pedidoDaCadeia } from '../dados/cadeia'
import { salvarDeduzida } from '../dados/deduzida'
import { grauHerdado, type GrauHerdado } from '../dados/grau'
import { estado, useEstado } from '../dados/estado'
import { usePerfil } from '../dados/perfil'
import { preparar } from '../dados/premissas'
import { assinaturaCadeia, useVerificacao, type RodadaCadeia } from '../dados/verificacao'
import type { EstadoTeorema, PedidoCadeia, RelatorioCadeia } from '../motor/cadeia'
import { limiteTexto, tamanhoTexto } from '../motor/avaliar'
import type { Grupo } from '../motor/motor'
import { ConferenciaNumerica, ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { CartaoLei } from './LeisQueFaltam'
import { SeloGrau } from './SeloGrau'
import { ConfigPerfil, ConfigSegundoPlano } from './SegundoPlano'
import { ArvorePassos, ModeloVisual } from './ResultadoVerificacao'

const NOME_ETAPA: Record<RelatorioCadeia['etapa'], string> = {
  consistencia: 'conferindo a consistência',
  leis: 'batendo as leis umas com as outras',
  teoremas: 'conferindo os teoremas',
  cadeia: 'montando a cadeia',
  juntos: 'conferindo os teoremas entre si',
  lacunas: 'procurando as leis que faltam',
  consequencias: 'procurando consequências novas',
  fim: 'pronto',
}

/** id de nota ("x") ou de teorema ("x:0") → id da nota */
const notaDe = (id: string) => {
  const k = id.lastIndexOf(':')
  return k > 0 && /^\d+$/.test(id.slice(k + 1)) ? id.slice(0, k) : id
}

function Link({ id }: { id: string }) {
  const n = estado.nota(notaDe(id))
  const extra = id !== notaDe(id) && (n?.formulas.filter((f) => f.trim()).length ?? 0) > 1 ? ` (fórmula ${Number(id.slice(id.lastIndexOf(':') + 1)) + 1})` : ''
  return <a href={`#/nota/${encodeURIComponent(notaDe(id))}`}>{(n?.titulo || 'Sem título') + extra}</a>
}

const Links = ({ ids }: { ids: string[] }) => (
  <>
    {ids.map((id, k) => (
      <>
        {k > 0 && (k === ids.length - 1 ? ' e ' : ', ')}
        <Link id={id} />
      </>
    ))}
  </>
)

/** Bate leis, fatos e teoremas uns contra os outros, em rodadas: aprovar uma lei dispara a próxima. */
export function Cadeia() {
  const est = useEstado()
  const ver = useVerificacao()
  const p = useMemo(() => preparar(est.notas, est.dicionario), [est.notas, est.dicionario])
  const pedido = useMemo(() => pedidoDaCadeia(est.notas, est.dicionario), [est.notas, est.dicionario])
  const fora = useMemo(() => foraDaCadeia(est.notas, est.dicionario), [est.notas, est.dicionario])
  const ocupado = ver.ocupado === 'cadeia'
  const pf = usePerfil()
  const atual = ver.rodadas.at(-1)
  const desatualizada = !!atual && atual.assinatura !== assinaturaCadeia(pedido, est.dicionario)

  const nada = !pedido.contextos.length
  return (
    <section class="cadeia">
      <h2>Reação em cadeia</h2>
      <p class="suave">
        O app bate cada lei, fato e teorema contra os outros: confere se as leis são consistentes e se cada uma é independente ou decorre das
        outras; quais teoremas seguem e de quais outros teoremas (a cadeia, geração por geração); se os que não seguem se contradizem; que leis
        fechariam o que falta; e que consequências novas aparecem. Ao aprovar uma lei sugerida, a reação continua sozinha numa nova rodada —
        mesmo que você vá para outra tela.
      </p>
      <ConfigPerfil />
      <ConfigSegundoPlano />
      {ver.interrompida && !ver.ocupado && (
        <div class="interrompida">
          A rodada {ver.interrompida.numero} ({ver.interrompida.motivo}) parou no meio — o app foi fechado ou pausado pelo sistema.{' '}
          <button type="button" class="primario mini" disabled={!p.pronto} onClick={() => ver.retomarCadeia()}>
            Retomar
          </button>{' '}
          <button type="button" class="mini" onClick={() => ver.descartarInterrompida()}>
            Deixar assim
          </button>
        </div>
      )}
      <div class="barra-acoes">
        {ocupado ? (
          <>
            <span class="girando" aria-hidden="true" />
            <span class="suave" aria-live="polite">
              {ver.rodando?.msg ?? 'preparando'}…
            </span>
            <button type="button" onClick={() => ver.cancelar()}>
              Parar
            </button>
          </>
        ) : (
          <button
            type="button"
            class="primario"
            disabled={!p.pronto || nada || !!ver.ocupado}
            onClick={() => ver.iniciarCadeia(pedido, est.dicionario, 'início', true)}
          >
            {ver.rodadas.length ? 'Recomeçar a reação' : 'Iniciar a reação em cadeia'}
          </button>
        )}
        <span class="suave">
          {pf.aprimorar
            ? `começa com ${limiteTexto(pf.atual.Ninicial, pf.atual.Kinicial)} e aprofunda sozinha até ${limiteTexto(pf.atual.limites.N, pf.atual.limites.K)}`
            : `cenários até ${limiteTexto(pf.atual.Ninicial, pf.atual.Kinicial)}`}
        </span>
      </div>
      {!p.pronto && <p class="erro-texto">Confirme antes os nomes sem ficha, em Contradições.</p>}
      {nada && <p class="suave">Não há leis, fatos ou teoremas ativos com fórmula.</p>}

      <Fora fora={fora} />

      {[...ver.rodadas].reverse().map((r) => {
        const anterior = ver.rodadas.find((x) => x.numero === r.numero - 1) ?? null
        const ultima = r === atual
        return ultima ? (
          <Rodada
            r={r}
            anterior={anterior}
            pedido={pedido}
            desatualizada={desatualizada}
            ocupado={ocupado}
            onAprovada={(nome) => ver.continuarCadeia(`aprovada: ${nome}`)}
          />
        ) : (
          <details class="rodada-antiga">
            <summary>
              Rodada {r.numero} — {r.motivo}
            </summary>
            <Rodada r={r} anterior={anterior} pedido={pedido} desatualizada ocupado={false} onAprovada={() => {}} />
          </details>
        )
      })}
    </section>
  )
}

function Fora({ fora }: { fora: ReturnType<typeof foraDaCadeia> }) {
  const est = useEstado()
  const total = fora.teoremasSemFormula.length + fora.leisSemFormula.length + fora.teoremasDesativados.length + fora.comErro.length
  if (!total) return null
  const ativar = async () => {
    for (const n of fora.teoremasDesativados) await est.salvarNota({ ...n, ativa: true })
  }
  return (
    <details class="fora-cadeia">
      <summary>
        Fora da reação: {total} nota{total > 1 ? 's' : ''}
      </summary>
      {fora.teoremasSemFormula.length + fora.leisSemFormula.length > 0 && (
        <>
          <p>
            <b>Só com texto ({fora.teoremasSemFormula.length + fora.leisSemFormula.length}):</b> o motor só lê fórmulas. Para entrar, a nota
            precisa de ao menos uma fórmula na linguagem do app. Notas com números, contas e cálculo (derivadas, integrais) ainda não podem
            ser escritas nela.
          </p>
          <ul class="lista-fora">
            {[...fora.leisSemFormula, ...fora.teoremasSemFormula].map((n) => (
              <li>
                <span class={`selo c-${n.compartimento}`}>{n.compartimento === 'teorema' ? 'Teorema' : n.compartimento === 'fato' ? 'Fato' : 'Lei'}</span>{' '}
                <a href={`#/nota/${encodeURIComponent(n.id)}`}>{n.titulo || 'Sem título'}</a>
              </li>
            ))}
          </ul>
        </>
      )}
      {fora.teoremasDesativados.length > 0 && (
        <>
          <p>
            <b>Teoremas desativados ({fora.teoremasDesativados.length}):</b> <Links ids={fora.teoremasDesativados.map((n) => n.id)} />.{' '}
            <button type="button" class="mini" onClick={ativar}>
              Ativar {fora.teoremasDesativados.length > 1 ? 'todos' : ''}
            </button>
          </p>
        </>
      )}
      {fora.comErro.length > 0 && (
        <p>
          <b>Fórmulas com erro ({fora.comErro.length}):</b> <Links ids={[...new Set(fora.comErro.map((f) => f.notaId))]} />.
        </p>
      )}
    </details>
  )
}

function Rodada({
  r,
  anterior,
  pedido,
  desatualizada,
  ocupado,
  onAprovada,
}: {
  r: RodadaCadeia
  anterior: RodadaCadeia | null
  pedido: PedidoCadeia
  desatualizada: boolean
  ocupado: boolean
  onAprovada: (nome: string) => void
}) {
  return (
    <div class="rodada">
      <h3>
        Rodada {r.numero}
        <span class="suave"> — {r.motivo}</span>
      </h3>
      <div class="suave res-meta">
        {r.interrompida ? 'interrompida' : r.terminada ? 'terminada' : r.baseTerminada ? 'terminada — aprimorando' : 'em andamento'} · {r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}
        {(r.terminada || r.baseTerminada) && desatualizada && <span class="selo aviso"> desatualizada — as notas mudaram</span>}
      </div>
      {r.erro && <p class="erro-texto">Falha no motor: {r.erro}</p>}
      {anterior && (r.terminada || r.baseTerminada) && <Mudancas r={r} anterior={anterior} />}
      {r.relatorios.map((rel) => (
        <Relatorio
          rel={rel}
          grupos={pedido.contextos.find((c) => c.chave === rel.chave)?.grupos ?? []}
          travado={desatualizada || !(r.terminada || r.baseTerminada) || (ocupado && !r.baseTerminada)}
          onAprovada={onAprovada}
        />
      ))}
    </div>
  )
}

/** O que mudou desde a rodada anterior: a reação que a aprovação gerou. */
function Mudancas({ r, anterior }: { r: RodadaCadeia; anterior: RodadaCadeia }) {
  const itens: preact.JSX.Element[] = []
  for (const rel of r.relatorios) {
    const ant = anterior.relatorios.find((x) => x.chave === rel.chave)
    if (!ant) continue
    for (const t of rel.teoremas) {
      const a = ant.teoremas.find((x) => x.id === t.id)
      if (a && a.resultado.tipo !== t.resultado.tipo)
        itens.push(
          <li>
            <Link id={t.id} />: {nomeResultado(a)} → <b>{nomeResultado(t)}</b>
            {t.geracao && ` (geração ${t.geracao})`}
          </li>,
        )
      else if (a && t.geracao && a.geracao && t.geracao !== a.geracao)
        itens.push(
          <li>
            <Link id={t.id} />: geração {a.geracao} → {t.geracao}
          </li>,
        )
    }
    for (const l of rel.leis) {
      const a = ant.leis.find((x) => x.id === l.id)
      if (!a)
        itens.push(
          <li>
            nova no conjunto: <Link id={l.id} /> ({l.tipo === 'decorre' ? 'decorre das outras' : l.tipo})
          </li>,
        )
      else if (a.tipo !== l.tipo)
        itens.push(
          <li>
            <Link id={l.id} />: {a.tipo} → <b>{l.tipo === 'decorre' ? 'decorre das outras' : l.tipo}</b>
          </li>,
        )
    }
    const antigas = new Set((ant.consequencias ?? []).map((c) => c.formula))
    for (const c of rel.consequencias ?? [])
      if (!antigas.has(c.formula))
        itens.push(
          <li>
            consequência nova: <span class="formula-inline">{c.formula}</span>
          </li>,
        )
  }
  return (
    <div class={`resultado ${itens.length ? 'res-ok' : ''}`}>
      <strong>{itens.length ? 'O que esta rodada gerou' : 'Nada mudou em relação à rodada anterior'}</strong>
      {itens.length > 0 && <ul>{itens}</ul>}
    </div>
  )
}

/** Até onde as conclusões foram conferidas, e o aprimoramento automático. */
function Nivel({ rel }: { rel: RelatorioCadeia }) {
  const ap = rel.aprimoramento
  return (
    <div class="nivel-cadeia">
      <span>
        Conferido em todos os cenários até <b>{limiteTexto(rel.N, rel.K)}</b>
        {ap && (ap.de.N !== rel.N || ap.de.K !== rel.K) && <span class="suave"> (a rodada começou com {limiteTexto(ap.de.N, ap.de.K)})</span>}
      </span>
      {ap?.situacao === 'esperando' && <span class="suave"> · aprimoramento na fila</span>}
      {ap?.situacao === 'aprofundando' && (
        <span class="suave">
          {' '}
          · <span class="girando" aria-hidden="true" /> aprimorando ({ap.conclusoes} conclusões a reconferir em cenários maiores)
        </span>
      )}
      {ap?.situacao === 'feito' && !ap.virada && ap.parouPor && <span class="suave"> · aprimoramento: {ap.parouPor}</span>}
      {ap?.virada && (
        <div class="aviso-texto">
          ⚠ Ao aprofundar: {ap.parouPor}. A reação refaz a rodada com {ap.virada.N} objetos.
        </div>
      )}
    </div>
  )
}

const nomeResultado = (t: EstadoTeorema) =>
  ({
    segue: '✓ segue',
    'nao-segue': '✗ não segue',
    contradiz: '✗ contradiz as leis',
    'premissas-contraditorias': 'leis contraditórias',
    'grande-demais': 'grande demais',
    'formula-invalida': 'fórmula inválida',
    aritmetica: '🔢 com números (Z3)',
  })[t.resultado.tipo]

function Relatorio({
  rel,
  grupos,
  travado,
  onAprovada,
}: {
  rel: RelatorioCadeia
  grupos: Grupo[]
  travado: boolean
  onAprovada: (nome: string) => void
}) {
  const seguem = rel.teoremas.filter((t) => t.resultado.tipo === 'segue')
  const naoSeguem = rel.teoremas.filter((t) => t.resultado.tipo === 'nao-segue')
  const contradizem = rel.teoremas.filter((t) => t.resultado.tipo === 'contradiz')
  const numericos = rel.teoremas.filter((t) => t.resultado.tipo === 'aritmetica')
  const outros = rel.teoremas.filter((t) => !['segue', 'nao-segue', 'contradiz', 'aritmetica'].includes(t.resultado.tipo))
  const geracoes = [...new Set(seguem.map((t) => t.geracao ?? 1))].sort((a, b) => a - b)
  // grau herdado pela cadeia, geração por geração (visões não têm grau)
  const graus = new Map<string, GrauHerdado>()
  if (!rel.chave.startsWith('visao:'))
    for (const t of [...seguem].sort((a, b) => (a.geracao ?? 1) - (b.geracao ?? 1))) {
      const ids = t.apoio?.length ? t.apoio : t.resultado.tipo === 'segue' ? t.resultado.notas : []
      graus.set(t.id, grauHerdado(ids, estado.notas, graus))
    }
  const independentes = rel.leis.filter((l) => l.tipo === 'independente')
  const decorrem = rel.leis.filter((l) => l.tipo === 'decorre')
  const c = rel.consistencia
  const visao = rel.chave.startsWith('visao:')

  return (
    <div class="relatorio-cadeia">
      <h4>
        {rel.rotulo}
        {rel.etapa !== 'fim' && <span class="suave"> — {NOME_ETAPA[rel.etapa]}…</span>}
      </h4>
      {rel.etapa === 'fim' && <Nivel rel={rel} />}

      {c?.tipo === 'consistente' && (
        <p class="status-ok">
          ✓ {visao ? 'As crenças desta visão' : 'As leis e fatos'} são consistentes (há um cenário com {tamanhoTexto(c.n, c.modelo.mundos)} em que
          todas valem).
        </p>
      )}
      {c?.tipo === 'sem-modelo' && (
        <div class="resultado res-conflito">
          <strong>{visao ? 'As crenças desta visão se contradizem' : 'As leis e fatos se contradizem'}</strong>
          <p>
            Conflito mínimo: <Links ids={c.conflito} />. Com leis contraditórias tudo "seguiria"; a reação para aqui. Veja a explicação em{' '}
            <a href="#/contradicoes">Contradições</a>.
          </p>
        </div>
      )}
      {c?.tipo === 'grande-demais' && <p class="aviso-texto">Grande demais para o motor finito (com {c.n} objetos). Diminua N.</p>}

      {rel.leis.length > 0 && (
        <details class="explicacao" open={decorrem.length > 0}>
          <summary>
            Leis batendo umas com as outras: {independentes.length} independente{independentes.length === 1 ? '' : 's'}
            {decorrem.length > 0 && `, ${decorrem.length} decorre${decorrem.length > 1 ? 'm' : ''} das outras`}
          </summary>
          <ul class="lista-cadeia">
            {rel.leis.map((l) => (
              <li>
                <Link id={l.id} />{' '}
                {l.tipo === 'decorre' ? (
                  <span class="aviso-texto">
                    — decorre de <Links ids={l.notas} /> (é redundante: as outras já a garantem)
                  </span>
                ) : l.tipo === 'independente' ? (
                  <details class="explicacao em-linha">
                    <summary>independente</summary>
                    <p class="suave">Há um cenário em que todas as outras valem e esta falha — ela diz algo que as outras não dizem:</p>
                    <ArvorePassos p={l.mundo.passos} />
                    <ModeloVisual m={l.mundo.modelo} />
                  </details>
                ) : (
                  <span class="suave">— incerto (grande demais)</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {rel.teoremas.length > 0 && (
        <>
          <h5>Teoremas</h5>
          {!rel.chave.startsWith('visao:') && (
            <p class="suave">
              Cada teorema que segue herda o grau mais fraco das leis de onde vem: F só se tudo é estabelecido. A lógica não mede nada — para uma
              lei M virar F, é preciso medir (e então mudar o grau na nota).
            </p>
          )}
          {geracoes.map((g) => (
            <div class="geracao">
              <div class="geracao-titulo">
                Geração {g} {g === 1 ? '— direto das leis' : `— usa teoremas da geração ${g - 1}`}
              </div>
              <ul class="lista-cadeia">
                {seguem
                  .filter((t) => (t.geracao ?? 1) === g)
                  .map((t) => (
                    <li class="segue">
                      ✓ <Link id={t.id} /> <span class="formula-inline">{t.formula}</span>
                      <div class="suave">
                        ⇐ {t.apoio?.length ? <Links ids={t.apoio} /> : t.resultado.tipo === 'segue' && t.resultado.notas.length ? <Links ids={t.resultado.notas} /> : 'vale sempre'}
                      </div>
                      {graus.get(t.id) && <SeloGrau g={graus.get(t.id)!} />}
                      {!travado && <ConfirmacaoZ3 tipo="segue" formulas={formulasDoApoio(t, rel, grupos)} negar={t.formula} />}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {naoSeguem.length > 0 && (
            <div class="geracao">
              <div class="geracao-titulo erro-texto">Não seguem das leis</div>
              <ul class="lista-cadeia">
                {naoSeguem.map((t) => (
                  <li class="nao-segue">
                    ✗ <Link id={t.id} /> <span class="formula-inline">{t.formula}</span>
                    {t.resultado.tipo === 'nao-segue' && (
                      <details class="explicacao">
                        <summary>contraexemplo: as leis valem e o teorema falha</summary>
                        <ArvorePassos p={t.resultado.mundo.passos} />
                        <ModeloVisual m={t.resultado.mundo.modelo} />
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {contradizem.length > 0 && (
            <div class="geracao">
              <div class="geracao-titulo erro-texto">Contradizem as leis</div>
              <ul class="lista-cadeia">
                {contradizem.map((t) => (
                  <li class="contradiz">
                    ✗ <Link id={t.id} /> <span class="formula-inline">{t.formula}</span>
                    {t.resultado.tipo === 'contradiz' && (
                      <div class="suave">
                        o contrário segue de <Links ids={t.resultado.notas} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {numericos.length > 0 && (
            <div class="geracao">
              <div class="geracao-titulo">Com números — conferidos pelo Z3 (para quaisquer valores)</div>
              <ul class="lista-cadeia">
                {numericos.map((t) => (
                  <li>
                    <Link id={t.id} /> <span class="formula-inline">{t.formula}</span>
                    {!travado && (
                      <ConferenciaNumerica
                        grupos={grupos}
                        formula={t.formula}
                        inativas={inativasDoContexto(estado.notas, rel.chave)}
                        onAtivada={(nome) => onAprovada(nome)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {outros.map((t) => (
            <p class="aviso-texto">
              <Link id={t.id} />: {nomeResultado(t)}
            </p>
          ))}
        </>
      )}

      {rel.conflitoTeoremas && (
        <div class="resultado res-conflito">
          <strong>Teoremas incompatíveis entre si</strong>
          <p>
            Nenhum segue das leis, e <Links ids={rel.conflitoTeoremas} /> não podem valer todos juntos com elas: ao menos um está errado.
          </p>
        </div>
      )}

      {(rel.sugestoes.length > 0 || (rel.etapa === 'fim' && naoSeguem.length > 0)) && (
        <>
          <h5>Leis que fechariam o que falta</h5>
          {rel.sugestoes.length ? (
            <ul class="lista-leis-sugeridas">
              {rel.sugestoes.map((s) => (
                <CartaoLei
                  s={s.lei}
                  teorema={s.fecha.map((id) => estado.nota(notaDe(id))?.titulo || 'Sem título').join('”, “')}
                  N={rel.N}
                  K={rel.K}
                  chave={rel.chave}
                  grupos={grupos}
                  negar={rel.teoremas.find((t) => t.id === s.fecha[0])?.formula ?? ''}
                  desatualizado={travado}
                  onAprovada={() => onAprovada(s.lei.nome)}
                  extra={
                    <div>
                      Fecha {s.fecha.length > 1 ? `${s.fecha.length} teoremas` : 'o teorema'}: <Links ids={s.fecha} />
                    </div>
                  }
                />
              ))}
            </ul>
          ) : (
            <p class="suave">Nenhuma lei simples fecha os teoremas que faltam. Se você tem certeza de um deles, pode torná-lo lei por decisão.</p>
          )}
        </>
      )}

      {rel.consequencias && rel.consequencias.length > 0 && (
        <>
          <h5>Consequências novas</h5>
          <ul class="lista-cadeia">
            {rel.consequencias.map((q) => (
              <Consequencia q={q} chave={rel.chave} N={rel.N} g={rel.chave.startsWith('visao:') ? null : grauHerdado(q.notas, estado.notas)} />
            ))}
          </ul>
          {rel.consequenciasJaTeorema > 0 && (
            <p class="suave">
              {rel.consequenciasJaTeorema} consequência{rel.consequenciasJaTeorema > 1 ? 's já estavam escritas' : ' já estava escrita'} como teorema.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Consequencia({ q, chave, N, g }: { q: NonNullable<RelatorioCadeia['consequencias']>[number]; chave: string; N: number; g: GrauHerdado | null }) {
  const [salva, setSalva] = useState<string | null>(null)
  return (
    <li>
      <span class="formula-inline">{q.formula}</span> — {q.descricao}
      <div class="suave">⇐ {q.notas.length ? <Links ids={q.notas} /> : 'vale sempre'}</div>
      {g && <SeloGrau g={g} />}
      {salva ? (
        <span class="status-ok">
          ✓ <a href={`#/nota/${encodeURIComponent(salva)}`}>Nota criada</a>
        </span>
      ) : (
        <button type="button" class="mini" onClick={async () => setSalva((await salvarDeduzida(q.formula, chave, q.notas, N)).id)}>
          Salvar como nota
        </button>
      )}
    </li>
  )
}
