// O Z3 completa a classificação do segundo modelo onde o motor finito não
// decide (fórmulas com números): para cada teorema, segue das leis
// (provado), as leis o contradizem (refutado) ou nenhum dos dois (tese); para
// cada nota desativada, cabe ou não junto com as leis. Sem limite de tamanho.

import type { ItemModelo, RelatorioModelo } from '../motor/modelo'
import { pedidoDaCadeia } from './cadeia'
import type { EntradaDicionario } from './tipos'
import { chaveZ3, disponibilidadeZ3, z3 } from './z3'
import { analisar } from '../motor/motor'

interface Checagem {
  item: ItemModelo
  premissas: string[]
  /** teorema: premissas ∧ ¬φ (sem modelo = segue) */
  segue?: string
  /** teorema: premissas ∧ φ (sem modelo = as leis contradizem); nota desativada: premissas ∧ nota (sem modelo = não cabe) */
  junto: string
  formulas: string[]
}

/** O que o Z3 precisa conferir neste resultado do modelo. */
function checagens(rel: RelatorioModelo, dicionario: EntradaDicionario[]): Checagem[] {
  const contextos = pedidoDaCadeia(rel.notas, dicionario).contextos
  const premissas = (chave: string) => contextos.find((c) => c.chave === chave)?.grupos.flatMap((g) => g.formulas) ?? []
  const cs: Checagem[] = []
  for (const item of rel.itens) {
    if (item.classe === 'numerico') {
      const ps = premissas(item.chave)
      cs.push({
        item,
        premissas: ps,
        formulas: [item.formula],
        segue: chaveZ3(ps, item.formula, dicionario),
        junto: chaveZ3([...ps, item.formula], null, dicionario),
      })
    } else if (item.classe === 'incerto' && item.notaId && !item.id.includes(':')) {
      // nota desativada com números: cabe junto com as leis?
      const nota = rel.notas.find((n) => n.id === item.notaId)
      if (!nota || nota.ativa) continue
      const ps = premissas(item.chave)
      const fs = nota.formulas.filter((f) => f.trim())
      cs.push({ item, premissas: ps, formulas: fs, junto: chaveZ3([...ps, ...fs], null, dicionario) })
    }
  }
  return cs
}

/** Pede ao Z3 as checagens que faltam (cada uma roda uma vez; as respostas ficam guardadas). */
export function pedirZ3DoModelo(rel: RelatorioModelo, dicionario: EntradaDicionario[]) {
  if (!z3.ativo) return
  for (const c of checagens(rel, dicionario)) {
    if (c.segue) z3.confirmar(c.segue, c.premissas, dicionario, c.formulas[0], true)
    // só as leis ligadas por nomes à fórmula (o Z3 não se perde no resto)
    z3.confirmar(c.junto, [...c.premissas, ...c.formulas], dicionario, undefined, true, c.formulas.map((f) => `(${f})`).join(' ∧ '))
  }
  for (const c of consistenciaZ3(rel, dicionario)) z3.confirmar(c.chaveZ3, c.premissas, dicionario)
}

/**
 * Consistência de cada conjunto com todas as leis, inclusive as com números
 * (o motor finito deixa essas de fora). Só para conjuntos que têm números.
 */
export function consistenciaZ3(rel: RelatorioModelo, dicionario: EntradaDicionario[]) {
  // fórmula com números: o motor finito a deixa de fora, o Z3 a lê
  const temNumero = (f: string) => !analisar([f], dicionario).length && analisar([f], dicionario, true).length > 0
  return pedidoDaCadeia(rel.notas, dicionario)
    .contextos.map((c) => ({ chave: c.chave, rotulo: c.rotulo, premissas: c.grupos.flatMap((g) => g.formulas) }))
    .filter((c) => c.premissas.some(temNumero))
    .map((c) => ({ ...c, chaveZ3: chaveZ3(c.premissas, null, dicionario) }))
}

/** Quantas checagens do Z3 ainda estão rodando para este resultado. */
export function z3Pendentes(rel: RelatorioModelo, dicionario: EntradaDicionario[]): number {
  return checagens(rel, dicionario).filter((c) => [c.segue, c.junto].some((k) => k && z3.consulta(k)?.estado === 'rodando')).length
}

/** Os itens do modelo com as respostas do Z3 que já chegaram. */
export function itensComZ3(rel: RelatorioModelo, dicionario: EntradaDicionario[]): ItemModelo[] {
  const decididos = new Map<string, ItemModelo>()
  const r = (k?: string) => (k ? z3.consulta(k)?.resultado : undefined)
  for (const c of checagens(rel, dicionario)) {
    const z = ' — pelo Z3, para qualquer tamanho'
    if (c.segue) {
      if (r(c.segue) === 'unsat') decididos.set(c.item.id, { ...c.item, classe: 'provado', explicacao: `segue das leis${z}` })
      else if (r(c.junto) === 'unsat') decididos.set(c.item.id, { ...c.item, classe: 'refutado', explicacao: `as leis implicam o contrário${z}` })
      else if (r(c.segue) === 'sat' && r(c.junto) === 'sat')
        decididos.set(c.item.id, { ...c.item, classe: 'tese', explicacao: `não contradiz as leis, mas não segue delas${z}` })
      else if (r(c.segue) === 'unknown' || r(c.junto) === 'unknown')
        decididos.set(c.item.id, { ...c.item, explicacao: 'usa números; o Z3 não decidiu no tempo limite' })
    } else if (r(c.junto) === 'sat')
      decididos.set(c.item.id, { ...c.item, classe: 'compativel', explicacao: `desativada; não contradiz as leis ativas${z}` })
    else if (r(c.junto) === 'unsat')
      decididos.set(c.item.id, { ...c.item, classe: 'incompativel', explicacao: `desativada; contradiz as leis ativas${z}` })
  }
  return rel.itens.map((i) => decididos.get(i.id) ?? i)
}

