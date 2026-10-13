import type { EntradaDicionario } from '../dados/tipos'
import { expandir } from '../logica/acucar'
import type { Formula, Termo } from '../logica/ast'
import { temAritmetica, usosDeNomes } from '../logica/termos'
import { validar } from '../logica/validador'
import { Aterrador, ehModal, GrandeDemais, PREFIXO_SKOLEM, type ProblemaCNF } from './aterrar'
import { Avaliador, type PassoExplicacao } from './avaliar'
import { bancoAtual, chaveProva, type BancoProvas, type Prova } from './bancoProvas'
import { resolver } from './sat'

/** Um grupo de fórmulas que entra ou sai junto (uma nota). */
export interface Grupo {
  id: string
  rotulo: string
  formulas: string[]
}

export interface OpcoesMotor {
  /** maior tamanho de domínio testado */
  N: number
  /** limite de tamanho do problema aterrado (nós do circuito / cláusulas) */
  limite: number
  /** maior número de mundos testado quando há □, ◇ ou B[…] */
  K: number
  /**
   * hora (Date.now()) em que a busca desiste: o resultado fica sem decisão
   * (como "grande demais"), nunca "sem modelo". Sem prazo, vai até o fim.
   */
  prazo?: number
}

export const OPCOES_PADRAO: OpcoesMotor = { N: 8, limite: 2_000_000, K: 3 }

export interface Modelo {
  n: number
  /** número de mundos (1 = sem lógica modal); o mundo 0 é o real */
  mundos: number
  constantes: { nome: string; valor: number }[]
  funcoes: { nome: string; tabela: { args: number[]; valor: number; w: number }[] }[]
  predicados: { nome: string; aridade: number; verdadeiros: { args: number[]; w: number }[] }[]
  /** (a, b, w): a ∈ b no mundo w */
  pertence: [number, number, number][]
  /** para cada agente, os pares (w, v): em w, o agente considera v possível */
  acessos: { agente: string; pares: [number, number][] }[]
}

export type Busca =
  | { status: 'modelo'; n: number; modelo: Modelo }
  /** K: maior número de mundos testado (1 sem lógica modal) */
  | { status: 'sem-modelo'; K: number }
  /** tamanho n ficou grande demais (ou, com `tempo`, o prazo acabou nele); até n-1 não havia modelo */
  | { status: 'grande-demais'; n: number; tempo?: boolean }

export type ResultadoMotor =
  | { tipo: 'vazio' }
  | { tipo: 'consistente'; n: number; modelo: Modelo }
  | { tipo: 'sem-modelo'; N: number; K: number; conflito: string[]; explicacoes: ExplicacaoConflito[] }
  /** `tempo`: não foi o tamanho, foi o prazo da checagem que acabou com n objetos */
  | { tipo: 'grande-demais'; n: number; tempo?: boolean }

/** Por que uma nota é necessária ao conflito. */
export type ExplicacaoConflito =
  /** sem esta nota, as outras valem neste mundo, e nele a fórmula indicada falha */
  | { grupoId: string; tipo: 'mundo'; n: number; modelo: Modelo; formula: string; passos: PassoExplicacao }
  /** a nota se contradiz sozinha; `formulas` é o conflito mínimo entre as fórmulas dela */
  | { grupoId: string; tipo: 'sozinha'; formulas: string[]; explicacoes: ExplicacaoConflito[] }
  /** não foi possível montar a explicação (ex.: problema grande demais) */
  | { grupoId: string; tipo: 'indisponivel' }

export type Progresso = (msg: string) => void

/** Fórmula de uma nota já analisada: o texto, a árvore como escrita e a expandida para o motor. */
export interface FormulaPronta {
  texto: string
  original: Formula
  expandida: Formula
  /** usa números (contas, <, ≤, ∀x∈ℝ ou nomes numéricos): só o Z3 lê */
  aritmetica: boolean
}

/** Nomes do dicionário que são números (constantes e funções numéricas). */
export const nomesNumericos = (dicionario: EntradaDicionario[]) => new Set(dicionario.filter((e) => e.numerico).map((e) => e.simbolo))

/**
 * Analisa e expande as fórmulas válidas. Fórmulas com números ficam de fora
 * (o motor finito não lê números), a não ser com `comNumeros` (para o Z3).
 */
