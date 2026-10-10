// Descobre consequências simples das notas: igualdades, pertinências,
// inclusões, "não é vazio", predicados e valores de função sobre as
// constantes que aparecem nas notas.
//
// Estratégia (guiada por contraexemplos): uma candidata falsa em algum mundo
// conhecido das notas não segue delas e é descartada sem custo. As que
// sobrevivem passam pela checagem completa (notas ∪ {¬candidata}); se aparece
// um mundo, ele entra na coleção e derruba outras candidatas de uma vez.

import type { EntradaDicionario, TipoSimbolo } from '../dados/tipos'
import type { Formula } from '../logica/ast'
import { imprimir } from '../logica/impressao'
import { renomear } from '../logica/nomes'
import { usosDeNomes } from '../logica/termos'
import { ehModal } from './aterrar'
import { Avaliador } from './avaliar'
import { analisar, buscarModelo, minimizar, nao, type Grupo, type GrupoPronto, type Modelo, type OpcoesMotor, type Progresso } from './motor'

export interface Consequencia {
  formula: string
  /** leitura em português, ex.: "A não é vazio" */
  descricao: string
  /** notas necessárias (conjunto irredutível) */
  notas: string[]
}

export type ResultadoDescoberta =
  | {
      tipo: 'consequencias'
      N: number
      /** mundos testados (1 sem lógica modal) */
      K: number
      itens: Consequencia[]
      /** candidatas testadas */
      testadas: number
      /** consequências que já estavam escritas nas notas (não listadas) */
      jaNasNotas: number
      /** candidatas cuja checagem passou do limite de tamanho */
      incertas: number
      /** havia mais candidatas que o limite; só as primeiras foram testadas */
      truncado: boolean
    }
  | { tipo: 'premissas-contraditorias'; N: number }
  | { tipo: 'grande-demais'; n: number }
  | { tipo: 'vazio' }

export const MAX_CANDIDATAS = 400

interface Candidata {
  formula: string
  descricao: string
  /** chave para descartar repetições depois de identificar constantes iguais */
  forma: 'igual' | 'diferente' | 'pertence' | 'nao-pertence' | 'contido' | 'nao-vazio' | 'vazio' | 'pred' | 'nao-pred' | 'func'
  constantes: string[]
}

/** Gera as candidatas a partir dos símbolos usados nas notas. */
export function gerarCandidatas(premissas: Formula[]): { candidatas: Candidata[]; truncado: boolean } {
  const tipos = new Map<string, { tipo: TipoSimbolo; aridade: number }>()
  for (const f of premissas) for (const u of usosDeNomes(f)) if (!tipos.has(u.nome)) tipos.set(u.nome, { tipo: u.tipo, aridade: u.aridade })
  const C = [...tipos].filter(([, t]) => t.tipo === 'constante').map(([n]) => n)
  const P = [...tipos].filter(([, t]) => t.tipo === 'predicado' && t.aridade <= 2)
  const F = [...tipos].filter(([, t]) => t.tipo === 'funcao' && t.aridade === 1).map(([n]) => n)

  // variável para "não é vazio" que não colida com nenhum nome usado
  const usados = new Set(tipos.keys())
  let x = ['x', 'y', 'z', 'w', 'u', 'v'].find((v) => !usados.has(v))
  for (let i = 1; !x; i++) if (!usados.has(`x${i}`)) x = `x${i}`

  const cs: Candidata[] = []
  const add = (formula: string, descricao: string, forma: Candidata['forma'], constantes: string[]) => cs.push({ formula, descricao, forma, constantes })

  C.forEach((a, i) =>
    C.slice(i + 1).forEach((b) => {
      add(`${a} = ${b}`, `${a} e ${b} são o mesmo objeto`, 'igual', [a, b])
      add(`${a} ≠ ${b}`, `${a} e ${b} são objetos diferentes`, 'diferente', [a, b])
    }),
  )
  for (const c of C) {
    add(`∃${x} (${x} ∈ ${c})`, `${c} não é vazio`, 'nao-vazio', [c])
    add(`∀${x} (${x} ∉ ${c})`, `${c} é vazio`, 'vazio', [c])
  }
  for (const a of C)
    for (const b of C) {
      add(`${a} ∈ ${b}`, `${a} pertence a ${b}`, 'pertence', [a, b])
      add(`${a} ∉ ${b}`, `${a} não pertence a ${b}`, 'nao-pertence', [a, b])
      if (a !== b) add(`${a} ⊆ ${b}`, `${a} está contido em ${b}`, 'contido', [a, b])
    }
  for (const [p, { aridade }] of P) {
    const tuplas = aridade === 0 ? [[]] : aridade === 1 ? C.map((c) => [c]) : C.flatMap((a) => C.map((b) => [a, b]))
    for (const t of tuplas) {
      const at = aridade ? `${p}(${t.join(', ')})` : p
      add(at, aridade ? `${p} vale para ${t.join(', ')}` : `${p} é verdadeiro`, 'pred', t)
      add(`¬${at}`, aridade ? `${p} não vale para ${t.join(', ')}` : `${p} é falso`, 'nao-pred', t)
    }
  }
  for (const f of F) for (const a of C) for (const b of C) add(`${f}(${a}) = ${b}`, `${f}(${a}) é ${b}`, 'func', [a, b])

  return { candidatas: cs.slice(0, MAX_CANDIDATAS), truncado: cs.length > MAX_CANDIDATAS }
}

