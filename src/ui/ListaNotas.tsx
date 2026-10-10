import { useMemo, useState } from 'preact/hooks'
import { FILTRO_VAZIO, filtrarNotas, todasAsTags, type Filtro } from '../dados/filtro'
import { useEstado } from '../dados/estado'
import { COMPARTIMENTOS, NOME_COMPARTIMENTO, NOME_GRAU, type Grau, type Nota } from '../dados/tipos'
import { validar } from '../logica/validador'
import { sistemaCifrado } from '../dados/sistemas'
import { FormulaExibida } from './FormulaExibida'
import { DesbloquearSistema } from './Sistemas'

const GRAUS: Grau[] = ['F', 'M', 'D']

let filtroSalvo: Filtro = FILTRO_VAZIO // mantém o filtro ao voltar do editor

export function ListaNotas() {
  const est = useEstado()
  const [f, setF] = useState<Filtro>(filtroSalvo)
  const mudar = (p: Partial<Filtro>) => {
    filtroSalvo = { ...f, ...p }
    setF(filtroSalvo)
  }

  const tags = useMemo(() => todasAsTags(est.notas), [est.notas])
  const padrao = sistemaCifrado(est.sistemaPadrao)
  const notas = useMemo(() => filtrarNotas(est.notas, f, est.dicionario), [est.notas, f, est.dicionario])
  const temFiltro = f.busca || f.compartimento || f.grau || f.tag

  return (
    <section>
      <div class="barra-acoes">
        <a class="botao primario" href={`#/nova/${f.compartimento ?? 'lei'}`}>
          + Nova nota
        </a>
        <a class="botao" href="#/sistemas">
          Sistemas prontos
        </a>
      </div>

      <input
        type="search"
        class="busca"
        placeholder="Buscar em títulos, textos, fórmulas e termos do dicionário"
        value={f.busca}
        onInput={(e) => mudar({ busca: (e.target as HTMLInputElement).value })}
      />

      <div class="chips" role="group" aria-label="Compartimento">
        <button type="button" class={!f.compartimento ? 'chip ativo' : 'chip'} onClick={() => mudar({ compartimento: null })}>
          Todas
        </button>
        {COMPARTIMENTOS.map((c) => (
          <button
            type="button"
            class={`chip c-${c}${f.compartimento === c ? ' ativo' : ''}`}
            onClick={() => mudar({ compartimento: f.compartimento === c ? null : c, grau: c === 'lei' ? f.grau : null })}
          >
            {NOME_COMPARTIMENTO[c]}
          </button>
        ))}
      </div>

      {(f.compartimento === 'lei' || f.grau) && (
        <div class="chips" role="group" aria-label="Grau">
          <span class="suave">Grau:</span>
          {GRAUS.map((g) => (
            <button type="button" title={NOME_GRAU[g]} class={f.grau === g ? 'chip ativo' : 'chip'} onClick={() => mudar({ grau: f.grau === g ? null : g })}>
              {g} · {NOME_GRAU[g]}
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div class="chips" role="group" aria-label="Tags">
          <span class="suave">Tag:</span>
          {tags.map((t) => (
            <button type="button" class={f.tag === t ? 'chip ativo' : 'chip'} onClick={() => mudar({ tag: f.tag === t ? null : t })}>
              #{t}
            </button>
          ))}
        </div>
      )}

      {!est.notas.length && est.carregado && (
        <div class="vazio">
          <p>Nenhuma nota ainda.</p>
          {padrao ? (
            <>
              <p class="suave">Abrir o {padrao.nome} (protegido por senha):</p>
              <DesbloquearSistema s={padrao} rotulo="Abrir e carregar" />
            </>
          ) : (
            <a class="botao" href="#/sistemas">
              Sistemas prontos
            </a>
          )}
        </div>
      )}
      {est.notas.length > 0 && !notas.length && <p class="suave">Nenhuma nota com esse filtro.</p>}
      {temFiltro && notas.length > 0 && (
        <p class="suave">
          {notas.length} de {est.notas.length} notas
        </p>
      )}

      <ul class="lista-notas">
        {notas.map((n) => (
          <CartaoNota nota={n} />
        ))}
      </ul>
    </section>
  )
}

function CartaoNota({ nota: n }: { nota: Nota }) {
  const est = useEstado()
  const comErro = n.formulas.filter((t) => t.trim() && !validar(t, est.dicionario).ok).length
  const formulas = n.formulas.filter((t) => t.trim())
  const detalhe =
    n.compartimento === 'lei'
      ? `${n.grau} · ${NOME_GRAU[n.grau]}`
      : n.compartimento === 'fato'
        ? [n.fonte, n.data && new Date(n.data + 'T00:00').toLocaleDateString('pt-BR')].filter(Boolean).join(' · ')
        : n.titular && `de ${n.titular}`

  return (
    <li class={`cartao c-${n.compartimento}${n.ativa ? '' : ' inativa'}`}>
      <a href={`#/nota/${encodeURIComponent(n.id)}`} class="cartao-link">
        <div class="cartao-topo">
          <span class={`selo c-${n.compartimento}`}>{NOME_COMPARTIMENTO[n.compartimento]}</span>
          {detalhe && <span class="suave">{detalhe}</span>}
          {!n.ativa && <span class="selo inativo">inativa</span>}
          {comErro > 0 && <span class="selo erro">{comErro} com erro</span>}
        </div>
        <strong class="cartao-titulo">{n.titulo || <em class="suave">Sem título</em>}</strong>
        {formulas.slice(0, 3).map((t) => (
          <FormulaExibida texto={t} titular={n.compartimento === 'visao' ? n.titular : undefined} />
        ))}
        {formulas.length > 3 && <span class="suave">+ {formulas.length - 3} fórmulas</span>}
        {n.tags.length > 0 && <div class="tags">{n.tags.map((t) => `#${t}`).join(' ')}</div>}
      </a>
      <label class="alternar" title="Ativa: entra no motor de contradição">
        <input type="checkbox" checked={n.ativa} onChange={() => est.salvarNota({ ...n, ativa: !n.ativa })} />
        ativa
      </label>
    </li>
  )
}
