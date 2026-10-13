import { useMemo, useState } from 'preact/hooks'
import { foraDaCadeia, formulasDoApoio, inativasDoContexto, pedidoDaCadeia } from '../dados/cadeia'
import { salvarDeduzida } from '../dados/deduzida'
import { grauHerdado, type GrauHerdado } from '../dados/grau'
import { estado, useEstado } from '../dados/estado'
import { usePerfil } from '../dados/perfil'
import { preparar } from '../dados/premissas'
import { podeManterAcordado } from '../dados/acordado'
import { assinaturaCadeia, useVerificacao, type PacienciaHoras, type RodadaCadeia } from '../dados/verificacao'
import { estadoEfetivo, type EstadoTeorema, type PedidoCadeia, type RelatorioCadeia } from '../motor/cadeia'
import { limiteTexto, tamanhoTexto } from '../motor/avaliar'
import type { Grupo } from '../motor/motor'
import { ConferenciaNumerica, ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { CartaoLei } from './LeisQueFaltam'
import { ModoCadeia } from './Modelo'
import { SeloGrau } from './SeloGrau'
import { ConfigPerfil, ConfigSegundoPlano, StatusAutomatico } from './SegundoPlano'
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
  const ficou = atual && !ocupado ? oQueFicou(atual) : null
  return (
    <section class="cadeia">
      <ModoCadeia atual="cadeia" />
      <h2>Reação em cadeia</h2>
      <p class="suave">
        O app bate cada lei, fato e teorema contra os outros: confere se as leis são consistentes e se cada uma é independente ou decorre das
        outras; quais teoremas seguem e de quais outros teoremas (a cadeia, geração por geração); se os que não seguem se contradizem; que leis
        fechariam o que falta; e que consequências novas aparecem. Ao aprovar uma lei sugerida, a reação continua sozinha numa nova rodada —
        mesmo que você vá para outra tela.
      </p>
      <ConfigPerfil />
      <ConfigSegundoPlano />
      <StatusAutomatico
        ligado={pf.automatico}
        emDia={!!atual && !desatualizada && !atual.interrompida && (atual.terminada || !!atual.baseTerminada)}
        rodandoAgora={ocupado}
      />
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
          <>
            {ficou && (
              <button
                type="button"
                class="primario"
                disabled={!p.pronto || nada || !!ver.ocupado}
                title="Uma rodada nova que aproveita tudo o que já foi provado (fica no banco de provas): segue de onde a anterior parou"
                onClick={() => ver.continuarCadeia(`continuada de onde parou (${ficou})`)}
              >
                Continuar de onde parou
              </button>
            )}
            <button
              type="button"
              class={ficou ? '' : 'primario'}
              disabled={!p.pronto || nada || !!ver.ocupado}
              onClick={() => ver.iniciarCadeia(pedido, est.dicionario, 'início', true)}
            >
              {ver.rodadas.length ? 'Recomeçar a reação' : 'Iniciar a reação em cadeia'}
            </button>
          </>
        )}
        <span class="suave">
          {pf.aprimorar
            ? `começa com ${limiteTexto(pf.atual.Ninicial, pf.atual.Kinicial)} e aprofunda sozinha até ${limiteTexto(pf.atual.limites.N, pf.atual.limites.K)}`
            : `cenários até ${limiteTexto(pf.atual.Ninicial, pf.atual.Kinicial)}`}
        </span>
      </div>
      <label class="suave">
        Tempo para resolver o que ficar pendente:{' '}
        <select value={ver.paciencia} onChange={(e) => ver.definirPaciencia(Number((e.target as HTMLSelectElement).value) as PacienciaHoras)}>
          <option value={0}>o do aparelho ({pf.aprimorar ? `até ${Math.round(pf.atual.limites.orcamentoMs / 60_000)} min` : 'sem continuar'})</option>
          <option value={1}>até 1 hora</option>
          <option value={5}>até 5 horas</option>
          <option value={10}>até 10 horas</option>
        </select>
      </label>
      {ver.paciencia > 0 && (
        <p class="suave">
          Modo de horas: o teorema que não decidir no prazo da rodada continua sendo conferido por até {ver.paciencia} hora
          {ver.paciencia > 1 ? 's' : ''} — o motor retoma do tamanho em que parou, e o Z3 (se estiver ligado, em Contradições) tenta
          provar com tentativas cada vez mais longas. O que decidir entra no histórico na hora. Deixe o app aberto
          {podeManterAcordado() ? ' (a tela fica acesa enquanto isso)' : ' e a tela ligada (este navegador não deixa o app mantê-la acesa)'}; no
          celular, ligue na tomada.
        </p>
      )}
      {ficou && (
        <p class="suave">
          A última rodada {ficou}. “Continuar de onde parou” faz uma rodada nova que aproveita o que já foi provado.
        </p>
      )}
      <p class="suave">
        Tudo o que as rodadas concluem fica guardado no <a href="#/historico">histórico</a>, mesmo depois de rodadas novas.
      </p>
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

