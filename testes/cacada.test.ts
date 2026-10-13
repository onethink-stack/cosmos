import { describe, expect, it } from 'vitest'
import { MODELOS, TREINOS, type CasoTreino } from '../src/dados/cacadaTreinos'
import { examinarPromessa, examinarTudo, hipotese, type RespostaCacada } from '../src/motor/cacada'
import { analisar, OPCOES_PADRAO, type Grupo } from '../src/motor/motor'
import { imprimir } from '../src/logica/impressao'

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
