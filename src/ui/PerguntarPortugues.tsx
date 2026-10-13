import { useEffect, useMemo, useState } from 'preact/hooks'
import { useConselheiro } from '../dados/conselheiro'
import { salvarDeduzida } from '../dados/deduzida'
import { useEstado } from '../dados/estado'
import { MAX_CANDIDATOS, usePerguntas, type Conversa, type RespostaDeQuem } from '../dados/perguntas'
import type { Resposta, Veredito } from '../dados/resposta'
import { MODELOS_CLAUDE, useTradutor } from '../dados/tradutor'
import type { EntradaDicionario, Nota } from '../dados/tipos'
import { useVerificacao, verificacao } from '../dados/verificacao'
import { useZ3 } from '../dados/z3'
import { lerEmPortugues } from '../logica/leitura'
import type { Formula } from '../logica/ast'
import { validar } from '../logica/validador'
import { montarTarefas, type Tarefa } from '../motor/tarefas'
import { EditorFormulas } from './EditorFormulas'
import { FormulaExibida } from './FormulaExibida'
import { ArvorePassos, ModeloVisual } from './ResultadoVerificacao'

// o que foi digitado fica ao trocar de tela
let textoSalvo = ''
let chaveSalva = 'geral'

/** A pergunta em português: traduz, mostra como entendeu, e responde só com prova, cenário ou "não sei". */
export function PerguntarPortugues() {
  const est = useEstado()
  const p = usePerguntas()
  const z = useZ3()
  useVerificacao()
  const { tarefas } = useMemo(() => montarTarefas(est.notas, est.dicionario), [est.notas, est.dicionario])
  const [texto, setTextoLocal] = useState(textoSalvo)
  const [chave, setChaveLocal] = useState(chaveSalva)
  const setTexto = (t: string) => setTextoLocal((textoSalvo = t))
  const setChave = (c: string) => setChaveLocal((chaveSalva = c))
  // "tudo junto" mistura crenças com leis: aqui só leis e fatos, ou uma visão
  const conjuntos = tarefas.filter((t) => t.chave !== 'tudo')
  const tarefa = conjuntos.find((t) => t.chave === chave) ?? conjuntos[0]

  const perguntar = (t = texto) => {
    if (t.trim() && tarefa) void p.perguntar(t.trim(), tarefa.chave)
  }
  const c = p.atual

  return (
    <section class="perguntar-pt">
      <h2>Perguntar</h2>
      <p class="suave">
        Pergunte em português. O Caderno traduz a pergunta para uma fórmula, mostra como entendeu, e responde <b>só com o que dá para garantir</b>{' '}
        a partir das suas notas: provado, um cenário que mostra que não decorre, ou "não sei" — nunca uma opinião.
      </p>

      {!z.ativo && (
        <p class="aviso-texto">
          O Z3 está desligado: sem ele, nada é provado para qualquer número de objetos, e as respostas param em "vale nos cenários até N".{' '}
          <button type="button" class="mini" onClick={() => void z.definirAtivo(true)}>
            Ligar o Z3
          </button>
        </p>
      )}

      {conjuntos.length > 1 && (
        <label class="campo-rotulo">
          Responder a partir de
          <select value={tarefa?.chave} onChange={(e) => setChave((e.target as HTMLSelectElement).value)}>
            {conjuntos.map((t) => (
              <option value={t.chave}>{t.rotulo}</option>
            ))}
          </select>
        </label>
      )}

      <label class="campo-rotulo">
        Sua pergunta
        <textarea
          rows={2}
          value={texto}
          placeholder="Ex.: Todo homem é mortal?"
          onInput={(e) => setTexto((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              perguntar()
            }
          }}
        />
      </label>
      <div class="barra-acoes">
        {p.ocupada ? (
          <>
            <span class="girando" aria-hidden="true" />
            <span class="suave" aria-live="polite">
              {c?.etapa === 'traduzindo' ? 'traduzindo' : (c?.msg ?? 'pensando')}…
            </span>
            <button type="button" onClick={() => p.cancelar()}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" class="primario" disabled={!texto.trim() || !tarefa} onClick={() => perguntar()}>
            Perguntar
          </button>
        )}
      </div>
      <Exemplos tarefa={tarefa} dicionario={est.dicionario} onEscolher={(t) => (setTexto(t), perguntar(t))} />

      {c && <ConversaAtual c={c} dicionario={est.dicionario} notas={est.notas} rotulo={conjuntos.find((t) => t.chave === c.chave)?.rotulo} />}

      <ConfigTradutor />
      <PainelConselheiro />

      {p.recentes.length > 0 && (
        <details class="explicacao">
          <summary>Perguntas anteriores ({p.recentes.length})</summary>
          <ul class="lista-simples">
            {p.recentes.map((r) => (
              <li>
                <button
                  type="button"
                  class="link"
                  onClick={() => {
                    setTexto(r.texto)
                    setChave(r.chave)
                    void p.perguntar(r.texto, r.chave, r.corrigida ? r.formula : undefined)
                  }}
                >
                  {r.texto}
                </button>{' '}
                <span class="suave">— {r.veredito === 'quem' ? 'lista de nomes' : NOME_VEREDITO[r.veredito]}</span>
              </li>
            ))}
          </ul>
          <button type="button" class="mini" onClick={() => p.esquecerRecentes()}>
            Esquecer as perguntas anteriores
          </button>
        </details>
      )}
    </section>
  )
}

