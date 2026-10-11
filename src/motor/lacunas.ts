// Procura a lei que falta: quando um teorema não segue das leis e fatos, testa
// leis candidatas e devolve as que (1) não contradizem as leis e fatos e
// (2) junto com eles fazem o teorema seguir.
//
// Candidatas: primeiro as notas desativadas do próprio caderno (leis e fatos),
// depois leis gerais montadas com os símbolos em uso (extensionalidade,
// injetividade, "não é vazio", propriedades de relações, pontes entre
// predicados…).
//
// Estratégia (guiada por contraexemplos, como em descobrir.ts): uma candidata
// que vale num cenário em que as leis valem e o teorema falha não basta e é
// descartada sem custo. As que sobram passam pela checagem completa; se
// aparece um cenário novo, ele derruba outras candidatas de uma vez.

import type { EntradaDicionario, TipoSimbolo } from '../dados/tipos'
import type { Formula } from '../logica/ast'
import { canonica } from '../logica/canonica'
import { imprimir } from '../logica/impressao'
import { usosDeNomes } from '../logica/termos'
import { ehModal } from './aterrar'
import { Avaliador, type PassoExplicacao } from './avaliar'
import { analisar, buscarModelo, minimizarRapido, nao, type Grupo, type GrupoPronto, type OpcoesMotor, type Progresso } from './motor'

export interface LeiSugerida {
  formula: string
  /** nome curto, ex. "Extensionalidade" */
  nome: string
  /** leitura em português */
  leitura: string
  /** se veio de uma nota desativada do caderno, o id dela */
  notaId?: string
  /** a lei avaliada no cenário em que o teorema falhava (ela é falsa lá) */
  porque: PassoExplicacao
  /** tamanho do cenário em que o teorema falhava */
  n: number
  /** leis e fatos usados junto com ela (conjunto irredutível) */
  notas: string[]
  /** dadas as leis e fatos, a lei equivale ao próprio teorema (aprová-la = assumir o teorema) */
  equivalente: boolean
}

export type ResultadoLacunas =
  | { tipo: 'sugestoes'; N: number; K: number; itens: LeiSugerida[]; testadas: number; incertas: number; truncado: boolean }
  /** o teorema já segue: não falta nada */
  | { tipo: 'ja-segue'; N: number }
  /** as leis e fatos contradizem o teorema: nenhuma lei acrescentada resolve sem criar contradição */
  | { tipo: 'contradiz'; N: number; notas: string[] }
  | { tipo: 'premissas-contraditorias'; N: number }
  | { tipo: 'grande-demais'; n: number }
  | { tipo: 'formula-invalida' }

export const MAX_CANDIDATAS_LEI = 300
/** quantas sugestões no máximo são explicadas (as melhores primeiro) */
export const MAX_SUGESTOES = 20

export interface CandidataLei {
  formula: string
  nome: string
  leitura: string
  notaId?: string
}

