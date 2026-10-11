import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { biblioteca, conversa, notasDaBiblioteca, notasDoProblema, operadoresDoCaderno, pastaDoProblema, procurar, procurarProblemas } from '../src/dados/biblioteca'
import { notaVazia } from '../src/dados/estado'
import type { EntradaDicionario } from '../src/dados/tipos'
import { validar } from '../src/logica/validador'
import { OPCOES_PADRAO, perguntar } from '../src/motor/motor'

const linhas = [
  { tipo: 'cabecalho', formato: 'biblioteca-tptp', versao: 1, teorias: 3 },
  {
    tipo: 'teoria',
    id: 'SET999+0',
    pasta: 'raiz',
    dominio: 'Set Theory',
    descricao: 'Naive set theory',
    formulas: [
      { nome: 'subset_def', papel: 'axiom', texto: '∀a ∀b ((subset(a, b) ⟺ ∀x ((member(x, a) ⟹ member(x, b)))))' },
      { nome: 'reflexivo', papel: 'conjecture', texto: '∀a (subset(a, a))' },
    ],
    fichas: [
      { simbolo: 'subset', termo: 'subset', tipo: 'predicado', aridade: 2 },
      { simbolo: 'member', termo: 'member', tipo: 'predicado', aridade: 2 },
    ],
    avisos: 0,
  },
  {
    tipo: 'teoria',
    id: 'GRP999-0',
    pasta: 'raiz',
    dominio: 'Group Theory',
    descricao: 'Group axioms',
    formulas: [{ nome: 'assoc', papel: 'axiom', texto: '∀x ∀y ∀z ((multiply(multiply(x, y), z) = multiply(x, multiply(y, z))))' }],
    fichas: [{ simbolo: 'multiply', termo: 'multiply', tipo: 'funcao', aridade: 2 }],
    avisos: 0,
  },
  { tipo: 'teoria', id: 'BIO999+0', pasta: 'raiz', dominio: 'Biology', descricao: 'huge ontology', formulas: [], fichas: [], avisos: 0, grande: 9160 },
]
/** o pacote compactado como o montador grava (gzip) */
const pacote = async () => {
  const texto = new Blob([linhas.map((l) => JSON.stringify(l)).join('\n')])
  const gz = await new Response(texto.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  return new File([gz], 'biblioteca-tptp.jsonl.gz')
}

describe('biblioteca TPTP no aparelho', () => {
  it('abre o pacote compactado e guarda o catálogo e as teorias', async () => {
    await biblioteca.abrirPacote(await pacote())
    expect(biblioteca.catalogo.map((t) => t.id).sort()).toEqual(['BIO999+0', 'GRP999-0', 'SET999+0'])
    expect(biblioteca.catalogo.find((t) => t.id === 'BIO999+0')!.nFormulas).toBe(9160)
    expect((await biblioteca.teoria('SET999+0'))!.formulas.length).toBe(2)
  })

  it('procura por área, nome ou símbolo', async () => {
    const cat = biblioteca.catalogo
    expect(procurar(cat, 'member', null).map((t) => t.id)).toEqual(['SET999+0'])
    expect(procurar(cat, '', 'Group Theory').map((t) => t.id)).toEqual(['GRP999-0'])
    expect(procurar(cat, 'naive set', null).map((t) => t.id)).toEqual(['SET999+0'])
  })

  it('diz o que conversa com o caderno e cria a ponte member ↔ ∈', async () => {
    const notas = [{ ...notaVazia('lei'), id: 'n', formulas: ['∀x (x ∈ A)'] }]
    const ops = operadoresDoCaderno(notas)
    const set = biblioteca.catalogo.find((t) => t.id === 'SET999+0')!
    expect(conversa(set, [], ops).pontes).toEqual(['member ↔ ∈'])
    const t = (await biblioteca.teoria('SET999+0'))!
    const { fichas, notas: novas } = notasDaBiblioteca(t, [], ops)
    const ponte = novas.find((n) => n.tags.includes('ponte'))!
    expect(ponte.formulas[0]).toBe('∀x ∀y (member(x, y) ⟺ x ∈ y)')
    expect(ponte.grau).toBe('D')
    const dic = fichas.map((e) => ({ ...e, id: e.simbolo }))
    for (const n of novas) expect(validar(n.formulas[0], dic).ok, n.formulas[0]).toBe(true)
    // a conjectura da teoria segue dos axiomas dela
    const leis = novas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    const conj = novas.find((n) => n.compartimento === 'teorema')!
    expect(perguntar(leis, conj.formulas[0], dic, { ...OPCOES_PADRAO, N: 4 }).tipo).toBe('segue')
  })

  it('um símbolo do caderno com outro sentido faz o da teoria ganhar sufixo', async () => {
    const dic: EntradaDicionario[] = [{ id: 'm', simbolo: 'member', termo: 'membro do clube', tipo: 'predicado', aridade: 1, definicao: '' }]
    const { fichas, notas } = notasDaBiblioteca((await biblioteca.teoria('SET999+0'))!, dic, new Set())
    expect(fichas.map((f) => f.simbolo)).toContain('member2')
    expect(notas[0].formulas[0]).toContain('member2(x, a)')
  })

  it('abre o pacote dos problemas sem apagar as teorias, e procura pelo que se sabe', async () => {
    const problemas = [
      { tipo: 'cabecalho', formato: 'problemas-tptp', versao: 1, problemas: 2 },
      {
        tipo: 'problema',
        id: 'SET998+1',
        dominio: 'Set Theory',
        titulo: 'Subsets both ways have the same members',
        ingles: '',
        status: 'Theorem',
        sabe: 'segue',
        dificuldade: 0.1,
        inclui: [{ id: 'SET999+0', so: ['subset_def'] }],
        formulas: [{ nome: 'mesmos', papel: 'conjecture', texto: '∀a ∀b (((subset(a, b) ∧ subset(b, a)) ⟹ ∀x ((member(x, a) ⟺ member(x, b)))))' }],
        fichas: [],
        nFormulas: 2,
      },
      { tipo: 'problema', id: 'XYZ001+1', dominio: 'Outra', titulo: 'x', ingles: '', status: 'Open', sabe: 'aberto', dificuldade: null, inclui: [{ id: 'XYZ000+0' }], formulas: [], fichas: [], nFormulas: 1 },
    ]
    const gz = await new Response(new Blob([problemas.map((l) => JSON.stringify(l)).join('\n')]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
    expect(await biblioteca.abrirPacote(new File([gz], 'problemas-tptp.jsonl.gz'))).toBe('problemas-tptp')
    expect(biblioteca.catalogo.length).toBe(3)
    expect(biblioteca.problemas.map((p) => p.id).sort()).toEqual(['SET998+1', 'XYZ001+1'])
    expect(procurarProblemas(biblioteca.problemas, '', null, 'segue').map((p) => p.id)).toEqual(['SET998+1'])
    expect(procurarProblemas(biblioteca.problemas, 'both ways', null, null).map((p) => p.id)).toEqual(['SET998+1'])
  })

  it('carrega o problema com as fórmulas escolhidas da teoria incluída; a conjectura leva o que se sabe', async () => {
    const p = (await biblioteca.problema('SET998+1'))!
    const { fichas, notas, faltam } = await notasDoProblema(p, [], new Set())
    expect(faltam).toEqual([])
    // da SET999+0 só entra a subset_def (o problema escolheu), não a conjectura dela
    expect(notas.map((n) => n.titulo)).toEqual(['subset_def (SET998+1)', 'mesmos (SET998+1)'])
    expect(notas.every((n) => n.tags.includes(pastaDoProblema('SET998+1')))).toBe(true)
    const conj = notas.find((n) => n.compartimento === 'teorema')!
    expect(conj.tags).toContain('tptp-sabe-segue')
    expect(conj.texto).toContain('os provadores provaram')
    const dic = fichas.map((e) => ({ ...e, id: e.simbolo }))
    const leis = notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    expect(perguntar(leis, conj.formulas[0], dic, { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('segue')
    // a teoria incluída precisa estar no aparelho
    expect((await notasDoProblema((await biblioteca.problema('XYZ001+1'))!, [], new Set())).faltam).toEqual(['XYZ000+0'])
  })

  it('recusa um arquivo que não é pacote', async () => {
    const outro = new File([JSON.stringify({ tipo: 'cabecalho', formato: 'outra-coisa' })], 'x.jsonl')
    await expect(biblioteca.abrirPacote(outro)).rejects.toThrow('não é um pacote')
  })
})