const NOME_VEREDITO: Record<Veredito, string> = {
  sim: 'sim (provado)',
  nao: 'não (provado)',
  'nao-decidem': 'as notas não decidem',
  'nao-decorre': 'não decorre das notas',
  'quase-sim': 'não sei (vale até N)',
  'quase-nao': 'não sei (falha até N)',
  'nao-sei': 'não sei',
  contraditorias: 'as notas se contradizem',
  discordam: 'os motores discordam',
}

/** perguntas de exemplo feitas com as palavras do próprio dicionário (que o tradutor do aparelho entende) */
function Exemplos({ tarefa, dicionario, onEscolher }: { tarefa?: Tarefa; dicionario: EntradaDicionario[]; onEscolher: (t: string) => void }) {
  const exemplos = useMemo(() => {
    if (!tarefa) return []
    const fichas = new Map(dicionario.map((e) => [e.simbolo, e]))
    const nome = (s: string) => fichas.get(s)?.termo.trim() || s
    // só palavras que o tradutor do aparelho lê sem tropeçar
    const simples = (s: string) => /^[\p{L} ]+$/u.test(nome(s))
    const unario = (f: Formula, v?: string): string | null =>
      f.k === 'pred' && f.args.length === 1 && f.args[0].k === 'nome' && (v === undefined || f.args[0].nome === v) && simples(f.nome) ? f.nome : null
    const asts = tarefa.grupos.flatMap((g) => g.formulas.map((f) => validar(f, dicionario).ast).filter((a): a is Formula => !!a))
    // uma lei "todo A é B" e um fato "c é A": perguntas que decorrem das notas
    const leis = asts.flatMap((a) => {
      if (a.k !== 'forall' || a.corpo.k !== 'imp') return []
      const de = unario(a.corpo.l, a.v)
      const para = unario(a.corpo.r, a.v)
      return de && para ? [{ de, para }] : []
    })
    const fatos = asts.flatMap((a) => {
      const p = unario(a)
      const arg = a.k === 'pred' ? a.args[0] : undefined
      return p && arg?.k === 'nome' && fichas.get(arg.nome)?.tipo === 'constante' && simples(arg.nome) ? [{ p, c: arg.nome }] : []
    })
    const r: string[] = []
    const lei = leis.find((l) => fatos.some((f) => f.p === l.de)) ?? leis[0]
    const fato = lei ? fatos.find((f) => f.p === lei.de) : fatos[0]
    if (fato) r.push(`${nome(fato.c)} é ${nome(lei?.para ?? fato.p)}?`)
    if (lei) r.push(`Todo ${nome(lei.de)} é ${nome(lei.para)}?`, `Quem é ${nome(lei.para)}?`)
    else if (fato) r.push(`Quem é ${nome(fato.p)}?`)
    return r
  }, [tarefa, dicionario])
  if (!exemplos.length) return null
  return (
    <p class="suave exemplos">
      Exemplos com as suas palavras:{' '}
      {exemplos.map((t) => (
        <button type="button" class="mini" onClick={() => onEscolher(t)}>
          {t}
        </button>
      ))}
    </p>
  )
}

