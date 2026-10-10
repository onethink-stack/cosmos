import type { EntradaDicionario } from '../dados/tipos'
import { expandir } from '../logica/acucar'
import type { Formula } from '../logica/ast'
import { validar } from '../logica/validador'
import { Aterrador, ehModal, GrandeDemais, type ProblemaCNF } from './aterrar'
import { Avaliador, type PassoExplicacao } from './avaliar'
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
  /** tamanho n ficou grande demais; até n-1 não havia modelo */
  | { status: 'grande-demais'; n: number }

export type ResultadoMotor =
  | { tipo: 'vazio' }
  | { tipo: 'consistente'; n: number; modelo: Modelo }
  | { tipo: 'sem-modelo'; N: number; K: number; conflito: string[]; explicacoes: ExplicacaoConflito[] }
  | { tipo: 'grande-demais'; n: number }

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
}

export function analisar(textos: string[], dicionario: EntradaDicionario[]): FormulaPronta[] {
  const r: FormulaPronta[] = []
  for (const texto of textos) {
    const v = validar(texto, dicionario)
    if (v.ast && v.ok) r.push({ texto, original: v.ast, expandida: expandir(v.ast) })
  }
  return r
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
        constantes.push({ nome: info.nome, valor: info.d })
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
  for (let n = 1; n <= op.N; n++) {
    for (let k = 1; k <= K; k++) {
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
      const r = resolver(p.nVars, p.clausulas)
      if (r.sat) return { status: 'modelo', n, modelo: lerModelo(n, k, p, r.valores) }
    }
  }
  return { status: 'sem-modelo', K }
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
  if (r.status === 'grande-demais') return { tipo: 'grande-demais', n: r.n }

  const conjunto = minimizar(prontos, [], op, 1, (g, i) => progresso?.(`procurando o conflito mínimo: testando sem "${g.rotulo}" (${i + 1}/${prontos.length})`))

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
  /** há mundo com as notas e a fórmula falsa, e há mundo com as notas e a fórmula verdadeira */
  | { tipo: 'nao-segue'; N: number; mundo: MundoExplicado }
  /** as notas já não têm modelo até N: qualquer coisa "seguiria" */
  | { tipo: 'premissas-contraditorias'; N: number }
  | { tipo: 'grande-demais'; n: number }
  | { tipo: 'formula-invalida' }

export const nao = (f: Formula): Formula => ({ k: 'not', f, pos: 0, end: 0 })

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
  if (!phi) return { tipo: 'formula-invalida' }
  const prontos: GrupoPronto[] = grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))

  progresso?.('conferindo se as notas são consistentes')
  const base = buscarModelo(premissas, op)
  if (base.status === 'grande-demais') return { tipo: 'grande-demais', n: base.n }
  if (base.status === 'sem-modelo') return { tipo: 'premissas-contraditorias', N: op.N }

  progresso?.('procurando um mundo onde as notas valem e a fórmula falha')
  const contra = buscarModelo([...premissas, nao(phi.expandida)], op)
  if (contra.status === 'grande-demais') return { tipo: 'grande-demais', n: contra.n }
  if (contra.status === 'sem-modelo') {
    const notas = minimizarRapido(prontos, [nao(phi.expandida)], op, 0, (g, i) =>
      progresso?.(`procurando as notas necessárias: testando sem "${g.rotulo}" (${i + 1}/${prontos.length})`),
    )
    return { tipo: 'segue', N: op.N, K: contra.K, notas: notas.map((x) => x.g.id) }
  }

  const mundo: MundoExplicado = { n: contra.n, modelo: contra.modelo, passos: new Avaliador(contra.modelo).explicar(phi.original) }
  progresso?.('procurando um mundo onde as notas valem e a fórmula também')
  const afavor = buscarModelo([...premissas, phi.expandida], op)
  if (afavor.status === 'sem-modelo') {
    const notas = minimizarRapido(prontos, [phi.expandida], op, 0, (g, i) =>
      progresso?.(`procurando as notas que a contradizem: testando sem "${g.rotulo}" (${i + 1}/${prontos.length})`),
    )
    return { tipo: 'contradiz', N: op.N, K: afavor.K, notas: notas.map((x) => x.g.id), mundo }
  }
  // grande demais ao procurar o mundo a favor: ainda assim sabemos que não segue
  return { tipo: 'nao-segue', N: op.N, mundo }
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
