import { useEffect } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { disponibilidadeZ3, useZ3 } from '../dados/z3'

export type TipoConfirmacao =
  /** notas que o motor finito acusou como conflito: o Z3 prova ou desmente */
  | 'conflito'
  /** conjunto inteiro que ficou "grande demais" para o motor finito */
  | 'conjunto'
  /** fórmula que segue das notas (checa notas ∧ ¬φ) */
  | 'segue'
  /** fórmula contradita pelas notas (checa notas ∧ φ) */
  | 'contradiz'

/**
 * Segunda opinião do Z3, sem limite de tamanho. Só aparece com o Z3 ligado.
 * `formulas` são afirmadas; `negar`, se dado, entra negado.
 */
export function ConfirmacaoZ3({ tipo, formulas, negar }: { tipo: TipoConfirmacao; formulas: string[]; negar?: string }) {
  const z = useZ3()
  const est = useEstado()
  const disp = disponibilidadeZ3()
  const chave = JSON.stringify([formulas, negar ?? null, est.dicionario.map((e) => [e.simbolo, e.tipo, e.aridade])])
  const c = z.consulta(chave)

  useEffect(() => {
    if (z.ativo && disp.ok) z.confirmar(chave, formulas, est.dicionario, negar)
  }, [z.ativo, disp.ok, chave])

  if (!z.ativo) return null
  if (!disp.ok)
    return (
      <div class="z3 z3-aviso">
        <b>Z3:</b> {disp.motivo}{' '}
        {disp.recarregar && (
          <button type="button" class="mini" onClick={() => location.reload()}>
            Recarregar
          </button>
        )}
      </div>
    )
  if (!c || c.estado === 'rodando')
    return (
      <div class="z3" aria-live="polite">
        <span class="girando" aria-hidden="true" /> {z.status === 'carregando' ? 'Carregando o Z3 (35 MB na primeira vez)…' : 'O Z3 está provando…'}
      </div>
    )
  if (c.estado === 'erro') return <div class="z3 z3-aviso">Z3: {c.erro}</div>

  const tempo = c.ms! < 1000 ? `${c.ms} ms` : `${(c.ms! / 1000).toFixed(1)} s`
  if (c.resultado === 'unknown')
    return (
      <div class="z3 z3-aviso">
        <b>Z3:</b> não decidiu no tempo limite ({tempo}). Isso é comum quando só cenários infinitos resolveriam. Vale o resultado do motor finito.
      </div>
    )
  const provado = c.resultado === 'unsat'
  const texto = {
    conflito: provado
      ? 'Provado pelo Z3: estas notas se contradizem de verdade, em cenários de qualquer tamanho, inclusive infinitos.'
      : 'O Z3 encontrou um cenário (maior que N, ou infinito) onde estas notas valem juntas: NÃO é contradição.',
    conjunto: provado ? 'Provado pelo Z3: este conjunto é contraditório.' : 'O Z3 encontrou um cenário onde tudo vale: o conjunto é consistente.',
    segue: provado
      ? 'Provado pelo Z3: segue em cenários de qualquer tamanho.'
      : 'O Z3 encontrou um cenário maior onde as notas valem e a fórmula falha: NÃO segue.',
    contradiz: provado
      ? 'Provado pelo Z3: as notas contradizem esta fórmula em cenários de qualquer tamanho.'
      : 'O Z3 encontrou um cenário maior onde as notas e a fórmula valem juntas: NÃO há contradição.',
  }[tipo]
  return (
    <div class={`z3 ${provado ? 'z3-provado' : 'z3-desmente'}`}>
      {provado ? '✓ ' : '⚠ '}
      {texto} <span class="suave">({tempo})</span>
    </div>
  )
}
