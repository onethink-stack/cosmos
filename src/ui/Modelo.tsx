import { useEffect, useMemo, useState } from 'preact/hooks'
import { todasAsTags } from '../dados/filtro'
import { grauHerdado, type GrauHerdado } from '../dados/grau'
import { estado, useEstado } from '../dados/estado'
import {
  assinaturaModelo,
  escreverComoTeorema,
  levarParaOCaderno,
  mudancasParaOCaderno,
  notasDoModelo,
  useConfigModelo,
  type ExecucaoModelo,
} from '../dados/modelo'
import { usePerfil } from '../dados/perfil'
import { preparar } from '../dados/premissas'
import { useVerificacao } from '../dados/verificacao'
import { consistenciaZ3, itensComZ3, pedirZ3DoModelo, z3Pendentes } from '../dados/modeloZ3'
import { disponibilidadeZ3, useZ3 } from '../dados/z3'
import { faseZ3DoModelo } from '../dados/segundoPlano'
import { limiteTexto } from '../motor/avaliar'
import { MAX_RODADAS_MODELO, PREFIXO_ADOTADA, type Classe, type EventoModelo, type ItemModelo, type RelatorioModelo } from '../motor/modelo'
import type { Nota } from '../dados/tipos'

/** Troca entre a reação em cadeia (você aprova) e o segundo modelo (automático). */
export function ModoCadeia({ atual }: { atual: 'cadeia' | 'modelo' }) {
  return (
    <nav class="segmentado modo-cadeia" aria-label="Modo">
      <a href="#/cadeia" class={atual === 'cadeia' ? 'ativo' : ''} aria-current={atual === 'cadeia' ? 'page' : undefined}>
        Reação em cadeia <small>você aprova</small>
      </a>
      <a href="#/modelo" class={atual === 'modelo' ? 'ativo' : ''} aria-current={atual === 'modelo' ? 'page' : undefined}>
        Segundo modelo <small>automático</small>
      </a>
    </nav>
  )
}

/** Seções da classificação, na ordem em que aparecem. */
const SECOES: { classe: Classe; titulo: string; descricao: string; aberta?: boolean }[] = [
  { classe: 'provado', titulo: 'Provados', descricao: 'valem em todos os mundos testados: são fatos do modelo', aberta: true },
  { classe: 'descoberta', titulo: 'Consequências descobertas', descricao: 'novas, ainda não escritas no caderno', aberta: true },
  { classe: 'tese', titulo: 'Teses', descricao: 'não contradizem as leis (há mundo onde valem), mas não seguem delas', aberta: true },
  { classe: 'conflito', titulo: 'Teses em conflito', descricao: 'cada uma cabe, mas não todas juntas: falta escolher', aberta: true },
  { classe: 'refutado', titulo: 'Refutados', descricao: 'as leis implicam o contrário (o modelo desativou)', aberta: true },
  { classe: 'numerico', titulo: 'Com números', descricao: 'o motor finito não decide; o Z3 decide' },
  { classe: 'adotada', titulo: 'Leis adotadas pelo modelo', descricao: 'criadas para fechar teoremas; grau D (decisão do modelo)', aberta: true },
  { classe: 'ativada', titulo: 'Leis ativadas pelo modelo', descricao: 'estavam desativadas e fecham teoremas', aberta: true },
  { classe: 'desativada', titulo: 'Desativadas pelo modelo', descricao: 'entravam em contradição', aberta: true },
  { classe: 'lei', titulo: 'Leis', descricao: 'premissas ativas, consistentes' },
  { classe: 'redundante', titulo: 'Leis redundantes', descricao: 'decorrem das outras: poderiam ser teoremas' },
  { classe: 'compativel', titulo: 'Desativadas que cabem', descricao: 'não contradizem as leis, mas nada precisou delas' },
  { classe: 'incompativel', titulo: 'Desativadas que não cabem', descricao: 'contradizem as leis ativas' },
  { classe: 'incerto', titulo: 'Sem conclusão', descricao: 'grandes demais, com erro ou fora da conferência' },
]