export function descobrir(grupos: Grupo[], dicionario: EntradaDicionario[], op: OpcoesMotor, progresso?: Progresso): ResultadoDescoberta {
  const prontos: GrupoPronto[] = grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))
  if (!premissas.length) return { tipo: 'vazio' }

  progresso?.('conferindo se as notas são consistentes')
  const base = buscarModelo(premissas, op)
  if (base.status === 'grande-demais') return { tipo: 'grande-demais', n: base.n }
  if (base.status === 'sem-modelo') return { tipo: 'premissas-contraditorias', N: op.N }

  const { candidatas, truncado } = gerarCandidatas(premissas)
  const escritas = new Set(prontos.flatMap((x) => x.itens.map((i) => imprimir(i.original))))
  const mundos: Modelo[] = [base.modelo]
  const avaliadores = [new Avaliador(base.modelo)]

  // candidatas válidas (com a árvore como escrita e a expandida)
  const vivas = candidatas
    .map((c) => ({ c, pronta: analisar([c.formula], dicionario)[0] }))
    .filter((x) => !!x.pronta)
  const valeEmTodos = (f: Formula) => avaliadores.every((av) => av.avaliar(f))

  const confirmadas: typeof vivas = []
  let incertas = 0
  vivas.forEach((v, i) => {
    if (!valeEmTodos(v.pronta.original)) return // um mundo conhecido já a derruba
    progresso?.(`testando candidatas (${i + 1}/${vivas.length}): ${v.c.formula}`)
    const r = buscarModelo([...premissas, nao(v.pronta.expandida)], op)
    if (r.status === 'modelo') {
      mundos.push(r.modelo)
      avaliadores.push(new Avaliador(r.modelo))
    } else if (r.status === 'sem-modelo') confirmadas.push(v)
    else incertas++
  })

  // separa o que já está escrito nas notas; tira o que vale sempre (sem precisar de nota)
  const jaEscritas = confirmadas.filter((v) => escritas.has(imprimir(v.pronta.original)))
  const relevantes = confirmadas.filter(
    (v) => !jaEscritas.includes(v) && buscarModelo([nao(v.pronta.expandida)], op).status !== 'sem-modelo',
  )
  const jaNasNotas = jaEscritas.length

  const enxutas = tirarObvias(
    relevantes.map((v) => v.c),
    jaEscritas.map((v) => v.c),
  )
  const porFormula = new Map(relevantes.map((v) => [v.c.formula, v]))

  const itens: Consequencia[] = enxutas.map((c, k) => {
    progresso?.(`procurando as notas de origem (${k + 1}/${enxutas.length}): ${c.formula}`)
    const v = porFormula.get(c.formula)!
    const notas = minimizar(prontos, [nao(v.pronta.expandida)], op, 0)
    return { formula: c.formula, descricao: c.descricao, notas: notas.map((x) => x.g.id) }
  })
  const K = premissas.some(ehModal) ? op.K : 1
  return { tipo: 'consequencias', N: op.N, K, itens, testadas: vivas.length, jaNasNotas, incertas, truncado }
}

/**
 * Tira consequências óbvias a partir de outras já listadas:
 * - se a = b segue, fórmulas que só mudam a por b repetem outra;
 * - se algum c ∈ d segue, "d não é vazio" é óbvio.
 */
function tirarObvias(cs: Candidata[], escritas: Candidata[]): Candidata[] {
  // classes de igualdade (das listadas e das já escritas), com o primeiro nome como representante
  const rep = new Map<string, string>()
  const achar = (a: string): string => (rep.has(a) && rep.get(a) !== a ? achar(rep.get(a)!) : a)
  for (const c of [...escritas, ...cs])
    if (c.forma === 'igual') {
      const [a, b] = c.constantes.map(achar)
      if (a !== b) rep.set(b, a)
    }
  const canonica = (c: Candidata) => {
    let f = c.formula
    for (const k of new Set(c.constantes)) {
      const r = achar(k)
      if (r !== k) f = renomear(f, k, r)
    }
    return f
  }
  const naoVazios = new Set([...escritas, ...cs].filter((c) => c.forma === 'pertence').map((c) => achar(c.constantes[1])))
  // o que só repete uma fórmula já escrita (trocando iguais por iguais) também é óbvio
  const vistas = new Set<string>(escritas.map(canonica))
  return cs.filter((c) => {
    if (c.forma === 'igual') return true
    if (c.forma === 'nao-vazio' && naoVazios.has(achar(c.constantes[0]))) return false
    const k = canonica(c)
    if (vistas.has(k)) return false
    vistas.add(k)
    // a = b com a ≠ b canônico vira "a ≠ a", "a ∈ a"... ainda informativo; "a ⊆ a" não
    if (c.forma === 'contido' && achar(c.constantes[0]) === achar(c.constantes[1])) return false
    return true
  })
}
