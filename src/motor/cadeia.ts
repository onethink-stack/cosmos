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
import { Aterrador, ehModal, GrandeDemais } from './aterrar'
import { Avaliador, tamanhoTexto } from './avaliar'
import { cenariosValidos, julgarNosMundos, sugerirNotas, type ConselhoCadeia } from './conselho'
import { descobrirComPrazo, type Consequencia, type PrazosDescoberta } from './descobrir'
import { darVez, emParalelo, poolAtual } from './paralelo'
import { canonica, type LeiSugerida, type ResultadoLacunas } from './lacunas'
import {
  analisar,
  buscarModelo,
  nomesDe,
  registrarSemModelo,
  minimizarRapido,
  nao,
  nomesDaFormula,
  perguntar,
  verificar,
  type Grupo,
  type BuscaFaixa,
  type GrupoPronto,
  type Modelo,
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
  /**
   * as notas desativadas DESTE conjunto (candidatas na busca da lei que falta):
   * a lei que falta para um teorema de uma visão nunca é uma lei geral, e vice-versa
   */
  inativas?: Grupo[]
  /** o que o conselheiro do app aprendeu sobre este conjunto (cenários e provas guardados) */
  conselho?: ConselhoCadeia
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
  /**
   * modo de horas: os teoremas que não decidiram na rodada continuam, cada um
   * podendo usar até este tempo (ms), e o Z3 insiste neles o tempo todo
   */
  paciencia?: number
  /**
   * o Z3 faz uma tentativa curta por conclusão, sem insistir com tentativas
   * cada vez mais longas (o segundo modelo: ele não pode ficar parado minutos
   * esperando o Z3 — o que não decidir fica "até N", como sem o Z3)
   */
  z3Curto?: boolean
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
 * cada conjunto de fórmulas não tem modelo. Os índices vão entrando nas
 * respostas conforme chegam. `ate`: até quando insistir (tentativas cada vez
 * mais longas); sem ele, uma tentativa curta para cada.
 */
export type AjudaZ3 = (conjuntos: Formula[][], ate?: number, grupos?: (number | null)[][]) => RespostasZ3

export interface RespostasZ3 {
  /** sem modelo de nenhum tamanho: o Z3 provou */
  semModelo: Set<number>
  /**
   * com `grupos` (de qual nota vem cada fórmula): para os provados, as notas
   * que a prova de fato usou (o núcleo), em vez de todas
   */
  nucleos: Map<number, number[]>
  /** o Z3 achou um cenário */
  comModelo: Set<number>
  /** o Z3 terminou (ou desistiu no prazo); `desligado`: não há Z3 ligado neste aparelho */
  fim: Promise<{ desligado?: boolean }>
}

/**
 * O conjunto inteiro passou do limite do motor finito: até n−1 objetos não há
 * cenário em que todas as notas valem, e com n o problema não cabe. As notas
 * sem nenhum nome em comum com as outras ficam à parte (a rodada segue com as
 * outras), e o Z3, se ligado, confere o conjunto inteiro sem limite de tamanho.
 */
export interface PartePesada {
  n: number
  limite: number
  /** notas que ficaram fora da rodada (todas, se não deu para separar) */
  notas: string[]
  /** as notas que mais pesam com n objetos (o tamanho de cada uma sozinha; acima do limite = limite + 1) */
  pesos: { id: string; tamanho: number }[]
  /** teoremas que usam nomes das notas à parte (ficaram fora da rodada) */
  teoremas: string[]
  /** o Z3 sobre o conjunto inteiro */
  z3?: 'rodando' | 'desligado' | 'consistente' | 'contraditorio' | 'sem-decisao'
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
  /**
   * o que o Z3 decidiu, para qualquer número de objetos (inclusive infinito):
   * 'segue'/'contradiz' = provado; 'nao-segue' = há cenário (maior que os
   * testados, ou infinito) em que as leis valem e ele falha; 'nao-contradiz' =
   * há cenário em que as leis e ele valem juntos. Sem isso, um "segue" ou
   * "contradiz" do motor finito só vale nos cenários até N.
   */
  z3?: 'segue' | 'nao-segue' | 'contradiz' | 'nao-contradiz'
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
  /** teoremas que não decidiram no prazo da rodada e continuam sendo conferidos, com mais tempo (ids) */
  continuando?: string[]
  /** aprimoramento automático (N e K acima sobem conforme as conclusões são reconferidas) */
  aprimoramento: EstadoAprimoramento | null
  /** ids das leis e fatos que entraram nesta rodada (para dizer o que é novo na seguinte) */
  leisIds?: string[]
  /** o conjunto inteiro passou do limite do motor finito: o que ficou à parte */
  aParte?: PartePesada
  /** o que o conselheiro poupou nesta rodada */
  conselho?: AjudaDoConselho
}

/** O que o conselheiro poupou numa rodada (ele só antecipa e recorta: quem decide é o motor finito e o Z3). */
export interface AjudaDoConselho {
  /** cenários das notas conhecidos (o da consistência, os guardados que ainda valem e os achados na rodada) */
  cenarios: number
  /** teoremas decididos só pelos cenários conhecidos (um em que falha e outro em que vale) */
  porCenario: number
  /** teoremas em que um cenário conhecido poupou a busca do contraexemplo */
  contraConhecido: number
  /** teoremas provados pelo Z3 só com as notas sugeridas */
  provadosComSugeridas: number
  /** cenários das notas achados na rodada em que um teorema vale (o conselheiro do app os guarda) */
  aFavor?: Modelo[]
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
  // o conjunto de cada contexto que a rodada usou (sem as notas grandes demais que ficaram à parte)
  const usados: ContextoCadeia[] = []
  for (const [k, c] of pedido.contextos.entries()) {
    const rel = relatorios[k]
    usados[k] = await rodarContexto(c, rel, pedido.inativas, dicionario, op, enviar, (msg) => progresso?.(c.chave, msg), pedido.rapida, pedido.aprimorar ?? pedido.limites)
    rel.etapa = 'fim'
    if (pedido.aprimorar) rel.aprimoramento = { situacao: 'esperando', de: { N: rel.N, K: rel.K }, conclusoes: 0, ms: 0 }
    enviar()
  }
  // aprimoramento: as conclusões que dependem do tamanho são reconferidas em cenários maiores
  const lim = pedido.aprimorar
  // antes, os teoremas que não decidiram no prazo da rodada: continuam de onde pararam, com mais tempo
  // (no modo de horas, com o tempo escolhido, mesmo sem aprimoramento)
  const base = lim ?? pedido.limites ?? { N: op.N, K: op.K, limite: op.limite, tempoChecagemMs: PRAZO_CHECAGEM_SEM_PERFIL_MS, orcamentoMs: 0 }
  const paraPendentes = pedido.paciencia ? { ...base, tempoChecagemMs: pedido.paciencia, orcamentoMs: pedido.paciencia } : lim
  // e, ao mesmo tempo, o que ficou grande demais para o motor finito vai para o Z3 (sem limite de tamanho)
  const prazoZ3 = pedido.z3Curto ? PRAZO_Z3_CURTO_MS : (pedido.paciencia ?? Math.min(Math.max(base.orcamentoMs, PRAZO_Z3_A_PARTE_MS), 30 * 60_000))
  const insistir = !pedido.z3Curto
  for (const [k, c] of pedido.contextos.entries()) {
    const aviso = (msg: string) => progresso?.(c.chave, msg)
    await Promise.all([
      paraPendentes && terminarTeoremas(usados[k], relatorios[k], dicionario, op, paraPendentes, enviar, aviso, ajudaZ3, !!pedido.paciencia),
      aParteNoZ3(c, relatorios[k], dicionario, Date.now() + prazoZ3, enviar, aviso, ajudaZ3, insistir),
      // o "segue" e o "contradiz" do motor finito só valem até N: o Z3 prova (ou derruba) para qualquer tamanho
      confirmarNoZ3(usados[k], relatorios[k], dicionario, Date.now() + prazoZ3, enviar, aviso, ajudaZ3, !paraPendentes, insistir),
    ])
  }
  if (!lim) return
  const ini = Date.now()
  for (let k = 0; k < pedido.contextos.length; k++) {
    const c = usados[k]
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

const faixa = (de: number, ate: number) => Array.from({ length: Math.max(0, ate - de + 1) }, (_, i) => de + i)

/**
 * Os teoremas que não decidiram no prazo da rodada continuam aqui, depois que
 * ela já está pronta: a busca recomeça do tamanho em que parou, vários ao mesmo
 * tempo, cada um com o tempo inteiro do aprimoramento do aparelho. O resultado
 * de cada um entra no relatório assim que sai.
 */
async function terminarTeoremas(
  c: ContextoCadeia,
  rel: RelatorioCadeia,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  lim: LimitesAprimoramento,
  enviar: () => void,
  progresso: Progresso,
  ajudaZ3?: AjudaZ3,
  /** modo de horas: o Z3 insiste até o fim do prazo */
  horas = false,
): Promise<void> {
  if (rel.consistencia?.tipo !== 'consistente') return
  const pendentes = rel.teoremas.filter((e) => e.resultado.tipo === 'tempo')
  if (!pendentes.length) return
  const m = premissasMarcadas(c, dicionario)
  const premissas = m.formulas
  const phis = pendentes.map((e) => analisar([e.formula], dicionario)[0])
  const ate = Date.now() + lim.orcamentoMs
  // com o Z3 ligado, ele tenta ao mesmo tempo provar cada um para qualquer número de objetos
  const respostasZ3 = ajudaZ3?.(
    phis.map((p) => (p ? [...premissas, nao(p.expandida)] : [])),
    horas ? ate : undefined,
    phis.map(() => [...m.grupos, null]),
  )
  const provadasZ3 = respostasZ3?.semModelo ?? new Set<number>()
  const ks = faixa(1, Math.max(1, rel.K))
  const resta = () => Math.max(1000, ate - Date.now())
  let feitos = 0
  rel.continuando = pendentes.map((e) => e.id)
  const fim = horas ? ` — insistindo até ${new Date(ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''
  const aviso = () => progresso(`conferindo com mais tempo os teoremas que não decidiram na rodada (${feitos}/${pendentes.length})${fim}`)
  aviso()
  enviar()
  const decididos = new Set<string>()
  const decidir = (e: EstadoTeorema, resultado: ResultadoPergunta, z3?: EstadoTeorema['z3']) => {
    if (decididos.has(e.id)) return
    decididos.add(e.id)
    rel.teoremas = rel.teoremas.map((x) =>
      x.id === e.id ? { ...x, resultado, ...(z3 ? { z3 } : {}), ...(resultado.tipo === 'segue' ? { apoio: resultado.notas, geracao: 1 } : {}) } : x,
    )
    rel.continuando = rel.continuando?.filter((id) => id !== e.id)
    feitos++
    aviso()
    enviar()
  }
  const notasDe = async (fixas: Formula[]) =>
    (await poolAtual().rodar({ tipo: 'minimizar', grupos: c.grupos, fixas, dicionario, op: { ...op, limite: lim.limite }, prazoMs: Math.min(resta(), lim.tempoChecagemMs) })) as string[]
  /** espera o Z3 provar o i-ésimo (devolve true), ou `fim` acontecer (false) */
  const peloZ3 = (i: number, fim: Promise<unknown>) =>
    new Promise<boolean>((ok) => {
      let acabou = false
      void fim.finally(() => ((acabou = true), ok(false)))
      const ver = () => (provadasZ3.has(i) ? ok(true) : !acabou && Date.now() < ate && setTimeout(ver, 2000))
      ver()
    })
  await Promise.all(
    pendentes.map(async (e, i) => {
      const phi = phis[i]
      if (!phi || e.resultado.tipo !== 'tempo') return
      const negada = nao(phi.expandida)
      try {
        // até n−1 já não havia cenário em que o teorema falha: recomeça do n
        const desde = e.resultado.fase === 'contra' ? e.resultado.n : 1
        const busca = poolAtual().rodar({ tipo: 'faixa', formulas: [...premissas, negada], ns: faixa(desde, op.N), ks, limite: lim.limite, prazoMs: resta() }) as Promise<BuscaFaixa>
        // provado pelo Z3: as notas são as que a prova usou (o núcleo)
        if (await peloZ3(i, busca)) {
          const nucleo = respostasZ3?.nucleos.get(i)
          return decidir(e, { tipo: 'segue', N: op.N, K: rel.K, notas: nucleo ? m.ids(nucleo) : await notasDe([negada]) }, 'segue')
        }
        const contra = await busca
        if (contra.status === 'tempo' || contra.status === 'grande-demais') return decidir(e, { tipo: 'tempo', n: contra.n, fase: 'contra' })
        if (contra.status === 'sem-modelo') return decidir(e, { tipo: 'segue', N: op.N, K: contra.K, notas: await notasDe([negada]) })
        // há cenário em que falha: segue não; as leis o contradizem, ou não decidem?
        const mundo = { n: contra.n, modelo: contra.modelo, passos: new Avaliador(contra.modelo).explicar(phi.original) }
        const afavor = (await poolAtual().rodar({ tipo: 'faixa', formulas: [...premissas, phi.expandida], ns: faixa(1, op.N), ks, limite: lim.limite, prazoMs: resta() })) as BuscaFaixa
        if (afavor.status === 'sem-modelo') return decidir(e, { tipo: 'contradiz', N: op.N, K: afavor.K, notas: await notasDe([phi.expandida]), mundo })
        decidir(e, { tipo: 'nao-segue', N: op.N, mundo })
      } catch {
        // um worker quebrou: o teorema fica como estava (não decidiu a tempo)
        decidir(e, e.resultado)
      }
    }),
  )
  rel.continuando = undefined
  enviar()
}

/**
 * O que vale de um teorema: o que o Z3 decidiu (para qualquer tamanho) passa
 * na frente do que o motor finito viu (até N). `provado`: vale para qualquer
 * número de objetos (não só até N).
 */
export function estadoEfetivo(t: EstadoTeorema): { tipo: ResultadoPergunta['tipo']; provado: boolean } {
  if (t.z3 === 'nao-segue' || t.z3 === 'nao-contradiz') return { tipo: 'nao-segue', provado: true }
  if (t.z3 === 'segue') return { tipo: 'segue', provado: true }
  if (t.z3 === 'contradiz') return { tipo: 'contradiz', provado: true }
  return { tipo: t.resultado.tipo, provado: false }
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
    // o que o Z3 decidiu vale para qualquer tamanho (e usa notas que ficaram à parte)
    if (!phi || t.z3) continue
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
  const provadas = todas.length && ajudaZ3 ? ajudaZ3(todas.map((x) => x.formulas)).semModelo : new Set<number>()
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

/**
 * Uma rodada num contexto. Devolve o conjunto que a rodada usou: o próprio
 * contexto, ou, se o conjunto inteiro passou do limite do motor finito, só as
 * notas que couberam (as outras ficam em `rel.aParte`).
 */
async function rodarContexto(
  inteiro: ContextoCadeia,
  rel: RelatorioCadeia,
  inativas: Grupo[],
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  enviar: () => void,
  progresso: Progresso,
  rapida = false,
  lim?: LimitesAprimoramento,
): Promise<ContextoCadeia> {
  const paralelo = poolAtual().tamanho
  const vez = (n: number) => (paralelo > 1 && n > 1 ? `, ${Math.min(paralelo, n)} ao mesmo tempo` : '')
  let c = inteiro
  let prontos: GrupoPronto[] = c.grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  let premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))
  let teoremas = c.teoremas.map((t) => ({ t, pronta: analisar([t.formula], dicionario)[0] }))
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
  // passou do limite (o tamanho, não o prazo): as notas sem nome em comum com as outras
  // ficam à parte, e a rodada segue com as que cabem
  if (rel.consistencia.tipo === 'grande-demais' && !rel.consistencia.tempo) {
    c = separarPesadas(c, prontos, rel, dicionario, op, prazoChecagem, progresso)
    prontos = prontos.filter((x) => c.grupos.includes(x.g))
    premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))
    teoremas = teoremas.filter((x) => c.teoremas.includes(x.t))
  }
  // os teoremas que ficaram à parte entram no relatório como "grande demais" (o Z3 confere depois)
  const deFora: EstadoTeorema[] = inteiro.teoremas
    .filter((t) => rel.aParte?.teoremas.includes(t.id))
    .map((t) => ({ id: t.id, notaId: t.notaId, formula: t.formula, resultado: { tipo: 'grande-demais', n: rel.aParte!.n } }))
  rel.teoremas = deFora
  enviar()
  if (rel.consistencia.tipo === 'sem-modelo' || rel.consistencia.tipo === 'grande-demais') return c

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

  // 3. cada teorema (vários ao mesmo tempo). Antes de procurar, o teorema é julgado nos
  // cenários das notas já conhecidos: falso num deles, não segue (é um cenário real) — e
  // verdadeiro noutro, nem é preciso procurar nada. Os cenários que cada teorema acha
  // entram na lista e servem para os seguintes.
  rel.etapa = 'teoremas'
  enviar()
  {
    const conhecidos = cenariosConhecidos(inteiro.conselho, rel, premissas)
    const ajuda: AjudaDoConselho = { cenarios: conhecidos.length, porCenario: 0, contraConhecido: 0, provadosComSugeridas: 0 }
    rel.conselho = ajuda
    const aprender = (m: Modelo) => {
      if (conhecidos.length < MAX_CENARIOS_NA_RODADA) conhecidos.push(m)
      ajuda.cenarios = conhecidos.length
    }
    const estados: (EstadoTeorema | undefined)[] = []
    let feitos = 0
    if (teoremas.length) progresso(`conferindo os teoremas (0/${teoremas.length}${vez(teoremas.length)})`)
    await aosPoucos(teoremas.length, paralelo, async (i) => {
      const { t, pronta } = teoremas[i]
      const j = pronta && conhecidos.length ? julgarNosMundos(conhecidos, pronta.expandida) : { falha: null, vale: false }
      let resultado: ResultadoPergunta
      if (pronta && j.falha && j.vale) {
        resultado = { tipo: 'nao-segue', N: op.N, mundo: { n: j.falha.n, modelo: j.falha, passos: new Avaliador(j.falha).explicar(pronta.original) } }
        ajuda.porCenario++
      } else {
        if (j.falha) ajuda.contraConhecido++
        resultado = (await poolAtual().rodar({
          tipo: 'perguntar',
          grupos: c.grupos,
          formula: t.formula,
          dicionario,
          op,
          prazoMs: prazoChecagem,
          extras: { comAFavor: true, ...(j.falha ? { contra: j.falha } : {}) },
        })) as ResultadoPergunta
        // os cenários deste teorema valem para todas as notas do conjunto: servem para os próximos
        if (resultado.tipo === 'nao-segue' || resultado.tipo === 'contradiz') aprender(resultado.mundo.modelo)
        if (resultado.tipo === 'nao-segue' && resultado.aFavor) {
          aprender(resultado.aFavor)
          if ((ajuda.aFavor ??= []).length < MAX_A_FAVOR_NO_RELATORIO) ajuda.aFavor.push(resultado.aFavor)
          const { aFavor: _aFavor, ...semAFavor } = resultado
          resultado = semAFavor
        }
      }
      estados[i] = { id: t.id, notaId: t.notaId, formula: t.formula, resultado }
      rel.teoremas = [...estados.filter((x): x is EstadoTeorema => !!x), ...deFora]
      progresso(`conferindo os teoremas (${++feitos}/${teoremas.length}${vez(teoremas.length)})`)
      enviar()
    })
    // em paralelo, cada worker tem só uma parte da memória: o teorema que não coube nela
    // é refeito aqui, sozinho, com o limite inteiro (os outros workers estão parados)
    const teto = poolAtual().teto
    if (teto && teto < op.limite) {
      const grandes = estados.flatMap((e, i) => (e?.resultado.tipo === 'grande-demais' ? [i] : []))
      for (const [k, i] of grandes.entries()) {
        const { t } = teoremas[i]
        progresso(`conferindo sozinho, com toda a memória, um teorema grande (${k + 1}/${grandes.length})`)
        estados[i] = { ...estados[i]!, resultado: perguntar(c.grupos, t.formula, dicionario, { ...op, prazo: Date.now() + prazoChecagem }) }
        rel.teoremas = [...estados.filter((x): x is EstadoTeorema => !!x), ...deFora]
        enviar()
      }
    }
  }

  // 4. a cadeia: teoremas que seguem de teoremas já provados
  rel.etapa = 'cadeia'
  enviar()
  const provados = rel.teoremas
    .map((e, ordem) => ({ e, ordem, pronta: teoremas.find((x) => x.t.id === e.id)?.pronta }))
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
    .map((e) => ({ e, pronta: teoremas.find((x) => x.t.id === e.id)?.pronta }))
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
    (x) => ({ tipo: 'lacunas', grupos: c.grupos, inativas: c.inativas ?? inativas, formula: x.e.formula, dicionario, op: etapa6 }),
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
  return c
}

/**
 * O conjunto inteiro passou do limite do motor finito: até n−1 objetos não
 * havia cenário, e com n não cabe. Mede o peso de cada nota nesse tamanho,
 * separa as notas em blocos sem nenhum nome em comum e tira os blocos mais
 * pesados, um por vez, até o resto caber. O que sai fica em `rel.aParte`
 * (com os teoremas que usam nomes dele); devolve o contexto com o que ficou
 * (o próprio, se não deu para separar: aí tudo fica à parte).
 */
function separarPesadas(
  c: ContextoCadeia,
  prontos: GrupoPronto[],
  rel: RelatorioCadeia,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  prazoChecagem: number,
  progresso: Progresso,
): ContextoCadeia {
  const gd = rel.consistencia as Extract<ResultadoMotor, { tipo: 'grande-demais' }>
  progresso(`o conjunto passou do limite com ${gd.n} objetos: medindo o peso de cada nota`)
  const peso = new Map<string, number>()
  const fimMedida = Date.now() + PRAZO_MEDIR_PESOS_MS
  for (const x of prontos) {
    if (Date.now() > fimMedida) break
    peso.set(x.g.id, pesoAterrado(x.itens.map((i) => i.expandida), gd.n, rel.K, op.limite))
  }
  const pesos = [...peso].map(([id, tamanho]) => ({ id, tamanho })).sort((a, b) => b.tamanho - a.tamanho).slice(0, 8)
  // uma nota que não deu tempo de medir conta como pesada
  const pesoDe = (b: GrupoPronto[]) => b.reduce((s, x) => s + (peso.get(x.g.id) ?? op.limite), 0)
  // os blocos mais leves primeiro: os pesados saem do fim
  const ficam = blocosIndependentes(prontos).sort((a, b) => pesoDe(a) - pesoDe(b))
  const saem: GrupoPronto[] = []
  let r: ResultadoMotor = gd
  while (ficam.length > 1 && r.tipo === 'grande-demais' && !r.tempo) {
    saem.push(...ficam.pop()!)
    progresso(`conferindo as outras notas, sem as ${saem.length} mais pesadas`)
    r = verificar(ficam.flat().map((x) => x.g), dicionario, { ...op, prazo: Date.now() + prazoChecagem }, progresso)
  }
  const separou = saem.length > 0 && !(r.tipo === 'grande-demais' && !r.tempo)
  const fora = separou ? saem : prontos
  const nomesFora = new Set(fora.flatMap((x) => x.itens.flatMap(nomesDe)))
  // com tudo à parte, todos os teoremas que o motor finito lê; separando, os que usam nomes do que saiu
  const teoremasFora = c.teoremas.filter((t) => {
    const p = analisar([t.formula], dicionario)[0]
    return !!p && (!separou || nomesDe(p).some((n) => nomesFora.has(n)))
  })
  rel.aParte = { n: gd.n, limite: op.limite, notas: fora.map((x) => x.g.id), pesos, teoremas: teoremasFora.map((t) => t.id) }
  if (!separou) return c
  rel.consistencia = r
  const idsFora = new Set(rel.aParte.notas)
  return { ...c, grupos: c.grupos.filter((g) => !idsFora.has(g.id)), teoremas: c.teoremas.filter((t) => !teoremasFora.includes(t)) }
}

/** tamanho do circuito das fórmulas com n objetos (e k mundos, se modais); acima do limite: limite + 1 */
function pesoAterrado(fs: Formula[], n: number, k: number, limite: number): number {
  const at = new Aterrador(n, limite, fs.some(ehModal) ? k : 1)
  try {
    for (const f of fs) at.afirmar(f)
    return at.tamanhoAtual
  } catch (e) {
    if (e instanceof GrandeDemais) return limite + 1
    throw e
  }
}

/**
 * Separa as notas em blocos sem nenhum nome em comum. Um bloco não muda o que
 * vale nos outros (fora o número de objetos, que é o mesmo para todos): cada
 * um pode ser conferido à parte.
 */
export function blocosIndependentes(prontos: GrupoPronto[]): GrupoPronto[][] {
  const pai = prontos.map((_, i) => i)
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])))
  const dono = new Map<string, number>()
  prontos.forEach((x, i) => {
    for (const nome of x.itens.flatMap(nomesDe)) {
      const j = dono.get(nome)
      if (j === undefined) dono.set(nome, i)
      else pai[raiz(i)] = raiz(j)
    }
  })
  const blocos = new Map<number, GrupoPronto[]>()
  prontos.forEach((x, i) => blocos.set(raiz(i), [...(blocos.get(raiz(i)) ?? []), x]))
  return [...blocos.values()]
}

/**
 * O que ficou grande demais para o motor finito vai para o Z3, que não tem
 * limite de tamanho: o conjunto inteiro tem cenário? Cada teorema que ficou
 * de fora segue de todas as leis? As respostas entram no relatório assim que
 * chegam, até o Z3 terminar ou o prazo acabar.
 */
async function aParteNoZ3(
  c: ContextoCadeia,
  rel: RelatorioCadeia,
  dicionario: EntradaDicionario[],
  ate: number,
  enviar: () => void,
  progresso: Progresso,
  ajudaZ3?: AjudaZ3,
  /** tentativas cada vez mais longas até o prazo (senão, uma curta para cada) */
  insistir = true,
): Promise<void> {
  const ap = rel.aParte
  if (!ap) return
  if (!ajudaZ3) {
    rel.aParte = { ...ap, z3: 'desligado' }
    return enviar()
  }
  const m = premissasMarcadas(c, dicionario)
  const premissas = m.formulas
  const fora = rel.teoremas.filter((t) => ap.teoremas.includes(t.id))
  const conjuntos = [
    premissas,
    ...fora.map((t) => {
      const p = analisar([t.formula], dicionario)[0]
      return p ? [...premissas, nao(p.expandida)] : []
    }),
  ]
  rel.aParte = { ...ap, z3: 'rodando' }
  progresso('o Z3 confere, sem limite de tamanho, o que ficou grande demais para o motor finito')
  enviar()
  const r = ajudaZ3(
    conjuntos,
    insistir ? ate : undefined,
    conjuntos.map((_, i) => (i === 0 ? m.grupos : [...m.grupos, null])),
  )
  const vistos = new Set<number>()
  const ler = () => {
    let mudou = false
    for (const i of [...r.semModelo, ...r.comModelo]) {
      if (vistos.has(i)) continue
      vistos.add(i)
      mudou = true
      const sem = r.semModelo.has(i)
      if (i === 0) rel.aParte = { ...rel.aParte!, z3: sem ? 'contraditorio' : 'consistente' }
      else {
        const id = fora[i - 1]?.id
        if (!id) continue
        // as notas que a prova usou (sem o núcleo, todas)
        const notas = m.ids(r.nucleos.get(i) ?? m.prontos.map((_, k) => k))
        rel.teoremas = rel.teoremas.map((x) =>
          x.id !== id
            ? x
            : sem
              ? { ...x, z3: 'segue', resultado: { tipo: 'segue', N: rel.N, K: rel.K, notas }, apoio: notas, geracao: 1 }
              : { ...x, z3: 'nao-segue' },
        )
      }
    }
    if (mudou) enviar()
  }
  const fim = await esperarZ3(r, ate, ler)
  if (rel.aParte?.z3 === 'rodando') rel.aParte = { ...rel.aParte, z3: fim.desligado ? 'desligado' : 'sem-decisao' }
  enviar()
}

/** As premissas do contexto e de qual nota vem cada fórmula (para o Z3 dizer quais a prova usou). */
function premissasMarcadas(c: ContextoCadeia, dicionario: EntradaDicionario[]) {
  const prontos: GrupoPronto[] = c.grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  return {
    prontos,
    formulas: prontos.flatMap((x) => x.itens.map((i) => i.expandida)),
    grupos: prontos.flatMap((x, k) => x.itens.map(() => k)),
    /** do núcleo (índices das notas) para os ids */
    ids: (nucleo: number[]) => nucleo.map((k) => prontos[k].g.id),
  }
}

/** Lê as respostas do Z3 conforme chegam (`ler`), até ele terminar ou o prazo acabar; `aCadaVolta`: a cada segundo (o andamento na tela). */
async function esperarZ3(r: RespostasZ3, ate: number, ler: () => void, aCadaVolta?: () => void): Promise<{ desligado?: boolean }> {
  const fim: { desligado?: boolean; pronto?: boolean } = {}
  void r.fim.then((x) => Object.assign(fim, x, { pronto: true }))
  while (!fim.pronto && Date.now() < ate) {
    ler()
    aCadaVolta?.()
    await new Promise((ok) => setTimeout(ok, 1000))
  }
  ler()
  return fim
}

/**
 * O motor finito só confere cenários até N objetos: um "segue" ou
 * "contradiz" dele pode cair num cenário maior — ou infinito, como "função
 * injetiva é sobrejetiva", que vale em todo cenário finito e falha nos
 * números naturais. Aqui o Z3 confere cada um para qualquer tamanho:
 *  1. primeiro só com as notas que o motor finito achou necessárias (S): se
 *     "S e o contrário" não tem cenário, está provado A PARTIR DE S — a lista
 *     fica pequena e certa, e a checagem é rápida;
 *  2. se não deu, com todas as notas do conjunto (pedindo ao Z3 as que a
 *     prova usou); se ele achar um cenário em que o teorema falha, o teorema
 *     deixa de "seguir".
 * `comPendentes`: também os que não decidiram a tempo (sem a continuação deles).
 */
async function confirmarNoZ3(
  c: ContextoCadeia,
  rel: RelatorioCadeia,
  dicionario: EntradaDicionario[],
  ate: number,
  enviar: () => void,
  progresso: Progresso,
  ajudaZ3?: AjudaZ3,
  comPendentes = false,
  /** na fase com todas as notas, tentativas cada vez mais longas até o prazo (senão, uma curta para cada) */
  insistir = true,
): Promise<void> {
  if (!ajudaZ3 || rel.consistencia?.tipo !== 'consistente') return
  const tipos = comPendentes ? ['segue', 'contradiz', 'tempo', 'grande-demais'] : ['segue', 'contradiz']
  const alvos = rel.teoremas
    .filter((t) => !t.z3 && !rel.aParte?.teoremas.includes(t.id) && tipos.includes(t.resultado.tipo))
    .map((t) => ({ t, phi: analisar([t.formula], dicionario)[0] }))
    .filter((x) => !!x.phi)
  if (!alvos.length) return
  const m = premissasMarcadas(c, dicionario)
  const indice = new Map(m.prontos.map((p, k) => [p.g.id, k]))
  /** as fórmulas de uma lista de notas */
  const formulasDe = (ids: string[]) => ids.flatMap((id) => m.prontos[indice.get(id) ?? -1]?.itens.map((i) => i.expandida) ?? [])
  // "contradiz": as leis com ele não têm modelo; os outros: as leis com o contrário dele não têm modelo
  const contra = (x: (typeof alvos)[number]) => (x.t.resultado.tipo === 'contradiz' ? x.phi!.expandida : nao(x.phi!.expandida))
  const notasFinitas = (x: (typeof alvos)[number]) => ('notas' in x.t.resultado ? x.t.resultado.notas : null)
  const decidir = (x: (typeof alvos)[number], provado: boolean, notas: string[] | null) => {
    rel.teoremas = rel.teoremas.map((y) => {
      if (y.id !== x.t.id) return y
      const res = y.resultado
      if (res.tipo === 'contradiz') return { ...y, z3: provado ? 'contradiz' : 'nao-contradiz', ...(provado && notas ? { resultado: { ...res, notas } } : {}) }
      if (!provado) return { ...y, z3: 'nao-segue' }
      // provado: as notas são as da prova (as de S, as do núcleo, ou — sem saber quais — todas)
      const ns = notas ?? m.prontos.map((p) => p.g.id)
      if (res.tipo === 'segue' && notas && mesmasNotas(notas, res.notas)) return { ...y, z3: 'segue' }
      return { ...y, z3: 'segue', resultado: { tipo: 'segue', N: rel.N, K: rel.K, notas: ns }, apoio: ns, geracao: 1 }
    })
  }
  // o andamento: quantos o Z3 já decidiu, e há quanto tempo está nisso (a tela não parece parada)
  const ini = Date.now()
  const decididos = () => alvos.filter((x) => rel.teoremas.find((y) => y.id === x.t.id)?.z3).length
  const andamento = () =>
    progresso(`o Z3 confere os teoremas para qualquer número de objetos: ${decididos()} de ${alvos.length} decididos (há ${Math.round((Date.now() - ini) / 1000)} s)`)
  /** um pedido ao Z3; `ler(i, provado, núcleo)` a cada resposta; `longo`: tentativas cada vez mais longas até o prazo (senão, uma curta) */
  const pedir = async (
    conjuntos: Formula[][],
    grupos: (number | null)[][] | undefined,
    longo: boolean,
    ler: (i: number, provado: boolean, nucleo?: number[]) => void,
  ) => {
    const r = ajudaZ3(conjuntos, longo ? ate : undefined, grupos)
    const vistos = new Set<number>()
    await esperarZ3(
      r,
      ate,
      () => {
        let mudou = false
        for (const i of [...r.semModelo, ...r.comModelo]) {
          if (vistos.has(i)) continue
          vistos.add(i)
          mudou = true
          ler(i, r.semModelo.has(i), r.nucleos.get(i))
        }
        if (mudou) enviar()
      },
      andamento,
    )
  }

  andamento()
  // 1. com as notas que o motor finito achou (S); os que não têm S vão direto com todas
  const comS = alvos.filter((x) => notasFinitas(x) !== null)
  const semS = alvos.filter((x) => notasFinitas(x) === null)
  const faltam: typeof alvos = []
  // (uma tentativa curta: o Z3 às vezes não prova com poucas leis e prova com todas — a insistência fica para a fase 2)
  await pedir(comS.map((x) => [...formulasDe(notasFinitas(x)!), contra(x)]), undefined, false, (i, provado) => {
    // "S e o contrário" sem cenário: provado a partir de S. Com cenário, S só não basta: vai com todas
    const x = comS[i]
    if (!x) return
    if (provado) decidir(x, true, notasFinitas(x))
    else faltam.push(x)
  })
  // os que S não provou (ou não respondeu a tempo), e os sem S
  for (const x of comS) if (!faltam.includes(x) && !rel.teoremas.find((y) => y.id === x.t.id)?.z3) faltam.push(x)
  let todos = [...semS, ...faltam]
  // 1b. as notas que o conselheiro sugere (as que provaram teoremas parecidos e as que falam
  // dos mesmos nomes), sozinhas, numa tentativa curta: sem modelo com elas = provado com todas
  const disponiveis = m.prontos.map((p) => ({ id: p.g.id, simbolos: [...new Set(p.itens.flatMap(nomesDe))] }))
  const sugeridas = todos
    .map((x) => ({ x, ids: sugerirNotas(c.conselho?.provas ?? [], [...new Set(nomesDaFormula(x.phi!.expandida))], disponiveis) }))
    .filter((s) => s.ids.length && s.ids.length < m.prontos.length && !mesmasNotas(s.ids, notasFinitas(s.x) ?? []))
  if (sugeridas.length && Date.now() < ate) {
    const gruposDe = (ids: string[]) => ids.flatMap((id) => m.prontos[indice.get(id) ?? -1]?.itens.map(() => indice.get(id)!) ?? [])
    await pedir(
      sugeridas.map((s) => [...formulasDe(s.ids), contra(s.x)]),
      sugeridas.map((s) => [...gruposDe(s.ids), null]),
      false,
      (i, provado, nucleo) => {
        const s = sugeridas[i]
        if (!s || !provado) return
        decidir(s.x, true, nucleo ? m.ids(nucleo) : s.ids)
        if (rel.conselho) rel.conselho = { ...rel.conselho, provadosComSugeridas: rel.conselho.provadosComSugeridas + 1 }
      },
    )
    todos = todos.filter((x) => !rel.teoremas.find((y) => y.id === x.t.id)?.z3)
  }
  // o resto: com todas as notas
  if (todos.length && Date.now() < ate)
    await pedir(
      todos.map((x) => [...m.formulas, contra(x)]),
      todos.map(() => [...m.grupos, null]),
      insistir,
      (i, provado, nucleo) => todos[i] && decidir(todos[i], provado, provado && nucleo ? m.ids(nucleo) : null),
    )
  enviar()
}

const mesmasNotas = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/** com `z3Curto` (o segundo modelo), o máximo que a rodada espera o Z3 */
const PRAZO_Z3_CURTO_MS = 3 * 60_000

/** quantos cenários a rodada guarda para julgar os teoremas (os primeiros; os outros só valem para o próprio teorema) */
const MAX_CENARIOS_NA_RODADA = 60
/** quantos cenários "a favor" vão no relatório para o conselheiro do app guardar */
const MAX_A_FAVOR_NO_RELATORIO = 10
/** tempo para conferir os cenários que o conselheiro mandou contra as notas de agora */
const PRAZO_CONFERIR_CENARIOS_MS = 3000

/**
 * Os cenários em que todas as notas do conjunto valem, já conhecidos antes de
 * conferir os teoremas: o da consistência (desta rodada) e os que o conselheiro
 * mandou, conferidos aqui contra as notas de agora (com prazo).
 */
function cenariosConhecidos(conselho: ConselhoCadeia | undefined, rel: RelatorioCadeia, premissas: Formula[]): Modelo[] {
  const r: Modelo[] = []
  if (rel.consistencia?.tipo === 'consistente') r.push(rel.consistencia.modelo)
  if (conselho?.mundos.length) r.push(...cenariosValidos(conselho.mundos, premissas, Date.now() + PRAZO_CONFERIR_CENARIOS_MS))
  return r.slice(0, MAX_CENARIOS_NA_RODADA)
}

/**
 * Roda `fazer(i)` para cada i, até `paralelo` ao mesmo tempo, começando cada
 * um só quando há vaga (assim o que os primeiros descobrem já serve aos seguintes).
 */
async function aosPoucos(total: number, paralelo: number, fazer: (i: number) => Promise<void>): Promise<void> {
  let proximo = 0
  const vaga = async () => {
    while (proximo < total) await fazer(proximo++)
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(paralelo, total)) }, vaga))
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

/** quanto tempo, no máximo, para medir o peso de cada nota quando o conjunto passa do limite */
const PRAZO_MEDIR_PESOS_MS = 20_000

/** o mínimo que o Z3 tem para conferir o que ficou grande demais (fora do modo de horas) */
const PRAZO_Z3_A_PARTE_MS = 2 * 60_000

/** quantas notas o teorema usa direto das leis (menos = mais básico; entra antes na cadeia) */
const apoioDireto = (e: EstadoTeorema) => (e.resultado.tipo === 'segue' ? e.resultado.notas.length : 99)

/** mais teoremas fechados primeiro; as que equivalem ao teorema por último */
const ordenar = (ss: SugestaoCadeia[]) =>
  [...ss].sort((a, b) => Number(a.lei.equivalente) - Number(b.lei.equivalente) || b.fecha.length - a.fecha.length || Number(!a.lei.notaId) - Number(!b.lei.notaId))