/** O que a última rodada deixou pela metade (para oferecer "continuar de onde parou"), ou null. */
function oQueFicou(r: RodadaCadeia): string | null {
  if (r.interrompida) return 'parou no meio'
  if (r.erro) return 'parou por uma falha no motor'
  if (!r.terminada && !r.baseTerminada) return null
  const semDecisao = r.relatorios.reduce((s, x) => s + x.teoremas.filter((t) => t.resultado.tipo === 'tempo').length, 0)
  if (semDecisao) return `deixou ${semDecisao} teorema${semDecisao > 1 ? 's' : ''} sem decisão`
  const ap = r.relatorios.map((x) => x.aprimoramento).find((a) => a?.situacao === 'feito' && a.parouPor && /tempo|passou de|parado|falha|grande demais/.test(a.parouPor))
  if (r.terminada && ap) return `parou de aprofundar (${ap.parouPor})`
  const candidatas = r.relatorios.reduce((s, x) => s + (x.consequenciasSemDecisao ?? 0), 0)
  if (r.terminada && candidatas) return `deixou ${candidatas} candidata${candidatas > 1 ? 's' : ''} a consequência sem decisão`
  return null
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
      if (!a)
        itens.push(
          <li>
            teorema novo: <Link id={t.id} /> — <b>{nomeResultado(t)}</b>
            {t.geracao && ` (geração ${t.geracao})`}
          </li>,
        )
      else if (a.resultado.tipo !== t.resultado.tipo)
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
      // "nova" só se a lei não estava na rodada anterior (com uma lei só, não há comparação entre leis)
      const estava = ant.leisIds ? ant.leisIds.includes(l.id) : !!a
      if (!a && !estava)
        itens.push(
          <li>
            nova no conjunto: <Link id={l.id} /> ({l.tipo === 'decorre' ? 'decorre das outras' : l.tipo})
          </li>,
        )
      else if (a && a.tipo !== l.tipo)
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
          · <span class="girando" aria-hidden="true" /> aprimorando ({ap.conclusoes} conclusões a reconferir em cenários maiores
          {ap.paralelo && ap.paralelo > 1 ? `, ${ap.paralelo} núcleos` : ''})
        </span>
      )}
      {ap?.situacao === 'feito' && !ap.virada && ap.parouPor && <span class="suave"> · aprimoramento: {ap.parouPor}</span>}
      {!!ap?.provadasZ3 && (
        <span class="suave">
          {' '}
          · o Z3 provou {ap.provadasZ3} de {ap.conclusoes} conclusões para qualquer número de objetos
        </span>
      )}
      {!!ap?.sairam?.length && (
        <div class="suave">
          Ao aprofundar, {ap.sairam.length === 1 ? 'uma conclusão secundária caiu e saiu' : `${ap.sairam.length} conclusões secundárias caíram e saíram`}{' '}
          da lista (sem refazer a rodada): {ap.sairam.join('; ')}.
        </div>
      )}
      {ap?.virada && (
        <div class="aviso-texto">
          ⚠ Ao aprofundar: {ap.parouPor}. A reação refaz a rodada com {ap.virada.N} objetos.
        </div>
      )}
    </div>
  )
}

const milhares = (x: number) => x.toLocaleString('pt-BR')

/** por que diminuir N não resolve: abaixo de n não há cenário com todas */
const GrandeDemaisTexto = ({ n, limite, quais }: { n: number; limite?: number; quais: string }) => (
  <>
    Grande demais para o motor finito:{' '}
    {n > 1
      ? `até ${tamanhoTexto(n - 1)} não há cenário em que ${quais} valem todas juntas, e com ${n} o problema passa do limite`
      : 'já com 1 objeto o problema passa do limite'}{' '}
    deste aparelho{limite ? ` (${milhares(limite)})` : ''}.
    {n > 1 && ` Ou elas se contradizem, ou precisam de ${n} objetos ou mais — por isso diminuir N não resolve.`}
  </>
)

