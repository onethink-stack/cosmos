import { describe, expect, it } from 'vitest'
import { MODELOS, TREINOS, type CasoTreino } from '../src/dados/cacadaTreinos'
import { examinarPromessa, examinarTudo, hipotese, type RespostaCacada } from '../src/motor/cacada'
import { analisar, OPCOES_PADRAO, type Grupo } from '../src/motor/motor'
import { imprimir } from '../src/logica/impressao'
import { alvoSaneado, lerPacoteDeAlvos, mesclarAlvos, pacoteDeAlvos } from '../src/dados/cacadaArquivo'
import { esqueletoFoundry, rascunhoRelatorio, type Achado, type Alvo } from '../src/dados/cacada'

const op = { ...OPCOES_PADRAO, N: 6 }
const grupos = (rs: { id: string; titulo: string; formula: string }[]): Grupo[] => rs.map((r) => ({ id: r.id, rotulo: r.titulo, formulas: [r.formula] }))
const corrigidas = (c: CasoTreino) => [...c.regras.filter((r) => r.id !== c.correcao.substitui), c.correcao]

describe('caçar falhas: casos reais', () => {
  for (const c of TREINOS)
    it(`${c.nome}: fura com as regras de antes e vale com a correção`, () => {
      for (const r of [...c.regras, c.correcao, { formula: c.promessa.formula }]) expect(analisar([r.formula], []), r.formula).toHaveLength(1)
      const antes = examinarPromessa(grupos(c.regras), c.promessa.formula, op)
      expect(antes.tipo).toBe('fura')
      const depois = examinarPromessa(grupos(corrigidas(c)), c.promessa.formula, op)
      expect(depois.tipo).toBe('vale')
      if (depois.tipo !== 'vale') return
      // vale de verdade (o que a promessa supõe pode acontecer), e a correção é uma das regras que a sustentam
      // (sem ela, a promessa fura de novo)
      expect(depois.vazia).toBeUndefined()
      expect(depois.sustentam.map((s) => s.id)).toContain(c.correcao.id)
      // sem cada regra que sustenta, a promessa fura (e o cenário vem junto)
      for (const s of depois.sustentam) expect(s.semEla, s.id).toBeDefined()
    })
})

describe('caçar falhas: modelo inicial da LayerZero', () => {
  const m = MODELOS.find((x) => x.id === 'layerzero-recebimento')!
  const regras = grupos(m.regras)
  const promessa = (id: string) => m.promessas.find((p) => p.id === id)!.formula

  it('as fórmulas são válidas', () => {
    for (const f of [...m.regras.map((r) => r.formula), ...m.promessas.map((p) => p.formula)]) expect(analisar([f], []), f).toHaveLength(1)
  })

  it('entrega no máximo uma vez: vale, apoiada na hipótese do hash e na checagem do lzReceive', () => {
    const r = examinarPromessa(regras, promessa('lz-uma-vez'), op)
    expect(r.tipo).toBe('vale')
    if (r.tipo === 'vale') expect(r.sustentam.map((s) => s.id).sort()).toEqual(['lz-hash', 'lz-receber'])
  }, 60_000)

  it('a promessa ingênua fura: uma lacuna antes da mensagem verificada trava a entrega (comportamento documentado)', () => {
    const r = examinarPromessa(regras, promessa('lz-entregavel'), op)
    expect(r.tipo).toBe('fura')
  }, 60_000)
})