/** Leis gerais montadas com os símbolos usados nas fórmulas. */
/** `reservados`: nomes que não podem virar variável (ex.: os do dicionário). */
export function gerarLeis(formulas: Formula[], reservados: Iterable<string> = []): { candidatas: CandidataLei[]; truncado: boolean } {
  const tipos = new Map<string, { tipo: TipoSimbolo; aridade: number }>()
  for (const f of formulas) for (const u of usosDeNomes(f)) if (!tipos.has(u.nome)) tipos.set(u.nome, { tipo: u.tipo, aridade: u.aridade })
  const C = [...tipos].filter(([, t]) => t.tipo === 'constante').map(([n]) => n)
  const P1 = [...tipos].filter(([, t]) => t.tipo === 'predicado' && t.aridade === 1).map(([n]) => n)
  const P2 = [...tipos].filter(([, t]) => t.tipo === 'predicado' && t.aridade === 2).map(([n]) => n)
  const F = [...tipos].filter(([, t]) => t.tipo === 'funcao' && t.aridade === 1).map(([n]) => n)
  const usaPertence = formulas.some((f) => /[∈∉⊆⋂⋃∅]/.test(imprimir(f)))

  // variáveis que não colidem com nenhum nome usado
  const usados = new Set([...tipos.keys(), ...reservados])
  const vars: string[] = []
  for (const v of ['x', 'y', 'z', 'u', 'v', 'w', 's', 't']) if (!usados.has(v)) vars.push(v)
  for (let i = 1; vars.length < 3; i++) if (!usados.has(`x${i}`)) vars.push(`x${i}`)
  const [x, y, z] = vars

  const cs: CandidataLei[] = []
  const add = (formula: string, nome: string, leitura: string) => cs.push({ formula, nome, leitura })

  if (usaPertence) {
    add(
      `∀${x} ∀${y} ((∀${z} (${z} ∈ ${x} ⟺ ${z} ∈ ${y})) ⟹ ${x} = ${y})`,
      'Extensionalidade',
      'dois objetos com exatamente os mesmos elementos são o mesmo objeto',
    )
    add(`∀${x} (${x} ∉ ${x})`, 'Nada pertence a si mesmo', 'nenhum objeto é elemento de si mesmo')
    add(`∀${x} ∀${y} (${x} ∈ ${y} ⟹ ${y} ∉ ${x})`, 'Sem pertinência mútua', 'se um objeto pertence a outro, o outro não pertence a ele')
    for (const c of C) add(`∃${x} (${x} ∈ ${c})`, `${c} não é vazio`, `${c} tem ao menos um elemento`)
  }
  for (const f of F) {
    add(`∀${x} ∀${y} (${f}(${x}) = ${f}(${y}) ⟹ ${x} = ${y})`, `${f} é injetiva`, `objetos diferentes têm imagens diferentes por ${f}`)
    if (usaPertence)
      for (const c of C) {
        add(
          `∀${x}∈${c} ∀${y}∈${c} (${f}(${x}) = ${f}(${y}) ⟹ ${x} = ${y})`,
          `${f} é injetiva em ${c}`,
          `elementos diferentes de ${c} têm imagens diferentes por ${f}`,
        )
        add(
          `∀${x}∈${c} ∀${y}∈${c} (${x} ≠ ${y} ⟹ ¬(${f}(${x}) ⊆ ${f}(${y})))`,
          `Nenhum ${f}(…) de ${c} contém outro`,
          `para elementos diferentes de ${c}, nenhum ${f}(${x}) está contido em outro ${f}(${y})`,
        )
      }
  }
  for (const p of P1) {
    add(`∃${x} ${p}(${x})`, `Existe algo com ${p}`, `ao menos um objeto tem ${p}`)
    add(`∀${x} ${p}(${x})`, `Tudo tem ${p}`, `todo objeto tem ${p}`)
    for (const q of P1) if (q !== p) add(`∀${x} (${p}(${x}) ⟹ ${q}(${x}))`, `${p} implica ${q}`, `todo objeto com ${p} tem ${q}`)
  }
  for (const r of P2) {
    const R = (a: string, b: string) => `${r}(${a}, ${b})`
    add(`∀${x} ${R(x, x)}`, `${r} é reflexiva`, `todo objeto está em ${r} consigo mesmo`)
    add(`∀${x} ¬${R(x, x)}`, `${r} é irreflexiva`, `nenhum objeto está em ${r} consigo mesmo`)
    add(`∀${x} ∀${y} (${R(x, y)} ⟹ ${R(y, x)})`, `${r} é simétrica`, `se ${R(x, y)}, então ${R(y, x)}`)
    add(`∀${x} ∀${y} (${R(x, y)} ⟹ ¬${R(y, x)})`, `${r} é assimétrica`, `se ${R(x, y)}, então não ${R(y, x)}`)
    add(`∀${x} ∀${y} (${R(x, y)} ∧ ${R(y, x)} ⟹ ${x} = ${y})`, `${r} é antissimétrica`, `${R(x, y)} e ${R(y, x)} só juntos quando ${x} = ${y}`)
    add(
      `∀${x} ∀${y} ∀${z} (${R(x, y)} ∧ ${R(y, z)} ⟹ ${R(x, z)})`,
      `${r} é transitiva`,
      `se ${R(x, y)} e ${R(y, z)}, então ${R(x, z)}`,
    )
    add(`∀${x} ∃${y} ${R(x, y)}`, `Todo objeto tem um ${r}`, `para todo ${x} existe ${y} com ${R(x, y)}`)
    for (const s of P2)
      if (s !== r) {
        const S = (a: string, b: string) => `${s}(${a}, ${b})`
        add(`∀${x} ∀${y} (${R(x, y)} ⟹ ${S(x, y)})`, `${r} implica ${s}`, `sempre que ${R(x, y)}, também ${S(x, y)}`)
        add(`∀${x} ∀${y} (${R(x, y)} ⟹ ${S(y, x)})`, `${r} implica ${s} invertida`, `sempre que ${R(x, y)}, também ${S(y, x)}`)
      }
  }
  // fatos simples entre constantes
  C.forEach((a, i) =>
    C.slice(i + 1).forEach((b) => add(`${a} ≠ ${b}`, `${a} e ${b} são diferentes`, `${a} e ${b} são objetos diferentes`)),
  )
  if (usaPertence)
    for (const a of C)
      for (const b of C) {
        if (a === b) continue
        add(`${a} ⊆ ${b}`, `${a} está contido em ${b}`, `todo elemento de ${a} é elemento de ${b}`)
        add(`${a} ∉ ${b}`, `${a} não pertence a ${b}`, `${a} não é elemento de ${b}`)
      }

  return { candidatas: cs.slice(0, MAX_CANDIDATAS_LEI), truncado: cs.length > MAX_CANDIDATAS_LEI }
}

/**
 * `grupos`: leis e fatos ativos. `inativas`: notas desativadas (testadas
 * primeiro, como candidatas). `formula`: o teorema.
 */