/** O conjunto inteiro passou do limite do motor finito: o que ficou à parte, o que pesa e o que o Z3 disse. */
/** O que o conselheiro poupou nesta rodada (ele só antecipa e recorta: quem decide é o motor finito e o Z3). */
function AjudaConselheiro({ rel }: { rel: RelatorioCadeia }) {
  const a = rel.conselho
  if (!a || (!a.porCenario && !a.contraConhecido && !a.provadosComSugeridas)) return null
  const partes = [
    a.porCenario > 0 && `${a.porCenario} teorema${a.porCenario > 1 ? 's decididos' : ' decidido'} sem procurar, por cenários já conhecidos das notas`,
    a.contraConhecido > 0 && `${a.contraConhecido} em que um cenário conhecido poupou a busca do contraexemplo`,
    a.provadosComSugeridas > 0 &&
      `${a.provadosComSugeridas} provado${a.provadosComSugeridas > 1 ? 's' : ''} pelo Z3 só com as notas sugeridas`,
  ].filter(Boolean)
  return (
    <p class="suave">
      Conselheiro: {partes.join('; ')}. Um cenário conhecido só é usado se as notas de agora valem nele; as respostas são as mesmas, só mais
      rápidas.
    </p>
  )
}

function APartePesada({ rel }: { rel: RelatorioCadeia }) {
  const ap = rel.aParte!
  // nada deu para separar: a rodada parou na consistência
  const tudo = rel.consistencia?.tipo === 'grande-demais' && !rel.consistencia.tempo
  const visao = rel.chave.startsWith('visao:')
  const quais = visao ? 'as crenças desta visão' : 'as leis e fatos'
  const fora = rel.teoremas.filter((t) => ap.teoremas.includes(t.id))
  return (
    <div class="explicacao">
      {tudo ? (
        <p class="aviso-texto">
          <GrandeDemaisTexto n={ap.n} limite={ap.limite} quais={quais} />
        </p>
      ) : (
        <p class="aviso-texto">
          O conjunto inteiro passa do limite deste aparelho com {ap.n} objetos. {ap.notas.length === 1 ? 'Esta nota não tem' : 'Estas notas não têm'}{' '}
          nenhum nome em comum com as outras e {ap.notas.length === 1 ? 'ficou' : 'ficaram'} à parte: <Links ids={ap.notas} />. A rodada seguiu com as
          outras{fora.length ? `; os teoremas que usam nomes delas ficaram de fora` : ''}.
        </p>
      )}
      {ap.z3 === 'rodando' && (
        <p class="suave">
          <span class="girando" aria-hidden="true" /> O Z3 está conferindo o conjunto inteiro, sem limite de tamanho
          {fora.length ? `, e ${fora.length === 1 ? 'o teorema que ficou' : `os ${fora.length} teoremas que ficaram`} de fora` : ''}…
        </p>
      )}
      {ap.z3 === 'consistente' && <p class="status-ok">✓ O Z3 achou um cenário em que todas valem juntas: {quais} são consistentes.</p>}
      {ap.z3 === 'contraditorio' && (
        <div class="resultado res-conflito">
          <strong>O Z3 provou que {quais} se contradizem</strong>
          <p>
            Com qualquer número de objetos, não há cenário em que todas valem. Com leis contraditórias tudo "seguiria": veja o conflito em{' '}
            <a href="#/contradicoes">Contradições</a>.
          </p>
        </div>
      )}
      {ap.z3 === 'desligado' && (
        <p class="suave">
          Ligue o Z3 (em <a href="#/contradicoes">Contradições</a>): ele confere o conjunto inteiro sem limite de tamanho, e a próxima rodada já o usa.
        </p>
      )}
      {ap.z3 === 'sem-decisao' && <p class="suave">O Z3 não decidiu no tempo que teve. No modo de horas ele insiste bem mais.</p>}
      {ap.pesos.length > 0 && (
        <details class="explicacao em-linha">
          <summary>as notas que mais pesam com {ap.n} objetos</summary>
          <ul class="lista-cadeia">
            {ap.pesos.map((p) => (
              <li>
                <Link id={p.id} /> — {p.tamanho > ap.limite ? 'passa do limite sozinha' : `${milhares(p.tamanho)} (sozinha)`}
              </li>
            ))}
          </ul>
          <p class="suave">Desativar as mais pesadas deixa o resto ser conferido aqui; o Z3 não tem esse limite.</p>
        </details>
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
    tempo: `⏱ não decidiu a tempo${t.resultado.tipo === 'tempo' && t.resultado.n > 1 ? ` (sem contraexemplo até ${t.resultado.n - 1} objetos)` : ''}`,
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
  // o que o Z3 decidiu (para qualquer tamanho) passa na frente do que o motor finito viu (até N)
  const tipo = (t: EstadoTeorema) => estadoEfetivo(t).tipo
  const seguem = rel.teoremas.filter((t) => tipo(t) === 'segue')
  const naoSeguem = rel.teoremas.filter((t) => tipo(t) === 'nao-segue')
  const contradizem = rel.teoremas.filter((t) => tipo(t) === 'contradiz')
  const numericos = rel.teoremas.filter((t) => tipo(t) === 'aritmetica')
  const outros = rel.teoremas.filter((t) => !['segue', 'nao-segue', 'contradiz', 'aritmetica'].includes(tipo(t)))
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
      {c?.tipo === 'grande-demais' && c.tempo && (
        <p class="aviso-texto">
          A consistência não foi decidida a tempo (a checagem passou do prazo com {c.n} objetos). A rodada parou aqui; ela recomeça quando as notas
          mudarem.
        </p>
      )}
      {rel.aParte && <APartePesada rel={rel} />}
      {c?.tipo === 'grande-demais' && !c.tempo && !rel.aParte && (
        <p class="aviso-texto">
          <GrandeDemaisTexto n={c.n} quais={visao ? 'as crenças desta visão' : 'as leis e fatos'} /> Rode de novo para ver as notas que mais pesam.
        </p>
      )}

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
          <AjudaConselheiro rel={rel} />
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
                      {t.z3 === 'segue' ? (
                        <div class="status-ok">✓ provado: vale com qualquer número de objetos (inclusive infinito)</div>
                      ) : (
                        <div class="suave">
                          vale em todos os cenários até {tamanhoTexto(rel.N)} — ainda sem prova para cenários maiores (só o Z3 prova para
                          qualquer tamanho)
                        </div>
                      )}
                      {graus.get(t.id) && <SeloGrau g={graus.get(t.id)!} />}
                      {!travado && !t.z3 && <ConfirmacaoZ3 tipo="segue" formulas={formulasDoApoio(t, rel, grupos)} negar={t.formula} />}
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
                    {t.z3 === 'nao-segue' && (
                      <div class="suave">
                        {t.resultado.tipo === 'segue'
                          ? `valia em todos os cenários até ${tamanhoTexto(rel.N)}, mas o Z3 achou um cenário maior (ou infinito) em que as leis valem e ele falha: não segue`
                          : 'o Z3 achou um cenário em que as leis valem e ele falha (grande demais para desenhar aqui)'}
                      </div>
                    )}
                    {t.z3 === 'nao-contradiz' && (
                      <div class="suave">
                        as leis não o contradizem: o Z3 achou um cenário (maior que {tamanhoTexto(rel.N)}, ou infinito) em que as leis e ele valem
                        juntos; e ele também não segue delas
                      </div>
                    )}
                    {t.resultado.tipo === 'nao-segue' && !t.z3 && (
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
                    {t.z3 === 'contradiz' ? (
                      <div class="status-ok">provado: vale com qualquer número de objetos</div>
                    ) : (
                      <div class="suave">em todos os cenários até {tamanhoTexto(rel.N)} — ainda sem prova para cenários maiores</div>
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
              <Link id={t.id} />:{' '}
              {rel.continuando?.includes(t.id) ? (
                <>
                  <span class="girando" aria-hidden="true" /> conferindo com mais tempo
                  {t.resultado.tipo === 'tempo' && t.resultado.n > 1 && ` (sem contraexemplo até ${t.resultado.n - 1} objetos; continua do ${t.resultado.n})`}…
                </>
              ) : rel.aParte?.teoremas.includes(t.id) && t.resultado.tipo === 'grande-demais' ? (
                rel.aParte.z3 === 'rodando' ? (
                  <>
                    <span class="girando" aria-hidden="true" /> grande demais para o motor finito; o Z3 está conferindo…
                  </>
                ) : (
                  `grande demais para o motor finito${rel.aParte.z3 === 'desligado' ? ' (ligue o Z3 para conferir)' : rel.aParte.z3 === 'sem-decisao' ? '; o Z3 não decidiu a tempo' : ''}`
                )
              ) : (
                nomeResultado(t)
              )}
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
      {!!rel.consequenciasSemDecisao && rel.etapa === 'fim' && (
        <p class="suave">
          {rel.consequenciasSemDecisao} candidata{rel.consequenciasSemDecisao > 1 ? 's' : ''} a consequência ficou sem decisão: a checagem passou do
          tempo desta etapa. A rodada seguiu assim mesmo; a próxima aproveita o que já foi provado.
        </p>
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
