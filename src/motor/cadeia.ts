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
import { Avaliador, tamanhoTexto } from './avaliar'
import { descobrirComPrazo, type Consequencia, type PrazosDescoberta } from './descobrir'
import { darVez, emParalelo, poolAtual } from './paralelo'
import { canonica, type LeiSugerida, type ResultadoLacunas } from './lacunas'
import {
  analisar,
  buscarModelo,
  registrarSemModelo,
  minimizarRapido,
  nao,
  verificar,
  type Grupo,
  type BuscaFaixa,
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
  /** depois da rodada, aprofunda sozinho as conclusões até estes limites */
  aprimorar?: LimitesAprimoramento
  /** só consistência, teoremas, conflitos entre eles e leis que faltam (as rodadas do segundo modelo) */
  rapida?: boolean
  /** os prazos do aparelho sem aprofundar (as rodadas do segundo modelo); com `aprimorar`, valem os dele */
  limites?: LimitesAprimoramento
}

/** Até onde o aprimoramento automático pode ir (vem do perfil do aparelho). */
export interface LimitesAprimoramento {
  /** maior número de objetos */
  N: number
  /** maior número de mundos (só com □, ◇, B[…]) */
  K: number
  /** limite de tamanho do problema aterrado */
  limite: number
  /** cada checagem desiste depois deste tempo */
  tempoChecagemMs: number
  /** tempo total do aprimoramento (todas as conclusões, todos os tamanhos) */
  orcamentoMs: number
}

export interface EstadoAprimoramento {
  situacao: 'esperando' | 'aprofundando' | 'feito'
  /** nível em que a rodada começou */
  de: { N: number; K: number }
  /** quantas conclusões dependem do tamanho (são reconferidas) */
  conclusoes: number
  /** por que parou */
  parouPor?: string
  /** uma conclusão caiu num cenário maior: a rodada precisa ser refeita nesse nível */
  virada?: { N: number; K: number; descricao: string }
  /** conclusões que o Z3 provou para qualquer tamanho (não precisam ser aprofundadas) */
  provadasZ3?: number
  /** conclusões leves que caíram num cenário maior e saíram do relatório (sem refazer a rodada) */
  sairam?: string[]
  /** checagens rodando ao mesmo tempo */
  paralelo?: number
  ms: number
}

/**
 * Pede ao Z3 (na linha principal) para provar, sem limite de tamanho, que
 * cada conjunto de fórmulas não tem modelo. Os índices provados vão entrando
 * no conjunto devolvido conforme as respostas chegam.
 */
export type AjudaZ3 = (conjuntos: Formula[][]) => Set<number>

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
  /** candidatas a consequência que ficaram sem decisão (o prazo de cada checagem, ou o da etapa, acabou) */
  consequenciasSemDecisao?: number
  /** aprimoramento automático (N e K acima sobem conforme as conclusões são reconferidas) */
  aprimoramento: EstadoAprimoramento | null
  /** ids das leis e fatos que entraram nesta rodada (para dizer o que é novo na seguinte) */
  leisIds?: string[]
}

const conj = (fs: Formula[]): Formula => fs.reduce((a, b): Formula => ({ k: 'and', l: a, r: b, pos: 0, end: 0 }))

export async function reacaoEmCadeia(
  pedido: PedidoCadeia,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  parcial: (r: RelatorioCadeia[]) => void,
  progresso?: (chave: string, msg: string) => void,
  ajudaZ3?: AjudaZ3,
): Promise<void> {
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
    aprimoramento: null,
    leisIds: c.grupos.map((g) => g.id),
  }))
  const enviar = () => parcial(relatorios.map((r) => ({ ...r })))
  for (const [k, c] of pedido.contextos.entries()) {
    const rel = relatorios[k]
    await rodarContexto(c, rel, pedido.inativas, dicionario, op, enviar, (msg) => progresso?.(c.chave, msg), pedido.rapida, pedido.aprimorar ?? pedido.limites)
    rel.etapa = 'fim'
    if (pedido.aprimorar) rel.aprimoramento = { situacao: 'esperando', de: { N: rel.N, K: rel.K }, conclusoes: 0, ms: 0 }
    enviar()
  }
  // aprimoramento: as conclusões que dependem do tamanho são reconferidas em cenários maiores
  const lim = pedido.aprimorar
  if (!lim) return
  const ini = Date.now()
  for (let k = 0; k < pedido.contextos.length; k++) {
    const c = pedido.contextos[k]
    const virou = await aprofundar(c, relatorios[k], dicionario, lim, ini, enviar, (msg) => progresso?.(c.chave, msg), ajudaZ3)
    if (virou) {
      // o resto fica como está; a próxima rodada (no nível novo) refaz tudo
      for (const r of relatorios.slice(k + 1))
        if (r.aprimoramento) r.aprimoramento = { ...r.aprimoramento, situacao: 'feito', parouPor: 'outra conclusão mudou; a próxima rodada refaz tudo' }
      enviar()
      return
    }
  }
}

