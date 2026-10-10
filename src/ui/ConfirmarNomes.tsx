import { useState } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { NOME_TIPO, type EntradaDicionario, type TipoSimbolo } from '../dados/tipos'
import { renomear, type PropostaFicha } from '../logica/nomes'

interface Rascunho {
  termo: string
  tipo: TipoSimbolo
  aridade: number
}

/**
 * Lista os nomes usados nas notas que ainda não têm ficha, com tipo e aridade
 * deduzidos. Cada ficha só entra no dicionário quando o usuário confirma.
 */
export function ConfirmarNomes({ propostas }: { propostas: PropostaFicha[] }) {
  const est = useEstado()
  const [rasc, setRasc] = useState<Record<string, Rascunho>>({})
  const r = (p: PropostaFicha): Rascunho => rasc[p.simbolo] ?? { termo: '', tipo: p.tipo, aridade: p.aridade }
  const mudar = (p: PropostaFicha, m: Partial<Rascunho>) => setRasc((x) => ({ ...x, [p.simbolo]: { ...r(p), ...m } }))

  const paraEntrada = (p: PropostaFicha): EntradaDicionario => {
    const x = r(p)
    return {
      id: '',
      simbolo: p.simbolo,
      termo: x.termo.trim() || p.simbolo,
      tipo: x.tipo,
      aridade: x.tipo === 'constante' ? 0 : x.aridade,
      definicao: '',
    }
  }

  const trocarEmTodas = async (p: PropostaFicha) => {
    if (!p.parecidoCom) return
    if (!confirm(`Trocar '${p.simbolo}' por '${p.parecidoCom}' em ${p.notas.length} nota(s)?`)) return
    for (const id of p.notas) {
      const n = est.nota(id)
      if (n) await est.salvarNota({ ...n, formulas: n.formulas.map((f) => renomear(f, p.simbolo, p.parecidoCom!, est.dicionario)) })
    }
  }

  const semConflito = propostas.filter((p) => !p.conflito)

  if (!propostas.length) return <p class="status-ok">✓ Todos os nomes usados têm ficha confirmada no dicionário.</p>

  return (
    <div class="confirmar-nomes">
      <p>
        {propostas.length === 1 ? '1 nome usado nas notas não tem ficha' : `${propostas.length} nomes usados nas notas não têm ficha`}. Confira o tipo
        deduzido e confirme:
      </p>
      <ul>
        {propostas.map((p) => {
          const x = r(p)
          return (
            <li class={p.conflito ? 'conflito' : ''}>
              <div class="proposta-topo">
                <code class="simbolo">{p.simbolo}</code>
                <select value={x.tipo} onChange={(e) => mudar(p, { tipo: (e.target as HTMLSelectElement).value as TipoSimbolo })} aria-label="Tipo">
                  {(['constante', 'funcao', 'predicado'] as TipoSimbolo[]).map((t) => (
                    <option value={t}>{NOME_TIPO[t]}</option>
                  ))}
                </select>
                {x.tipo !== 'constante' && (
                  <label class="aridade">
                    aridade
                    <input
                      type="number"
                      min={0}
                      max={9}
                      value={x.aridade}
                      onInput={(e) => mudar(p, { aridade: Number((e.target as HTMLInputElement).value) || 0 })}
                    />
                  </label>
                )}
                <span class="suave">
                  em {p.notas.length} nota{p.notas.length > 1 ? 's' : ''}
                </span>
              </div>
              {p.conflito && <div class="aviso-texto">⚠ {p.conflito}. Escolha o tipo certo e corrija as fórmulas que discordam.</div>}
              {p.parecidoCom && (
                <div class="aviso-texto">
                  Você quis dizer <code>{p.parecidoCom}</code>?{' '}
                  <button type="button" class="mini" onClick={() => trocarEmTodas(p)}>
                    Trocar em todas as notas
                  </button>
                </div>
              )}
              <div class="proposta-baixo">
                <input
                  type="text"
                  placeholder={`Termo por extenso (opcional)`}
                  value={x.termo}
                  onInput={(e) => mudar(p, { termo: (e.target as HTMLInputElement).value })}
                />
                <button type="button" onClick={() => est.salvarEntradas(paraEntrada(p))}>
                  Confirmar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      {semConflito.length > 1 && (
        <button type="button" class="primario" onClick={() => est.salvarEntradas(...semConflito.map(paraEntrada))}>
          Confirmar todos sem conflito ({semConflito.length})
        </button>
      )}
    </div>
  )
}
