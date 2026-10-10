// Reação em cadeia: bate leis, fatos e teoremas uns contra os outros e
// mostra o que isso gera.
//
// Para cada conjunto (leis e fatos; ou a visão de um titular):
//   1. as leis e fatos são consistentes?
//   2. leis batendo umas com as outras: cada uma decorre das outras
//      (redundante) ou é independente (com o cenário que prova)?
//   3. cada teorema segue? (com as notas de onde vem)
//   4. a cadeia: teoremas que seguem de outros teoremas já provados
//      (geração 1 = direto das leis; geração 2 = usa um teorema da 1; …)
//   5. os teoremas que não seguem se contradizem entre si, junto com as leis?
//   6. que leis fechariam os que faltam (e quantos teoremas cada uma fecha)
//   7. que consequências novas as leis geram
// A cada etapa o relatório parcial é enviado, para a tela mostrar a reação
// acontecendo. Aprovar uma lei sugerida dispara a rodada seguinte (na tela).

import type { EntradaDicionario } from '../dados/tipos'
import type { Formula } from '../logica/ast'
import { ehModal } from './aterrar'
import { Avaliador } from './avaliar'
import { descobrir, type Consequencia } from './descobrir'
import { canonica, procurarLeis, type LeiSugerida } from './lacunas'
import {
  analisar,
  buscarModelo,
  minimizarRapido,
  nao,
  perguntar,
  verificar,
  type Grupo,
  type GrupoPronto,
  type MundoExplicado,
  type OpcoesMotor,
  type Progresso,
  type ResultadoMotor,
  type ResultadoPergunta,
} from './motor'

export interface TeoremaEntrada {
  /** "notaId:índice" */
  id: string
  notaId: string
  rotulo: string
  formula: string
}

export interface ContextoCadeia {
  /** "geral" ou "visao:<titular>" */
  chave: string
  rotulo: string
  grupos: Grupo[]
  teoremas: TeoremaEntrada[]
}

export interface PedidoCadeia {
  contextos: ContextoCadeia[]
  /** leis e fatos desativados: candidatos na busca das leis que faltam */
  inativas: Grupo[]
}

export type EstadoLei =
  /** as outras leis valem neste cenário e esta falha: ela diz algo que as outras não dizem */
  | { id: string; tipo: 'independente'; mundo: MundoExplicado; formula: string }
  /** segue das outras (redundante): as notas necessárias */
  | { id: string; tipo: 'decorre'; notas: string[] }
  | { id: string; tipo: 'incerto' }

export interface EstadoTeorema {
  id: string
  notaId: string
  formula: string
  resultado: ResultadoPergunta
  /** para os que seguem: apoio usando teoremas anteriores quando possível (ids de notas e de teoremas) */
  apoio?: string[]
  /** 1 = direto das leis; 2 = usa um teorema da geração 1; … */
  geracao?: number
}

export interface SugestaoCadeia {
  lei: LeiSugerida
  /** ids dos teoremas que esta lei faria seguir */
  fecha: string[]
}

export type EtapaCadeia = 'consistencia' | 'leis' | 'teoremas' | 'cadeia' | 'juntos' | 'lacunas' | 'consequencias' | 'fim'

export interface RelatorioCadeia {
  chave: string
  rotulo: string
  etapa: EtapaCadeia
  N: number
  K: number
  consistencia: ResultadoMotor | null
  leis: EstadoLei[]
  teoremas: EstadoTeorema[]
  /** teoremas que não seguem e que, junto com as leis, se contradizem (conjunto mínimo) */
  conflitoTeoremas: string[] | null
  sugestoes: SugestaoCadeia[]
  consequencias: Consequencia[] | null
  /** consequências que já estavam escritas como teorema */
  consequenciasJaTeorema: number
}

const conj = (fs: Formula[]): Formula => fs.reduce((a, b): Formula => ({ k: 'and', l: a, r: b, pos: 0, end: 0 }))