/** Uma conclusão que vale "em todos os cenários até N" (logo, pode mudar num cenário maior). */
interface ConclusaoLimitada {
  descricao: string
  /** fórmulas que não podem ter modelo para a conclusão continuar valendo */
  formulas: Formula[]
  /**
   * Se cair num cenário maior, o que fazer: as "leves" (uma consequência,
   * uma sugestão fechando um teorema, o apoio de um teorema na cadeia) só
   * saem do relatório; as outras mudam o resultado da rodada (que é refeita).
   */
  leve?: (rel: RelatorioCadeia) => void
}

/** Junta as conclusões do relatório que dependem do tamanho dos cenários. */
function conclusoesLimitadas(c: ContextoCadeia, rel: RelatorioCadeia, dicionario: EntradaDicionario[]): ConclusaoLimitada[] {
  const prontos: GrupoPronto[] = c.grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))
  const dosGrupos = (ids: string[]) => prontos.filter((x) => ids.includes(x.g.id)).flatMap((x) => x.itens.map((i) => i.expandida))
  const teorema = new Map(c.teoremas.map((t) => [t.id, t]))
  const formulaDe = (texto: string) => analisar([texto], dicionario)[0]?.expandida
  const rotulo = (id: string) => teorema.get(id)?.rotulo ?? prontos.find((x) => x.g.id === id)?.g.rotulo ?? id
  const cs: ConclusaoLimitada[] = []

  if (rel.consistencia?.tipo === 'sem-modelo') cs.push({ descricao: 'as leis e fatos se contradizem', formulas: premissas })
  for (const l of rel.leis)
    if (l.tipo === 'decorre') {
      const alvo = prontos.find((x) => x.g.id === l.id)
      if (alvo)
        cs.push({
          descricao: `"${alvo.g.rotulo}" decorre das outras`,
          formulas: [...prontos.filter((x) => x !== alvo).flatMap((x) => x.itens.map((i) => i.expandida)), nao(conj(alvo.itens.map((i) => i.expandida)))],
        })
    }
  for (const t of rel.teoremas) {
    const phi = formulaDe(t.formula)
    if (!phi) continue
    if (t.resultado.tipo === 'segue') {
      cs.push({ descricao: `"${rotulo(t.id)}" segue das leis`, formulas: [...premissas, nao(phi)] })
      // a cadeia: o apoio (leis e teoremas anteriores) continua bastando?
      const lemas = (t.apoio ?? []).filter((id) => teorema.has(id))
      if (lemas.length) {
        const fs = lemas.map((id) => formulaDe(teorema.get(id)!.formula)).filter((f): f is Formula => !!f)
        cs.push({
          descricao: `a cadeia de "${rotulo(t.id)}"`,
          formulas: [...dosGrupos(t.apoio!), ...fs, nao(phi)],
          // o teorema continua seguindo das leis (outra conclusão); só o atalho pelos teoremas anteriores cai
          leve: (r) => {
            const x = r.teoremas.find((y) => y.id === t.id)
            if (x?.resultado.tipo === 'segue') {
              x.apoio = x.resultado.notas
              x.geracao = 1
            }
          },
        })
      }
    } else if (t.resultado.tipo === 'contradiz') cs.push({ descricao: `as leis contradizem "${rotulo(t.id)}"`, formulas: [...premissas, phi] })
  }
  if (rel.conflitoTeoremas) {
    const fs = rel.conflitoTeoremas.map((id) => formulaDe(teorema.get(id)?.formula ?? '')).filter((f): f is Formula => !!f)
    cs.push({ descricao: 'os teoremas incompatíveis entre si', formulas: [...premissas, ...fs] })
  }
  for (const s of rel.sugestoes) {
    const lei = formulaDe(s.lei.formula)
    if (!lei) continue
    for (const id of s.fecha) {
      const phi = formulaDe(teorema.get(id)?.formula ?? '')
      if (phi)
        cs.push({
          descricao: `a lei sugerida "${s.lei.nome}" fecha "${rotulo(id)}"`,
          formulas: [...premissas, lei, nao(phi)],
          leve: (r) => {
            const x = r.sugestoes.find((y) => y.lei.formula === s.lei.formula)
            if (x) x.fecha = x.fecha.filter((f) => f !== id)
            r.sugestoes = r.sugestoes.filter((y) => y.fecha.length)
          },
        })
    }
  }
  for (const q of rel.consequencias ?? []) {
    const f = formulaDe(q.formula)
    if (f)
      cs.push({
        descricao: `a consequência ${q.formula}`,
        formulas: [...premissas, nao(f)],
        leve: (r) => (r.consequencias = (r.consequencias ?? []).filter((y) => y.formula !== q.formula)),
      })
  }
  return cs
}