export function analisar(textos: string[], dicionario: EntradaDicionario[], comNumeros = false): FormulaPronta[] {
  const r: FormulaPronta[] = []
  const numericos = nomesNumericos(dicionario)
  for (const texto of textos) {
    const v = validar(texto, dicionario)
    if (!v.ast || !v.ok) continue
    const aritmetica = temAritmetica(v.ast, (n) => numericos.has(n))
    if (aritmetica && !comNumeros) continue
    r.push({ texto, original: v.ast, expandida: expandir(v.ast), aritmetica })
  }
  return r
}

/**
 * Só as fórmulas ligadas ao alvo por nomes em comum (direta ou indiretamente).
 * Números e objetos são tipos separados, então leis sobre outros nomes não
 * mudam se o alvo segue (desde que não se contradigam, o que é conferido à
 * parte). Deixa o Z3 livre das leis que não têm nada a ver com a conta.
 */
export function relevantes(formulas: FormulaPronta[], alvo: FormulaPronta): FormulaPronta[] {
  const nomes = (f: FormulaPronta) => new Set(usosDeNomes(f.original).map((u) => u.nome))
  const cada = formulas.map((f) => ({ f, ns: nomes(f) }))
  const ligados = nomes(alvo)
  const dentro = new Set<number>()
  for (let mudou = true; mudou; ) {
    mudou = false
    cada.forEach((x, i) => {
      if (dentro.has(i) || ![...x.ns].some((n) => ligados.has(n))) return
      dentro.add(i)
      x.ns.forEach((n) => ligados.add(n))
      mudou = true
    })
  }
  return cada.filter((_, i) => dentro.has(i)).map((x) => x.f)
}

/** a fórmula usa ∈ (ou ∅, que o motor define por ∈)? */
function usaPertence(f: Formula): boolean {
  const termo = (t: Termo): boolean => {
    switch (t.k) {
      case 'vazio':
        return true
      case 'app':
        return t.args.some(termo)
      case 'inter':
      case 'uniao':
      case 'arit':
        return termo(t.l) || termo(t.r)
      case 'neg':
        return termo(t.t)
      default:
        return false
    }
  }
  switch (f.k) {
    case 'rel':
      return f.op === '∈' || f.op === '∉' || termo(f.l) || termo(f.r)
    case 'pred':
      return f.args.some(termo)
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      return usaPertence(f.f)
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return usaPertence(f.l) || usaPertence(f.r)
    case 'forall':
    case 'exists':
      return !!f.dom || usaPertence(f.corpo)
    default:
      return false
  }
}

/**
 * Os nomes que a fórmula usa. ∈ e os operadores modais contam como nomes:
 * a relação ∈ e os mundos são os mesmos para todas as notas.
 */
export function nomesDe(it: FormulaPronta): string[] {
  return nomesDaFormula(it.expandida)
}

/** os nomes de uma fórmula já expandida (com ∈ e □ como nomes compartilhados) */
export function nomesDaFormula(f: Formula): string[] {
  const nomes = usosDeNomes(f).map((u) => u.nome)
  if (usaPertence(f)) nomes.push('∈')
  if (ehModal(f)) nomes.push('□')
  return nomes
}

/**
 * As notas ligadas às fórmulas-alvo por nomes em comum (direta ou
 * indiretamente), mais as que não têm nome nenhum (ex.: "há no máximo 2
 * objetos": falam do tamanho, que é de todos). As outras não mudam o que vale
 * sobre os nomes do alvo — a não ser pelo número de objetos, por isso quem usa
 * confere e, se preciso, volta a olhar todas.
 */
export function gruposRelevantes(prontos: GrupoPronto[], alvos: FormulaPronta[]): GrupoPronto[] {
  const ligados = new Set(alvos.flatMap(nomesDe))
  const nomesDoGrupo = prontos.map((x) => new Set(x.itens.flatMap(nomesDe)))
  const dentro = new Set<number>()
  nomesDoGrupo.forEach((ns, i) => ns.size === 0 && dentro.add(i))
  for (let mudou = true; mudou; ) {
    mudou = false
    nomesDoGrupo.forEach((ns, i) => {
      if (dentro.has(i) || ![...ns].some((n) => ligados.has(n))) return
      dentro.add(i)
      ns.forEach((n) => ligados.add(n))
      mudou = true
    })
  }
  return prontos.filter((_, i) => dentro.has(i))
}