export function reacaoEmCadeia(
  pedido: PedidoCadeia,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  parcial: (r: RelatorioCadeia[]) => void,
  progresso?: (chave: string, msg: string) => void,
) {
  const relatorios: RelatorioCadeia[] = pedido.contextos.map((c) => ({
    chave: c.chave,
    rotulo: c.rotulo,
    etapa: 'consistencia',
    N: op.N,
    K: 1,
    consistencia: null,
    leis: [],
    teoremas: [],
    conflitoTeoremas: null,
    sugestoes: [],
    consequencias: null,
    consequenciasJaTeorema: 0,
  }))
  const enviar = () => parcial(relatorios.map((r) => ({ ...r })))
  pedido.contextos.forEach((c, k) => {
    const rel = relatorios[k]
    rodarContexto(c, rel, pedido.inativas, dicionario, op, enviar, (msg) => progresso?.(c.chave, msg))
    rel.etapa = 'fim'
    enviar()
  })
}

function rodarContexto(
  c: ContextoCadeia,
  rel: RelatorioCadeia,
  inativas: Grupo[],
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  enviar: () => void,
  progresso: Progresso,
) {
  const prontos: GrupoPronto[] = c.grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))
  const teoremas = c.teoremas.map((t) => ({ t, pronta: analisar([t.formula], dicionario)[0] }))
  rel.K = [...premissas, ...teoremas.flatMap((x) => (x.pronta ? [x.pronta.expandida] : []))].some(ehModal) ? op.K : 1

  // 1. consistência
  rel.etapa = 'consistencia'
  progresso('conferindo se as leis e fatos são consistentes')
  rel.consistencia = verificar(c.grupos, dicionario, op, progresso)
  enviar()
  if (rel.consistencia.tipo === 'sem-modelo' || rel.consistencia.tipo === 'grande-demais') return

  // 2. leis batendo umas com as outras
  rel.etapa = 'leis'
  if (prontos.length >= 2)
    prontos.forEach((alvo, i) => {
      progresso(`batendo cada lei com as outras (${i + 1}/${prontos.length}): ${alvo.g.rotulo}`)
      const outros = prontos.filter((x) => x !== alvo)
      const negada = nao(conj(alvo.itens.map((it) => it.expandida)))
      const r = buscarModelo([...outros.flatMap((x) => x.itens.map((it) => it.expandida)), negada], op)
      if (r.status === 'modelo') {
        const av = new Avaliador(r.modelo)
        const falha = alvo.itens.find((it) => !av.avaliar(it.original)) ?? alvo.itens[0]
        rel.leis.push({
          id: alvo.g.id,
          tipo: 'independente',
          formula: falha.texto,
          mundo: { n: r.n, modelo: r.modelo, passos: av.explicar(falha.original) },
        })
      } else if (r.status === 'sem-modelo') {
        const notas = minimizarRapido(outros, [negada], op)
        rel.leis.push({ id: alvo.g.id, tipo: 'decorre', notas: notas.map((x) => x.g.id) })
      } else rel.leis.push({ id: alvo.g.id, tipo: 'incerto' })
      enviar()
    })

  // 3. cada teorema
  rel.etapa = 'teoremas'
  teoremas.forEach(({ t }, i) => {
    const resultado = perguntar(c.grupos, t.formula, dicionario, op, (msg) =>
      progresso(`teorema ${i + 1} de ${teoremas.length} (${t.rotulo}): ${msg}`),
    )
    rel.teoremas.push({ id: t.id, notaId: t.notaId, formula: t.formula, resultado })
    enviar()
  })

  // 4. a cadeia: teoremas que seguem de teoremas já provados
  rel.etapa = 'cadeia'
  const provados = rel.teoremas
    .map((e, ordem) => ({ e, ordem, pronta: teoremas.find((x) => x.t.id === e.id)!.pronta }))
    .filter((x) => x.e.resultado.tipo === 'segue' && x.pronta)
    .sort((a, b) => apoioDireto(a.e) - apoioDireto(b.e) || a.ordem - b.ordem)
  const geracao = new Map<string, number>()
  provados.forEach((x, k) => {
    const lemas: GrupoPronto[] = provados
      .slice(0, k)
      .map((l) => ({ g: { id: l.e.id, rotulo: l.e.formula, formulas: [l.e.formula] }, itens: [l.pronta!] }))
    let apoio = x.e.resultado.tipo === 'segue' ? x.e.resultado.notas : []
    if (lemas.length) {
      progresso(`montando a cadeia (${k + 1}/${provados.length}): ${x.e.formula}`)
      // as leis vêm primeiro na ordem de remoção: onde um teorema anterior basta, ele fica no lugar delas
      apoio = minimizarRapido([...prontos, ...lemas], [nao(x.pronta!.expandida)], op).map((g) => g.g.id)
    }
    const g = 1 + Math.max(0, ...apoio.map((id) => geracao.get(id) ?? 0))
    geracao.set(x.e.id, g)
    x.e.apoio = apoio
    x.e.geracao = g
    enviar()
  })

  // 5. os que não seguem se contradizem entre si (junto com as leis)?
  rel.etapa = 'juntos'
  const abertos = rel.teoremas
    .map((e) => ({ e, pronta: teoremas.find((x) => x.t.id === e.id)!.pronta }))
    .filter((x) => x.e.resultado.tipo === 'nao-segue' && x.pronta)
  if (abertos.length >= 2) {
    progresso('conferindo se os teoremas que não seguem se contradizem entre si')
    const fs = [...premissas, ...abertos.map((x) => x.pronta!.expandida)]
    if (buscarModelo(fs, op).status === 'sem-modelo') {
      const grupos = abertos.map((x) => ({ g: { id: x.e.id, rotulo: x.e.formula, formulas: [x.e.formula] }, itens: [x.pronta!] }))
      rel.conflitoTeoremas = minimizarRapido(grupos, premissas, op, 1).map((g) => g.g.id)
    }
    enviar()
  }

  // 6. leis que fechariam os que faltam
  rel.etapa = 'lacunas'
  const porForma = new Map<string, SugestaoCadeia>()
  abertos.forEach((x, i) => {
    const r = procurarLeis(c.grupos, inativas, x.e.formula, dicionario, op, (msg) =>
      progresso(`lei que falta para o teorema ${i + 1} de ${abertos.length}: ${msg}`),
    )
    if (r.tipo !== 'sugestoes') return
    for (const lei of r.itens) {
      const p = analisar([lei.formula], dicionario)[0]
      const k = p ? canonica(p.original) : lei.formula
      const s = porForma.get(k)
      if (s) s.fecha.push(x.e.id)
      else porForma.set(k, { lei, fecha: [x.e.id] })
    }
    rel.sugestoes = ordenar([...porForma.values()])
    enviar()
  })
  // cada lei sugerida fecha também outros teoremas abertos?
  const sugestoes = [...porForma.values()]
  sugestoes.forEach((s, i) => {
    const p = analisar([s.lei.formula], dicionario)[0]
    if (!p) return
    for (const x of abertos) {
      if (s.fecha.includes(x.e.id)) continue
      const contra = x.e.resultado.tipo === 'nao-segue' ? x.e.resultado.mundo.modelo : null
      if (contra && new Avaliador(contra).avaliar(p.original)) continue // vale no contraexemplo: não fecha
      progresso(`a lei "${s.lei.nome}" fecha outros teoremas? (${i + 1}/${sugestoes.length})`)
      if (buscarModelo([...premissas, p.expandida, nao(x.pronta!.expandida)], op).status === 'sem-modelo') s.fecha.push(x.e.id)
    }
  })
  rel.sugestoes = ordenar(sugestoes)
  enviar()

  // 7. consequências novas
  rel.etapa = 'consequencias'
  if (prontos.length) {
    const d = descobrir(c.grupos, dicionario, op, progresso)
    if (d.tipo === 'consequencias') {
      const jaTeorema = new Set(teoremas.flatMap((x) => (x.pronta ? [canonica(x.pronta.original)] : [])))
      const novas = d.itens.filter((it) => {
        const p = analisar([it.formula], dicionario)[0]
        return !p || !jaTeorema.has(canonica(p.original))
      })
      rel.consequencias = novas
      rel.consequenciasJaTeorema = d.itens.length - novas.length
    } else rel.consequencias = []
  }
}

/** quantas notas o teorema usa direto das leis (menos = mais básico; entra antes na cadeia) */
const apoioDireto = (e: EstadoTeorema) => (e.resultado.tipo === 'segue' ? e.resultado.notas.length : 99)

/** mais teoremas fechados primeiro; as que equivalem ao teorema por último */
const ordenar = (ss: SugestaoCadeia[]) =>
  [...ss].sort((a, b) => Number(a.lei.equivalente) - Number(b.lei.equivalente) || b.fecha.length - a.fecha.length || Number(!a.lei.notaId) - Number(!b.lei.notaId))
