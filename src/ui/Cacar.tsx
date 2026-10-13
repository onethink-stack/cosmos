import { useEffect, useState } from 'preact/hooks'
import {
  assinaturaAlvo,
  avisosDaFormula,
  errosDaFormula,
  esqueletoFoundry,
  ESTADOS_ACHADO,
  N_CACADA,
  novaPromessa,
  novaRegra,
  rascunhoRelatorio,
  useCacada,
  type Achado,
  type Alvo,
  type ParecerZ3Cacada,
  type PromessaAlvo,
  type RegraAlvo,
  type ResultadoPromessa,
} from '../dados/cacada'
import { MODELOS, TREINOS } from '../dados/cacadaTreinos'
import { disponibilidadeZ3, useZ3 } from '../dados/z3'
import type { MundoExplicado } from '../motor/motor'
import { EditorFormulas } from './EditorFormulas'
import { FormulaExibida } from './FormulaExibida'
import { ArvorePassos, ModeloVisual } from './ResultadoVerificacao'

/** Baixa um texto como arquivo. */
function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const hoje = () => new Date().toISOString().slice(0, 10)
const nomeArquivo = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'alvo'

/** Caçar falhas lógicas: a lista de alvos, ou um alvo aberto. */
export function Cacar({ id }: { id?: string }) {
  const c = useCacada()
  useEffect(() => void c.carregar(), [])
  if (!c.carregado) return <p class="suave">Carregando…</p>
  if (!id) return <ListaAlvos />
  const alvo = c.alvo(id)
  if (!alvo)
    return (
      <section class="cacar">
        <p>Esse alvo não existe mais.</p>
        <a href="#/cacar">← Alvos</a>
      </section>
    )
  return <TelaAlvo alvo={alvo} />
}

function RegrasDoJogo({ aberto }: { aberto?: boolean }) {
  return (
    <details class="regras-jogo" open={aberto}>
      <summary>Um cenário é uma pista, não um bug — antes de reportar</summary>
      <p>
        O cenário mostra que as regras <em>que você escreveu</em> permitem a falha. Muitas vezes o código tem uma checagem que ficou de fora do
        modelo: escreva-a como regra e veja se o cenário some. Só vira falha quando uma sequência de chamadas reais leva a ele.
      </p>
      <ul>
        <li>
          <b>Teste no código, sempre.</b> LayerZero e Wormhole exigem prova de conceito em qualquer gravidade; a LayerZero diz que explicações não
          valem como prova, só código. Um cenário do motor, sozinho, não é aceito.
        </li>
        <li>
          <b>Só numa cópia local.</b> Os programas proíbem testar na rede principal e nas redes de teste públicas: use uma cópia local da rede (um
          fork, com Foundry ou Hardhat).
        </li>
        <li>
          <b>O que já é conhecido não paga</b>: falhas listadas nas auditorias publicadas ou já conhecidas pelo time.
        </li>
        <li>
          <b>Para receber</b>, os programas pedem identificação (KYC).
        </li>
        <li>
          <b>Quanto pagam</b> (consultado em outubro de 2026): LayerZero, até US$ 15 milhões por falha crítica e até US$ 250 mil por alta; Wormhole,
          até US$ 1 milhão. O valor depende do impacto provado (quanto dinheiro fica em risco), não do cenário.
        </li>
      </ul>
    </details>
  )
}