/**
 * Reconfere as conclusões em cenários cada vez maiores: primeiro mais mundos
 * (se há lógica modal), depois um objeto a mais por vez, até os limites, o
 * tempo de cada checagem ou o tempo total. Devolve true se uma conclusão caiu.
 */
async function aprofundar(
  c: ContextoCadeia,
  rel: RelatorioCadeia,
  dicionario: EntradaDicionario[],
  lim: LimitesAprimoramento,
  inicioGeral: number,
  enviar: () => void,
  progresso: Progresso,
  ajudaZ3?: AjudaZ3,
): Promise<boolean> {
  if (!rel.aprimoramento) return false
  const ini = Date.now()
  const todas = conclusoesLimitadas(c, rel, dicionario)
  // o Z3 tenta provar cada uma para qualquer tamanho; as que ele prova saem do aprofundamento
  const provadas = todas.length && ajudaZ3 ? ajudaZ3(todas.map((x) => x.formulas)) : new Set<number>()
  /** as leves que caíram: saíram do relatório */
  const caidas = new Set<number>()
  const sairam: string[] = []
  let cs = todas
  const paralelo = poolAtual().tamanho
  const atualizar = (m: Partial<EstadoAprimoramento>) => {
    rel.aprimoramento = { ...rel.aprimoramento!, ...m, conclusoes: todas.length, provadasZ3: provadas.size, sairam: [...sairam], paralelo, ms: Date.now() - ini }
    enviar()
  }
  /** tira as que o Z3 já provou; true se não sobrou nenhuma */
  const semAsProvadas = async () => {
    await darVez() // deixa chegar as respostas do Z3
    cs = todas.filter((_, i) => !provadas.has(i) && !caidas.has(i))
    if (cs.length) return false
    atualizar({
      situacao: 'feito',
      parouPor:
        provadas.size && !caidas.size
          ? 'o Z3 provou todas as conclusões que dependiam do tamanho: valem para qualquer número de objetos'
          : `nenhuma conclusão que sobrou depende do tamanho${provadas.size ? ' (o Z3 provou as outras para qualquer número de objetos)' : ''}`,
    })
    return true
  }
  if (!todas.length) {
    atualizar({ situacao: 'feito', parouPor: 'nenhuma conclusão depende do tamanho dos cenários: todas já são definitivas' })
    return false
  }
  if (rel.consistencia?.tipo === 'grande-demais') {
    atualizar({ situacao: 'feito', parouPor: 'o conjunto já é grande demais' })
    return false
  }
  const modal = todas.some((x) => x.formulas.some(ehModal))
  atualizar({ situacao: 'aprofundando' })

  const tempoTotal = () => `atingiu o tempo total do aprimoramento (${Math.round(lim.orcamentoMs / 60000)} min)`
  /** confere todas as conclusões num nível (várias ao mesmo tempo): 'ok', 'virou', ou o motivo de parar */
  const nivel = async (ns: number[], ks: number[], N: number, K: number): Promise<string> => {
    const resta = lim.orcamentoMs - (Date.now() - inicioGeral)
    if (resta <= 0) return tempoTotal()
    const onde = `aprimorando com ${N} objetos${modal ? ` e ${K} mundos` : ''}`
    const vez = paralelo > 1 ? `, ${Math.min(paralelo, cs.length)} ao mesmo tempo` : ''
    let feitas = 0
    progresso(`${onde} (0/${cs.length}${vez})`)
    let rs: BuscaFaixa[]
    try {
      rs = await emParalelo(
        cs,
        (x) => ({ tipo: 'faixa', formulas: x.formulas, ns, ks, limite: lim.limite, prazoMs: Math.min(lim.tempoChecagemMs, resta) }),
        () => progresso(`${onde} (${++feitas}/${cs.length}${vez})`),
      )
    } catch (e) {
      return `falha num worker do motor com ${N} objetos (${(e as Error).message})`
    }
    // as leves que caíram saem do relatório; a rodada só é refeita se caiu uma que muda o resultado
    rs.forEach((r, k) => {
      const leve = cs[k].leve
      if (r.status !== 'modelo' || !leve) return
      leve(rel)
      caidas.add(todas.indexOf(cs[k]))
      sairam.push(`com ${tamanhoTexto(r.n, r.modelo.mundos)}, ${cs[k].descricao}: deixou de valer`)
    })
    if (caidas.size) atualizar({})
    const i = rs.findIndex((r, k) => r.status === 'modelo' && !cs[k].leve)
    if (i >= 0) {
      const r = rs[i] as Extract<BuscaFaixa, { status: 'modelo' }>
      atualizar({
        situacao: 'feito',
        virada: { N: Math.max(r.n, rel.N), K: modal ? K : 1, descricao: cs[i].descricao },
        parouPor: `com ${tamanhoTexto(r.n, r.modelo.mundos)}, ${cs[i].descricao}: deixou de valer`,
      })
      return 'virou'
    }
    if (rs.some((r) => r.status === 'tempo'))
      return Date.now() - inicioGeral >= lim.orcamentoMs ? tempoTotal() : `uma checagem passou de ${Math.round(lim.tempoChecagemMs / 1000)} s com ${N} objetos`
    if (rs.some((r) => r.status === 'grande-demais')) return `o problema ficou grande demais para este aparelho com ${N} objetos`
    return 'ok'
  }

  // mais mundos, nos tamanhos já conferidos
  if (modal)
    for (let k = rel.K + 1; k <= lim.K; k++) {
      if (await semAsProvadas()) return false
      const res = await nivel([...Array(rel.N).keys()].map((i) => i + 1), [k], rel.N, k)
      if (res === 'virou') return true
      if (res !== 'ok') {
        atualizar({ situacao: 'feito', parouPor: res })
        return false
      }
      rel.K = k
      for (const c of cs) if (!caidas.has(todas.indexOf(c))) registrarSemModelo(c.formulas, rel.N, k)
      atualizar({})
    }
  // um objeto a mais por vez
  for (let n = rel.N + 1; n <= lim.N; n++) {
    if (await semAsProvadas()) return false
    const res = await nivel([n], [...Array(modal ? rel.K : 1).keys()].map((i) => i + 1), n, rel.K)
    if (res === 'virou') return true
    if (res !== 'ok') {
      atualizar({ situacao: 'feito', parouPor: res })
      return false
    }
    rel.N = n
    // fica no banco de provas: a próxima rodada começa daqui
    for (const c of cs) if (!caidas.has(todas.indexOf(c))) registrarSemModelo(c.formulas, n, modal ? rel.K : 1)
    atualizar({})
  }
  atualizar({ situacao: 'feito', parouPor: `chegou ao limite do aparelho (${lim.N} objetos${modal ? `, ${lim.K} mundos` : ''})` })
  return false
}

