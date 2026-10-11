import { useMemo, useState } from 'preact/hooks'
import { estado, notaVazia, useEstado } from '../dados/estado'
import { historico, NOME_RESULTADO, useHistorico, type Achado, type ResultadoAchado } from '../dados/historico'
import { limiteTexto } from '../motor/avaliar'
import { FormulaExibida } from './FormulaExibida'

/** filtros da tela: o que mostrar */
const FILTROS: { id: string; nome: string; quer: (a: Achado) => boolean }[] = [
  { id: 'tudo', nome: 'Tudo', quer: () => true },
  { id: 'segue', nome: 'Teoremas provados', quer: (a) => a.tipo === 'teorema' && a.resultado === 'segue' },
  { id: 'nao-segue', nome: 'Não seguem', quer: (a) => a.resultado === 'nao-segue' },
  { id: 'contradiz', nome: 'Refutados', quer: (a) => a.resultado === 'contradiz' },
  { id: 'tempo', nome: 'Sem decisão', quer: (a) => a.resultado === 'tempo' },
  { id: 'descoberta', nome: 'Descobertas', quer: (a) => a.resultado === 'descoberta' },
  { id: 'lei', nome: 'Leis do modelo', quer: (a) => a.tipo === 'lei' },
  { id: 'conflito', nome: 'Conflitos', quer: (a) => a.resultado === 'conflito' },
]

const data = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const sem = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Tudo o que a reação em cadeia e o segundo modelo já concluíram, guardado no aparelho. */
export function Historico() {
  const h = useHistorico()
  const est = useEstado()
  const [filtro, setFiltro] = useState('tudo')
  const [busca, setBusca] = useState('')
  const [mostrar, setMostrar] = useState(60)
  const escritas = useMemo(() => new Set(est.notas.flatMap((n) => n.formulas.map((f) => f.replace(/\s+/g, '')))), [est.notas])
  const contagem = useMemo(() => new Map(FILTROS.map((f) => [f.id, h.achados.filter(f.quer).length])), [h.achados])
  const lista = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro) ?? FILTROS[0]
    const termos = sem(busca).split(/\s+/).filter(Boolean)
    return h.achados
      .filter(f.quer)
      .filter((a) => {
        if (!termos.length) return true
        const alvo = sem(`${a.titulo} ${a.formula} ${a.explicacao} ${a.contexto} ${a.notas.map((n) => n.titulo).join(' ')}`)
        return termos.every((t) => alvo.includes(t))
      })
      .sort((a, b) => b.ultimaVez.localeCompare(a.ultimaVez))
  }, [h.achados, filtro, busca])

  const baixar = () => {
    const blob = new Blob([JSON.stringify({ app: 'caderno-logico', tipo: 'historico', exportadoEm: new Date().toISOString(), achados: h.achados }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `caderno-historico-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <section class="historico">
      <h2>Histórico</h2>
      <p class="suave">
        Tudo o que a reação em cadeia e o segundo modelo já concluíram: teoremas decididos, consequências descobertas, leis que o modelo criou,
        conflitos. Fica guardado neste aparelho — rodadas novas não apagam o que as anteriores acharam — e vai junto no backup. Cada achado aparece
        uma vez; se o resultado de um teorema mudar, entra outro, e dá para ver a evolução.
      </p>
      {!h.carregado ? (
        <p class="suave">Carregando…</p>
      ) : !h.achados.length ? (
        <p class="suave">Ainda nada: rode a reação em cadeia ou o segundo modelo, e o que eles concluírem aparece aqui.</p>
      ) : (
        <>
          <div class="chips" role="group" aria-label="Filtro">
            {FILTROS.map((f) => (
              <button type="button" class={filtro === f.id ? 'chip ativo' : 'chip'} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.nome} <small class="suave">{contagem.get(f.id)}</small>
              </button>
            ))}
          </div>
          <div class="barra-acoes">
            <input
              type="search"
              class="busca"
              placeholder="procurar por título, fórmula ou nota de origem"
              value={busca}
              onInput={(e) => setBusca((e.target as HTMLInputElement).value)}
            />
            <button type="button" onClick={baixar}>
              Baixar o histórico
            </button>
          </div>
          <p class="suave">
            {lista.length} achado{lista.length === 1 ? '' : 's'}, dos mais recentes para os mais antigos
          </p>
          <ul class="lista-historico">
            {lista.slice(0, mostrar).map((a) => (
              <ItemHistorico a={a} escrita={escritas.has(a.formula.replace(/\s+/g, ''))} />
            ))}
          </ul>
          {lista.length > mostrar && (
            <button type="button" onClick={() => setMostrar(mostrar + 100)}>
              Mostrar mais
            </button>
          )}
          <p>
            <button
              type="button"
              class="discreto perigo"
              onClick={() => confirm('Apagar todo o histórico deste aparelho? (As notas não mudam.)') && void historico.apagarTudo()}
            >
              Apagar o histórico
            </button>
          </p>
        </>
      )}
    </section>
  )
}

const CLASSE: Record<ResultadoAchado, string> = {
  segue: 'ok',
  'nao-segue': 'nao',
  contradiz: 'nao',
  tempo: 'incerto',
  descoberta: 'ok',
  adotada: 'decisao',
  induzida: 'decisao',
  conflito: 'nao',
}

function ItemHistorico({ a, escrita }: { a: Achado; escrita: boolean }) {
  const [feito, setFeito] = useState(false)
  const escrever = async () => {
    const titular = a.contexto.startsWith('Visão de ') ? a.contexto.slice('Visão de '.length) : ''
    await estado.salvarNota({
      ...notaVazia('teorema'),
      titulo: a.titulo,
      formulas: [a.formula],
      titular,
      texto: `Do histórico (${a.origem === 'modelo' ? 'segundo modelo' : 'reação em cadeia'}, ${data(a.primeiraVez)}): ${a.explicacao}.${
        a.notas.length ? ` Vem de: ${a.notas.map((n) => n.titulo).join(', ')}.` : ''
      }`,
    })
    setFeito(true)
  }
  return (
    <li class={`achado achado-${CLASSE[a.resultado]}`}>
      <div>
        <b>{NOME_RESULTADO[a.resultado]}</b> · {a.titulo}
      </div>
      {a.formula && <FormulaExibida texto={a.formula} />}
      <div class="suave">
        {a.explicacao}
        {a.notas.length > 0 && (
          <>
            :{' '}
            {a.notas.map((n, k) => (
              <>
                {k > 0 && ', '}
                {estado.nota(n.id) ? <a href={`#/nota/${encodeURIComponent(n.id)}`}>{n.titulo}</a> : <span>{n.titulo}</span>}
              </>
            ))}
          </>
        )}
      </div>
      <div class="suave res-meta">
        {a.origem === 'modelo' ? 'segundo modelo' : 'reação em cadeia'} · {a.contexto} · até {limiteTexto(a.N, a.K)} · primeira vez {data(a.primeiraVez)}
        {a.vezes > 1 && ` · última ${data(a.ultimaVez)} · ${a.vezes} rodadas`}
      </div>
      {(a.tipo === 'consequencia' || a.tipo === 'lei') && a.formula && (
        <div>
          {escrita || feito ? (
            <span class="suave">✓ já está no caderno</span>
          ) : (
            <button type="button" class="mini" onClick={() => void escrever()}>
              Escrever como teorema
            </button>
          )}
        </div>
      )}
    </li>
  )
}
