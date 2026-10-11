// O que observar para decidir uma tese (algo que não segue das leis nem é
// contradito por elas): a lógica parou aí; quem decide é o mundo.
//
//   - fatos simples sobre os nomes que a tese usa (P(a), ¬R(a, b), a = b…)
//     que, junto com as leis, provam a tese ou a derrubam;
//   - para uma tese universal, o retrato do objeto que a refutaria (tirado do
//     cenário em que as leis valem e ela falha): um basta para derrubá-la;
//   - para uma tese com números, as grandezas a medir num mesmo caso.

import type { EntradaDicionario } from '../dados/tipos'
import type { Formula, Termo } from '../logica/ast'
import { canonica } from '../logica/canonica'
import { imprimir } from '../logica/impressao'
import { usosDeNomes } from '../logica/termos'
import { Avaliador } from './avaliar'
import { analisar, buscarModelo, nao, nomesNumericos, relevantes, type Grupo, type MundoExplicado, type OpcoesMotor } from './motor'

export interface Observacao {
  /** o que observar, em português */
  texto: string
  /** a observação como fórmula (quando é um fato simples) */
  formula?: string
  /** o que acontece com a tese se isso for observado */
  efeito: 'confirma' | 'refuta' | 'medir'
}

/** candidatas testadas por tese (cada uma custa até 3 buscas) */
const MAX_CANDIDATAS = 40
const MAX_POR_EFEITO = 4

export function oQueObservar(grupos: Grupo[], formula: string, dicionario: EntradaDicionario[], op: OpcoesMotor, contra?: MundoExplicado): Observacao[] {
  const [phi] = analisar([formula], dicionario, true)
  if (!phi) return []

  // com números: o que medir (as grandezas da tese e das leis ligadas a ela)
  if (phi.aritmetica) {
    const numericos = nomesNumericos(dicionario)
    const prontas = analisar(
      grupos.flatMap((g) => g.formulas),
      dicionario,
      true,
    )
    const ligadas = relevantes(prontas, phi)
    const nomes = new Set<string>()
    for (const f of [phi, ...ligadas]) for (const u of usosDeNomes(f.original)) if (u.tipo === 'constante' && numericos.has(u.nome)) nomes.add(u.nome)
    if (!nomes.size) return []
    return [
      {
        efeito: 'medir',
        texto: `medir ${[...nomes].join(', ')} num mesmo caso — com esses valores, a tese fica decidida (importe as medições como tabela em Mundo: cada linha um caso, uma coluna por grandeza)`,
      },
    ]
  }

  const premissas = analisar(
    grupos.flatMap((g) => g.formulas),
    dicionario,
  ).map((x) => x.expandida)
  const obs: Observacao[] = []

  // fatos simples sobre os nomes da tese e das leis ligadas a ela (é por elas que uma observação chega à tese)
  const ligadas = relevantes(
    analisar(
      grupos.flatMap((g) => g.formulas),
      dicionario,
    ),
    phi,
  )
  const usos = [phi, ...ligadas].flatMap((f) => usosDeNomes(f.original))
  const constantes = [...new Set(usos.filter((u) => u.tipo === 'constante').map((u) => u.nome))]
  const predicados = [...new Map(usos.filter((u) => u.tipo === 'predicado').map((u) => [u.nome, u.aridade])).entries()]
  const usaPertence = /[∈∉⊆]/.test(formula)
  const candidatas: string[] = []
  const tuplas = (k: number): string[][] =>
    k === 0 ? [[]] : tuplas(k - 1).flatMap((t) => constantes.map((c) => [...t, c]))
  for (const [p, ar] of predicados) if (ar <= 2) for (const t of tuplas(ar)) candidatas.push(`${p}(${t.join(', ')})`)
  for (let i = 0; i < constantes.length; i++)
    for (let j = 0; j < constantes.length; j++) {
      if (i === j) continue
      if (usaPertence) candidatas.push(`${constantes[i]} ∈ ${constantes[j]}`)
      if (i < j) candidatas.push(`${constantes[i]} = ${constantes[j]}`)
    }
  const pequeno = { ...op, N: Math.min(op.N, 4) }
  /** sem modelo até N (triado antes no tamanho pequeno: com modelo lá, já não decide) */
  const semModelo = (fs: Formula[]) => buscarModelo(fs, pequeno).status === 'sem-modelo' && buscarModelo(fs, op).status === 'sem-modelo'
  let testadas = 0
  for (const base of candidatas) {
    for (const texto of [base, `¬${base}`]) {
      if (testadas++ >= MAX_CANDIDATAS) break
      const [l] = analisar([texto], dicionario)
      if (!l) continue
      // observar a própria tese (ou o contrário dela) não ensina nada
      const forma = canonica(l.original)
      if (forma === canonica(phi.original) || forma === canonica(nao(phi.original))) continue
      // observável: as leis permitem
      if (buscarModelo([...premissas, l.expandida], pequeno).status !== 'modelo') continue
      if (obs.filter((o) => o.efeito === 'confirma').length < MAX_POR_EFEITO && semModelo([...premissas, l.expandida, nao(phi.expandida)]))
        obs.push({ efeito: 'confirma', formula: texto, texto: `observar ${texto}: com as leis, a tese passa a seguir` })
      else if (obs.filter((o) => o.efeito === 'refuta').length < MAX_POR_EFEITO && semModelo([...premissas, l.expandida, phi.expandida]))
        obs.push({ efeito: 'refuta', formula: texto, texto: `observar ${texto}: com as leis, a tese cai` })
    }
  }

  // tese universal: o objeto que a derrubaria (do cenário em que ela falha)
  const f = phi.original
  if (f.k === 'forall' && contra) {
    const av = new Avaliador(contra.modelo)
    const v: Termo = { k: 'nome', nome: f.v, pos: 0, end: 0 }
    // ∀x∈S φ: o objeto tem de estar em S
    const noDominio = (x: number) => !f.dom || av.avaliar({ k: 'rel', op: '∈', l: v, r: f.dom, pos: 0, end: 0 }, new Map([[f.v, x]]))
    const d = av.D.find((x) => noDominio(x) && !av.avaliar(f.corpo, new Map([[f.v, x]])))
    if (d !== undefined) {
      const tracos = predicados
        .filter(([, ar]) => ar === 1)
        .map(([p]) => {
          const atomo: Formula = { k: 'pred', nome: p, args: [{ k: 'nome', nome: f.v, pos: 0, end: 0 }], pos: 0, end: 0 }
          return av.avaliar(atomo, new Map([[f.v, d]])) ? p : `¬${p}`
        })
      obs.push({
        efeito: 'refuta',
        texto: tracos.length
          ? `achar um objeto com ${tracos.join(' e ')}: um só basta para derrubar a tese (confirmá-la por observação não dá — seria preciso olhar todos)`
          : `achar um objeto em que ${imprimir(f.corpo)} falhe: um só basta para derrubar a tese`,
      })
    }
  }
  // tese existencial: um exemplo basta
  if (f.k === 'exists') obs.push({ efeito: 'confirma', texto: `achar um exemplo: algo que satisfaça ${imprimir(f.corpo)} — um só basta para confirmar a tese` })
  return obs
}