const COR: Partial<Record<Classe, string>> = {
  provado: 'segue',
  descoberta: 'segue',
  adotada: 'segue',
  ativada: 'segue',
  refutado: 'contradiz',
  conflito: 'contradiz',
  desativada: 'contradiz',
  incompativel: 'contradiz',
}

const NOME_EVENTO: Record<EventoModelo['tipo'], string> = {
  desativou: 'desativou',
  refutou: 'refutou',
  ativou: 'ativou',
  adotou: 'adotou',
  provou: 'provou',
  aviso: 'aviso',
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

const tempo = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 120_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60000)} min`)

/**
 * Segundo modelo: uma cópia das pastas escolhidas em que o motor decide
 * sozinho (desativa, ativa, adota leis) até o ponto fixo, e classifica tudo.
 */
export function Modelo() {
  const est = useEstado()
  const ver = useVerificacao()
  const cfg = useConfigModelo()
  const pf = usePerfil()
  const tags = useMemo(() => todasAsTags(est.notas), [est.notas])
  const notas = useMemo(() => notasDoModelo(est.notas, cfg.pastas), [est.notas, cfg.pastas])
  const pronto = useMemo(() => preparar(notas, est.dicionario), [notas, est.dicionario]).pronto
  const assinatura = useMemo(() => assinaturaModelo(notas, est.dicionario, cfg.pastas), [notas, est.dicionario, cfg.pastas])
  const ocupado = ver.ocupado === 'modelo'
  const [esperando, setEsperando] = useState(false)
  const exec = ver.modelo
  const conta = (c: Nota['compartimento']) => notas.filter((n) => n.compartimento === c && n.formulas.some((f) => f.trim())).length
  const comFormula = notas.filter((n) => n.formulas.some((f) => f.trim())).length
  const porTag = (t: string) => est.notas.filter((n) => n.tags.includes(t)).length

  return (
    <section class="cadeia modelo">
      <ModoCadeia atual="modelo" />
      <h2>Segundo modelo</h2>
      <p class="suave">
        Uma cópia das pastas que você escolher, onde o motor decide sozinho, sem pedir aprovação: confere se as leis se contradizem (e
        desativa a mais fraca do conflito), confere cada teorema (refuta os que as leis contradizem), adota a lei que fecha mais teoremas
        abertos — desde que ela não contradiga nada em nenhum mundo — e repete, rodada após rodada, até nada mais mudar. No fim, classifica
        tudo: provado, tese, em conflito, refutado, lei, redundante, adotada, desativada. Seu caderno não muda; se gostar do resultado, leve
        para o caderno.
      </p>

      <h3>Pastas que entram</h3>
      <div class="chips" role="group" aria-label="Pastas">
        <button type="button" class={!cfg.pastas.length ? 'chip ativo' : 'chip'} aria-pressed={!cfg.pastas.length} onClick={() => cfg.definirPastas([])}>
          Todas as notas
        </button>
        {tags.map((t) => (
          <button type="button" class={cfg.pastas.includes(t) ? 'chip ativo' : 'chip'} aria-pressed={cfg.pastas.includes(t)} onClick={() => cfg.alternarPasta(t)}>
            #{t} <small class="suave">{porTag(t)}</small>
          </button>
        ))}
      </div>
      <p class="suave">
        {cfg.pastas.length ? `Notas com ${cfg.pastas.map((p) => `#${p}`).join(' ou ')}: ` : 'Todas as notas: '}
        {plural(comFormula, 'nota', 'notas')} com fórmula — {plural(conta('lei'), 'lei', 'leis')}, {plural(conta('fato'), 'fato', 'fatos')},{' '}
        {plural(conta('visao'), 'visão', 'visões')}, {plural(conta('teorema'), 'teorema', 'teoremas')} (os teoremas desativados também são
        conferidos).
      </p>
      <label class="alternar">
        <input type="checkbox" checked={cfg.automatico} onChange={(e) => cfg.definirAutomatico((e.target as HTMLInputElement).checked)} />
        Rodar sozinho sempre que as notas dessas pastas mudarem, e avisar o que achou
      </label>

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
            disabled={!pronto || !comFormula || esperando}
            onClick={() => {
              // espera o trabalho atual do motor terminar (não o cancela); as notas são lidas na hora de rodar
              setEsperando(!!ver.ocupado)
              ver.quandoLivre(() => {
                setEsperando(false)
                const agora = notasDoModelo(estado.notas, cfg.pastas)
                ver.iniciarModelo(agora, cfg.pastas, estado.dicionario, 'iniciado por você')
              })
            }}
          >
            {esperando ? 'Na fila…' : exec ? 'Rodar de novo' : 'Rodar o segundo modelo'}
          </button>
        )}
        <span class="suave">
          até {MAX_RODADAS_MODELO} rodadas com {limiteTexto(pf.atual.Ninicial, pf.atual.Kinicial)}
          {pf.aprimorar && `; depois aprofunda até ${limiteTexto(pf.atual.limites.N, pf.atual.limites.K)}`}
        </span>
      </div>
      {esperando && <p class="suave">O motor está ocupado com outro trabalho; o modelo roda quando ele terminar.</p>}
      {!pronto && <p class="erro-texto">Confirme antes os nomes sem ficha, em Contradições.</p>}

      {exec && <Execucao exec={exec} desatualizada={exec.assinatura !== assinatura} ocupado={ocupado} />}
    </section>
  )
}

function Execucao({ exec, desatualizada, ocupado }: { exec: ExecucaoModelo; desatualizada: boolean; ocupado: boolean }) {
  const rel = exec.relatorio
  const situacao = exec.interrompida
    ? exec.interrompida === 'usuario'
      ? 'parado por você'
      : exec.interrompida === 'fechado'
        ? 'parou no meio (o app foi fechado)'
        : 'parou no meio (outro trabalho do motor)'
    : !exec.terminada
      ? rel?.situacao === 'final'
        ? 'classificando e aprofundando'
        : 'nas rodadas'
      : 'pronto'
  return (
    <div class="rodada">
      <h3>
        {exec.pastas.length ? exec.pastas.map((p) => `#${p}`).join(' ') : 'Todas as notas'}
        <span class="suave"> — {exec.motivo}</span>
      </h3>
      <div class="suave res-meta">
        {situacao}
        {rel && ` · ${rel.rodada} rodada${rel.rodada === 1 ? '' : 's'}`} · {tempo(exec.ms)} · {new Date(exec.quando).toLocaleString('pt-BR')}
        {exec.terminada && desatualizada && <span class="selo aviso"> desatualizado — as notas mudaram</span>}
      </div>
      {exec.erro && <p class="erro-texto">Falha no motor: {exec.erro}</p>}
      {rel?.parouPor && <p class="suave">Rodadas: {rel.parouPor}.</p>}
      {rel?.final && <Nivel final={rel.final} />}
      {rel && rel.situacao === 'pronto' && <Classificacao rel={rel} pastas={exec.pastas} travado={desatualizada || ocupado} />}
      {rel && rel.situacao !== 'pronto' && !rel.eventos.length && !exec.terminada && <p class="suave">Primeira rodada em andamento…</p>}
      {rel && rel.eventos.length > 0 && <Diario eventos={rel.eventos} aberto={rel.situacao !== 'pronto'} />}
    </div>
  )
}