/** Uma lei batida com as outras do conjunto: decorre delas (e de quais) ou é independente (com o cenário que prova). */
export function estadoDaLei(grupos: Grupo[], alvoId: string, dicionario: EntradaDicionario[], op: OpcoesMotor): EstadoLei {
  const prontos: GrupoPronto[] = grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const alvo = prontos.find((x) => x.g.id === alvoId)
  if (!alvo) return { id: alvoId, tipo: 'incerto' }
  const outros = prontos.filter((x) => x !== alvo)
  const negada = nao(conj(alvo.itens.map((it) => it.expandida)))
  const r = buscarModelo([...outros.flatMap((x) => x.itens.map((it) => it.expandida)), negada], op)
  if (r.status === 'modelo') {
    const av = new Avaliador(r.modelo)
    const falha = alvo.itens.find((it) => !av.avaliar(it.original)) ?? alvo.itens[0]
    return { id: alvoId, tipo: 'independente', formula: falha.texto, mundo: { n: r.n, modelo: r.modelo, passos: av.explicar(falha.original) } }
  }
  if (r.status === 'sem-modelo') return { id: alvoId, tipo: 'decorre', notas: minimizarRapido(outros, [negada], op).map((x) => x.g.id) }
  return { id: alvoId, tipo: 'incerto' }
}