/** quantas notas o Z3 pode ativar seguidas (cada uma muda as leis e refaz as checagens) */
const MAX_ATIVACOES_Z3 = 5

const esperarTodas = async (chaves: (string | undefined)[]) => {
  for (const k of chaves) if (k) await z3.esperar(k)
}

/**
 * Fase do Z3 no fim do segundo modelo: uma nota desativada só com números
 * que cabe junto com as leis e fecha teses com números (sem refutar outra) é
 * ativada, como o motor finito faz com as outras. Repete até nada mudar.
 * Devolve as notas ativadas (para o aviso).
 */
export async function completarComZ3(
  quando: number,
  dicionario: EntradaDicionario[],
  atual: () => { quando: number; relatorio: RelatorioModelo | null } | null,
  gravar: (r: RelatorioModelo) => void,
): Promise<string[]> {
  if (emAndamento === quando || !z3.ativo || !disponibilidadeZ3().ok) return []
  emAndamento = quando
  try {
    return await completar(quando, dicionario, atual, gravar)
  } finally {
    if (emAndamento === quando) emAndamento = null
  }
}

/** execução do modelo cuja fase do Z3 está rodando (uma por vez) */
let emAndamento: number | null = null

async function completar(
  quando: number,
  dicionario: EntradaDicionario[],
  atual: () => { quando: number; relatorio: RelatorioModelo | null } | null,
  gravar: (r: RelatorioModelo) => void,
): Promise<string[]> {
  const ativadas: string[] = []
  const valendo = () => atual()?.quando === quando
  for (let i = 0; i < MAX_ATIVACOES_Z3 && z3.ativo && valendo(); i++) {
    const rel = atual()!.relatorio
    if (!rel || rel.situacao !== 'pronto') break
    pedirZ3DoModelo(rel, dicionario)
    const cs = checagens(rel, dicionario)
    await esperarTodas(cs.flatMap((c) => [c.segue, c.junto]))
    if (!valendo()) break
    const r = (k?: string) => (k ? z3.consulta(k)?.resultado : undefined)
    const teses = cs.filter((c) => c.segue && r(c.segue) === 'sat' && r(c.junto) === 'sat')
    const candidatas = cs.filter((c) => !c.segue && r(c.junto) === 'sat' && c.formulas.every((f) => !analisar([f], dicionario).length))
    if (!teses.length || !candidatas.length) break
    // cada candidata contra cada tese do mesmo conjunto: fecha?
    let melhor: { c: Checagem; fecha: Checagem[] } | null = null
    for (const cand of candidatas) {
      const fecha: Checagem[] = []
      for (const t of teses.filter((x) => x.item.chave === cand.item.chave)) {
        const k = chaveZ3([...t.premissas, ...cand.formulas], t.formulas[0], dicionario)
        z3.confirmar(k, [...t.premissas, ...cand.formulas], dicionario, t.formulas[0], true)
        if ((await z3.esperar(k))?.resultado === 'unsat') fecha.push(t)
      }
      if (!fecha.length) continue
      // não pode refutar outra tese
      let refuta = false
      for (const t of teses.filter((x) => x.item.chave === cand.item.chave && !fecha.includes(x))) {
        const fs = [...t.premissas, ...cand.formulas, t.formulas[0]]
        const k = chaveZ3(fs, null, dicionario)
        z3.confirmar(k, fs, dicionario, undefined, true, `(${t.formulas[0]})`)
        if ((await z3.esperar(k))?.resultado === 'unsat') refuta = true
        if (refuta) break
      }
      if (!refuta && (!melhor || fecha.length > melhor.fecha.length)) melhor = { c: cand, fecha }
    }
    if (!melhor || !valendo()) break
    const { c, fecha } = melhor
    const nomes = fecha.map((t) => `“${t.item.titulo}”`).join(', ')
    const detalhe = `estava desativada; ativada porque fecha ${nomes} e não contradiz as leis nem refuta outra tese — pelo Z3, para qualquer tamanho`
    const notaId = c.item.notaId!
    gravar({
      ...rel,
      notas: rel.notas.map((n) => (n.id === notaId ? { ...n, ativa: true } : n)),
      itens: rel.itens.map((it) => (it.id === c.item.id ? { ...it, classe: 'ativada', explicacao: detalhe } : it)),
      eventos: [...rel.eventos, { rodada: rel.rodada + 1, tipo: 'ativou', conjunto: c.item.chave === 'geral' ? 'Leis e fatos' : c.item.chave, notaId, titulo: c.item.titulo, detalhe }],
      rodada: rel.rodada + 1,
    })
    ativadas.push(`${c.item.titulo} (fecha ${nomes})`)
  }
  return ativadas
}
