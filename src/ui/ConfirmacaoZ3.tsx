import { useEffect } from 'preact/hooks'
import { estado, useEstado } from '../dados/estado'
import { chaveZ3, disponibilidadeZ3, useZ3 } from '../dados/z3'
import type { Grupo } from '../motor/motor'

export type TipoConfirmacao =
  /** notas que o motor finito acusou como conflito: o Z3 prova ou desmente */
  | 'conflito'
  /** conjunto inteiro que ficou "grande demais" para o motor finito */
  | 'conjunto'
  /** fórmula que segue das notas (checa notas ∧ ¬φ) */
  | 'segue'
  /** fórmula contradita pelas notas (checa notas ∧ φ) */
  | 'contradiz'
  /** fórmula com números (só o Z3 decide): segue das notas? (checa notas ∧ ¬φ) */
  | 'numeros'

/**
 * Segunda opinião do Z3, sem limite de tamanho. Só aparece com o Z3 ligado.
 * `formulas` são afirmadas; `negar`, se dado, entra negado.
 */
export function ConfirmacaoZ3({ tipo, formulas, negar }: { tipo: TipoConfirmacao; formulas: string[]; negar?: string }) {
  const z0 = useZ3()
  // fórmulas com números só o Z3 confere: com ele desligado, oferece ligar
  if (!z0.ativo && tipo === 'numeros')
    return (
      <div class="z3 z3-aviso">
        Esta fórmula usa números: quem confere é o Z3.{' '}
        <button type="button" class="mini" onClick={() => void z0.definirAtivo(true)}>
          Ligar o Z3
        </button>
      </div>
    )
  return <ConfirmacaoZ3Ligado tipo={tipo} formulas={formulas} negar={negar} />
}

function ConfirmacaoZ3Ligado({ tipo, formulas, negar }: { tipo: TipoConfirmacao; formulas: string[]; negar?: string }) {
  const z = useZ3()
  const est = useEstado()
  const disp = disponibilidadeZ3()
  const chave = chaveZ3(formulas, negar ?? null, est.dicionario)
  const c = z.consulta(chave)

  useEffect(() => {
    if (z.ativo && disp.ok) z.confirmar(chave, formulas, est.dicionario, negar, tipo === 'numeros')
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
        <b>Z3:</b> não decidiu no tempo limite ({tempo}).{' '}
        {tipo === 'numeros'
          ? 'Contas com multiplicação de incógnitas e quantificadores podem ser difíceis demais; tente escrever o caso com valores fixos.'
          : 'Isso é comum quando só cenários infinitos resolveriam. Vale o resultado do motor finito.'}
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
    numeros: provado
      ? 'Segue — provado pelo Z3, para quaisquer valores dos números.'
      : 'Não segue: o Z3 achou valores em que as notas valem e a fórmula falha.',
  }[tipo]
  return (
    <div class={`z3 ${provado ? 'z3-provado' : 'z3-desmente'}`}>
      {provado ? '✓ ' : '⚠ '}
      {texto} <span class="suave">({tempo})</span>
    </div>
  )
}

/**
 * Teorema com números: o Z3 confere. Se não segue, testa as notas desativadas
 * (leis e fatos) e mostra as que fariam seguir sem contradizer as outras.
 */
export function ConferenciaNumerica({
  grupos,
  formula,
  inativas,
  onAtivada,
}: {
  grupos: Grupo[]
  formula: string
  inativas: Grupo[]
  onAtivada?: (nome: string) => void
}) {
  const z = useZ3()
  const est = useEstado()
  const disp = disponibilidadeZ3()
  const formulas = grupos.flatMap((g) => g.formulas)
  const principal = z.consulta(chaveZ3(formulas, formula, est.dicionario))
  const naoSegue = principal?.estado === 'feito' && principal.resultado !== 'unsat'
  // cada candidata: com ela, segue? e ela é compatível com as outras?
  const testes = inativas.map((g) => {
    const juntas = [...formulas, ...g.formulas]
    return { g, juntas, kSegue: chaveZ3(juntas, formula, est.dicionario), kCabe: chaveZ3(juntas, null, est.dicionario) }
  })
  useEffect(() => {
    if (!naoSegue || !z.ativo || !disp.ok) return
    for (const t of testes) {
      z.confirmar(t.kSegue, t.juntas, est.dicionario, formula, true)
      z.confirmar(t.kCabe, t.juntas, est.dicionario, undefined, true, t.g.formulas[0])
    }
  }, [naoSegue, z.ativo, disp.ok, testes.map((t) => t.kSegue).join('|')])
  const fecham = naoSegue
    ? testes.filter((t) => z.consulta(t.kSegue)?.resultado === 'unsat' && z.consulta(t.kCabe)?.resultado === 'sat')
    : []
  const testando = naoSegue && testes.some((t) => z.consulta(t.kSegue)?.estado === 'rodando' || z.consulta(t.kCabe)?.estado === 'rodando')
  return (
    <>
      <ConfirmacaoZ3 tipo="numeros" formulas={formulas} negar={formula} />
      {testando && (
        <div class="z3 suave">
          <span class="girando" aria-hidden="true" /> procurando, entre as notas desativadas, a lei que falta…
        </div>
      )}
      {fecham.map((t) => (
        <div class="z3 z3-provado">
          Com a nota desativada <a href={`#/nota/${encodeURIComponent(t.g.id)}`}>{t.g.rotulo}</a>, segue (provado pelo Z3) e ela não contradiz as
          outras.{' '}
          <button
            type="button"
            class="primario mini"
            onClick={async () => {
              const n = estado.nota(t.g.id)
              if (n) await estado.salvarNota({ ...n, ativa: true })
              onAtivada?.(t.g.rotulo)
            }}
          >
            Aprovar: ativar esta nota
          </button>
        </div>
      ))}
    </>
  )
}
