import { useState } from 'preact/hooks'
import { CODATA, constantesComoFatos } from '../dados/codata'
import { estado, useEstado } from '../dados/estado'
import { buscarClasses, itensDe, padraoDaClasse, propriedadesDe, PRONTAS, tabelaDe, type Classe, type Propriedade, type TabelaWikidata } from '../dados/wikidata'
import { enviarParaImportar } from './importacao'

/** Bases públicas: Wikidata (tabelas de fatos) e constantes físicas (CODATA). */
export function BasesPublicas() {
  return (
    <>
      <h3>Bases públicas</h3>
      <Wikidata />
      <Codata />
    </>
  )
}

/** Uma tabela do Wikidata vai para a importação (lá se confere como cada coluna entra). */
const mandar = (t: TabelaWikidata) => {
  const limpa = (s: string | null) => (s ?? '').replace(/[\t\n\r]+/g, ' ')
  const tsv = [t.cabecalho, ...t.linhas].map((l) => l.map(limpa).join('\t')).join('\n')
  enviarParaImportar({ texto: tsv, nome: t.nome, fonte: t.fonte })
}

function Wikidata() {
  const [busca, setBusca] = useState('')
  const [classes, setClasses] = useState<Classe[] | null>(null)
  const [classe, setClasse] = useState<Classe | null>(null)
  const [itens, setItens] = useState<string[]>([])
  const [props, setProps] = useState<Propriedade[] | null>(null)
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const rodar = async (passo: () => Promise<void>) => {
    setErro(null)
    try {
      await passo()
    } catch (e) {
      setErro(navigator.onLine === false ? 'Sem internet: o Wikidata precisa de conexão.' : (e as Error).message)
    }
    setStatus(null)
  }

  const pronta = (p: (typeof PRONTAS)[number]) =>
    rodar(async () => {
      setStatus(`buscando “${p.nome}”…`)
      const its = await itensDe(p.padrao)
      mandar(await tabelaDe(p.nome, its, p.props, (m) => setStatus(m)))
    })

  const buscar = (e: Event) => {
    e.preventDefault()
    if (!busca.trim()) return
    void rodar(async () => {
      setStatus('procurando…')
      setClasse(null)
      setProps(null)
      setClasses(await buscarClasses(busca.trim()))
    })
  }

  const escolherClasse = (c: Classe) =>
    rodar(async () => {
      setClasse(c)
      setStatus(`buscando os itens de “${c.rotulo}”…`)
      const its = await itensDe(padraoDaClasse(c.id))
      setItens(its)
      if (!its.length) throw new Error(`nada no Wikidata é marcado como “${c.rotulo}” diretamente; tente uma classe mais específica`)
      setStatus('vendo que informações esses itens têm…')
      const ps = await propriedadesDe(its)
      setProps(ps)
      setEscolhidas(new Set(ps.slice(0, 4).map((p) => p.id)))
    })

  const montar = () =>
    rodar(async () => {
      if (!classe || !props) return
      const sel = props.filter((p) => escolhidas.has(p.id))
      mandar(await tabelaDe(classe.rotulo, itens, sel, (m) => setStatus(m)))
    })

  return (
    <details class="base-publica">
      <summary>
        <b>Wikidata</b> <span class="suave">— fatos sobre coisas com nome (planetas, elementos, pessoas, obras…), com fonte</span>
      </summary>
      <p class="suave">
        Precisa de internet. Só a consulta sai do aparelho; o caderno não. A tabela montada vai para “Importar uma tabela”, onde você confere
        como cada coluna entra antes de importar. Números vêm na unidade do SI (kg, m, s).
      </p>
      <div class="barra-acoes">
        {PRONTAS.map((p) => (
          <button type="button" class="mini" disabled={!!status} onClick={() => void pronta(p)}>
            {p.nome}
          </button>
        ))}
      </div>
      <form class="barra-acoes" onSubmit={buscar}>
        <input
          type="search"
          class="busca"
          placeholder="ou procure um tipo de coisa: planeta, rio, filósofo, enzima…"
          value={busca}
          onInput={(e) => setBusca((e.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={!!status || !busca.trim()}>
          Procurar
        </button>
      </form>
      {status && (
        <p class="suave" aria-live="polite">
          <span class="girando" aria-hidden="true" /> {status}
        </p>
      )}
      {erro && <p class="erro-texto">{erro}</p>}
      {classes && !classe && (
        <ul class="lista-classes">
          {!classes.length && <li class="suave">Nada encontrado.</li>}
          {classes.map((c) => (
            <li>
              <button type="button" class="discreto" onClick={() => void escolherClasse(c)}>
                <b>{c.rotulo}</b> <span class="suave">{c.descricao}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {classe && props && (
        <div class="props-wikidata">
          <p>
            <b>{classe.rotulo}</b>: {itens.length} itens. Escolha as informações (até 8):
          </p>
          <div class="chips">
            {props.map((p) => (
              <button
                type="button"
                class={escolhidas.has(p.id) ? 'chip ativo' : 'chip'}
                aria-pressed={escolhidas.has(p.id)}
                onClick={() => {
                  const s = new Set(escolhidas)
                  if (s.has(p.id)) s.delete(p.id)
                  else if (s.size < 8) s.add(p.id)
                  setEscolhidas(s)
                }}
              >
                {p.rotulo} <small class="suave">{p.tipo === 'quantidade' ? 'número' : 'relação'}</small>
              </button>
            ))}
          </div>
          <div class="barra-acoes">
            <button type="button" class="primario" disabled={!!status || !escolhidas.size} onClick={() => void montar()}>
              Montar a tabela
            </button>
            <button type="button" class="discreto" onClick={() => setClasse(null)}>
              Outra classe
            </button>
          </div>
        </div>
      )}
    </details>
  )
}

function Codata() {
  const est = useEstado()
  const [sel, setSel] = useState<Set<string>>(new Set(CODATA.map((k) => k.simbolo)))
  const [feito, setFeito] = useState<string | null>(null)
  const importar = async () => {
    const { fichas, fatos } = constantesComoFatos(
      CODATA.filter((k) => sel.has(k.simbolo)),
      estado.dicionario,
    )
    if (fichas.length) await estado.salvarEntradas(...fichas)
    // não duplica: um fato com o mesmo título é atualizado
    for (const f of fatos) {
      const ja = estado.notas.find((n) => n.titulo === f.titulo && n.tags.includes('codata'))
      await estado.salvarNota(ja ? { ...ja, formulas: f.formulas, texto: f.texto, fonte: f.fonte } : f)
    }
    setFeito(`${fatos.length} constantes no caderno (pasta #codata), como fatos com fonte.`)
  }
  const ja = est.notas.filter((n) => n.tags.includes('codata')).length
  return (
    <details class="base-publica">
      <summary>
        <b>Constantes físicas (CODATA 2018)</b> <span class="suave">— embutidas no app, funcionam sem internet{ja ? ` · ${ja} já no caderno` : ''}</span>
      </summary>
      <p class="suave">
        Os valores recomendados pelo NIST. Entram como fatos (grau F, com fonte), uma constante numérica cada; o Z3 as usa nas contas. As
        exatas são as que definem o SI desde 2019.
      </p>
      <ul class="lista-constantes">
        {CODATA.map((k) => (
          <li>
            <label class="alternar">
              <input
                type="checkbox"
                checked={sel.has(k.simbolo)}
                onChange={() => {
                  const s = new Set(sel)
                  if (s.has(k.simbolo)) s.delete(k.simbolo)
                  else s.add(k.simbolo)
                  setSel(s)
                }}
              />
              <span>
                {k.nome} <span class="formula-inline">{k.simbolo}</span>{' '}
                <span class="suave">
                  = {k.valor.toLocaleString('pt-BR', { maximumSignificantDigits: 12 })} {k.unidade}
                  {k.incerteza === 0 ? ' (exata)' : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button type="button" class="primario" disabled={!sel.size} onClick={() => void importar()}>
        Importar {sel.size} como fatos
      </button>
      {feito && <p class="status-ok">✓ {feito}</p>}
    </details>
  )
}
