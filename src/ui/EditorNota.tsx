import { useEffect, useState } from 'preact/hooks'
import { estado, notaVazia, useEstado } from '../dados/estado'
import { montarTarefas, verificacao } from '../dados/verificacao'
import { COMPARTIMENTOS, NOME_COMPARTIMENTO, NOME_GRAU, type Compartimento, type Grau, type Nota } from '../dados/tipos'
import type { Diag } from '../logica/ast'
import { EditorFormulas } from './EditorFormulas'
import { guarda, ir } from './rotas'
import { StatusVerificacao } from './StatusVerificacao'

const GRAUS: Grau[] = ['F', 'M', 'D']

// status da verificação feita ao salvar, por nota (sobrevive à troca nova → #/nota/id)
const statusPorNota = new Map<string, { chave: string; bloqueado: boolean } | null>()

const limparTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))]
const comparavel = (n: Nota) => JSON.stringify({ ...n, formulas: n.formulas.filter((f) => f.trim()), atualizadaEm: '' })

export function EditorNota({ id, compartimento }: { id?: string; compartimento?: Compartimento }) {
  const est = useEstado()
  const original = id ? est.nota(id) : undefined
  const [base, setBase] = useState<Nota>(() => original ?? notaVazia(compartimento))
  const [nota, setNota] = useState<Nota>(base)
  const [tagsTexto, setTagsTexto] = useState(base.tags.join(', '))
  const [aviso, setAviso] = useState<string | null>(null)
  const [verificado, setVerificadoLocal] = useState(() => (id ? (statusPorNota.get(id) ?? null) : null))

  const atual = { ...nota, tags: limparTags(tagsTexto) }
  const sujo = comparavel(atual) !== comparavel(base)

  // pede confirmação ao sair com alterações não salvas
  useEffect(() => {
    guarda.sair = sujo ? () => confirm('Há alterações não salvas nesta nota. Sair sem salvar?') : null
    const antesDeFechar = (e: BeforeUnloadEvent) => {
      if (sujo) e.preventDefault()
    }
    window.addEventListener('beforeunload', antesDeFechar)
    return () => {
      guarda.sair = null
      window.removeEventListener('beforeunload', antesDeFechar)
    }
  }, [sujo])

  if (id && !original && est.carregado) {
    return (
      <section>
        <p>Nota não encontrada.</p>
        <a href="#/notas">Voltar para a lista</a>
      </section>
    )
  }

  const mudar = (p: Partial<Nota>) => setNota((n) => ({ ...n, ...p }))

  const salvar = async () => {
    const limpa: Nota = { ...atual, formulas: atual.formulas.filter((f) => f.trim()) }
    if (!limpa.formulas.length) limpa.formulas = []
    const salva = await est.salvarNota(limpa)
    const nova = { ...salva, formulas: salva.formulas.length ? salva.formulas : [''] }
    setBase(nova)
    setNota(nova)
    setTagsTexto(nova.tags.join(', '))
    guarda.sair = null
    mostrar('Nota salva')
    verificarAoSalvar(salva)
    if (!id) ir(`#/nota/${encodeURIComponent(salva.id)}`, true)
  }

  /** Ao salvar uma nota ativa com fórmulas, verifica o conjunto dela (geral ou do titular). */
  const verificarAoSalvar = (salva: Nota) => {
    const setVerificado = (v: { chave: string; bloqueado: boolean } | null) => {
      statusPorNota.set(salva.id, v)
      setVerificadoLocal(v)
    }
    if (!salva.ativa || !salva.formulas.length) return setVerificado(null)
    const chave = salva.compartimento === 'visao' ? `visao:${salva.titular.trim() || '(sem titular)'}` : 'geral'
    const { tarefas, pronto } = montarTarefas(estado.notas, estado.dicionario)
    const t = tarefas.find((x) => x.chave === chave)
    if (!pronto) return setVerificado({ chave, bloqueado: true })
    if (!t) return setVerificado(null)
    setVerificado({ chave, bloqueado: false })
    // um trabalho longo em andamento (cadeia, teoremas…) não é cancelado: a checagem espera a vez
    if (verificacao.ocupado && verificacao.ocupado !== 'verificar')
      return verificacao.quandoLivre(() => {
        const atual = montarTarefas(estado.notas, estado.dicionario).tarefas.find((x) => x.chave === chave)
        if (atual) verificacao.iniciar([atual], estado.dicionario)
      })
    verificacao.iniciar([t], estado.dicionario)
  }

  const apagar = async () => {
    if (!confirm(`Apagar a nota "${nota.titulo || 'sem título'}"? Isto não pode ser desfeito.`)) return
    guarda.sair = null
    if (nota.id) await est.apagarNota(nota.id)
    ir('#/notas', true)
  }

  const mostrar = (msg: string) => {
    setAviso(msg)
    setTimeout(() => setAviso((a) => (a === msg ? null : a)), 2500)
  }

  const criarFicha = async (f: NonNullable<Diag['ficha']>) => {
    if (est.dicionario.some((e) => e.simbolo === f.simbolo)) return
    await est.salvarEntradas({ id: '', termo: f.simbolo, simbolo: f.simbolo, tipo: f.tipo, aridade: f.aridade, definicao: '' })
    mostrar(`Ficha de '${f.simbolo}' criada. Complete o termo e a definição no Dicionário.`)
  }

  return (
    <section class="editor-nota">
      <div class="barra-acoes">
        <a href="#/notas" class="botao discreto">
          ← Notas
        </a>
        <span class="suave">{id ? 'Editando' : 'Nova nota'}</span>
      </div>

      <label class="campo-rotulo">
        Título
        <input type="text" value={nota.titulo} onInput={(e) => mudar({ titulo: (e.target as HTMLInputElement).value })} />
      </label>

      <div class="campo-rotulo">
        Compartimento
        <div class="segmentado" role="radiogroup">
          {COMPARTIMENTOS.map((c) => (
            <button
              type="button"
              role="radio"
              aria-checked={nota.compartimento === c}
              class={`c-${c}${nota.compartimento === c ? ' ativo' : ''}`}
              onClick={() => mudar({ compartimento: c })}
            >
              {NOME_COMPARTIMENTO[c]}
            </button>
          ))}
        </div>
      </div>

      {nota.compartimento === 'lei' && (
        <div class="campo-rotulo">
          Grau
          <div class="segmentado" role="radiogroup">
            {GRAUS.map((g) => (
              <button type="button" role="radio" aria-checked={nota.grau === g} class={nota.grau === g ? 'ativo' : ''} onClick={() => mudar({ grau: g })}>
                <b>{g}</b> <small>{NOME_GRAU[g]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {nota.compartimento === 'fato' && (
        <div class="linha-campos">
          <label class="campo-rotulo cresce">
            Fonte (texto ou link)
            <input type="text" value={nota.fonte} onInput={(e) => mudar({ fonte: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="campo-rotulo">
            Data
            <input type="date" value={nota.data} onInput={(e) => mudar({ data: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
      )}

      {nota.compartimento === 'visao' && (
        <>
          <label class="campo-rotulo">
            Titular (quem acredita)
            <input
              type="text"
              placeholder="ex.: cristãos, Nietzsche"
              value={nota.titular}
              onInput={(e) => mudar({ titular: (e.target as HTMLInputElement).value })}
            />
          </label>
          <p class="nota-visao">
            Cada fórmula φ desta nota vale como <b>B<sub>{nota.titular || 'titular'}</sub>(φ)</b>: "{nota.titular || 'o titular'} acredita
            que φ". Ela nunca entra como premissa do motor geral; só é checada junto com as outras visões do mesmo titular.
          </p>
        </>
      )}

      {nota.compartimento === 'teorema' && (
        <>
          <label class="campo-rotulo">
            Conferir contra a visão de (opcional)
            <input
              type="text"
              placeholder="vazio = leis e fatos"
              value={nota.titular}
              onInput={(e) => mudar({ titular: (e.target as HTMLInputElement).value })}
            />
          </label>
          <p class="nota-teorema">
            Um teorema não entra como premissa. Em <b>Contradições → Teoremas</b> e na <b>Reação em cadeia</b>, o app confere se cada fórmula
            desta nota segue {nota.titular.trim() ? <>da visão de <b>{nota.titular.trim()}</b></> : 'das leis e fatos ativos'} — e mostra de
            quais notas, ou um contraexemplo. Use o texto livre para a demonstração.
          </p>
        </>
      )}

      <h2>Fórmulas</h2>
      <EditorFormulas formulas={nota.formulas} onChange={(formulas) => mudar({ formulas })} dicionario={est.dicionario} onCriarFicha={criarFicha} />

      <label class="campo-rotulo">
        Texto livre
        <textarea rows={5} value={nota.texto} onInput={(e) => mudar({ texto: (e.target as HTMLTextAreaElement).value })} />
      </label>

      <label class="campo-rotulo">
        Tags (separadas por vírgula)
        <input type="text" value={tagsTexto} onInput={(e) => setTagsTexto((e.target as HTMLInputElement).value)} autocapitalize="off" />
      </label>

      <label class="alternar grande">
        <input type="checkbox" checked={nota.ativa} onChange={() => mudar({ ativa: !nota.ativa })} />
        Ativa (entra no motor de contradição)
      </label>

      {id && (
        <p class="suave">
          Criada em {new Date(nota.criadaEm).toLocaleString('pt-BR')} · alterada em {new Date(nota.atualizadaEm).toLocaleString('pt-BR')}
        </p>
      )}

      <div class="rodape-acoes">
        {verificado && (
          <div class="rodape-status">
            <StatusVerificacao chave={verificado.chave} bloqueado={verificado.bloqueado} />
          </div>
        )}
        {id ? (
          <button type="button" class="discreto perigo" onClick={apagar}>
            Apagar
          </button>
        ) : (
          <span />
        )}
        <span class="suave" aria-live="polite">
          {aviso ?? (sujo ? 'Alterações não salvas' : '')}
        </span>
        <button type="button" class="primario" onClick={salvar} disabled={!sujo && !!id}>
          Salvar
        </button>
      </div>
    </section>
  )
}