/** Analisa e expande as fórmulas de um grupo. Fórmulas com erro são ignoradas. */
export function prepararFormulas(textos: string[], dicionario: EntradaDicionario[]): Formula[] {
  return analisar(textos, dicionario).map((x) => x.expandida)
}

function lerModelo(n: number, k: number, p: ProblemaCNF, valores: Int8Array): Modelo {
  const constantes: Modelo['constantes'] = []
  const funcoes = new Map<string, Modelo['funcoes'][number]['tabela']>()
  const predicados = new Map<string, { aridade: number; verdadeiros: { args: number[]; w: number }[] }>()
  const pertence: [number, number, number][] = []
  const acessos = new Map<string, [number, number][]>()
  for (const [v, info] of p.info) {
    if (info.k === 'pred' && !predicados.has(info.nome)) predicados.set(info.nome, { aridade: info.args.length, verdadeiros: [] })
    if (info.k === 'acesso' && !acessos.has(info.agente)) acessos.set(info.agente, [])
    if (valores[v] !== 1) continue
    switch (info.k) {
      case 'const':
        // as constantes criadas no lugar de um "existe" são do motor, não do usuário
        if (!info.nome.startsWith(PREFIXO_SKOLEM)) constantes.push({ nome: info.nome, valor: info.d })
        break
      case 'func':
        if (!funcoes.has(info.nome)) funcoes.set(info.nome, [])
        funcoes.get(info.nome)!.push({ args: info.args, valor: info.d, w: info.w })
        break
      case 'pred':
        predicados.get(info.nome)!.verdadeiros.push({ args: info.args, w: info.w })
        break
      case 'in':
        pertence.push([info.a, info.b, info.w])
        break
      case 'acesso':
        acessos.get(info.agente)!.push([info.de, info.para])
        break
    }
  }
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  }
  return {
    n,
    mundos: k,
    constantes: constantes.sort((a, b) => a.nome.localeCompare(b.nome)),
    funcoes: [...funcoes]
      .map(([nome, tabela]) => ({ nome, tabela: tabela.sort((a, b) => a.w - b.w || cmp(a.args, b.args)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    predicados: [...predicados]
      .map(([nome, x]) => ({ nome, ...x, verdadeiros: x.verdadeiros.sort((a, b) => a.w - b.w || cmp(a.args, b.args)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    pertence: pertence.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]),
    acessos: [...acessos].map(([agente, pares]) => ({ agente, pares: pares.sort((a, b) => a[0] - b[0] || a[1] - b[1]) })),
  }
}

/**
 * Procura modelo com domínio de 1 a N objetos. Com □, ◇ ou B[…], para cada
 * tamanho testa de 1 a K mundos.
 */
export function buscarModelo(formulas: Formula[], op: OpcoesMotor, progresso?: Progresso): Busca {
  const K = formulas.some(ehModal) ? Math.max(1, op.K) : 1
  // banco de provas: o que já se sabe deste conjunto (pula os tamanhos já testados)
  const banco = bancoAtual()
  const chave = banco ? chaveProva(formulas) : ''
  const sabido = banco ? conhecido(banco.obter(chave)) : null
  if (sabido?.modelo && sabido.modelo.n <= op.N && (sabido.modelo.modelo.mundos ?? 1) <= K) {
    banco!.estatisticas.acertos++
    return { status: 'modelo', n: sabido.modelo.n, modelo: sabido.modelo.modelo }
  }
  const jaN = sabido?.semN ?? 0
  const jaK = sabido?.semK ?? 0
  if (banco && op.N <= jaN && K <= jaK) {
    banco.estatisticas.acertos++
    return { status: 'sem-modelo', K }
  }
  if (banco) banco.estatisticas[jaN ? 'parciais' : 'faltas']++
  // o prazo acabou no tamanho n: até n-1 não havia modelo — fica no banco, e a próxima tentativa começa dali
  const semTempo = (n: number): Busca => {
    if (banco && n - 1 > jaN) guardarSemModelo(banco, chave, n - 1, K, jaN, jaK)
    return { status: 'grande-demais', n, tempo: true }
  }

  for (let n = 1; n <= op.N; n++) {
    for (let k = 1; k <= K; k++) {
      if (n <= jaN && k <= jaK) continue // já provado sem modelo
      if (op.prazo && Date.now() > op.prazo) return semTempo(n)
      progresso?.(`testando ${n} objeto${n > 1 ? 's' : ''}${K > 1 ? ` e ${k} mundo${k > 1 ? 's' : ''}` : ''}`)
      let p: ProblemaCNF
      try {
        const at = new Aterrador(n, op.limite, k)
        for (const f of formulas) at.afirmar(f)
        p = at.cnf()
      } catch (e) {
        if (e instanceof GrandeDemais) return { status: 'grande-demais', n }
        throw e
      }
      const r = resolver(p.nVars, p.clausulas, op.prazo ? { prazo: op.prazo } : {})
      // o prazo acabou no meio: não decidiu (e nada vai para o banco)
      if (r.sat === null) return semTempo(n)
      if (r.sat) {
        const modelo = lerModelo(n, k, p, r.valores)
        banco?.guardar({ chave, status: 'modelo', n, modelo, K, usadoEm: Date.now() })
        return { status: 'modelo', n, modelo }
      }
    }
  }
  if (banco) guardarSemModelo(banco, chave, op.N, K, jaN, jaK)
  return { status: 'sem-modelo', K }
}

/** O que o banco de provas já decide sobre o conjunto até N (e K), sem rodar nada; null se não sabe. */
export function sabidoNoBanco(formulas: Formula[], op: OpcoesMotor): Busca | null {
  const banco = bancoAtual()
  if (!banco) return null
  const K = formulas.some(ehModal) ? Math.max(1, op.K) : 1
  const s = conhecido(banco.obter(chaveProva(formulas)))
  if (s?.modelo && s.modelo.n <= op.N && (s.modelo.modelo.mundos ?? 1) <= K) return { status: 'modelo', n: s.modelo.n, modelo: s.modelo.modelo }
  if (s && op.N <= s.semN && K <= s.semK) return { status: 'sem-modelo', K }
  return null
}

/** O que o banco sabe: um modelo, e/ou até onde não há modelo (N objetos, K mundos). */
function conhecido(p: Prova | undefined): { modelo?: { n: number; modelo: Modelo }; semN: number; semK: number } | null {
  if (!p) return null
  // um modelo achado com n objetos: abaixo de n (com os mundos daquela busca) não havia
  if (p.status === 'modelo') return { modelo: { n: p.n, modelo: p.modelo }, semN: p.n - 1, semK: p.K }
  return { semN: p.N, semK: p.K }
}

/** Guarda "sem modelo até N, K", ficando com a maior região já provada. */
function guardarSemModelo(banco: BancoProvas, chave: string, N: number, K: number, jaN: number, jaK: number) {
  const [n, k] = N >= jaN ? [N, K >= jaK || N > jaN ? K : jaK] : [jaN, jaK]
  if (n > jaN || k > jaK) banco.guardar({ chave, status: 'sem-modelo', N: n, K: k, usadoEm: Date.now() })
}

/** O aprimoramento provou que não há modelo até N, K: registra no banco. */
export function registrarSemModelo(formulas: Formula[], N: number, K: number) {
  const banco = bancoAtual()
  if (!banco) return
  const chave = chaveProva(formulas)
  const s = conhecido(banco.obter(chave))
  if (s?.modelo && s.modelo.n <= N) return
  guardarSemModelo(banco, chave, N, K, s?.semN ?? 0, s?.semK ?? 0)
}

export type BuscaFaixa = Busca | { status: 'tempo'; n: number }

/**
 * Procura modelo só nos tamanhos `ns` e números de mundos `ks` dados (sem
 * lógica modal, só 1 mundo), desistindo quando passa do prazo. Usado para
 * aprofundar uma conclusão já conferida até um tamanho menor.
 */
export function buscarNaFaixa(formulas: Formula[], ns: number[], ks: number[], limite: number, prazo?: number): BuscaFaixa {
  const modal = formulas.some(ehModal)
  const mundos = modal ? ks : ks.includes(1) ? [1] : []
  const banco = bancoAtual()
  const sabido = banco ? conhecido(banco.obter(chaveProva(formulas))) : null
  // um modelo já achado num desses tamanhos responde na hora
  if (sabido?.modelo && ns.includes(sabido.modelo.n) && mundos.includes(sabido.modelo.modelo.mundos ?? 1)) {
    banco!.estatisticas.acertos++
    return { status: 'modelo', n: sabido.modelo.n, modelo: sabido.modelo.modelo }
  }
  for (const n of ns)
    for (const k of mundos) {
      if (sabido && n <= sabido.semN && k <= sabido.semK) continue // já provado sem modelo
      let p: ProblemaCNF
      try {
        const at = new Aterrador(n, limite, k)
        for (const f of formulas) at.afirmar(f)
        p = at.cnf()
      } catch (e) {
        if (e instanceof GrandeDemais) return { status: 'grande-demais', n }
        throw e
      }
      const r = resolver(p.nVars, p.clausulas, { prazo })
      if (r.sat === null) return { status: 'tempo', n }
      if (r.sat) return { status: 'modelo', n, modelo: lerModelo(n, k, p, r.valores) }
    }
  return { status: 'sem-modelo', K: Math.max(1, ...mundos) }
}

/**
 * Verifica se o conjunto de grupos tem modelo até N. Sem modelo, encontra um
 * conjunto de grupos em conflito que é mínimo no sentido de irredutível:
 * tirar qualquer um deles faz aparecer um modelo (removendo um por vez e
 * testando de novo). Grupos são testados para remoção na ordem dada.
 */
export function verificar(grupos: Grupo[], dicionario: EntradaDicionario[], op: OpcoesMotor, progresso?: Progresso): ResultadoMotor {
  const prontos = grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  if (!prontos.length) return { tipo: 'vazio' }
  const formulas = (xs: typeof prontos) => xs.flatMap((x) => x.itens.map((i) => i.expandida))

  const r = buscarModelo(formulas(prontos), op, progresso)
  if (r.status === 'modelo') return { tipo: 'consistente', n: r.n, modelo: r.modelo }
  if (r.status === 'grande-demais') return { tipo: 'grande-demais', n: r.n, tempo: r.tempo }
  // o prazo vale para decidir; o conflito mínimo vai até o fim (com notas a mais, sairia uma inocente)
  op = { ...op, prazo: undefined }

  const conjunto = minimizarRapido(prontos, [], op, 1, (g, i) => progresso?.(`procurando o conflito mínimo: testando sem "${g.rotulo}" (${i + 1}/${prontos.length})`))

  progresso?.('montando a explicação')
  const explicacoes = conjunto.map((alvo) => {
    const outros = conjunto.filter((x) => x !== alvo)
    if (outros.length) return explicarNecessidade(alvo.g.id, alvo.itens, formulas(outros), op)
    // a nota se contradiz sozinha: repete a análise entre as fórmulas dela
    const sub =
      alvo.itens.length > 1
        ? verificar(
            alvo.itens.map((it, k) => ({ id: String(k), rotulo: it.texto, formulas: [it.texto] })),
            dicionario,
            op,
          )
        : null
    const explic: ExplicacaoConflito = {
      grupoId: alvo.g.id,
      tipo: 'sozinha',
      formulas: sub?.tipo === 'sem-modelo' ? sub.conflito.map((k) => alvo.itens[Number(k)].texto) : alvo.itens.map((it) => it.texto),
      explicacoes: sub?.tipo === 'sem-modelo' ? sub.explicacoes : [],
    }
    return explic
  })
  return { tipo: 'sem-modelo', N: op.N, K: r.K, conflito: conjunto.map((x) => x.g.id), explicacoes }
}

export type GrupoPronto = { g: Grupo; itens: FormulaPronta[] }

/**
 * Remove grupos um por vez, na ordem dada, enquanto `grupos ∪ fixas` continuar
 * sem modelo até N. O resultado é irredutível: tirar qualquer grupo restante
 * faz aparecer um modelo. Na dúvida (grande demais), o grupo fica.
 */
export function minimizar(grupos: GrupoPronto[], fixas: Formula[], op: OpcoesMotor, minimo: number, aviso?: (g: Grupo, i: number) => void): GrupoPronto[] {
  let conjunto = grupos
  grupos.forEach((alvo, i) => {
    if (conjunto.length <= minimo) return
    const sem = conjunto.filter((x) => x !== alvo)
    aviso?.(alvo.g, i)
    const fs = [...sem.flatMap((x) => x.itens.map((it) => it.expandida)), ...fixas]
    if (buscarModelo(fs, op).status === 'sem-modelo') conjunto = sem
  })
  return conjunto
}

/**
 * Como `minimizar`, mas primeiro com cenários pequenos (rápido) e depois uma
 * única conferência com o limite completo. Se a conferência falhar (algum
 * grupo só era necessário em cenários maiores), refaz com o limite completo.
 */
export function minimizarRapido(
  grupos: GrupoPronto[],
  fixas: Formula[],
  op: OpcoesMotor,
  minimo = 0,
  aviso?: (g: Grupo, i: number) => void,
): GrupoPronto[] {
  const pequeno = { ...op, N: Math.min(op.N, 4) }
  if (pequeno.N === op.N || grupos.length <= minimo) return minimizar(grupos, fixas, op, minimo, aviso)
  const r = minimizar(grupos, fixas, pequeno, minimo, aviso)
  if (r.length === grupos.length) return r
  const fs = [...r.flatMap((x) => x.itens.map((i) => i.expandida)), ...fixas]
  return buscarModelo(fs, op).status === 'sem-modelo' ? r : minimizar(grupos, fixas, op, minimo, aviso)
}

// ---------------------------------------------------------------- perguntar

/** Um mundo concreto e a explicação do valor da fórmula perguntada nele. */
export interface MundoExplicado {
  n: number
  modelo: Modelo
  passos: PassoExplicacao
}

export type ResultadoPergunta =
  /** nenhum mundo até N tem as notas verdadeiras e a fórmula falsa; `notas` = as necessárias ([] = vale sempre) */
  | { tipo: 'segue'; N: number; K: number; notas: string[] }
  /** as notas implicam a negação da fórmula */
  | { tipo: 'contradiz'; N: number; K: number; notas: string[]; mundo: MundoExplicado }
  /**
   * há mundo com as notas e a fórmula falsa, e há mundo com as notas e a
   * fórmula verdadeira (`semMundoAFavor`: esse segundo ficou grande demais
   * para procurar — não se sabe se as notas a contradizem)
   */
  | { tipo: 'nao-segue'; N: number; mundo: MundoExplicado; semMundoAFavor?: true }
  /** as notas já não têm modelo até N: qualquer coisa "seguiria" */
  | { tipo: 'premissas-contraditorias'; N: number }
  | { tipo: 'grande-demais'; n: number }
  /**
   * a checagem passou do prazo com n objetos: até n−1 nenhum mundo decidiu (nem
   * contraexemplo). `fase`: 'base' = conferindo se as notas são consistentes;
   * 'contra' = procurando o cenário em que a fórmula falha (até n−1 não há)
   */
  | { tipo: 'tempo'; n: number; fase?: 'base' | 'contra' }
  | { tipo: 'formula-invalida' }
  /** a fórmula usa números: o motor finito não decide; o Z3 decide */
  | { tipo: 'aritmetica' }

export const nao = (f: Formula): Formula => ({ k: 'not', f, pos: 0, end: 0 })

/** com prazo, o tempo mínimo para achar as notas de origem depois de decidir */
const PRAZO_MINIMO_NOTAS_MS = 15_000

/**
 * "A fórmula segue das notas?" — testa notas ∪ {¬φ} e notas ∪ {φ} em
 * domínios de 1 a N objetos.
 */
export function perguntar(
  grupos: Grupo[],
  formula: string,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  progresso?: Progresso,
): ResultadoPergunta {
  const [phi] = analisar([formula], dicionario)
  if (!phi) return analisar([formula], dicionario, true).length ? { tipo: 'aritmetica' } : { tipo: 'formula-invalida' }
  const prontos: GrupoPronto[] = grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))

  progresso?.('conferindo se as notas são consistentes')
  const base = buscarModelo(premissas, op)
  if (base.status === 'grande-demais') return base.tempo ? { tipo: 'tempo', n: base.n, fase: 'base' } : { tipo: 'grande-demais', n: base.n }
  if (base.status === 'sem-modelo') return { tipo: 'premissas-contraditorias', N: op.N }

  progresso?.('procurando um mundo onde as notas valem e a fórmula falha')
  const contra = buscarModelo([...premissas, nao(phi.expandida)], op)
  if (contra.status === 'grande-demais') return contra.tempo ? { tipo: 'tempo', n: contra.n, fase: 'contra' } : { tipo: 'grande-demais', n: contra.n }
  // com prazo, achar as notas de origem ganha um tempo próprio (uma checagem que não
  // decide mantém a nota: a lista pode sair maior, nunca insuficiente)
  const opNotas = op.prazo ? { ...op, prazo: Math.max(op.prazo, Date.now() + PRAZO_MINIMO_NOTAS_MS) } : op
  if (contra.status === 'sem-modelo') {
    const notas = notasNecessarias(prontos, phi, [nao(phi.expandida)], opNotas, (g, i, n) =>
      progresso?.(`procurando as notas necessárias: testando sem "${g.rotulo}" (${i + 1}/${n})`),
    )
    return { tipo: 'segue', N: op.N, K: contra.K, notas: notas.map((x) => x.g.id) }
  }

  const mundo: MundoExplicado = { n: contra.n, modelo: contra.modelo, passos: new Avaliador(contra.modelo).explicar(phi.original) }
  progresso?.('procurando um mundo onde as notas valem e a fórmula também')
  const afavor = buscarModelo([...premissas, phi.expandida], op)
  if (afavor.status === 'sem-modelo') {
    const notas = notasNecessarias(prontos, phi, [phi.expandida], opNotas, (g, i, n) =>
      progresso?.(`procurando as notas que a contradizem: testando sem "${g.rotulo}" (${i + 1}/${n})`),
    )
    return { tipo: 'contradiz', N: op.N, K: afavor.K, notas: notas.map((x) => x.g.id), mundo }
  }
  // grande demais ao procurar o mundo a favor: ainda assim sabemos que não segue
  return { tipo: 'nao-segue', N: op.N, mundo, ...(afavor.status === 'modelo' ? {} : { semMundoAFavor: true as const }) }
}

/**
 * As notas necessárias para `fixas` não ter modelo, procuradas primeiro só
 * entre as ligadas ao teorema pelos nomes (com centenas de notas, testar
 * tirar uma por uma de todas estourava o prazo, e a lista saía com todas).
 * Se as ligadas não bastarem (o tamanho do mundo também conta), olha todas.
 */
export function notasNecessarias(
  prontos: GrupoPronto[],
  phi: FormulaPronta,
  fixas: Formula[],
  op: OpcoesMotor,
  aviso?: (g: Grupo, i: number, total: number) => void,
): GrupoPronto[] {
  const ligadas = gruposRelevantes(prontos, [phi])
  const bastam =
    ligadas.length < prontos.length && buscarModelo([...ligadas.flatMap((x) => x.itens.map((i) => i.expandida)), ...fixas], op).status === 'sem-modelo'
  const base = bastam ? ligadas : prontos
  return minimizarRapido(base, fixas, op, 0, (g, i) => aviso?.(g, i, base.length))
}

/**
 * Procura um mundo onde as outras fórmulas valem e o grupo falha (existe,
 * pela minimalidade do conflito), e explica onde ele falha.
 */
function explicarNecessidade(grupoId: string, itens: FormulaPronta[], outras: Formula[], op: OpcoesMotor): ExplicacaoConflito {
  const conj = itens.map((i) => i.expandida).reduce((a, b): Formula => ({ k: 'and', l: a, r: b, pos: 0, end: 0 }))
  const r = buscarModelo([...outras, { k: 'not', f: conj, pos: 0, end: 0 }], op)
  if (r.status !== 'modelo') return { grupoId, tipo: 'indisponivel' }
  const av = new Avaliador(r.modelo)
  const falha = itens.find((i) => !av.avaliar(i.original))
  if (!falha) return { grupoId, tipo: 'indisponivel' }
  return { grupoId, tipo: 'mundo', n: r.n, modelo: r.modelo, formula: falha.texto, passos: av.explicar(falha.original) }
}
