import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  biblioteca,
  conversa,
  MAX_FORMULAS_NO_CADERNO,
  notasDaBiblioteca,
  operadoresDoCaderno,
  pastaDaTeoria,
  procurar,
  useBiblioteca,
  type ItemCatalogo,
} from '../dados/biblioteca'
import { estado, useEstado } from '../dados/estado'
import { ProblemasTptp } from './ProblemasTptp'

/** quantas teorias aparecem de uma vez na busca */
const MOSTRAR = 40

/** A biblioteca TPTP inteira no aparelho: procurar, ver o que conversa com o caderno, carregar a que interessa. */
export function BibliotecaTptp() {
  const bib = useBiblioteca()
  const est = useEstado()
  const [busca, setBusca] = useState('')
  const [dominio, setDominio] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  useEffect(() => {
    if (!bib.carregado) void bib.carregar()
  }, [])

  const operadores = useMemo(() => operadoresDoCaderno(est.notas), [est.notas])
  const dominios = useMemo(() => {
    const c = new Map<string, number>()
    for (const t of bib.catalogo) c.set(t.dominio, (c.get(t.dominio) ?? 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1])
  }, [bib.catalogo])
  const achadas = useMemo(() => procurar(bib.catalogo, busca, dominio), [bib.catalogo, busca, dominio])
  const conversam = useMemo(
    () =>
      bib.catalogo
        .filter((t) => !t.grande)
        .map((t) => ({ t, c: conversa(t, est.dicionario, operadores) }))
        .filter((x) => x.c.comuns.length + x.c.pontes.length > 0)
        .sort((a, b) => b.c.comuns.length + 2 * b.c.pontes.length - (a.c.comuns.length + 2 * a.c.pontes.length))
        .slice(0, 8),
    [bib.catalogo, est.dicionario, operadores],
  )
  const totalFormulas = bib.catalogo.reduce((s, t) => s + t.nFormulas, 0)

  const abrir = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (!f) return
    setErro(null)
    setFeito(null)
    try {
      const formato = await biblioteca.abrirPacote(f)
      setFeito(
        formato === 'problemas-tptp'
          ? `${biblioteca.problemas.length.toLocaleString('pt-BR')} problemas guardados neste aparelho.`
          : `${biblioteca.catalogo.length.toLocaleString('pt-BR')} teorias guardadas neste aparelho.`,
      )
    } catch (x) {
      setErro(`Não deu para abrir o pacote: ${(x as Error).message}`)
    }
  }

  const carregar = async (item: ItemCatalogo) => {
    const t = await biblioteca.teoria(item.id)
    if (!t) return
    const { fichas, notas } = notasDaBiblioteca(t, estado.dicionario, operadoresDoCaderno(estado.notas))
    if (fichas.length) await estado.salvarEntradas(...fichas)
    for (const n of notas) {
      const ja = estado.nota(n.id)
      await estado.salvarNota(ja ? { ...ja, formulas: n.formulas, texto: n.texto } : n)
    }
    setFeito(`${t.id}: ${notas.length} notas na pasta #${notas[0]?.tags[0] ?? ''}.`)
  }

  return (
    <details class="base-publica">
      <summary>
        <b>Biblioteca TPTP no aparelho</b>{' '}
        <span class="suave">
          —{' '}
          {bib.catalogo.length
            ? `${bib.catalogo.length.toLocaleString('pt-BR')} teorias, ${totalFormulas.toLocaleString('pt-BR')} fórmulas${bib.problemas.length ? `; ${bib.problemas.length.toLocaleString('pt-BR')} problemas` : ''}`
            : 'todas as teorias de axiomas do TPTP de uma vez'}
        </span>
      </summary>
      {!bib.catalogo.length && !bib.abrindo && (
        <p class="suave">
          O site do TPTP só deixa baixar até 250 MB por vez. O pacote da biblioteca junta todas as teorias de axiomas (as que o app lê, em FOF
          e CNF) já traduzidas, num arquivo só. Abra-o aqui uma vez: ele fica guardado neste aparelho, e daí você procura e carrega no
          caderno só a teoria que interessa. O pacote dos problemas (problemas-tptp) traz as conjecturas com a resposta conhecida; abra-o
          também.
        </p>
      )}
      <label class="campo-rotulo">
        {bib.catalogo.length ? 'Abrir outro pacote (substitui o do mesmo tipo)' : 'Abrir o pacote (biblioteca-tptp ou problemas-tptp .jsonl.gz)'}
        <input type="file" accept=".gz,.jsonl" disabled={!!bib.abrindo} onChange={(e) => void abrir(e)} />
      </label>
      {bib.abrindo && (
        <p class="suave" aria-live="polite">
          <span class="girando" aria-hidden="true" /> guardando… {bib.abrindo.feitas.toLocaleString('pt-BR')} de{' '}
          {bib.abrindo.total.toLocaleString('pt-BR')} {bib.abrindo.formato === 'problemas-tptp' ? 'problemas' : 'teorias'}
        </p>
      )}
      {erro && <p class="erro-texto">{erro}</p>}
      {feito && <p class="status-ok">✓ {feito}</p>}

      {(bib.catalogo.length > 0 || bib.problemas.length > 0) && !bib.abrindo && (
        <>
          {conversam.length > 0 && (
            <>
              <h4>Conversam com o seu caderno</h4>
              <ul class="lista-teorias">
                {conversam.map(({ t, c }) => (
                  <ItemTeoria t={t} conversa={c} onCarregar={() => void carregar(t)} />
                ))}
              </ul>
            </>
          )}
          <h4>Procurar teorias</h4>
          <div class="barra-acoes">
            <input
              type="search"
              class="busca"
              placeholder="nome, área ou símbolo: set, group, ordering, mereology, member…"
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
          </div>
          <p class="suave">
            {achadas.length} teoria{achadas.length === 1 ? '' : 's'}
            {achadas.length > MOSTRAR && ` — mostrando as ${MOSTRAR} primeiras`}
          </p>
          <ul class="lista-teorias">
            {achadas.slice(0, MOSTRAR).map((t) => (
              <ItemTeoria t={t} conversa={conversa(t, est.dicionario, operadores)} onCarregar={() => void carregar(t)} />
            ))}
          </ul>
          <ProblemasTptp />
          <button
            type="button"
            class="discreto perigo"
            onClick={() =>
              confirm('Apagar a biblioteca deste aparelho (teorias e problemas)? O que já foi carregado no caderno fica.') && void biblioteca.apagar()
            }
          >
            Apagar a biblioteca do aparelho
          </button>
        </>
      )}
    </details>
  )
}