function ConversaAtual({ c, dicionario, notas, rotulo }: { c: Conversa; dicionario: EntradaDicionario[]; notas: Nota[]; rotulo?: string }) {
  const p = usePerguntas()
  const [corrigindo, setCorrigindo] = useState<string | null>(null)
  const t = c.traducao

  const leitura = (f: string) => {
    const ast = validar(f, dicionario).ast
    return ast ? lerEmPortugues(ast, dicionario) : null
  }

  return (
    <div class="conversa">
      {t && !t.ok && (
        <div class="resultado res-aviso">
          <strong>Não entendi a pergunta</strong>
          <p>{t.erro}</p>
          {t.explicacao && <p class="suave">O Claude disse: {t.explicacao}</p>}
          {t.por === 'aparelho' && (
            <p class="suave">
              O tradutor do aparelho entende frases simples com as palavras do Dicionário (ex.: "Todo X é Y?", "a é X?", "Quem é X?"). Você também
              pode escrever a fórmula direto, ou ligar o Claude em "Tradutor", abaixo, para perguntas mais livres.
            </p>
          )}
        </div>
      )}

      {t?.ok && (
        <div class="entendi">
          <p class="suave">
            Entendi assim{' '}
            {t.por === 'aparelho' ? '(tradutor do aparelho)' : t.por === 'claude' ? '(traduzido pelo Claude — confira)' : '(fórmula sua)'}
            {rotulo && ` · ${rotulo}`}:
          </p>
          <FormulaExibida texto={t.formula} />
          {leitura(t.formula) && <p class="leitura">“{leitura(t.formula)}”</p>}
          {t.tipo === 'quem' && <p class="suave">Pergunta de nomes: cada nome que aparece nas notas no lugar de {t.variavel}.</p>}
          {t.explicacao && <p class="suave">O Claude leu: {t.explicacao}</p>}
          {corrigindo === null ? (
            !p.ocupada && (
              <button type="button" class="mini" onClick={() => setCorrigindo(t.formula)}>
                Não é isso: corrigir a fórmula
              </button>
            )
          ) : (
            <div class="corrigir">
              <EditorFormulas
                formulas={[corrigindo]}
                onChange={([f]) => setCorrigindo(f ?? '')}
                dicionario={dicionario}
                unica={{ rotulo: 'Fórmula da pergunta', onEnter: () => undefined }}
              />
              <div class="barra-acoes">
                <button
                  type="button"
                  class="primario"
                  disabled={!validar(corrigindo, dicionario, { exigirFichas: true }).ok}
                  onClick={() => {
                    void p.perguntar(c.texto, c.chave, corrigindo.trim())
                    setCorrigindo(null)
                  }}
                >
                  Responder esta
                </button>
                <button type="button" onClick={() => setCorrigindo(null)}>
                  Desistir
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {c.erro && <p class="erro-texto">{c.erro}</p>}
      {c.resposta && <CartaoResposta r={c.resposta} chave={c.chave} notas={notas} />}
      {c.quem && <ListaDeQuem q={c.quem} dicionario={dicionario} terminou={c.etapa === 'pronto'} />}
    </div>
  )
}

function ListaNotas({ ids, notas }: { ids: string[]; notas: Nota[] }) {
  return (
    <ul class="lista-conflito">
      {ids
        .map((id) => notas.find((n) => n.id === id))
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
}

function Motivos({ r }: { r: Resposta }) {
  if (!r.motivos.length) return null
  return (
    <p class="suave">
      Por que não há resposta certa: {r.motivos.join('; ')}.
    </p>
  )
}

function Cenario({ r, rotulo }: { r: Resposta; rotulo: string }) {
  if (!r.mundo) return null
  return (
    <details class="explicacao">
      <summary>{rotulo}</summary>
      <ArvorePassos p={r.mundo.passos} />
      <ModeloVisual m={r.mundo.modelo} />
    </details>
  )
}

function CartaoResposta({ r, chave, notas }: { r: Resposta; chave: string; notas: Nota[] }) {
  const [salva, setSalva] = useState<string | null>(null)
  const salvar = async (provado: boolean) => {
    const nova = await salvarDeduzida(r.formula, chave, r.notas, r.N ?? verificacao.N, provado)
    setSalva(nova.id)
  }
  const botaoSalvar = (provado: boolean) =>
    r.notas.length > 0 &&
    (salva ? (
      <p class="status-ok">
        ✓ Nota criada. <a href={`#/nota/${encodeURIComponent(salva)}`}>Abrir</a>
      </p>
    ) : (
      <button type="button" class="mini" onClick={() => void salvar(provado)}>
        {provado ? 'Salvar como lei (provada)' : 'Salvar como teorema (sem prova)'}
      </button>
    ))

  switch (r.veredito) {
    case 'sim':
      return (
        <div class="resultado res-ok">
          <strong>Sim.</strong>
          <p>Provado: segue das suas notas com qualquer número de objetos (inclusive infinitos).</p>
          <Conselho r={r} />
          {r.notas.length > 0 ? (
            <>
              <p>A prova usou{r.notas.length > 1 ? ` estas ${r.notas.length} notas` : ' esta nota'}:</p>
              <ListaNotas ids={r.notas} notas={notas} />
            </>
          ) : (
            <p>Vale sempre, sem depender de nenhuma nota.</p>
          )}
          {botaoSalvar(true)}
        </div>
      )
    case 'nao':
      return (
        <div class="resultado res-conflito">
          <strong>Não.</strong>
          <p>Provado: as suas notas dizem o contrário, com qualquer número de objetos.</p>
          <Conselho r={r} />
          {r.notas.length > 0 && (
            <>
              <p>A prova usou:</p>
              <ListaNotas ids={r.notas} notas={notas} />
            </>
          )}
          <Cenario r={r} rotulo="Ver um cenário das suas notas, onde ela falha" />
        </div>
      )
    case 'nao-decidem':
      return (
        <div class="resultado res-aviso">
          <strong>As suas notas não decidem.</strong>
          <p>Há um cenário em que todas elas valem e isto é verdade, e outro em que é falso. Para decidir, falta uma lei ou um fato.</p>
          <Conselho r={r} />
          <Cenario r={r} rotulo="Ver o cenário em que é falso" />
        </div>
      )
    case 'nao-decorre':
      return (
        <div class="resultado res-aviso">
          <strong>Não decorre das suas notas.</strong>
          <p>Há um cenário em que todas elas valem e isto é falso. (Não deu para saber se elas o contradizem.)</p>
          <Conselho r={r} />
          <Cenario r={r} rotulo="Ver esse cenário" />
          <Motivos r={r} />
        </div>
      )
    case 'quase-sim':
      return (
        <div class="resultado res-aviso">
          <strong>Não sei — provavelmente sim, mas sem prova.</strong>
          <p>
            Vale em todos os cenários com até {r.N} objetos em que as suas notas valem, mas não há prova para tamanhos maiores (há fórmulas que valem
            em todo cenário finito e falham num infinito).
          </p>
          <Motivos r={r} />
          {r.notas.length > 0 && (
            <>
              <p>Notas necessárias (até {r.N} objetos):</p>
              <ListaNotas ids={r.notas} notas={notas} />
            </>
          )}
          {botaoSalvar(false)}
        </div>
      )
    case 'quase-nao':
      return (
        <div class="resultado res-aviso">
          <strong>Não sei — provavelmente não, mas sem prova.</strong>
          <p>Falha em todos os cenários com até {r.N} objetos em que as suas notas valem, mas não há prova para tamanhos maiores.</p>
          <Motivos r={r} />
          <Cenario r={r} rotulo="Ver um cenário das suas notas, onde ela falha" />
        </div>
      )
    case 'nao-sei':
      return (
        <div class="resultado res-aviso">
          <strong>Não sei.</strong>
          <Motivos r={r} />
        </div>
      )
    case 'contraditorias':
      return (
        <div class="resultado res-conflito">
          <strong>As suas notas se contradizem.</strong>
          <p>
            {r.definitiva ? 'Provado pelo Z3' : `Não há cenário com até ${r.N} objetos em que todas valham`}: com notas contraditórias, qualquer coisa
            "seguiria" — a resposta não diria nada. Resolva o conflito em <a href="#/contradicoes">Contradições</a>.
          </p>
          {r.notas.length > 0 && <ListaNotas ids={r.notas} notas={notas} />}
        </div>
      )
    case 'discordam':
      return (
        <div class="resultado res-erro">
          <strong>Os motores discordam.</strong>
          <p>O motor finito achou um cenário e o Z3, uma prova do contrário: é um defeito, e nenhuma resposta é dada.</p>
        </div>
      )
  }
}

function ListaDeQuem({ q, dicionario, terminou }: { q: RespostaDeQuem; dicionario: EntradaDicionario[]; terminou: boolean }) {
  const nome = (s: string) => dicionario.find((e) => e.simbolo === s)?.termo.trim() || s
  if (!q.candidatos.length) return <p class="aviso-texto">Nenhum nome (constante do dicionário) aparece nas notas deste conjunto: não há a quem perguntar.</p>
  const grupos: [string, string, (r: Resposta) => boolean][] = [
    ['Sim (provado)', 'res-ok', (r) => r.veredito === 'sim'],
    ['Não (provado)', 'res-conflito', (r) => r.veredito === 'nao'],
    ['Sem prova: vale até N objetos', 'res-aviso', (r) => r.veredito === 'quase-sim'],
    ['As notas não dizem', 'res-aviso', (r) => r.veredito === 'nao-decidem' || r.veredito === 'nao-decorre' || r.veredito === 'quase-nao'],
    ['Não sei', 'res-aviso', (r) => r.veredito === 'nao-sei' || r.veredito === 'discordam' || r.veredito === 'contraditorias'],
  ]
  return (
    <div class="quem">
      {grupos.map(([titulo, classe, filtro]) => {
        const nomes = q.feitos.filter((f) => filtro(f.resposta)).map((f) => nome(f.simbolo))
        return (
          nomes.length > 0 && (
            <div class={`resultado ${classe}`}>
              <strong>{titulo}</strong>
              <p>{nomes.join(', ')}</p>
            </div>
          )
        )
      })}
      <p class="suave">
        {terminou ? 'Testados' : 'Testando'} {q.feitos.length} de {q.candidatos.length} nomes que aparecem nas notas
        {q.deFora > 0 && ` (${q.deFora} ficaram de fora: o máximo é ${MAX_CANDIDATOS})`}.
      </p>
    </div>
  )
}

/** O que o conselheiro fez nesta resposta (ele só antecipa e recorta: quem decide é o motor finito e o Z3). */
function Conselho({ r }: { r: Resposta }) {
  const recorte = (r.veredito === 'sim' ? r.z3Segue : r.veredito === 'nao' ? r.z3Contradiz : null)?.recorte
  const texto = r.atalho
    ? 'Decidido na hora: o conselheiro já conhecia cenários das suas notas em que isto vale e em que não vale — nem o motor finito nem o Z3 precisaram procurar.'
    : r.mundoConhecido
      ? 'O cenário veio dos que o conselheiro guardou (as suas notas de agora valem nele): ninguém precisou procurar.'
      : recorte
        ? `O Z3 recebeu só ${recorte.usadas} das ${recorte.total} notas (${recorte.etapa === 'sugeridas' ? 'as que o conselheiro sugeriu' : 'as ligadas à pergunta pelos nomes'}) e provou com elas — o que é prova com todas.`
        : null
  return texto ? <p class="suave conselho">Conselheiro: {texto}</p> : null
}

/** O que o conselheiro aprendeu e se ele está ajudando. */
function PainelConselheiro() {
  const c = useConselheiro()
  useEffect(() => void c.carregar(), [])
  const e = c.estatisticas()
  const seg = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)
  return (
    <details class="explicacao painel-conselheiro">
      <summary>
        Conselheiro: {e.mundos} cenário{e.mundos === 1 ? '' : 's'} e {e.provas} prova{e.provas === 1 ? '' : 's'} guardados
      </summary>
      <p class="suave">
        O conselheiro aprende com cada pergunta e com cada rodada da reação em cadeia, e só muda a <b>ordem</b> e o <b>recorte</b> do que o motor
        finito e o Z3 conferem — nunca a resposta. Ele guarda cenários em que as suas notas valem (uma pergunta falsa num deles não segue: isso já é
        um cenário real) e as notas que cada prova usou (para uma pergunta parecida, elas vão primeiro ao Z3; se não bastarem, vêm as outras).
        Um cenário só é usado depois de conferir que as notas de agora valem nele.
      </p>
      <ul class="lista-simples">
        <li>
          Perguntas decididas na hora pelos cenários guardados: <b>{e.decididasPorMundos}</b>
          {e.refutadasPorMundos > e.decididasPorMundos && ` (e em mais ${e.refutadasPorMundos - e.decididasPorMundos} um cenário guardado mostrou que não segue)`}
        </li>
        <li>
          Provas do Z3 só com as notas sugeridas: <b>{e.provasSugeridas.n}</b>
          {e.provasSugeridas.n > 0 &&
            ` — em média ${e.provasSugeridas.premissas.toFixed(0)} de ${e.provasSugeridas.total.toFixed(0)} notas, em ${seg(e.provasSugeridas.ms)}`}
        </li>
        <li>
          Provas que precisaram de mais notas: <b>{e.provasComMais.n}</b>
          {e.provasComMais.n > 0 && ` — em média ${seg(e.provasComMais.ms)}`}
        </li>
        <li>
          Checagens do Z3 sem decisão no prazo: <b>{e.semDecisao}</b>
        </li>
        <li class="suave">{e.tentativas} tentativas registradas neste aparelho</li>
      </ul>
      {(e.mundos > 0 || e.provas > 0 || e.tentativas > 0) && (
        <button type="button" class="mini" onClick={() => void c.esquecer()}>
          Esquecer o que o conselheiro aprendeu
        </button>
      )}
    </details>
  )
}

function ConfigTradutor() {
  const t = useTradutor()
  const [chave, setChave] = useState('')
  return (
    <details class="explicacao config-tradutor">
      <summary>Tradutor: {t.claudePronto ? `aparelho + ${MODELOS_CLAUDE.find((m) => m.id === t.modelo)?.nome.split(' (')[0]}` : 'só o do aparelho'}</summary>
      <p class="suave">
        O tradutor do aparelho entende português simples, sem internet e sem adivinhar. Para perguntas mais livres, um modelo de linguagem pode
        traduzir — só traduzir: a resposta continua vindo só das suas notas, pelo motor finito e pelo Z3, e a tradução aparece para você conferir.
      </p>
      <label class="alternar">
        <input type="checkbox" checked={t.usarClaude} onChange={(e) => t.definir({ usarClaude: (e.target as HTMLInputElement).checked })} /> Quando o
        tradutor do aparelho não entender, usar o Claude (pela internet)
      </label>
      {t.usarClaude && (
        <>
          <label class="campo-rotulo">
            Modelo
            <select value={t.modelo} onChange={(e) => t.definir({ modelo: (e.target as HTMLSelectElement).value })}>
              {MODELOS_CLAUDE.map((m) => (
                <option value={m.id}>{m.nome}</option>
              ))}
            </select>
          </label>
          <label class="campo-rotulo">
            Chave da API da Anthropic {t.chave ? '(guardada neste aparelho)' : ''}
            <input
              type="password"
              autocomplete="off"
              value={chave}
              placeholder={t.chave ? '•••••••• (cole outra para trocar)' : 'sk-ant-…'}
              onInput={(e) => setChave((e.target as HTMLInputElement).value)}
            />
          </label>
          <div class="barra-acoes">
            <button
              type="button"
              class="mini"
              disabled={!chave.trim()}
              onClick={() => {
                t.definir({ chave })
                setChave('')
              }}
            >
              Guardar a chave
            </button>
            {t.chave && (
              <button type="button" class="mini" onClick={() => t.definir({ chave: '' })}>
                Apagar a chave
              </button>
            )}
          </div>
          <p class="suave">
            Crie a chave em console.anthropic.com (cobrada por uso). Com o Claude ligado, quando ele é usado, a pergunta e os nomes do seu
            dicionário (símbolo, tipo e nome por extenso) vão para a Anthropic; as notas e as definições, não. A chave fica só neste aparelho e não
            entra no backup.
          </p>
        </>
      )}
    </details>
  )
}