export function procurarLeis(
  grupos: Grupo[],
  inativas: Grupo[],
  formula: string,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  progresso?: Progresso,
): ResultadoLacunas {
  const [phi] = analisar([formula], dicionario)
  if (!phi) return { tipo: 'formula-invalida' }
  const prontos: GrupoPronto[] = grupos.map((g) => ({ g, itens: analisar(g.formulas, dicionario) })).filter((x) => x.itens.length)
  const premissas = prontos.flatMap((x) => x.itens.map((i) => i.expandida))

  progresso?.('conferindo se as leis e fatos são consistentes')
  const base = buscarModelo(premissas, op)
  if (base.status === 'grande-demais') return { tipo: 'grande-demais', n: base.n }
  if (base.status === 'sem-modelo') return { tipo: 'premissas-contraditorias', N: op.N }

  progresso?.('procurando um cenário em que o teorema falha')
  const contra = buscarModelo([...premissas, nao(phi.expandida)], op)
  if (contra.status === 'grande-demais') return { tipo: 'grande-demais', n: contra.n }
  if (contra.status === 'sem-modelo') return { tipo: 'ja-segue', N: op.N }

  progresso?.('conferindo se as leis e fatos contradizem o teorema')
  const afavor = buscarModelo([...premissas, phi.expandida], op)
  if (afavor.status === 'sem-modelo') {
    const notas = minimizarRapido(prontos, [phi.expandida], op, 0)
    return { tipo: 'contradiz', N: op.N, notas: notas.map((x) => x.g.id) }
  }

  // candidatas: notas desativadas primeiro, depois as leis gerais
  const escritas = new Set(prontos.flatMap((x) => x.itens.map((i) => canonica(i.original))))
  const daNota: CandidataLei[] = inativas.flatMap((g) => {
    const fs = g.formulas.filter((f) => f.trim())
    if (!fs.length) return []
    const f = fs.length === 1 ? fs[0] : fs.map((t) => `(${t})`).join(' ∧ ')
    return [{ formula: f, nome: g.rotulo, leitura: 'nota desativada do caderno', notaId: g.id }]
  })
  const { candidatas: gerais, truncado } = gerarLeis([...premissas, phi.expandida], dicionario.map((e) => e.simbolo))
  const vistas = new Set<string>()
  const candidatas = [...daNota, ...gerais]
    .map((c) => ({ c, pronta: analisar([c.formula], dicionario)[0] }))
    .filter((x) => {
      if (!x.pronta) return false
      const k = canonica(x.pronta.original)
      if (escritas.has(k) || vistas.has(k)) return false
      vistas.add(k)
      return true
    })

  const avaliadores = [new Avaliador(contra.modelo)]
  const suficientes: typeof candidatas = []
  let incertas = 0
  candidatas.forEach((v, i) => {
    // vale num cenário em que as leis valem e o teorema falha: não basta
    if (avaliadores.some((av) => av.avaliar(v.pronta.original))) return
    progresso?.(`testando leis candidatas (${i + 1}/${candidatas.length}): ${v.c.nome}`)
    const r = buscarModelo([...premissas, v.pronta.expandida, nao(phi.expandida)], op)
    if (r.status === 'modelo') {
      avaliadores.push(new Avaliador(r.modelo))
      return
    }
    if (r.status === 'grande-demais') {
      incertas++
      return
    }
    // basta; mas não pode contradizer as leis e fatos (senão "tudo seguiria")
    const ok = buscarModelo([...premissas, v.pronta.expandida], op)
    if (ok.status === 'modelo') suficientes.push(v)
    else if (ok.status === 'grande-demais') incertas++
  })

  // as que equivalem ao teorema vão para o fim (são "assumir o próprio teorema")
  const comEquivalencia = suficientes.map((v) => {
    progresso?.(`comparando com o teorema: ${v.c.nome}`)
    // sem decisão (prazo, tamanho) conta como equivalente: na dúvida, não é sugerida como lei nova
    const equivalente = buscarModelo([...premissas, phi.expandida, nao(v.pronta.expandida)], op).status !== 'modelo'
    return { ...v, equivalente }
  })
  const ordenadas = [...comEquivalencia.filter((v) => !v.equivalente), ...comEquivalencia.filter((v) => v.equivalente)].slice(0, MAX_SUGESTOES)

  const av0 = new Avaliador(contra.modelo)
  const itens: LeiSugerida[] = ordenadas.map((v, k) => {
    progresso?.(`procurando as leis usadas (${k + 1}/${ordenadas.length}): ${v.c.nome}`)
    const notas = minimizarRapido(prontos, [v.pronta.expandida, nao(phi.expandida)], op)
    return {
      formula: v.c.formula,
      nome: v.c.nome,
      leitura: v.c.leitura,
      notaId: v.c.notaId,
      porque: av0.explicar(v.pronta.original),
      n: contra.n,
      notas: notas.map((x) => x.g.id),
      equivalente: v.equivalente,
    }
  })
  const K = [...premissas, phi.expandida].some(ehModal) ? op.K : 1
  return { tipo: 'sugestoes', N: op.N, K, itens, testadas: candidatas.length, incertas, truncado }
}

export { canonica } from '../logica/canonica'