/** Até onde a classificação foi conferida (o aprimoramento sobe N e K). */
function Nivel({ final }: { final: NonNullable<RelatorioModelo['final']> }) {
  return (
    <ul class="nivel-cadeia suave">
      {final.map((r) => (
        <li>
          {r.rotulo}: conferido em todos os mundos até {limiteTexto(r.N, r.K)}
          {r.aprimoramento?.situacao === 'aprofundando' && (
            <>
              {' '}
              <span class="girando" aria-hidden="true" /> aprofundando
            </>
          )}
          {r.aprimoramento?.parouPor && ` — ${r.aprimoramento.parouPor}`}
        </li>
      ))}
    </ul>
  )
}

/** Grau herdado de cada conclusão, com as notas do modelo (as leis adotadas são D). */
function grausDoModelo(rel: RelatorioModelo): Map<string, GrauHerdado> {
  const graus = new Map<string, GrauHerdado>()
  const conclusoes = rel.itens.filter((i) => i.apoio && (i.classe === 'provado' || i.classe === 'descoberta'))
  for (const it of [...conclusoes].sort((a, b) => (a.geracao ?? 99) - (b.geracao ?? 99))) graus.set(it.id, grauHerdado(it.apoio!, rel.notas, graus))
  return graus
}

function Classificacao({ rel: rel0, pastas, travado }: { rel: RelatorioModelo; pastas: string[]; travado: boolean }) {
  const est = useEstado()
  const z = useZ3()
  const z3ok = z.ativo && disponibilidadeZ3().ok
  // o Z3 decide o que tem números (as respostas chegam aos poucos)
  useEffect(() => {
    if (z3ok) {
      pedirZ3DoModelo(rel0, est.dicionario)
      faseZ3DoModelo()
    }
  }, [rel0, z3ok])
  const rel = z3ok ? { ...rel0, itens: itensComZ3(rel0, est.dicionario) } : rel0
  const pendentesZ3 = z3ok ? z3Pendentes(rel0, est.dicionario) : 0
  const consistencia = z3ok ? consistenciaZ3(rel0, est.dicionario) : []
  const numericos = rel0.itens.some((i) => i.classe === 'numerico')
  const graus = useMemo(() => grausDoModelo(rel0), [rel0])
  const mudancas = mudancasParaOCaderno(rel, est.notas)
  const [levado, setLevado] = useState<string | null>(null)
  const [escritas, setEscritas] = useState<Set<string>>(new Set())
  const titulo = (id: string) => rel.notas.find((n) => n.id === id)?.titulo || 'Sem título'

  const levar = async () => {
    const resumo = mudancas.map((m) => `• ${m.tipo === 'criar' ? 'criar' : m.tipo} “${m.nota.titulo || 'Sem título'}”`).join('\n')
    if (!confirm(`Levar para o caderno?\n\n${resumo}`)) return
    await levarParaOCaderno(mudancas, pastas)
    setLevado(`${mudancas.length} mudança${mudancas.length > 1 ? 's' : ''} levada${mudancas.length > 1 ? 's' : ''} para o caderno.`)
  }

  return (
    <>
      {numericos && !z.ativo && (
        <p class="z3 z3-aviso">
          Há fórmulas com números: quem as decide é o Z3.{' '}
          <button type="button" class="mini" onClick={() => void z.definirAtivo(true)}>
            Ligar o Z3
          </button>
        </p>
      )}
      {pendentesZ3 > 0 && (
        <p class="suave" aria-live="polite">
          <span class="girando" aria-hidden="true" /> o Z3 está conferindo {pendentesZ3} fórmula{pendentesZ3 > 1 ? 's' : ''} com números…
        </p>
      )}
      {consistencia.map((c) => {
        const r = z.consulta(c.chaveZ3)?.resultado
        return r === 'unsat' ? (
          <p class="erro-texto">
            ⚠ {c.rotulo}: as leis com números se contradizem (pelo Z3). Confira em Contradições, com o Z3 ligado, quais notas estão em conflito.
          </p>
        ) : r === 'sat' ? (
          <p class="status-ok">✓ {c.rotulo}: as leis com números são consistentes (pelo Z3).</p>
        ) : null
      })}
      <div class="resumo-modelo">
        {SECOES.map((s) => {
          const n = rel.itens.filter((i) => i.classe === s.classe).length
          return n ? (
            <span class={`selo m-${COR[s.classe] ?? 'neutro'}`}>
              {s.titulo}: {n}
            </span>
          ) : null
        })}
      </div>

      {SECOES.map((s) => {
        const itens = rel.itens.filter((i) => i.classe === s.classe)
        if (!itens.length) return null
        return (
          <details class="secao-modelo" open={s.aberta}>
            <summary>
              <b>
                {s.titulo} ({itens.length})
              </b>{' '}
              <span class="suave">— {s.descricao}</span>
            </summary>
            <ul class="lista-cadeia">
              {itens.map((it) => (
                <li class={COR[it.classe] ?? ''}>
                  <ItemTitulo it={it} />
                  <div class="formula-inline">{it.formula}</div>
                  <div class="suave">
                    {it.explicacao}
                    {it.geracao && it.geracao > 1 && ` · geração ${it.geracao}`}
                  </div>
                  {graus.get(it.id) && <GrauNoModelo g={graus.get(it.id)!} titulo={titulo} />}
                  {it.classe === 'descoberta' &&
                    (escritas.has(it.id) ? (
                      <p class="status-ok">✓ escrita como teorema no caderno</p>
                    ) : (
                      <button
                        type="button"
                        class="mini"
                        disabled={travado}
                        onClick={async () => {
                          await escreverComoTeorema(it, pastas)
                          setEscritas(new Set([...escritas, it.id]))
                        }}
                      >
                        Escrever como teorema
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </details>
        )
      })}

      <div class="levar-caderno">
        <h4>Levar para o caderno</h4>
        {levado ? (
          <p class="status-ok">✓ {levado}</p>
        ) : mudancas.length ? (
          <>
            <ul>
              {mudancas.map((m) => (
                <li>
                  <b>{m.tipo === 'criar' ? 'criar lei' : m.tipo === 'ativar' ? 'ativar' : 'desativar'}</b> “{m.nota.titulo || 'Sem título'}”
                  {m.tipo === 'criar' && <span class="suave"> (grau D, {[...pastas, 'segundo-modelo'].map((p) => `#${p}`).join(' ')})</span>}
                </li>
              ))}
            </ul>
            <button type="button" class="primario" disabled={travado} onClick={levar}>
              Levar {mudancas.length} mudança{mudancas.length > 1 ? 's' : ''} para o caderno
            </button>
            {travado && <p class="suave">Rode de novo antes: as notas mudaram desde esta execução.</p>}
          </>
        ) : (
          <p class="suave">Nada a mudar no caderno: o modelo não precisou ativar, desativar ou criar notas.</p>
        )}
      </div>
    </>
  )
}

function ItemTitulo({ it }: { it: ItemModelo }) {
  const real = it.notaId && !it.notaId.startsWith(PREFIXO_ADOTADA)
  const visao = it.chave.startsWith('visao:') ? <span class="selo c-visao">{it.chave.slice('visao:'.length)}</span> : null
  return (
    <div>
      {visao} {real ? <a href={`#/nota/${encodeURIComponent(it.notaId!)}`}>{it.titulo}</a> : <b>{it.titulo}</b>}
    </div>
  )
}

function GrauNoModelo({ g, titulo }: { g: GrauHerdado; titulo: (id: string) => string }) {
  if (g.grau === 'F') return <div class="grau-herdado g-F">F · estabelecido</div>
  const nomes = (ids: string[]) => ids.map(titulo).join(', ')
  return (
    <div class={`grau-herdado g-${g.grau}`}>
      {g.grau === 'M' ? 'M · depende de mapeamento não medido' : 'D · depende de decisão'}
      {g.por.M.length > 0 && ` — não medido: ${nomes(g.por.M)}`}
      {g.por.D.length > 0 && ` — decisão: ${nomes(g.por.D)}`}
    </div>
  )
}

function Diario({ eventos, aberto }: { eventos: EventoModelo[]; aberto: boolean }) {
  const rodadas = [...new Set(eventos.map((e) => e.rodada))]
  return (
    <details class="diario-modelo" open={aberto}>
      <summary>
        Diário das decisões ({eventos.length})
      </summary>
      {rodadas.map((r) => (
        <div>
          <h4>Rodada {r}</h4>
          <ul class="lista-cadeia">
            {eventos
              .filter((e) => e.rodada === r)
              .map((e) => (
                <li class={e.tipo === 'desativou' || e.tipo === 'refutou' ? 'contradiz' : e.tipo === 'aviso' ? '' : 'segue'}>
                  <b>{NOME_EVENTO[e.tipo]}</b> {e.titulo}
                  {e.conjunto && <span class="suave"> · {e.conjunto}</span>}
                  <div class="suave">{e.detalhe}</div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </details>
  )
}
