import { useMemo, useState } from 'preact/hooks'
import { biblioteca, notasDoProblema, operadoresDoCaderno, pastaDoProblema, procurarProblemas, useBiblioteca, type ItemProblema } from '../dados/biblioteca'
import { SABE, type Sabe } from '../dados/conhecido'
import { estado, useEstado } from '../dados/estado'

/** quantos problemas aparecem de uma vez na busca */
const MOSTRAR = 40

/**
 * Os Problemas do TPTP no aparelho: conjecturas com a resposta conhecida
 * (provadas, refutadas, em aberto). Carregado no caderno, o problema traz as
 * teorias que inclui; o segundo modelo confere e compara com o que se sabe.
 */
export function ProblemasTptp() {
  const bib = useBiblioteca()
  const [busca, setBusca] = useState('')
  const [dominio, setDominio] = useState<string | null>(null)
  const [sabe, setSabe] = useState<Sabe | null>(null)
  const [soCarregaveis, setSoCarregaveis] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  const dominios = useMemo(() => {
    const c = new Map<string, number>()
    for (const p of bib.problemas) c.set(p.dominio, (c.get(p.dominio) ?? 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1])
  }, [bib.problemas])
  const porSabe = useMemo(() => {
    const c = new Map<Sabe, number>()
    for (const p of bib.problemas) c.set(p.sabe, (c.get(p.sabe) ?? 0) + 1)
    return c
  }, [bib.problemas])
  const achados = useMemo(
    () =>
      procurarProblemas(bib.problemas, busca, dominio, sabe)
        .filter((p) => !soCarregaveis || carregavel(p))
        // os mais fáceis primeiro: os que o motor tem mais chance de conferir
        .sort((a, b) => (a.dificuldade ?? 2) - (b.dificuldade ?? 2) || a.nFormulas - b.nFormulas),
    [bib.problemas, busca, dominio, sabe, soCarregaveis],
  )

  const carregar = async (item: ItemProblema) => {
    setErro(null)
    setFeito(null)
    const p = await biblioteca.problema(item.id)
    if (!p) return
    const { fichas, notas, faltam } = await notasDoProblema(p, estado.dicionario, operadoresDoCaderno(estado.notas))
    if (faltam.length) {
      setErro(`${p.id} inclui ${faltam.join(', ')}, que não está no aparelho: abra antes o pacote da biblioteca (biblioteca-tptp).`)
      return
    }
    if (fichas.length) await estado.salvarEntradas(...fichas)
    for (const n of notas) {
      const ja = estado.nota(n.id)
      await estado.salvarNota(ja ? { ...ja, formulas: n.formulas, texto: n.texto, tags: n.tags } : n)
    }
    setFeito(`${p.id}: ${notas.length} notas na pasta #${pastaDoProblema(p.id)}. Escolha essa pasta no segundo modelo para conferir.`)
  }

  if (!bib.problemas.length) return null
  return (
    <>
      <h4>Problemas (conjecturas com resposta conhecida)</h4>
      <p class="suave">
        {bib.problemas.length.toLocaleString('pt-BR')} problemas: {[...porSabe].map(([s, n]) => `${n.toLocaleString('pt-BR')} ${SABE[s].curto}`).join(' · ')}.
        Carregado no caderno, o problema traz junto as teorias que inclui; no segundo modelo, a conjectura aparece com o que os provadores já
        sabem dela. Os grandes demais vêm só com os axiomas ligados à conjectura: se segue com eles, segue com todos; um cenário onde ela
        falha pode ser só falta de um axioma deixado de fora.
      </p>
      {erro && <p class="erro-texto">{erro}</p>}
      {feito && <p class="status-ok">✓ {feito}</p>}
      <div class="barra-acoes">
        <input
          type="search"
          class="busca"
          placeholder="nome, área ou assunto: SET002, group, union, lattice…"
          value={busca}
          onInput={(e) => setBusca((e.target as HTMLInputElement).value)}
        />
        <select value={dominio ?? ''} onChange={(e) => setDominio((e.target as HTMLSelectElement).value || null)}>
          <option value="">todas as áreas</option>
          {dominios.map(([d, n]) => (
            <option value={d}>
              {d} ({n})
            </option>
          ))}
        </select>
        <select value={sabe ?? ''} onChange={(e) => setSabe(((e.target as HTMLSelectElement).value || null) as Sabe | null)}>
          <option value="">qualquer resposta</option>
          {(Object.keys(SABE) as Sabe[]).map((s) => (
            <option value={s}>
              {SABE[s].curto} ({porSabe.get(s) ?? 0})
            </option>
          ))}
        </select>
      </div>
      <label class="suave">
        <input type="checkbox" checked={soCarregaveis} onChange={(e) => setSoCarregaveis((e.target as HTMLInputElement).checked)} /> só os que cabem no
        caderno
      </label>
      <p class="suave">
        {achados.length.toLocaleString('pt-BR')} problema{achados.length === 1 ? '' : 's'}, dos mais fáceis para os mais difíceis
        {achados.length > MOSTRAR && ` — mostrando os ${MOSTRAR} primeiros`}
      </p>
      <ul class="lista-teorias">
        {achados.slice(0, MOSTRAR).map((p) => (
          <ItemProblemaUi p={p} onCarregar={() => void carregar(p)} />
        ))}
      </ul>
    </>
  )
}

const carregavel = (p: ItemProblema) => !p.grande && !p.incompleto

function ItemProblemaUi({ p, onCarregar }: { p: ItemProblema; onCarregar: () => void }) {
  const est = useEstado()
  const ja = est.notas.some((n) => n.tags.includes(pastaDoProblema(p.id)))
  return (
    <li>
      <b>{p.id}</b> <span class="selo">{p.dominio}</span> <span class={`selo sabe-${p.sabe}`}>{SABE[p.sabe].curto}</span>{' '}
      {ja && <span class="selo">no caderno</span>}
      {p.titulo && <div>{p.titulo}</div>}
      {p.ingles && p.ingles !== p.titulo && <div class="suave">{p.ingles}</div>}
      <div class="suave">
        {p.nFormulas.toLocaleString('pt-BR')} fórmulas
        {p.selecao && ` (${p.selecao.escolhidos} dos ${p.selecao.total.toLocaleString('pt-BR')} axiomas: os ligados à conjectura)`}
        {p.aritmetica && ' · com números (quem decide é o Z3)'}
        {p.aproximada && ' · traduzido para primeira ordem (só o "segue" é garantido)'}
        {p.inclui.length > 0 && ` · inclui ${p.inclui.map((i) => i.id).join(', ')}`}
        {p.dificuldade != null && ` · dificuldade ${Math.round(p.dificuldade * 100)}%`}
      </div>
      {p.grande ? (
        <div class="suave">Grande demais para o caderno (o motor trabalha bem até umas 400 leis).</div>
      ) : p.incompleto ? (
        <div class="suave">Não dá para carregar: {p.incompleto}.</div>
      ) : (
        <button type="button" class="mini" onClick={onCarregar}>
          {ja ? 'Carregar de novo' : 'Carregar no caderno'}
        </button>
      )}
    </li>
  )
}