async function rodarContexto(
  c: ContextoCadeia,
  rel: RelatorioCadeia,
  inativas: Grupo[],
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  enviar: () => void,
  progresso: Progresso,
  rapida = false,
  lim?: LimitesAprimoramento,
): Promise<void> {
  const paralelo = poolAtual().tamanho
  const vez = (n: number) => (paralelo > 1 && n > 1 ? `, ${Math.min(paralelo, n)} ao mesmo tempo` : '')
  const prontos: GrupoPronto[] = c.grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))
  const teoremas = c.teoremas.map((t) => ({ t, pronta: analisar([t.formula], dicionario)[0] }))
  rel.K = [...premissas, ...teoremas.flatMap((x) => (x.pronta ? [x.pronta.expandida] : []))].some(ehModal) ? op.K : 1
  // a consistência (1) e cada teorema (3) são o resultado: vão até o fim. O resto
  // explica e completa (redundância, a cadeia de provas, conflitos, leis que
  // faltam, consequências): cada etapa dessas tem prazo, e o que não couber fica
  // sem decisão — sempre do lado seguro, nunca uma conclusão a mais
  const aux = prazosAuxiliares(lim, op)
  const ateFimDaEtapa = (): OpcoesMotor => ({ ...op, prazo: Date.now() + aux.totalMs })
  // a consistência e cada teorema também têm prazo (o de cada checagem do perfil):
  // um teorema difícil fica "não decidiu a tempo" e a rodada segue, em vez de parar nele
  const prazoChecagem = lim?.tempoChecagemMs ?? PRAZO_CHECAGEM_SEM_PERFIL_MS

  // 1. consistência
  rel.etapa = 'consistencia'
  progresso('conferindo se as leis e fatos são consistentes')
  rel.consistencia = verificar(c.grupos, dicionario, { ...op, prazo: Date.now() + prazoChecagem }, progresso)
  enviar()
  if (rel.consistencia.tipo === 'sem-modelo' || rel.consistencia.tipo === 'grande-demais') return

  // 2. leis batendo umas com as outras
  rel.etapa = 'leis'
  enviar()
  if (prontos.length >= 2 && !rapida) {
    const leis: (EstadoLei | undefined)[] = []
    let feitas = 0
    const etapa2 = ateFimDaEtapa()
    progresso(`batendo cada lei com as outras (0/${prontos.length}${vez(prontos.length)})`)
    await emParalelo(
      prontos,
      (alvo) => ({ tipo: 'lei', grupos: c.grupos, alvo: alvo.g.id, dicionario, op: etapa2 }),
      (i, r) => {
        leis[i] = r
        rel.leis = leis.filter((x): x is EstadoLei => !!x)
        progresso(`batendo cada lei com as outras (${++feitas}/${prontos.length}${vez(prontos.length)})`)
        enviar()
      },
    )
  }

  // 3. cada teorema (vários ao mesmo tempo)
  rel.etapa = 'teoremas'
  enviar()
  {
    const estados: (EstadoTeorema | undefined)[] = []
    let feitos = 0
    if (teoremas.length) progresso(`conferindo os teoremas (0/${teoremas.length}${vez(teoremas.length)})`)
    await emParalelo(
      teoremas,
      ({ t }) => ({ tipo: 'perguntar', grupos: c.grupos, formula: t.formula, dicionario, op, prazoMs: prazoChecagem }),
      (i, resultado) => {
        const { t } = teoremas[i]
        estados[i] = { id: t.id, notaId: t.notaId, formula: t.formula, resultado }
        rel.teoremas = estados.filter((x): x is EstadoTeorema => !!x)
        progresso(`conferindo os teoremas (${++feitos}/${teoremas.length}${vez(teoremas.length)})`)
        enviar()
      },
    )
  }

  // 4. a cadeia: teoremas que seguem de teoremas já provados
  rel.etapa = 'cadeia'
  enviar()
  const provados = rel.teoremas
    .map((e, ordem) => ({ e, ordem, pronta: teoremas.find((x) => x.t.id === e.id)!.pronta }))
    .filter((x) => x.e.resultado.tipo === 'segue' && x.pronta)
    .sort((a, b) => apoioDireto(a.e) - apoioDireto(b.e) || a.ordem - b.ordem)
  const geracao = new Map<string, number>()
  const fim4 = ateFimDaEtapa().prazo!
  provados.forEach((x, k) => {
    const lemas: GrupoPronto[] = provados
      .slice(0, k)
      .map((l) => ({ g: { id: l.e.id, rotulo: l.e.formula, formulas: [l.e.formula] }, itens: [l.pronta!] }))
    let apoio = x.e.resultado.tipo === 'segue' ? x.e.resultado.notas : []
    if (lemas.length && !rapida) {
      progresso(`montando a cadeia (${k + 1}/${provados.length}): ${x.e.formula}`)
      // as leis vêm primeiro na ordem de remoção: onde um teorema anterior basta, ele fica no lugar delas
      // com prazo: uma checagem que não decide mantém a nota (o apoio pode sair maior, nunca insuficiente)
      const prazo = Math.min(fim4, Date.now() + aux.checagemMs)
      apoio = minimizarRapido([...prontos, ...lemas], [nao(x.pronta!.expandida)], { ...op, prazo }).map((g) => g.g.id)
    }
    const g = 1 + Math.max(0, ...apoio.map((id) => geracao.get(id) ?? 0))
    geracao.set(x.e.id, g)
    x.e.apoio = apoio
    x.e.geracao = g
    enviar()
  })

  // 5. os que não seguem se contradizem entre si (junto com as leis)?
  rel.etapa = 'juntos'
  enviar()
  const abertos = rel.teoremas
    .map((e) => ({ e, pronta: teoremas.find((x) => x.t.id === e.id)!.pronta }))
    .filter((x) => x.e.resultado.tipo === 'nao-segue' && x.pronta)
  if (abertos.length >= 2) {
    progresso('conferindo se os teoremas que não seguem se contradizem entre si')
    const fs = [...premissas, ...abertos.map((x) => x.pronta!.expandida)]
    const etapa5 = ateFimDaEtapa()
    // sem decisão no prazo: o conflito não é afirmado
    if (buscarModelo(fs, etapa5).status === 'sem-modelo') {
      const grupos = abertos.map((x) => ({ g: { id: x.e.id, rotulo: x.e.formula, formulas: [x.e.formula] }, itens: [x.pronta!] }))
      rel.conflitoTeoremas = minimizarRapido(grupos, premissas, etapa5, 1).map((g) => g.g.id)
    }
    enviar()
  }

  // 6. leis que fechariam os que faltam
  rel.etapa = 'lacunas'
  enviar()
  // as leis que fecham cada teorema aberto, juntadas pela forma (a mesma lei pode fechar vários)
  const juntar = (rs: (ResultadoLacunas | undefined)[]) => {
    const m = new Map<string, SugestaoCadeia>()
    rs.forEach((r, i) => {
      if (r?.tipo !== 'sugestoes') return
      for (const lei of r.itens) {
        const p = analisar([lei.formula], dicionario)[0]
        const k = p ? canonica(p.original) : lei.formula
        const s = m.get(k)
        if (s) s.fecha.push(abertos[i].e.id)
        else m.set(k, { lei, fecha: [abertos[i].e.id] })
      }
    })
    return m
  }
  const lacunas: (ResultadoLacunas | undefined)[] = []
  let feitas = 0
  const etapa6 = ateFimDaEtapa()
  if (abertos.length) progresso(`procurando a lei que falta (0/${abertos.length}${vez(abertos.length)})`)
  await emParalelo(
    abertos,
    (x) => ({ tipo: 'lacunas', grupos: c.grupos, inativas, formula: x.e.formula, dicionario, op: etapa6 }),
    (i, r) => {
      lacunas[i] = r
      rel.sugestoes = ordenar([...juntar(lacunas).values()])
      progresso(`procurando a lei que falta (${++feitas}/${abertos.length}${vez(abertos.length)})`)
      enviar()
    },
  )
  // na ordem dos teoremas (o resultado não depende de qual worker acabou antes)
  const porForma = juntar(lacunas)
  // cada lei sugerida fecha também outros teoremas abertos?
  const sugestoes = [...porForma.values()]
  const fimFecha = ateFimDaEtapa().prazo!
  sugestoes.forEach((s, i) => {
    const p = analisar([s.lei.formula], dicionario)[0]
    if (!p) return
    for (const x of abertos) {
      if (s.fecha.includes(x.e.id) || Date.now() > fimFecha) continue
      const contra = x.e.resultado.tipo === 'nao-segue' ? x.e.resultado.mundo.modelo : null
      if (contra && new Avaliador(contra).avaliar(p.original)) continue // vale no contraexemplo: não fecha
      progresso(`a lei "${s.lei.nome}" fecha outros teoremas? (${i + 1}/${sugestoes.length})`)
      const prazo = Math.min(fimFecha, Date.now() + aux.checagemMs)
      if (buscarModelo([...premissas, p.expandida, nao(x.pronta!.expandida)], { ...op, prazo }).status === 'sem-modelo') s.fecha.push(x.e.id)
    }
  })
  rel.sugestoes = ordenar(sugestoes)
  enviar()

  // 7. consequências novas (com prazo: uma candidata difícil não prende a rodada)
  rel.etapa = 'consequencias'
  if (prontos.length && !rapida) {
    enviar()
    const d = await descobrirComPrazo(c.grupos, dicionario, op, aux, progresso)
    if (d.tipo === 'consequencias') {
      rel.consequenciasSemDecisao = d.incertas + (d.semTempo ?? 0)
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

/**
 * Quanto cada etapa auxiliar da rodada pode levar: um quarto do orçamento do
 * aprimoramento (entre 1 e 5 minutos), cada checagem até 30 s (o que passa
 * disso é aprofundamento, não a rodada) e a memória dividida entre os workers.
 */
export function prazosAuxiliares(lim: LimitesAprimoramento | undefined, op: OpcoesMotor): PrazosDescoberta {
  return {
    totalMs: Math.min(5 * 60_000, Math.max(60_000, (lim?.orcamentoMs ?? 8 * 60_000) / 4)),
    checagemMs: Math.min(lim?.tempoChecagemMs ?? 30_000, 30_000),
    limite: Math.min(op.limite, lim?.limite ?? op.limite),
  }
}

/** sem perfil (testes, aprimoramento desligado): quanto cada checagem principal pode levar */
const PRAZO_CHECAGEM_SEM_PERFIL_MS = 120_000

/** quantas notas o teorema usa direto das leis (menos = mais básico; entra antes na cadeia) */
const apoioDireto = (e: EstadoTeorema) => (e.resultado.tipo === 'segue' ? e.resultado.notas.length : 99)

/** mais teoremas fechados primeiro; as que equivalem ao teorema por último */
const ordenar = (ss: SugestaoCadeia[]) =>
  [...ss].sort((a, b) => Number(a.lei.equivalente) - Number(b.lei.equivalente) || b.fecha.length - a.fecha.length || Number(!a.lei.notaId) - Number(!b.lei.notaId))