function ListaAlvos() {
  const c = useCacada()
  const [importado, setImportado] = useState<{ ok?: string; erro?: string } | null>(null)
  const abrir = (a: Alvo) => (location.hash = `#/cacar/${encodeURIComponent(a.id)}`)
  return (
    <section class="cacar">
      <h2>Caçar falhas lógicas</h2>
      <p class="suave">
        Escreva as regras que o código de um sistema segue e as promessas que a documentação faz. O motor procura um cenário pequeno em que todas
        as regras valem e uma promessa falha — a falha de lógica que ler o código linha por linha não mostra. Quando a promessa vale, ele aponta
        as regras que a sustentam: é nelas que o código não pode falhar em nenhum caminho.
      </p>
      <RegrasDoJogo />

      <div class="barra-acoes">
        <button type="button" class="primario" onClick={() => abrir(c.novoAlvo())}>
          + Novo alvo
        </button>
        {c.alvos.length > 0 && (
          <button type="button" onClick={() => baixar(`cacada-alvos-${hoje()}.json`, c.exportar())}>
            Exportar todos os alvos
          </button>
        )}
        <label class="botao-arquivo">
          Importar alvos
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const el = e.target as HTMLInputElement
              const arq = el.files?.[0]
              el.value = ''
              if (!arq) return
              const r = await c.importar(await arq.text())
              if (!r.ok) return setImportado({ erro: r.erro })
              const m = r.mescla
              const partes = [
                m.novos && `${m.novos} alvo${m.novos > 1 ? 's novos' : ' novo'}`,
                m.atualizados && `${m.atualizados} atualizado${m.atualizados > 1 ? 's' : ''} (a versão do arquivo era mais nova)`,
                m.achadosNovos && `${m.achadosNovos} achado${m.achadosNovos > 1 ? 's' : ''} somado${m.achadosNovos > 1 ? 's' : ''}`,
                r.ignorados && `${r.ignorados} ignorado${r.ignorados > 1 ? 's' : ''} (incompleto${r.ignorados > 1 ? 's' : ''})`,
              ].filter(Boolean)
              setImportado({ ok: partes.length ? `Importado: ${partes.join('; ')}.` : 'Nada novo: este aparelho já tinha tudo o que o arquivo traz.' })
            }}
          />
        </label>
      </div>
      {importado?.ok && <p class="status-ok">✓ {importado.ok}</p>}
      {importado?.erro && <p class="erro-texto">{importado.erro}</p>}
      <p class="suave">
        Vários aparelhos caçando juntos: cada um exporta os alvos em que trabalhou e importa os dos outros. O mais novo de cada alvo fica, e os
        achados dos dois lados se somam.
      </p>

      {c.alvos.length > 0 && (
        <ul class="lista-alvos">
          {c.alvos.map((a) => {
            const abertos = a.achados.filter((x) => x.estado !== 'descartado' && x.estado !== 'faltava-regra').length
            return (
              <li>
                <a href={`#/cacar/${encodeURIComponent(a.id)}`}>{a.nome || 'Sem nome'}</a>
                <span class="suave">
                  {' '}
                  · {a.regras.length} regra{a.regras.length === 1 ? '' : 's'} · {a.promessas.length} promessa{a.promessas.length === 1 ? '' : 's'}
                  {abertos > 0 && ` · ${abertos} achado${abertos === 1 ? '' : 's'} em aberto`}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <h3>Começar de um modelo</h3>
      <ul class="lista-treinos">
        {MODELOS.map((m) => (
          <li class="treino">
            <strong>{m.nome}</strong>
            <p>{m.nota}</p>
            <button type="button" class="mini" onClick={() => abrir(c.deModelo(m))}>
              Começar por este
            </button>
          </li>
        ))}
      </ul>

      <h3>Treinar com casos reais</h3>
      <p class="suave">
        Ataques públicos a pontes entre redes, modelados de forma simplificada a partir dos relatórios publicados. Em cada um, o motor acha a
        falha com as regras que o código tinha; depois, com a correção, a promessa passa a valer. É o jeito de aprender a escrever regras e
        promessas antes de olhar um sistema de verdade.
      </p>
      <ul class="lista-treinos">
        {TREINOS.map((t) => (
          <li class="treino">
            <strong>{t.nome}</strong> <span class="suave">— {t.quando}</span>
            <p>{t.resumo}</p>
            <button type="button" class="mini" onClick={() => abrir(c.deTreino(t))}>
              Treinar com este caso
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TelaAlvo({ alvo }: { alvo: Alvo }) {
  const c = useCacada()
  const z = useZ3()
  const assinatura = assinaturaAlvo(alvo)
  useEffect(() => c.garantirExame(alvo), [assinatura])
  const exame = c.exames.get(alvo.id)
  const emDia = exame?.assinatura === assinatura
  const salvar = (m: Partial<Alvo>) => c.salvar({ ...alvo, ...m })
  const treino = alvo.treino ? TREINOS.find((t) => t.id === alvo.treino) : undefined
  const corrigido = !!treino && alvo.regras.some((r) => r.id === treino.correcao.id)
  const modelo = alvo.modelo ? MODELOS.find((m) => m.id === alvo.modelo) : undefined

  const mudarRegra = (r: RegraAlvo) => salvar({ regras: alvo.regras.map((x) => (x.id === r.id ? r : x)) })
  const mudarPromessa = (p: PromessaAlvo) => salvar({ promessas: alvo.promessas.map((x) => (x.id === p.id ? p : x)) })

  return (
    <section class="cacar">
      <a href="#/cacar">← Alvos</a>
      <label class="campo-rotulo">
        Alvo (o sistema e o contrato, ex.: "LayerZero EndpointV2 — recebimento")
        <input type="text" value={alvo.nome} onInput={(e) => salvar({ nome: (e.target as HTMLInputElement).value })} />
      </label>
      <div class="linha-campos">
        <label class="campo-rotulo cresce">
          Programa de recompensa (endereço)
          <input type="text" inputMode="url" placeholder="https://immunefi.com/bug-bounty/…" value={alvo.programa} onInput={(e) => salvar({ programa: (e.target as HTMLInputElement).value })} />
        </label>
        {/^https?:\/\//.test(alvo.programa) && (
          <a class="abrir-programa" href={alvo.programa} target="_blank" rel="noopener noreferrer">
            abrir
          </a>
        )}
      </div>
      <label class="campo-rotulo">
        Escopo (contratos e impactos que o programa aceita)
        <textarea rows={2} value={alvo.escopo} onInput={(e) => salvar({ escopo: (e.target as HTMLTextAreaElement).value })} />
      </label>

      {treino && (
        <div class="resultado res-aviso">
          <strong>Caso de treino</strong>
          <p>
            Com as regras abaixo, a promessa deve furar: veja o cenário e compare com o que aconteceu. Depois aplique a correção e veja a promessa
            passar a valer{z.ativo ? ' (e o Z3 provar)' : ''}.
          </p>
          {corrigido ? (
            <p class="status-ok">✓ Correção aplicada: {treino.correcao.titulo}.</p>
          ) : (
            <>
              <p class="suave">{treino.correcao.explicacao}</p>
              <button
                type="button"
                class="mini"
                onClick={() => {
                  const nova: RegraAlvo = { ...treino.correcao, ativa: true }
                  const regras = treino.correcao.substitui
                    ? alvo.regras.map((r) => (r.id === treino.correcao.substitui ? nova : r))
                    : [...alvo.regras, nova]
                  salvar({ regras })
                }}
              >
                Aplicar a correção
              </button>
            </>
          )}
        </div>
      )}

      {modelo && (
        <div class="resultado res-aviso">
          <strong>Modelo inicial</strong>
          <p>{modelo.nota}</p>
        </div>
      )}

      <AvisoZ3 />

      <h3>Regras — o que o código faz</h3>
      <p class="suave">
        Uma regra por checagem (um require, um if, um valor padrão), com a fonte. Os nomes valem pelo uso: P(x) é uma propriedade, f(x) é uma
        função, o resto é um nome. Separe os tipos (ex.: ∀x ¬(Mensagem(x) ∧ Conta(x))), senão o motor pode juntar coisas que no sistema são
        diferentes.
      </p>
      {alvo.regras.map((r, i) => (
        <EditorRegra
          r={r}
          numero={i + 1}
          onMudar={mudarRegra}
          onRemover={() => salvar({ regras: alvo.regras.filter((x) => x.id !== r.id) })}
        />
      ))}
      <button type="button" onClick={() => salvar({ regras: [...alvo.regras, novaRegra()] })}>
        + Regra
      </button>

      <h3>Promessas — o que a documentação garante</h3>
      <p class="suave">
        A frase da documentação e a fórmula dela. O motor procura um cenário com até {N_CACADA} objetos em que todas as regras ativas valem e a
        promessa falha.
      </p>
      {exame?.rodando && emDia && (
        <p class="suave" aria-live="polite">
          <span class="girando" aria-hidden="true" /> examinando{exame.msg ? `: ${exame.msg}` : '…'}
        </p>
      )}
      {alvo.promessas.map((p, i) => (
        <div class="promessa-alvo">
          <EditorPromessa
            p={p}
            numero={i + 1}
            onMudar={mudarPromessa}
            onRemover={() => salvar({ promessas: alvo.promessas.filter((x) => x.id !== p.id) })}
          />
          <ResultadoDaPromessa
            alvo={alvo}
            promessa={p}
            r={emDia ? exame?.resultados[p.id] : undefined}
            esperando={!emDia || !!exame?.rodando}
          />
        </div>
      ))}
      <button type="button" onClick={() => salvar({ promessas: [...alvo.promessas, novaPromessa()] })}>
        + Promessa
      </button>

      {alvo.achados.length > 0 && (
        <>
          <h3>Achados</h3>
          <p class="suave">Cada cenário guardado, do jeito que estava quando foi achado. Só com o teste no código ele vira um relatório.</p>
          {alvo.achados.map((a) => (
            <CartaoAchado alvo={alvo} a={a} />
          ))}
        </>
      )}

      <RegrasDoJogo />
      <div class="barra-acoes">
        <button type="button" onClick={() => baixar(`cacada-${nomeArquivo(alvo.nome)}-${hoje()}.json`, c.exportar([alvo.id]))}>
          Exportar este alvo
        </button>
        <button
          type="button"
          class="discreto perigo"
          onClick={() => {
            if (!confirm(`Apagar o alvo "${alvo.nome || 'Sem nome'}", com as regras, as promessas e os achados?`)) return
            c.remover(alvo.id)
            location.hash = '#/cacar'
          }}
        >
          Apagar este alvo
        </button>
      </div>
    </section>
  )
}

function AvisoZ3() {
  const z = useZ3()
  if (z.ativo && disponibilidadeZ3().ok) return null
  const d = disponibilidadeZ3()
  return (
    <p class="z3 z3-aviso">
      {z.ativo && !d.ok
        ? `O Z3 não está disponível (${d.motivo}): o que vale fica conferido só até ${N_CACADA} objetos.`
        : `O Z3 está desligado: sem ele, o que vale fica conferido só até ${N_CACADA} objetos (sem prova para sistemas maiores).`}{' '}
      {!z.ativo && (
        <button type="button" class="mini" onClick={() => void z.definirAtivo(true)}>
          Ligar o Z3
        </button>
      )}
    </p>
  )
}

/** A regra fechada: o título, a fórmula e a fonte; "Editar" abre o editor (a nova, vazia, já vem aberta). */
function EditorRegra(props: { r: RegraAlvo; numero: number; onMudar: (r: RegraAlvo) => void; onRemover: () => void }) {
  const { r, numero, onMudar } = props
  const [aberto, setAberto] = useState(!r.formula.trim())
  if (!aberto)
    return (
      <div class={`regra-alvo fechada${r.ativa ? '' : ' inativa'}`}>
        <div class="linha-campos">
          <span class="cresce">
            <b>Regra {numero}.</b> {r.titulo || <span class="suave">sem título</span>}
          </span>
          <label class="alternar">
            <input type="checkbox" checked={r.ativa} onChange={(e) => onMudar({ ...r, ativa: (e.target as HTMLInputElement).checked })} /> ativa
          </label>
          <button type="button" class="mini" onClick={() => setAberto(true)}>
            Editar
          </button>
        </div>
        <FormulaExibida texto={r.formula} />
        <ProblemasDaFormula texto={r.formula} />
        {r.fonte && <p class="suave fonte">{r.fonte}</p>}
      </div>
    )
  return <EditorRegraAberto {...props} onFechar={() => setAberto(false)} />
}

function EditorRegraAberto({ r, numero, onMudar, onRemover, onFechar }: { r: RegraAlvo; numero: number; onMudar: (r: RegraAlvo) => void; onRemover: () => void; onFechar: () => void }) {
  return (
    <div class={`regra-alvo${r.ativa ? '' : ' inativa'}`}>
      <div class="linha-campos">
        <label class="campo-rotulo cresce">
          Regra {numero}
          <input type="text" placeholder="o que o código faz, em palavras" value={r.titulo} onInput={(e) => onMudar({ ...r, titulo: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="alternar">
          <input type="checkbox" checked={r.ativa} onChange={(e) => onMudar({ ...r, ativa: (e.target as HTMLInputElement).checked })} /> ativa
        </label>
      </div>
      <EditorFormulas
        formulas={[r.formula]}
        onChange={([f]) => onMudar({ ...r, formula: f ?? '' })}
        dicionario={[]}
        semFichas
        unica={{ rotulo: `Fórmula da regra ${numero}`, onEnter: () => undefined }}
      />
      <div class="linha-campos">
        <label class="campo-rotulo cresce">
          Onde está no código
          <input type="text" placeholder="arquivo, função, linha" value={r.fonte} onInput={(e) => onMudar({ ...r, fonte: (e.target as HTMLInputElement).value })} />
        </label>
        <button type="button" class="discreto" onClick={onRemover}>
          Remover
        </button>
        <button type="button" class="mini" disabled={!r.formula.trim()} onClick={onFechar}>
          Pronto
        </button>
      </div>
    </div>
  )
}

/** A promessa fechada: o título, a frase da documentação e a fórmula; "Editar" abre o editor. */
function EditorPromessa(props: { p: PromessaAlvo; numero: number; onMudar: (p: PromessaAlvo) => void; onRemover: () => void }) {
  const { p, numero } = props
  const [aberto, setAberto] = useState(!p.formula.trim())
  if (!aberto)
    return (
      <div class="regra-alvo fechada">
        <div class="linha-campos">
          <span class="cresce">
            <b>Promessa {numero}.</b> {p.titulo || <span class="suave">sem título</span>}
          </span>
          <button type="button" class="mini" onClick={() => setAberto(true)}>
            Editar
          </button>
        </div>
        {p.citacao && <p class="citacao">“{p.citacao}”</p>}
        <FormulaExibida texto={p.formula} />
        <ProblemasDaFormula texto={p.formula} />
        {p.fonte && <p class="suave fonte">{p.fonte}</p>}
      </div>
    )
  return <EditorPromessaAberto {...props} onFechar={() => setAberto(false)} />
}

function EditorPromessaAberto({ p, numero, onMudar, onRemover, onFechar }: { p: PromessaAlvo; numero: number; onMudar: (p: PromessaAlvo) => void; onRemover: () => void; onFechar: () => void }) {
  return (
    <div class="regra-alvo">
      <label class="campo-rotulo">
        Promessa {numero}
        <input type="text" placeholder="em palavras, ex.: todo depósito válido pode ser sacado" value={p.titulo} onInput={(e) => onMudar({ ...p, titulo: (e.target as HTMLInputElement).value })} />
      </label>
      <label class="campo-rotulo">
        O que a documentação diz (copie a frase)
        <textarea rows={2} value={p.citacao} onInput={(e) => onMudar({ ...p, citacao: (e.target as HTMLTextAreaElement).value })} />
      </label>
      <EditorFormulas
        formulas={[p.formula]}
        onChange={([f]) => onMudar({ ...p, formula: f ?? '' })}
        dicionario={[]}
        semFichas
        unica={{ rotulo: `Fórmula da promessa ${numero}`, onEnter: () => undefined }}
      />
      <div class="linha-campos">
        <label class="campo-rotulo cresce">
          Onde está na documentação
          <input type="text" placeholder="endereço ou seção" value={p.fonte} onInput={(e) => onMudar({ ...p, fonte: (e.target as HTMLInputElement).value })} />
        </label>
        <button type="button" class="discreto" onClick={onRemover}>
          Remover
        </button>
        <button type="button" class="mini" disabled={!p.formula.trim()} onClick={onFechar}>
          Pronto
        </button>
      </div>
    </div>
  )
}

/** Fechada, a fórmula ainda mostra o que está errado nela (inválida, ou um aviso como o do escopo). */
function ProblemasDaFormula({ texto }: { texto: string }) {
  if (errosDaFormula(texto).length) return <p class="erro-texto">Fórmula inválida: fica de fora do exame. Abra para ver o erro.</p>
  const avisos = avisosDaFormula(texto)
  return avisos.length ? (
    <ul class="aviso-texto avisos-formula">
      {avisos.map((a) => (
        <li>Aviso: {a}</li>
      ))}
    </ul>
  ) : null
}

function Cenario({ mundo, rotulo, aberto }: { mundo: MundoExplicado; rotulo: string; aberto?: boolean }) {
  return (
    <details class="explicacao" open={aberto}>
      <summary>{rotulo}</summary>
      <ArvorePassos p={mundo.passos} />
      <ModeloVisual m={mundo.modelo} />
    </details>
  )
}

function LinhaZ3({ z }: { z?: ParecerZ3Cacada }) {
  if (!z || z.estado === 'desligado') return null
  switch (z.estado) {
    case 'rodando':
      return (
        <p class="suave">
          <span class="girando" aria-hidden="true" /> o Z3 está tentando provar para qualquer número de objetos…
        </p>
      )
    case 'provada':
      return <p class="status-ok">✓ O Z3 provou: vale para qualquer número de objetos (inclusive infinitos).</p>
    case 'provada-falsa':
      return <p class="erro-texto">O Z3 provou: as regras implicam o contrário da promessa, com qualquer número de objetos.</p>
    case 'fura':
      return (
        <p class="erro-texto">
          ⚠ O Z3 achou um cenário com as regras e a promessa falsa — maior do que {N_CACADA} objetos (ou infinito), grande demais para mostrar.
          Ela não está garantida.
        </p>
      )
    case 'regras-contraditorias':
      return <p class="erro-texto">O Z3 confirmou: as regras se contradizem.</p>
    case 'nao-sei':
      return <p class="suave">O Z3 não achou prova no tempo que teve.</p>
  }
}

function ResultadoDaPromessa({ alvo, promessa, r, esperando }: { alvo: Alvo; promessa: PromessaAlvo; r?: ResultadoPromessa; esperando: boolean }) {
  const c = useCacada()
  if (!promessa.formula.trim()) return null
  if (!r) return esperando ? <p class="suave">esperando o exame…</p> : null
  const titulo = (id: string) => alvo.regras.find((x) => x.id === id)
  const e = r.exame
  switch (e.tipo) {
    case 'fura':
      return (
        <div class="resultado res-conflito">
          <strong>Fura: há um cenário com {e.mundo.n} objeto{e.mundo.n === 1 ? '' : 's'} em que todas as regras valem e a promessa falha.</strong>
          <p>
            É uma pista, não um bug. Procure no código uma checagem que impeça este cenário: achou? Escreva-a como regra (o cenário some ou muda).
            Não achou? Monte as chamadas reais que levam a ele num teste, numa cópia local da rede.
          </p>
          <Cenario mundo={e.mundo} rotulo="Ver o cenário e onde a promessa falha" aberto />
          {jaGuardado(alvo, promessa.id, e.mundo) ? (
            <p class="status-ok">✓ Este cenário está nos achados, abaixo.</p>
          ) : (
            <button type="button" class="mini" onClick={() => c.guardarAchado(alvo.id, promessa.id, e.mundo)}>
              Guardar como achado (pista)
            </button>
          )}
        </div>
      )
    case 'sempre-falsa':
      return (
        <div class="resultado res-conflito">
          <strong>A promessa falha sempre: as regras implicam o contrário (em todo cenário até {e.N} objetos).</strong>
          <LinhaZ3 z={r.z3} />
          {e.regras.length > 0 && (
            <>
              <p>Bastam estas regras para isso:</p>
              <ListaRegras ids={e.regras} alvo={alvo} />
            </>
          )}
          <Cenario mundo={e.mundo} rotulo="Ver um cenário" />
        </div>
      )
    case 'vale': {
      const provada = r.z3?.estado === 'provada'
      return (
        <div class={`resultado ${e.vazia || r.z3?.estado === 'fura' ? 'res-aviso' : provada ? 'res-ok' : 'res-aviso'}`}>
          <strong>{provada ? 'Vale: provada para qualquer número de objetos.' : `Vale em todos os cenários até ${e.N} objetos.`}</strong>
          {!provada && r.z3?.estado !== 'fura' && <p class="suave">Sem prova para sistemas maiores{r.z3 ? '' : ' (ligue o Z3)'}.</p>}
          <LinhaZ3 z={r.z3} />
          {e.vazia && (
            <p class="aviso-texto">
              ⚠ Vale de graça: o que ela supõe nunca acontece com estas regras ({e.vazia} é impossível). Ou falta uma regra que deixa isso
              acontecer, ou o sistema trava algo que deveria funcionar — o que também pode ser uma falha.
            </p>
          )}
          {e.sustentam.length > 0 ? (
            <>
              <p>
                <b>Regras que a sustentam</b> — sem qualquer uma delas, a promessa fura. É aqui que o código não pode falhar em nenhum caminho:
                confira cada lugar que pode quebrar estas regras.
              </p>
              <ul class="lista-conflito">
                {e.sustentam.map((s) => {
                  const regra = titulo(s.id)
                  return (
                    <li>
                      {regra?.titulo || 'Regra sem título'}
                      {regra && <FormulaExibida texto={regra.formula} />}
                      {regra?.fonte && <span class="suave">{regra.fonte}</span>}
                      {s.semEla && <Cenario mundo={s.semEla} rotulo="Sem ela, este cenário fura a promessa" />}
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p class="suave">Vale sem depender de nenhuma regra (é verdade por si mesma).</p>
          )}
        </div>
      )
    }
    case 'regras-contraditorias':
      return (
        <div class="resultado res-conflito">
          <strong>As regras se contradizem: nenhum cenário com até {e.N} objetos satisfaz todas.</strong>
          <p>Assim qualquer promessa "valeria". Confira as regras: alguma está errada, ou duas descrevem caminhos que não podem coexistir.</p>
          <LinhaZ3 z={r.z3} />
        </div>
      )
    case 'nao-decide':
      return (
        <div class="resultado res-aviso">
          <strong>O motor finito não decidiu: {e.motivo}.</strong>
          <LinhaZ3 z={r.z3} />
        </div>
      )
    case 'invalida':
      return <p class="erro-texto">A fórmula da promessa é inválida.</p>
  }
}

/** o mesmo cenário (mesma promessa, mesmo modelo) já foi guardado como achado? */
const jaGuardado = (alvo: Alvo, promessaId: string, mundo: MundoExplicado) => {
  const m = JSON.stringify(mundo.modelo)
  return alvo.achados.some((a) => a.promessaId === promessaId && JSON.stringify(a.mundo.modelo) === m)
}

function ListaRegras({ ids, alvo }: { ids: string[]; alvo: Alvo }) {
  return (
    <ul class="lista-conflito">
      {ids
        .map((id) => alvo.regras.find((r) => r.id === id))
        .filter((r): r is RegraAlvo => !!r)
        .map((r) => (
          <li>
            {r.titulo || 'Regra sem título'}
            <FormulaExibida texto={r.formula} />
          </li>
        ))}
    </ul>
  )
}

function CartaoAchado({ alvo, a }: { alvo: Alvo; a: Achado }) {
  const c = useCacada()
  const [copiado, setCopiado] = useState<'relatorio' | 'teste' | null>(null)
  const pr = alvo.promessas.find((p) => p.id === a.promessaId)
  const comTeste = a.estado === 'poc' || a.estado === 'reportado'
  const info = ESTADOS_ACHADO.find((x) => x.estado === a.estado)
  const texto = rascunhoRelatorio(alvo, a)
  const teste = esqueletoFoundry(alvo, a)
  const copiar = (qual: 'relatorio' | 'teste', t: string) =>
    void navigator.clipboard?.writeText(t).then(
      () => setCopiado(qual),
      () => setCopiado(null),
    )
  return (
    <div class={`resultado ${a.estado === 'descartado' || a.estado === 'faltava-regra' ? '' : comTeste ? 'res-ok' : 'res-aviso'} achado`}>
      <div class="linha-campos">
        <strong class="cresce">{pr?.titulo || a.promessa}</strong>
        <span class="suave">{new Date(a.quando).toLocaleString('pt-BR')}</span>
      </div>
      <label class="campo-rotulo">
        Situação
        <select value={a.estado} onChange={(e) => c.mudarAchado(alvo.id, a.id, { estado: (e.target as HTMLSelectElement).value as Achado['estado'] })}>
          {ESTADOS_ACHADO.map((x) => (
            <option value={x.estado}>{x.nome}</option>
          ))}
        </select>
      </label>
      {info && <p class="suave">{info.dica}</p>}
      <Cenario mundo={a.mundo} rotulo={`Ver o cenário (${a.regras.length} regras ativas quando foi achado)`} />
      <label class="campo-rotulo">
        O que você conferiu no código
        <textarea rows={2} value={a.anotacao} onInput={(e) => c.mudarAchado(alvo.id, a.id, { anotacao: (e.target as HTMLTextAreaElement).value })} />
      </label>
      <label class="campo-rotulo">
        Prova de conceito: o teste que reproduz a falha (onde está e como rodar)
        <textarea rows={3} value={a.poc} onInput={(e) => c.mudarAchado(alvo.id, a.id, { poc: (e.target as HTMLTextAreaElement).value })} />
      </label>
      {!comTeste && (
        <p class="aviso-texto">
          Sem um teste no código que reproduza a falha, os programas não aceitam o relatório. Marque "Teste pronto" quando ele rodar.
        </p>
      )}
      <details class="explicacao">
        <summary>Esqueleto do teste (Foundry, para rodar numa cópia local da rede)</summary>
        <pre class="rascunho">{teste}</pre>
      </details>
      <details class="explicacao">
        <summary>Rascunho do relatório (em inglês, a língua dos programas)</summary>
        <pre class="rascunho">{texto}</pre>
      </details>
      <div class="barra-acoes">
        <button type="button" class="mini" onClick={() => copiar('teste', teste)}>
          {copiado === 'teste' ? '✓ Copiado' : 'Copiar o esqueleto do teste'}
        </button>
        <button type="button" class="mini" onClick={() => copiar('relatorio', texto)}>
          {copiado === 'relatorio' ? '✓ Copiado' : 'Copiar o rascunho'}
        </button>
        <button
          type="button"
          class="discreto"
          onClick={() => {
            if (confirm('Apagar este achado?')) c.removerAchado(alvo.id, a.id)
          }}
        >
          Apagar
        </button>
      </div>
    </div>
  )
}
