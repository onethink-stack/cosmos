// Teorias formais clássicas, prontas para carregar no caderno: leis
// (axiomas) e teoremas conhecidos, que o motor confere. Servem de base
// formal para bater as suas leis contra elas (o segundo modelo faz isso
// sozinho, se a pasta da teoria for escolhida junto com a sua).

import type { EntradaDicionario, Nota } from './tipos'
import { notaVazia } from './estado'

export interface Teoria {
  id: string
  nome: string
  descricao: string
  fichas: Omit<EntradaDicionario, 'id'>[]
  leis: { titulo: string; formula: string }[]
  teoremas: { titulo: string; formula: string }[]
}

const pred = (simbolo: string, aridade: number, termo: string, definicao: string): Omit<EntradaDicionario, 'id'> => ({
  simbolo,
  termo,
  tipo: 'predicado',
  aridade,
  definicao,
})

export const TEORIAS: Teoria[] = [
  {
    id: 'mereologia',
    nome: 'Mereologia (partes e todos)',
    descricao:
      'A teoria formal de partes e todos (mereologia clássica, fragmento de primeira ordem): parte de, sobreposição, parte própria e suplementação. Boa base para conferir uma teoria do todo e das partes.',
    fichas: [
      pred('ParteDe', 2, 'parte de', 'ParteDe(x, y): x é parte de y (inclusive x = y).'),
      pred('Sobrepoe', 2, 'sobrepõe', 'Sobrepoe(x, y): x e y têm alguma parte em comum.'),
      pred('ParteProp', 2, 'parte própria', 'ParteProp(x, y): x é parte de y e diferente de y.'),
    ],
    leis: [
      { titulo: 'M1 — Tudo é parte de si mesmo', formula: '∀x ParteDe(x, x)' },
      { titulo: 'M2 — Antissimetria', formula: '∀x ∀y (ParteDe(x, y) ∧ ParteDe(y, x) ⟹ x = y)' },
      { titulo: 'M3 — Transitividade', formula: '∀x ∀y ∀z (ParteDe(x, y) ∧ ParteDe(y, z) ⟹ ParteDe(x, z))' },
      { titulo: 'D1 — Sobreposição: ter parte em comum', formula: '∀x ∀y (Sobrepoe(x, y) ⟺ ∃z (ParteDe(z, x) ∧ ParteDe(z, y)))' },
      { titulo: 'D2 — Parte própria', formula: '∀x ∀y (ParteProp(x, y) ⟺ ParteDe(x, y) ∧ x ≠ y)' },
      {
        titulo: 'M4 — Suplementação fraca: o todo tem algo além da parte própria',
        formula: '∀x ∀y (ParteProp(x, y) ⟹ ∃z (ParteDe(z, y) ∧ ¬Sobrepoe(z, x)))',
      },
    ],
    teoremas: [
      { titulo: 'Sobreposição é simétrica', formula: '∀x ∀y (Sobrepoe(x, y) ⟹ Sobrepoe(y, x))' },
      { titulo: 'Tudo se sobrepõe a si mesmo', formula: '∀x Sobrepoe(x, x)' },
      { titulo: 'Parte própria é assimétrica', formula: '∀x ∀y (ParteProp(x, y) ⟹ ¬ParteProp(y, x))' },
      { titulo: 'Parte própria é transitiva', formula: '∀x ∀y ∀z (ParteProp(x, y) ∧ ParteProp(y, z) ⟹ ParteProp(x, z))' },
      {
        titulo: 'Quem tem uma parte própria tem outra, separada dela',
        formula: '∀x ∀y (ParteProp(x, y) ⟹ ∃z (ParteProp(z, y) ∧ ¬Sobrepoe(z, x)))',
      },
    ],
  },
  {
    id: 'ordem',
    nome: 'Ordem parcial',
    descricao: 'Reflexiva, antissimétrica e transitiva (como "≤" ou "está contido em").',
    fichas: [pred('Precede', 2, 'precede', 'Precede(x, y): x vem antes de y ou é igual (ordem parcial).')],
    leis: [
      { titulo: 'O1 — Reflexiva', formula: '∀x Precede(x, x)' },
      { titulo: 'O2 — Antissimétrica', formula: '∀x ∀y (Precede(x, y) ∧ Precede(y, x) ⟹ x = y)' },
      { titulo: 'O3 — Transitiva', formula: '∀x ∀y ∀z (Precede(x, y) ∧ Precede(y, z) ⟹ Precede(x, z))' },
    ],
    teoremas: [
      { titulo: 'Um ciclo de três é um ponto só', formula: '∀x ∀y ∀z (Precede(x, y) ∧ Precede(y, z) ∧ Precede(z, x) ⟹ x = z)' },
      { titulo: 'Não há ordem total garantida', formula: '∀x ∀y (Precede(x, y) ∨ Precede(y, x))' },
    ],
  },
  {
    id: 'ordem-estrita',
    nome: 'Ordem estrita',
    descricao: 'Irreflexiva e transitiva (como "<" ou "vem antes no tempo").',
    fichas: [pred('Antes', 2, 'antes de', 'Antes(x, y): x vem estritamente antes de y.')],
    leis: [
      { titulo: 'E1 — Nada vem antes de si', formula: '∀x ¬Antes(x, x)' },
      { titulo: 'E2 — Transitiva', formula: '∀x ∀y ∀z (Antes(x, y) ∧ Antes(y, z) ⟹ Antes(x, z))' },
    ],
    teoremas: [
      { titulo: 'Assimétrica', formula: '∀x ∀y (Antes(x, y) ⟹ ¬Antes(y, x))' },
      { titulo: 'Sem ciclos de três', formula: '∀x ∀y ∀z ¬(Antes(x, y) ∧ Antes(y, z) ∧ Antes(z, x))' },
    ],
  },
  {
    id: 'equivalencia',
    nome: 'Relação de equivalência',
    descricao: 'Reflexiva, simétrica e transitiva (como "tem a mesma forma que").',
    fichas: [pred('Equiv', 2, 'equivalente a', 'Equiv(x, y): x e y são da mesma classe.')],
    leis: [
      { titulo: 'Q1 — Reflexiva', formula: '∀x Equiv(x, x)' },
      { titulo: 'Q2 — Simétrica', formula: '∀x ∀y (Equiv(x, y) ⟹ Equiv(y, x))' },
      { titulo: 'Q3 — Transitiva', formula: '∀x ∀y ∀z (Equiv(x, y) ∧ Equiv(y, z) ⟹ Equiv(x, z))' },
    ],
    teoremas: [
      { titulo: 'Euclidiana', formula: '∀x ∀y ∀z (Equiv(x, y) ∧ Equiv(x, z) ⟹ Equiv(y, z))' },
      { titulo: 'Classes iguais ou separadas', formula: '∀x ∀y (∃z (Equiv(x, z) ∧ Equiv(y, z)) ⟹ Equiv(x, y))' },
    ],
  },
  {
    id: 'grupos',
    nome: 'Teoria de grupos',
    descricao: 'Uma operação associativa com elemento neutro e inversos (a álgebra das simetrias).',
    fichas: [
      { simbolo: 'op', termo: 'operação do grupo', tipo: 'funcao', aridade: 2, definicao: 'op(x, y): x combinado com y.' },
      { simbolo: 'inv', termo: 'inverso', tipo: 'funcao', aridade: 1, definicao: 'inv(x): o inverso de x.' },
      { simbolo: 'neutro', termo: 'elemento neutro', tipo: 'constante', aridade: 0, definicao: 'O elemento neutro do grupo.' },
    ],
    leis: [
      { titulo: 'G1 — Associatividade', formula: '∀x ∀y ∀z (op(op(x, y), z) = op(x, op(y, z)))' },
      { titulo: 'G2 — Neutro', formula: '∀x (op(neutro, x) = x ∧ op(x, neutro) = x)' },
      { titulo: 'G3 — Inverso', formula: '∀x (op(inv(x), x) = neutro ∧ op(x, inv(x)) = neutro)' },
    ],
    teoremas: [
      { titulo: 'O neutro é único', formula: '∀e (∀x (op(e, x) = x) ⟹ e = neutro)' },
      { titulo: 'Cancelamento', formula: '∀x ∀y ∀z (op(x, y) = op(x, z) ⟹ y = z)' },
      { titulo: 'O inverso do inverso', formula: '∀x (inv(inv(x)) = x)' },
      // até 5 elementos todo grupo é comutativo: o motor só acha o contraexemplo a partir de 6 objetos
      { titulo: 'Todo grupo é comutativo? (não: o menor contraexemplo tem 6 elementos)', formula: '∀x ∀y (op(x, y) = op(y, x))' },
    ],
  },
  {
    id: 'conjuntos',
    nome: 'Conjuntos: extensionalidade',
    descricao: 'Conjuntos com os mesmos elementos são o mesmo conjunto (com ∈, ⊆ e ∅ da própria linguagem).',
    fichas: [],
    leis: [{ titulo: 'Extensionalidade', formula: '∀s ∀t ((∀z (z ∈ s ⟺ z ∈ t)) ⟹ s = t)' }],
    teoremas: [
      { titulo: 'O vazio é único', formula: '∀s ((∀x (x ∉ s)) ⟹ s = ∅)' },
      { titulo: 'Inclusão nos dois sentidos é igualdade', formula: '∀s ∀t (s ⊆ t ∧ t ⊆ s ⟹ s = t)' },
      { titulo: 'O vazio está contido em tudo', formula: '∀s (∅ ⊆ s)' },
    ],
  },
]

