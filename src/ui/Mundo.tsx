import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { estado, novoId, notaVazia, useEstado } from '../dados/estado'
import { leisInduzidas, mundo, useMundo } from '../dados/mundo'
import { fichasDoConjunto, inferirTipos, lerTabela, montarConjunto, MAX_LINHAS } from '../dados/tabela'
import type { Nota } from '../dados/tipos'
import type { ConjuntoDados, TipoColuna } from '../motor/dados'
import { vereditoDosDados } from '../motor/modelo'
import { BasesPublicas } from './BasesPublicas'
import { TeoriasFormais } from './TeoriasFormais'
import { aoReceberTabela } from './importacao'

const NOME_TIPO: Record<TipoColuna, string> = {
  nome: 'nome do objeto',
  booleano: 'sim/não → propriedade',
  categoria: 'categoria → uma propriedade por valor',
  objeto: 'outro objeto → relação',
  numero: 'número (medição)',
  ignorar: 'ignorar',
}

/**
 * Dados do mundo: tabelas (suas ou de bases públicas) contra as quais as leis
 * e teses do caderno são conferidas, e de onde saem leis induzidas; e teorias
 * formais prontas para importar.
 */
export function Mundo() {
  const mu = useMundo()
  return (
    <section class="mundo">
      <h2>Dados do mundo</h2>
      <p class="suave">
        A lógica só tira o que já está nas leis; quem decide as teses é o mundo. Aqui entram observações: cada tabela vira um cenário real
        (até onde foi observado). O app confere nele as leis e teses do caderno — uma lei que o observado contradiz cai — e propõe as leis
        que os dados apoiam sem nenhum contraexemplo (hipóteses de grau M). O segundo modelo usa tudo isso sozinho.
      </p>

      <ImportarTabela />

      <h3>Conjuntos de dados ({mu.conjuntos.length})</h3>
      {!mu.conjuntos.length && <p class="suave">Nenhum ainda: importe uma tabela acima ou traga dados de uma base pública abaixo.</p>}
      {mu.conjuntos.map((c) => (
        <CartaoConjunto c={c} />
      ))}

      <BasesPublicas />
      <TeoriasFormais />
    </section>
  )
}