describe('caçar falhas: o exame', () => {
  const regras = grupos([
    { id: 'a', titulo: 'depósito válido fica guardado', formula: '∀x (Valido(x) ⟹ Guardado(x))' },
    { id: 'b', titulo: 'guardado pode ser sacado', formula: '∀x (Guardado(x) ⟹ Sacavel(x))' },
  ])

  it('a promessa que segue aponta as regras que a sustentam', () => {
    const r = examinarPromessa(regras, '∀x (Valido(x) ⟹ Sacavel(x))', op)
    expect(r).toMatchObject({ tipo: 'vale' })
    if (r.tipo === 'vale') expect(r.sustentam.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('uma regra que outra já cobre não sustenta sozinha (sem ela a promessa continua valendo)', () => {
    const comRepetida = [...regras, { id: 'a2', rotulo: 'a mesma coisa, dita de outro jeito', formulas: ['∀x (¬Guardado(x) ⟹ ¬Valido(x))'] }]
    const r = examinarPromessa(comRepetida, '∀x (Valido(x) ⟹ Sacavel(x))', op)
    expect(r).toMatchObject({ tipo: 'vale' })
    if (r.tipo === 'vale') expect(r.sustentam.map((s) => s.id)).toEqual(['b'])
  })

  it('a promessa que não segue mostra o cenário em que fura', () => {
    const r = examinarPromessa(regras, '∀x (Guardado(x) ⟹ Valido(x))', op)
    expect(r.tipo).toBe('fura')
    if (r.tipo === 'fura') expect(r.mundo.passos.valor).toBe(false)
  })

  it('avisa quando a promessa só vale porque o que ela supõe nunca acontece', () => {
    const r = examinarPromessa(grupos([{ id: 'c', titulo: 'nada é válido', formula: '∀x ¬Valido(x)' }]), '∀x (Valido(x) ⟹ Sacavel(x))', op)
    expect(r).toMatchObject({ tipo: 'vale', vazia: '∃x Valido(x)' })
  })

  it('regras que se contradizem não provam nada', () => {
    const r = examinarPromessa(grupos([{ id: 'd', titulo: 'p e não p', formula: 'P(a) ∧ ¬P(a)' }]), 'Q(a)', op)
    expect(r.tipo).toBe('regras-contraditorias')
  })

  it('o que a promessa supõe: tira os "para todo" e fica com a hipótese', () => {
    const f = analisar(['∀x ∀y (R(x, y) ∧ P(x) ⟹ Q(y))'], [])[0].expandida
    expect(imprimir(hipotese(f)!)).toBe('∃x ∃y (R(x, y) ∧ P(x))')
    expect(hipotese(analisar(['∀x P(x)'], [])[0].expandida)).toBeNull()
  })

  it('manda um exame por promessa e depois o fim', () => {
    const msgs: RespostaCacada[] = []
    examinarTudo(
      {
        id: 7,
        regras,
        promessas: [
          { id: 'p1', formula: '∀x (Valido(x) ⟹ Sacavel(x))' },
          { id: 'p2', formula: '∀x (Sacavel(x) ⟹ Valido(x))' },
        ],
        opcoes: op,
        prazoMs: 30_000,
      },
      (m) => msgs.push(m),
    )
    const exames = msgs.filter((m) => m.tipo === 'exame')
    expect(exames.map((m) => m.tipo === 'exame' && [m.promessaId, m.exame.tipo])).toEqual([
      ['p1', 'vale'],
      ['p2', 'fura'],
    ])
    expect(msgs.at(-1)).toEqual({ id: 7, tipo: 'fim' })
  })
})

describe('caçar falhas: modelo inicial da Axelar', () => {
  const m = MODELOS.find((x) => x.id === 'axelar-gateway')!
  const regras = grupos(m.regras)
  const promessa = (id: string) => m.promessas.find((p) => p.id === id)!.formula

  it('as fórmulas são válidas', () => {
    for (const f of [...m.regras.map((r) => r.formula), ...m.promessas.map((p) => p.formula)]) expect(analisar([f], []), f).toHaveLength(1)
  })

  it('uma aprovação consumida não volta: vale, e a chave incluir o commandId é uma das regras que sustentam', () => {
    const r = examinarPromessa(regras, promessa('ax-consumida'), op)
    expect(r.tipo).toBe('vale')
    if (r.tipo === 'vale') expect(r.sustentam.map((s) => s.id)).toContain('ax-chave')
  }, 60_000)

  it('entregue no máximo uma vez: vale; a ingênua fura', () => {
    expect(examinarPromessa(regras, promessa('ax-uma-vez'), op).tipo).toBe('vale')
    expect(examinarPromessa(regras, promessa('ax-ingenua'), op).tipo).toBe('fura')
  }, 60_000)
})

describe('caçar falhas: vários aparelhos', () => {
  const alvo = (id: string, quando: string, achados: string[] = [], nome = id): Alvo => ({
    id,
    nome,
    programa: '',
    escopo: '',
    regras: [{ id: 'r', titulo: '', formula: 'P(a)', fonte: '', ativa: true }],
    promessas: [{ id: 'p', titulo: '', citacao: '', formula: 'Q(a)', fonte: '' }],
    achados: achados.map(
      (x, i): Achado => ({
        id: x,
        promessaId: 'p',
        quando: i,
        promessa: 'Q(a)',
        regras: [],
        mundo: { n: 1, modelo: { n: 1, mundos: 1, constantes: [], funcoes: [], predicados: [], pertence: [], acessos: [] }, passos: { formula: 'Q(a)', valor: false, motivo: '', filhos: [], mundo: 0 } },
        estado: 'pista',
        anotacao: '',
        poc: '',
      }),
    ),
    criadoEm: quando,
    atualizadoEm: quando,
  })

  it('um alvo novo entra; o mesmo alvo fica com a versão mais nova e os achados se somam', () => {
    const aqui = [alvo('a', '2026-10-01', ['x1'], 'antigo'), alvo('b', '2026-10-05')]
    const deFora = [alvo('a', '2026-10-09', ['x2'], 'novo'), alvo('c', '2026-10-02', ['y'])]
    const m = mesclarAlvos(aqui, deFora)
    expect(m).toMatchObject({ novos: 1, atualizados: 1, achadosNovos: 2 })
    const a = m.alvos.find((x) => x.id === 'a')!
    expect(a.nome).toBe('novo')
    expect(a.achados.map((x) => x.id).sort()).toEqual(['x1', 'x2'])
    // a versão daqui mais nova fica, mas os achados de fora entram
    const m2 = mesclarAlvos([alvo('a', '2026-10-09', ['x1'], 'aqui')], [alvo('a', '2026-10-01', ['x9'], 'fora')])
    expect(m2.alvos[0].nome).toBe('aqui')
    expect(m2.alvos[0].achados.map((x) => x.id).sort()).toEqual(['x1', 'x9'])
    expect(m2).toMatchObject({ atualizados: 0, achadosNovos: 1 })
  })

  it('lê o arquivo de alvos e um backup do caderno; recusa o resto', () => {
    const pacote = JSON.stringify(pacoteDeAlvos([alvo('a', '2026-10-01')]))
    expect(lerPacoteDeAlvos(pacote)).toMatchObject({ ok: true, ignorados: 0 })
    expect(lerPacoteDeAlvos(JSON.stringify({ app: 'caderno-logico', versao: 1, notas: [], alvos: [alvo('b', 'x'), { nome: 'sem id' }] }))).toMatchObject({
      ok: true,
      ignorados: 1,
    })
    expect(lerPacoteDeAlvos('{').ok).toBe(false)
    expect(lerPacoteDeAlvos('{"app":"outro","alvos":[]}').ok).toBe(false)
  })

  it('itens malformados ficam de fora, o resto do alvo entra', () => {
    const a = alvoSaneado({ ...alvo('a', 'x', ['ok']), regras: [{ id: 'r', formula: 'P(a)' }, { titulo: 'sem fórmula' }], achados: [{ id: 'quebrado' }] })!
    expect(a.regras).toEqual([{ id: 'r', titulo: '', formula: 'P(a)', fonte: '', ativa: true }])
    expect(a.achados).toEqual([])
    expect(alvoSaneado({ nome: 'sem id' })).toBeNull()
  })
})

describe('caçar falhas: do achado ao teste e ao relatório', () => {
  it('o esqueleto do teste e o relatório trazem o cenário, as regras e a promessa', () => {
    const c = TREINOS.find((t) => t.id === 'nomad')!
    const r = examinarPromessa(grupos(c.regras), c.promessa.formula, op)
    if (r.tipo !== 'fura') throw new Error('o Nomad deveria furar')
    const a: Alvo = {
      id: 'a',
      nome: 'Nomad',
      programa: 'https://exemplo',
      escopo: '',
      regras: c.regras.map((x) => ({ ...x, ativa: true })),
      promessas: [{ id: 'p', titulo: 'Só mensagem provada é processada', citacao: 'Só depois de provada.', formula: c.promessa.formula, fonte: '' }],
      achados: [],
      criadoEm: '',
      atualizadoEm: '',
    }
    const achado: Achado = { id: 'x', promessaId: 'p', quando: 0, promessa: c.promessa.formula, regras: a.regras, mundo: r.mundo, estado: 'pista', anotacao: '', poc: '' }
    const teste = esqueletoFoundry(a, achado)
    expect(teste).toContain('vm.createSelectFork')
    expect(teste).toContain('zero = d')
    expect(teste).toContain(c.promessa.formula)
    const rel = rascunhoRelatorio(a, achado)
    expect(rel).toContain('The documentation states: "Só depois de provada" .'.replace(' .', '.'))
    expect(rel).toContain('## Proof of Concept')
  })
})