/**
 * As notas e fichas de uma teoria. Os ids são fixos: carregar de novo
 * atualiza, não duplica. Um símbolo que já existe com outro sentido ganha um
 * sufixo (e as fórmulas são trocadas junto).
 */
export function notasDaTeoria(t: Teoria, dicionario: EntradaDicionario[]): { fichas: EntradaDicionario[]; notas: Nota[] } {
  const troca = new Map<string, string>()
  const usados = new Map(dicionario.map((e) => [e.simbolo, e]))
  const fichas: EntradaDicionario[] = []
  for (const f of t.fichas) {
    const e = usados.get(f.simbolo)
    if (e && e.tipo === f.tipo && e.aridade === f.aridade) continue // já existe igual: usa a mesma
    let s = f.simbolo
    if (e) {
      let i = 2
      while (usados.has(`${f.simbolo}${i}`)) i++
      s = `${f.simbolo}${i}`
      troca.set(f.simbolo, s)
    }
    const nova = { ...f, simbolo: s, id: '' }
    fichas.push(nova)
    usados.set(s, nova)
  }
  const palavra = (de: string) => new RegExp(`(?<![\\p{L}\\p{N}])${de}(?![\\p{L}\\p{N}])`, 'gu')
  const trocar = (formula: string) => {
    let r = [...troca].reduce((acc, [de, para]) => acc.replace(palavra(de), para), formula)
    // variáveis com o nome de um símbolo do dicionário viram outras (senão seria quantificar uma constante)
    for (const v of new Set([...r.matchAll(/[∀∃]([\p{L}][\p{L}\p{N}]*)/gu)].map((m) => m[1])))
      if (usados.has(v)) {
        let i = 1
        while (usados.has(`${v}${i}`) || palavra(`${v}${i}`).test(r)) i++
        r = r.replace(palavra(v), `${v}${i}`)
      }
    return r
  }
  const agora = new Date().toISOString()
  const nota = (k: number, compartimento: 'lei' | 'teorema', titulo: string, formula: string): Nota => ({
    ...notaVazia(compartimento),
    id: `teoria-${t.id}-${k}`,
    titulo,
    formulas: [trocar(formula)],
    tags: [`teoria-${t.id}`, 'teoria'],
    fonte: 'Teoria clássica (biblioteca do Caderno Lógico)',
    texto: t.descricao,
    criadaEm: agora,
    atualizadaEm: agora,
  })
  return {
    fichas,
    notas: [...t.leis.map((l, k) => nota(k, 'lei', l.titulo, l.formula)), ...t.teoremas.map((x, k) => nota(100 + k, 'teorema', x.titulo, x.formula))],
  }
}
