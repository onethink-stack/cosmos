import { useState } from 'preact/hooks'
import { estado, useEstado } from '../dados/estado'
import { notasDaTeoria, TEORIAS, type Teoria } from '../dados/teorias'
import { importarTptp, type ImportacaoTptp } from '../dados/tptp'
import { textosDoArquivo } from '../dados/arquivos'
import { BibliotecaTptp } from './BibliotecaTptp'

/** Teorias formais: a biblioteca embutida e arquivos do TPTP. */
export function TeoriasFormais() {
  return (
    <>
      <h3>Teorias formais</h3>
      <p class="suave">
        Bases formais prontas: axiomas e teoremas conhecidos, que entram como leis e teoremas numa pasta própria. O motor confere os teoremas;
        escolhendo a pasta da teoria junto com a sua no segundo modelo, ele bate as suas leis contra ela.
      </p>
      <Biblioteca />
      <BibliotecaTptp />
      <Tptp />
    </>
  )
}

function Biblioteca() {
  const est = useEstado()
  const [feito, setFeito] = useState<string | null>(null)
  const carregar = async (t: Teoria) => {
    const { fichas, notas } = notasDaTeoria(t, estado.dicionario)
    if (fichas.length) await estado.salvarEntradas(...fichas)
    for (const n of notas) {
      const ja = estado.nota(n.id)
      await estado.salvarNota(ja ? { ...ja, formulas: n.formulas, texto: n.texto } : n)
    }
    setFeito(`“${t.nome}”: ${t.leis.length} leis e ${t.teoremas.length} teoremas na pasta #teoria-${t.id}.`)
  }
  return (
    <details class="base-publica">
      <summary>
        <b>Biblioteca de teorias</b> <span class="suave">— embutida, funciona sem internet</span>
      </summary>
      {feito && <p class="status-ok">✓ {feito}</p>}
      <ul class="lista-teorias">
        {TEORIAS.map((t) => {
          const ja = est.notas.some((n) => n.tags.includes(`teoria-${t.id}`))
          return (
            <li>
              <b>{t.nome}</b> {ja && <span class="selo">no caderno</span>}
              <div class="suave">{t.descricao}</div>
              <div class="suave">
                {t.leis.length} leis · {t.teoremas.length} teoremas
              </div>
              <button type="button" class="mini" onClick={() => void carregar(t)}>
                {ja ? 'Carregar de novo' : 'Carregar no caderno'}
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function Tptp() {
  const [texto, setTexto] = useState('')
  const [origem, setOrigem] = useState('')
  const [url, setUrl] = useState('')
  const [pasta, setPasta] = useState('tptp')
  const [previa, setPrevia] = useState<ImportacaoTptp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  const ler = (t: string, o: string) => {
    setTexto(t)
    setOrigem(o)
    setErro(null)
    setFeito(null)
    try {
      setPrevia(importarTptp(t, o, pasta, estado.dicionario))
    } catch (e) {
      setPrevia(null)
      setErro((e as Error).message)
    }
  }
  /** um ou vários arquivos (o problema e os axiomas que ele inclui); .tgz do TPTP abre direto */
  const abrirArquivo = async (e: Event) => {
    const fs = [...((e.target as HTMLInputElement).files ?? [])]
    if (!fs.length) return
    try {
      const textos = (await Promise.all(fs.map(textosDoArquivo))).flat().filter((x) => /\.(p|ax|tptp|txt)$/i.test(x.nome) || !/\./.test(x.nome))
      if (!textos.length) throw new Error('nenhum arquivo .p ou .ax dentro')
      ler(
        textos.map((x) => `% === arquivo: ${x.nome} ===\n${x.texto}`).join('\n'),
        textos.map((x) => x.nome).join(' + '),
      )
    } catch (x) {
      setErro(`Não deu para abrir: ${(x as Error).message}`)
    }
  }
  const baixar = async () => {
    setErro(null)
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`o site respondeu ${r.status}`)
      ler(await r.text(), url.slice(url.lastIndexOf('/') + 1) || url)
    } catch (e) {
      setErro(
        `Não deu para baixar (${(e as Error).message}). O tptp.org e muitos outros sites não deixam outro site ler os arquivos deles: use o Download do site e abra o arquivo aqui (o .tgz abre direto).`,
      )
    }
  }
  const importar = async () => {
    if (!previa) return
    const r = importarTptp(texto, origem, pasta, estado.dicionario)
    if (r.fichas.length) await estado.salvarEntradas(...r.fichas)
    for (const n of r.notas) await estado.salvarNota(n)
    setFeito(`${r.notas.length} fórmulas na pasta #${pasta}.`)
    setPrevia(null)
    setTexto('')
  }
  const leis = previa?.notas.filter((n) => n.compartimento === 'lei').length ?? 0
  const teoremas = previa?.notas.filter((n) => n.compartimento === 'teorema').length ?? 0

  return (
    <details class="base-publica">
      <summary>
        <b>TPTP</b> <span class="suave">— a biblioteca de problemas dos provadores automáticos (milhares de teorias, em FOF/CNF/TFF)</span>
      </summary>
      <p class="suave">
        Axiomas viram leis; conjecturas e teoremas viram teoremas, que o motor confere. Lê FOF, CNF e TFF com tipos simples (cada tipo vira
        um predicado, como tipoNat(x)); não lê THF (ordem superior), TFF com aritmética nem tipos polimórficos.
      </p>
      <ol class="suave passos-tptp">
        <li>
          Abra a biblioteca:{' '}
          <a href="https://seetptp.tptp.org/?folder=TPTPWorld/TPTP/Axioms/" target="_blank" rel="noopener">
            axiomas
          </a>{' '}
          (teorias: SET = conjuntos, GRP = grupos, MGT = gestão, KRS = conhecimento…) ou{' '}
          <a href="https://seetptp.tptp.org/?folder=TPTPWorld/TPTP/Problems/" target="_blank" rel="noopener">
            problemas
          </a>{' '}
          (cada um com a sua conjectura). Os nomes com “+” são em FOF; com “-”, em CNF; com “_”, em TFF.
        </li>
        <li>
          Abra um arquivo e toque em <b>Download</b> — vem compactado (.tgz) e o app abre assim mesmo. Se o problema tiver “include”, baixe
          também o arquivo de axiomas que ele cita e escolha os dois de uma vez aqui.
        </li>
        <li>Ou: selecione o texto do arquivo na página, copie e cole na caixa abaixo.</li>
      </ol>
      <div class="campos-linha">
        <label class="campo-rotulo">
          Abrir arquivo
          <input type="file" multiple accept=".p,.ax,.tptp,.txt,.tgz,.gz,.tar" onChange={abrirArquivo} />
        </label>
        <label class="campo-rotulo">
          Pasta
          <input value={pasta} onInput={(e) => setPasta((e.target as HTMLInputElement).value.trim() || 'tptp')} />
        </label>
      </div>
      <div class="barra-acoes">
        <input
          type="url"
          class="busca"
          placeholder="ou o endereço de um arquivo de texto (o tptp.org não deixa: use o Download)"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        />
        <button type="button" disabled={!url.trim()} onClick={() => void baixar()}>
          Baixar
        </button>
      </div>
      <textarea
        class="tabela-colada"
        rows={5}
        placeholder={"fof(transitiva, axiom, ![X,Y,Z]: ((r(X,Y) & r(Y,Z)) => r(X,Z))).\nfof(ciclo, conjecture, ![X]: ~r(X,X))."}
        value={texto}
        onInput={(e) => ler((e.target as HTMLTextAreaElement).value, origem || 'texto colado')}
      />
      {erro && <p class="erro-texto">{erro}</p>}
      {feito && <p class="status-ok">✓ {feito}</p>}
      {previa && (
        <>
          <p>
            {leis} lei{leis === 1 ? '' : 's'} e {teoremas} teorema{teoremas === 1 ? '' : 's'}
            {previa.fichas.length ? `; ${previa.fichas.length} nomes novos no dicionário` : ''}.
          </p>
          <ul class="lista-cadeia">
            {previa.notas.slice(0, 8).map((n) => (
              <li class={n.compartimento === 'teorema' ? '' : 'segue'}>
                <b>{n.titulo}</b>
                <div class="formula-inline">{n.formulas[0]}</div>
              </li>
            ))}
            {previa.notas.length > 8 && <li class="suave">… e mais {previa.notas.length - 8}</li>}
          </ul>
          {previa.avisos.length > 0 && (
            <details>
              <summary class="aviso-texto">{previa.avisos.length} trecho(s) não importado(s)</summary>
              <ul class="suave">
                {previa.avisos.map((a) => (
                  <li>{a}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" class="primario" disabled={!previa.notas.length} onClick={() => void importar()}>
            Importar {previa.notas.length} fórmula{previa.notas.length === 1 ? '' : 's'}
          </button>
        </>
      )}
    </details>
  )
}
