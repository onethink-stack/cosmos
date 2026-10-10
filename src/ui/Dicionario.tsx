import { useMemo, useState } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { NOME_TIPO, type EntradaDicionario, type TipoSimbolo } from '../dados/tipos'
import { lex } from '../logica/lexer'
import { deduzirFichas } from '../logica/nomes'
import { ConfirmarNomes } from './ConfirmarNomes'

const VAZIA: EntradaDicionario = { id: '', termo: '', simbolo: '', tipo: 'constante', aridade: 0, definicao: '' }

/** O símbolo precisa ser um único nome válido na linguagem. */
export function erroSimbolo(simbolo: string, outros: EntradaDicionario[], id: string): string | null {
  const s = simbolo.trim()
  if (!s) return 'Informe o símbolo.'
  const { tokens, erros } = lex(s)
  if (erros.length || tokens.length !== 2 || tokens[0].t !== 'nome')
    return 'O símbolo deve ser um nome só: letras e dígitos, sem espaços nem símbolos lógicos.'
  if (outros.some((e) => e.simbolo === s && e.id !== id)) return `Já existe uma ficha para '${s}'.`
  return null
}

export function Dicionario() {
  const est = useEstado()
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<EntradaDicionario | null>(null)

  const propostas = useMemo(
    () => deduzirFichas(est.notas.flatMap((n) => n.formulas.map((texto) => ({ texto, notaId: n.id }))), est.dicionario),
    [est.notas, est.dicionario],
  )

  const q = busca.trim().toLowerCase()
  const lista = est.dicionario.filter(
    (e) => !q || e.simbolo.toLowerCase().includes(q) || e.termo.toLowerCase().includes(q) || e.definicao.toLowerCase().includes(q),
  )

  return (
    <section>
      <h2>Nomes sem ficha</h2>
      <ConfirmarNomes propostas={propostas} />

      <h2>Fichas ({est.dicionario.length})</h2>
      <div class="barra-acoes">
        <input type="search" class="busca" placeholder="Buscar símbolo, termo ou definição" value={busca} onInput={(e) => setBusca((e.target as HTMLInputElement).value)} />
        <button type="button" class="primario" onClick={() => setEditando({ ...VAZIA })}>
          + Ficha
        </button>
      </div>

      {editando && !editando.id && <FormFicha entrada={editando} onFechar={() => setEditando(null)} />}

      <ul class="lista-fichas">
        {lista.map((e) =>
          editando?.id === e.id ? (
            <li>
              <FormFicha entrada={editando} onFechar={() => setEditando(null)} />
            </li>
          ) : (
            <li class="ficha" onClick={() => setEditando({ ...e })}>
              <code class="simbolo">{e.simbolo}</code>
              <span class="ficha-tipo">
                {e.tipo === 'constante' ? 'constante' : `${NOME_TIPO[e.tipo]}/${e.aridade}`}
                {e.numerico ? ' · número' : ''}
              </span>
              <span class="ficha-termo">{e.termo !== e.simbolo ? e.termo : ''}</span>
              {e.definicao && <div class="ficha-def">{e.definicao}</div>}
            </li>
          ),
        )}
      </ul>
      {!est.dicionario.length && <p class="suave">O dicionário está vazio.</p>}
    </section>
  )
}

function FormFicha({ entrada, onFechar }: { entrada: EntradaDicionario; onFechar: () => void }) {
  const est = useEstado()
  const [e, setE] = useState(entrada)
  const [tentou, setTentou] = useState(false)
  const erro = erroSimbolo(e.simbolo, est.dicionario, e.id)
  const mudar = (p: Partial<EntradaDicionario>) => setE((x) => ({ ...x, ...p }))

  const usos = useMemo(() => {
    if (!entrada.id) return 0
    return est.notas.filter((n) => n.formulas.some((f) => f.includes(entrada.simbolo))).length
  }, [entrada, est.notas])

  const salvar = async (ev: Event) => {
    ev.preventDefault()
    setTentou(true)
    if (erro) return
    await est.salvarEntradas({
      ...e,
      simbolo: e.simbolo.trim(),
      termo: e.termo.trim() || e.simbolo.trim(),
      aridade: e.tipo === 'constante' ? 0 : e.aridade,
      numerico: e.tipo !== 'predicado' && !!e.numerico ? true : undefined,
    })
    onFechar()
  }

  const apagar = async () => {
    const aviso = usos ? ` Ele aparece em ${usos} nota(s), que voltarão a avisar "não declarado".` : ''
    if (!confirm(`Apagar a ficha de '${entrada.simbolo}'?${aviso}`)) return
    await est.apagarEntrada(entrada.id)
    onFechar()
  }

  return (
    <form class="form-ficha" onSubmit={salvar}>
      <div class="linha-campos">
        <label class="campo-rotulo">
          Símbolo
          <input type="text" value={e.simbolo} autocapitalize="off" onInput={(x) => mudar({ simbolo: (x.target as HTMLInputElement).value })} />
        </label>
        <label class="campo-rotulo cresce">
          Termo por extenso
          <input type="text" value={e.termo} onInput={(x) => mudar({ termo: (x.target as HTMLInputElement).value })} />
        </label>
      </div>
      {tentou && erro && <div class="erro-texto">{erro}</div>}
      <div class="linha-campos">
        <label class="campo-rotulo">
          Tipo
          <select value={e.tipo} onChange={(x) => mudar({ tipo: (x.target as HTMLSelectElement).value as TipoSimbolo })}>
            <option value="constante">constante</option>
            <option value="funcao">função</option>
            <option value="predicado">predicado</option>
          </select>
        </label>
        {e.tipo !== 'constante' && (
          <label class="campo-rotulo">
            Aridade
            <input type="number" min={0} max={9} value={e.aridade} onInput={(x) => mudar({ aridade: Number((x.target as HTMLInputElement).value) || 0 })} />
          </label>
        )}
      </div>
      {e.tipo === 'predicado' && e.aridade === 0 && <p class="suave">Predicado de aridade 0 = proposição: pode ser usado sozinho como fórmula (ex.: P ∧ Q).</p>}
      {e.tipo !== 'predicado' && (
        <label class="alternar">
          <input type="checkbox" checked={!!e.numerico} onChange={(x) => mudar({ numerico: (x.target as HTMLInputElement).checked })} />
          É um número real (entra em contas: +, −, ·, /, ^ e comparações &lt;, ≤){e.tipo === 'funcao' ? '; a função recebe números' : ''}
        </label>
      )}
      <label class="campo-rotulo">
        Definição
        <textarea rows={3} value={e.definicao} onInput={(x) => mudar({ definicao: (x.target as HTMLTextAreaElement).value })} />
      </label>
      <div class="rodape-acoes">
        {entrada.id ? (
          <button type="button" class="discreto perigo" onClick={apagar}>
            Apagar
          </button>
        ) : (
          <span />
        )}
        <button type="button" class="discreto" onClick={onFechar}>
          Cancelar
        </button>
        <button type="submit" class="primario">
          Salvar
        </button>
      </div>
    </form>
  )
}