function ItemTeoria({ t, conversa: c, onCarregar }: { t: ItemCatalogo; conversa: { comuns: string[]; pontes: string[] }; onCarregar: () => void }) {
  const est = useEstado()
  const ja = est.notas.some((n) => n.tags.includes(pastaDaTeoria(t.id)))
  const grande = !!t.grande || t.nFormulas > MAX_FORMULAS_NO_CADERNO
  return (
    <li>
      <b>{t.id}</b> <span class="selo">{t.dominio}</span> {ja && <span class="selo">no caderno</span>}
      {t.descricao && <div class="suave">{t.descricao}</div>}
      <div class="suave">
        {t.nFormulas.toLocaleString('pt-BR')} fórmulas{t.pasta !== 'raiz' && ` · ${t.pasta}`}
        {(c.comuns.length > 0 || c.pontes.length > 0) &&
          ` · em comum com o caderno: ${[...c.comuns, ...c.pontes.map((p) => `ponte ${p}`)].slice(0, 6).join(', ')}`}
      </div>
      {grande ? (
        <div class="suave">
          Grande demais para o caderno (o motor confere tudo junto; trabalha bem até umas {MAX_FORMULAS_NO_CADERNO} leis).
        </div>
      ) : (
        <button type="button" class="mini" onClick={onCarregar}>
          {ja ? 'Carregar de novo' : 'Carregar no caderno'}
        </button>
      )}
    </li>
  )
}