/** Cola ou abre uma tabela; mostra como cada coluna vai entrar; importa. */
function ImportarTabela() {
  const est = useEstado()
  const [texto, setTexto] = useState('')
  const [nome, setNome] = useState('')
  const [fonte, setFonte] = useState('')
  const [pasta, setPasta] = useState('dados')
  const [tolerancia, setTolerancia] = useState(2)
  const [tipos, setTipos] = useState<TipoColuna[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const quadro = useRef<HTMLDetailsElement>(null)
  // tabela montada noutra parte da tela (Wikidata): vem para cá, para conferir e importar
  useEffect(
    () =>
      aoReceberTabela((p) => {
        setTexto(p.texto)
        setTipos(null)
        setNome(p.nome)
        setFonte(p.fonte)
        setAviso(null)
        if (quadro.current) {
          quadro.current.open = true
          quadro.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }),
    [],
  )
  const tabela = useMemo(() => (texto.trim() ? lerTabela(texto) : null), [texto])
  const tiposAtuais = useMemo(() => tipos ?? (tabela ? inferirTipos(tabela.cabecalho, tabela.linhas) : []), [tabela, tipos])
  const previa = useMemo(
    () =>
      tabela && tabela.linhas.length
        ? montarConjunto({ id: 'previa', nome: nome || 'tabela', fonte: fonte || 'colada', pasta }, tabela.cabecalho, tabela.linhas, est.dicionario, tiposAtuais)
        : null,
    [tabela, tiposAtuais, est.dicionario, nome, fonte, pasta],
  )

  const abrirArquivo = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (!f) return
    setTexto(await f.text())
    setTipos(null)
    setNome(f.name.replace(/\.[^.]+$/, ''))
    setFonte(`arquivo ${f.name}`)
  }

  const importar = async () => {
    if (!previa) return
    const c: ConjuntoDados = { ...previa, id: novoId(), tolerancia: tolerancia / 100, nome: nome.trim() || 'Tabela', fonte: fonte.trim() || 'tabela colada' }
    const fichas = fichasDoConjunto(c, estado.dicionario)
    if (fichas.length) await estado.salvarEntradas(...fichas)
    await mundo.adicionar(c)
    setAviso(`“${c.nome}”: ${c.linhas.length} linhas importadas${fichas.length ? `, ${fichas.length} nomes novos no dicionário` : ''}.`)
    setTexto('')
    setTipos(null)
    setNome('')
    setFonte('')
  }

  return (
    <details class="importar-tabela" open={!!texto || !!aviso} ref={quadro}>
      <summary>
        <b>Importar uma tabela</b> <span class="suave">— CSV, planilha copiada (Ctrl+C no Excel/Planilhas) ou texto separado por ; ou tabulação</span>
      </summary>
      <p class="suave">
        Primeira linha: os nomes das colunas. Cada linha seguinte é um <b>objeto</b> (ex.: um planeta, com propriedades e relações) ou um{' '}
        <b>caso medido</b> (ex.: uma colisão, com uma coluna por grandeza). Colunas com o mesmo nome de um símbolo do dicionário (ex.: mi, vi)
        viram esse símbolo — assim as suas leis são conferidas nas medições. Até {MAX_LINHAS} linhas.
      </p>
      <label class="campo-rotulo">
        Abrir arquivo
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={abrirArquivo} />
      </label>
      <textarea
        class="tabela-colada"
        rows={6}
        placeholder={'nome;tipo;rochoso;massa\nTerra;planeta;sim;5,97\nJúpiter;planeta;não;1898'}
        value={texto}
        onInput={(e) => {
          setTexto((e.target as HTMLTextAreaElement).value)
          setTipos(null)
        }}
      />
      {aviso && <p class="status-ok">✓ {aviso}</p>}
      {tabela && !tabela.linhas.length && <p class="aviso-texto">Só há a linha dos nomes das colunas; faltam os dados.</p>}
      {previa && (
        <>
          <div class="campos-linha">
            <label class="campo-rotulo">
              Nome
              <input value={nome} placeholder="ex.: Colisões do laboratório" onInput={(e) => setNome((e.target as HTMLInputElement).value)} />
            </label>
            <label class="campo-rotulo">
              Fonte
              <input value={fonte} placeholder="de onde vieram os dados" onInput={(e) => setFonte((e.target as HTMLInputElement).value)} />
            </label>
            <label class="campo-rotulo">
              Pasta
              <input value={pasta} onInput={(e) => setPasta((e.target as HTMLInputElement).value.trim() || 'dados')} />
            </label>
            <label class="campo-rotulo">
              Tolerância nas contas (%)
              <input type="number" min={0} max={50} step={0.5} value={tolerancia} onInput={(e) => setTolerancia(Number((e.target as HTMLInputElement).value) || 0)} />
            </label>
          </div>
          <table class="tabela-colunas">
            <thead>
              <tr>
                <th>Coluna</th>
                <th>Entra como</th>
                <th>Símbolo</th>
                <th>Exemplos</th>
              </tr>
            </thead>
            <tbody>
              {previa.colunas.map((col, j) => (
                <tr>
                  <td>{col.titulo}</td>
                  <td>
                    <select
                      value={tiposAtuais[j]}
                      onChange={(e) => {
                        const t = [...tiposAtuais]
                        t[j] = (e.target as HTMLSelectElement).value as TipoColuna
                        setTipos(t)
                      }}
                    >
                      {(Object.keys(NOME_TIPO) as TipoColuna[]).map((t) => (
                        <option value={t}>{NOME_TIPO[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td class="formula-inline">
                    {col.tipo === 'categoria' && col.valores
                      ? Object.values(col.valores).slice(0, 6).join(', ') + (Object.keys(col.valores).length > 6 ? '…' : '')
                      : col.tipo === 'objeto'
                        ? `${col.simbolo}(x, y)`
                        : col.tipo === 'booleano'
                          ? `${col.simbolo}(x)`
                          : col.simbolo}
                    {col.simbolo && est.dicionario.some((e) => e.simbolo === col.simbolo) && <span class="selo"> do dicionário</span>}
                  </td>
                  <td class="suave">
                    {previa.linhas
                      .map((l) => l[j])
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" class="primario" onClick={importar}>
            Importar {previa.linhas.length} linha{previa.linhas.length > 1 ? 's' : ''}
          </button>
        </>
      )}
    </details>
  )
}

/** Um conjunto de dados: o que ele diz do caderno e que leis sugere. */
function CartaoConjunto({ c }: { c: ConjuntoDados }) {
  const est = useEstado()
  const [aberto, setAberto] = useState(false)
  const [levadas, setLevadas] = useState<Set<string>>(new Set())
  const colunas = c.colunas.filter((x) => x.tipo !== 'ignorar')
  return (
    <details class="cartao-conjunto" onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
      <summary>
        <b>{c.nome}</b>{' '}
        <span class="suave">
          — {c.linhas.length} linhas · {colunas.length} colunas · #{c.pasta} · tolerância {Math.round(c.tolerancia * 1000) / 10}% · {c.fonte}
        </span>
      </summary>
      {aberto && <Conteudo c={c} notas={est.notas} levadas={levadas} setLevadas={setLevadas} />}
      <div class="barra-acoes">
        <button
          type="button"
          class="discreto perigo"
          onClick={() => confirm(`Apagar os dados “${c.nome}”? As notas e as fichas do dicionário ficam.`) && void mundo.remover(c.id)}
        >
          Apagar estes dados
        </button>
      </div>
    </details>
  )
}

function Conteudo({ c, notas, levadas, setLevadas }: { c: ConjuntoDados; notas: Nota[]; levadas: Set<string>; setLevadas: (s: Set<string>) => void }) {
  const est = useEstado()
  // o que estes dados dizem de cada nota ativa
  const vereditos = useMemo(
    () =>
      notas
        .filter((n) => n.ativa && n.formulas.some((f) => f.trim()))
        .map((n) => ({ n, v: vereditoDosDados(n.formulas.filter((f) => f.trim()), est.dicionario, [c]) }))
        .filter((x) => x.v && x.v.tipo !== 'incerto'),
    [notas, c, est.dicionario],
  )
  const induzidas = useMemo(() => leisInduzidas(c, est.dicionario), [c, est.dicionario])
  const levar = async (n: Nota) => {
    await estado.salvarNota({ ...notaVazia('lei'), ...n, id: '', criadaEm: new Date().toISOString() })
    setLevadas(new Set([...levadas, n.id]))
  }
  const contradiz = vereditos.filter((x) => x.v!.tipo === 'falha')
  const confirma = vereditos.filter((x) => x.v!.tipo === 'vale')
  return (
    <div class="conteudo-conjunto">
      <h4>O que estes dados dizem do caderno</h4>
      {!vereditos.length && (
        <p class="suave">
          Nenhuma nota ativa fala do que estes dados observam. Para o caderno ser conferido aqui, as colunas precisam ter os mesmos nomes
          dos símbolos das leis (ou as leis precisam usar os símbolos das colunas).
        </p>
      )}
      {contradiz.length > 0 && (
        <ul class="lista-cadeia">
          {contradiz.map(({ n, v }) => (
            <li class="contradiz">
              <a href={`#/nota/${encodeURIComponent(n.id)}`}>{n.titulo || 'Sem título'}</a> <span class="selo">{n.compartimento}</span>
              <div class="suave">{v!.texto}</div>
            </li>
          ))}
        </ul>
      )}
      {confirma.length > 0 && (
        <ul class="lista-cadeia">
          {confirma.map(({ n, v }) => (
            <li class="segue">
              <a href={`#/nota/${encodeURIComponent(n.id)}`}>{n.titulo || 'Sem título'}</a> <span class="selo">{n.compartimento}</span>
              <div class="suave">{v!.texto}</div>
            </li>
          ))}
        </ul>
      )}

      <h4>Leis que os dados sugerem ({induzidas.length})</h4>
      <p class="suave">
        Valem em tudo o que foi observado, sem nenhum contraexemplo (cada uma apoiada por pelo menos 3 objetos ou casos). São hipóteses: um
        caso ainda não observado pode derrubá-las. Com “usar os dados do mundo” ligado no segundo modelo, elas entram lá sozinhas.
      </p>
      <ul class="lista-cadeia">
        {induzidas.map((n) => (
          <li class="segue">
            <div class="formula-inline">{n.formulas[0]}</div>
            <div class="suave">{n.texto.split('\n')[0]}</div>
            {levadas.has(n.id) ? (
              <p class="status-ok">✓ no caderno (grau M)</p>
            ) : (
              <button type="button" class="mini" onClick={() => void levar(n)}>
                Levar para o caderno
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
