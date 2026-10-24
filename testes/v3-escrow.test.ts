import { describe, expect, it } from 'vitest'
import { criarSimulacao, travarOferta, liquidarCenario, reembolsarCenario, saldoSimulado, ATORES_DEMO, type CertificadoDeCenario, type EstadoDemo } from '../src/v3/escrowSimulado'
const [autor, provedor] = ATORES_DEMO
const pedido = { id: 'oferta-1', solicitante: autor, valor: 80n, entradas: ['fixture-inicial'], expira: 1000, hashProblema: 'a'.repeat(64) }
const cert: CertificadoDeCenario = { fonte: 'fixture-simulada', oferta: 'oferta-1', provedor, hashProblema: pedido.hashProblema, hashCertificado: 'b'.repeat(64), resultadoSimulado: 'valido' }
const total = (s: EstadoDemo) => s.utxos.reduce((n, u) => n + u.valor, s.queimado)
describe('trava exclusivamente simulada, sem emissão ou transferências reais', () => {
  it('trava, devolve troco e liquida com queima exata e conservação', () => {
    const inicial = criarSimulacao(), travada = travarOferta(inicial, pedido, 0), final = liquidarCenario(travada, cert, 1)
    expect(inicial.ofertas).toHaveLength(0)
    expect(saldoSimulado(travada, autor)).toBe(920n)
    expect(saldoSimulado(final, provedor)).toBe(76n)
    expect(final.queimado).toBe(4n)
    expect(total(final)).toBe(1000n)
  })
  it('recusa gasto duplo, duplicação de entrada e dupla liquidação sem mutação', () => {
    const inicial = criarSimulacao(), travada = travarOferta(inicial, pedido, 0), foto = structuredClone(travada)
    expect(() => travarOferta(inicial, { ...pedido, entradas: ['fixture-inicial', 'fixture-inicial'] }, 0)).toThrow()
    expect(() => travarOferta(travada, { ...pedido, id: 'oferta-2' }, 0)).toThrow(/gasta/)
    expect(travada).toEqual(foto)
    expect(() => liquidarCenario(liquidarCenario(travada, cert, 1), cert, 2)).toThrow(/encerrada/)
  })
  it('recusa auto-pagamento e ator fictício fora da fixture, sem alegar anti-Sybil real', () => {
    const s = travarOferta(criarSimulacao(), pedido, 0)
    expect(() => liquidarCenario(s, { ...cert, provedor: autor }, 1)).toThrow(/Auto-pagamento/)
    expect(() => liquidarCenario(s, { ...cert, provedor: 'conta-inventada' }, 1)).toThrow(/Ator/)
  })
  it('certificado inválido ou de outro problema nunca libera a trava', () => {
    const s = travarOferta(criarSimulacao(), pedido, 0), foto = structuredClone(s)
    expect(() => liquidarCenario(s, { ...cert, resultadoSimulado: 'invalido' }, 1)).toThrow(/Certificado/)
    expect(() => liquidarCenario(s, { ...cert, hashProblema: 'c'.repeat(64) }, 1)).toThrow(/Certificado/)
    expect(s).toEqual(foto)
  })
  it('reembolsa somente após expiração e somente ao solicitante, sem queimar', () => {
    const s = travarOferta(criarSimulacao(), pedido, 0)
    expect(() => reembolsarCenario(s, pedido.id, autor, 999)).toThrow()
    expect(() => reembolsarCenario(s, pedido.id, provedor, 1000)).toThrow()
    expect(() => liquidarCenario(s, cert, 1000)).toThrow(/expirada/)
    const r = reembolsarCenario(s, pedido.id, autor, 1000)
    expect(saldoSimulado(r, autor)).toBe(1000n)
    expect(r.queimado).toBe(0n)
    expect(() => reembolsarCenario(r, pedido.id, autor, 1001)).toThrow()
  })
  it('conluio entre os dois atores não aumenta suas unidades conjuntas neste modelo sem subsídio', () => {
    const s = liquidarCenario(travarOferta(criarSimulacao(), pedido, 0), cert, 1)
    expect(saldoSimulado(s, autor) + saldoSimulado(s, provedor)).toBe(996n)
    expect(total(s)).toBe(s.totalInicial)
  })
  it('limita spam de ofertas e recusa valores, prazos e parâmetros inválidos', () => {
    const inicial = criarSimulacao({ queimaBps: 500, maxOfertas: 1 }), s = travarOferta(inicial, pedido, 0)
    expect(() => travarOferta(s, { ...pedido, id: 'spam', entradas: ['sim-1-troco'] }, 0)).toThrow(/Limite/)
    for (const valor of [0n, -1n, 1001n]) expect(() => travarOferta(inicial, { ...pedido, valor }, 0)).toThrow()
    expect(() => travarOferta(inicial, { ...pedido, expira: Infinity }, 0)).toThrow()
    expect(() => criarSimulacao({ queimaBps: 10001, maxOfertas: 1 })).toThrow()
  })
  it('arredonda somente pela regra inteira explícita e aceita queima de 0 ou 100%', () => {
    for (const [bps, queimado, pagamento] of [[0, 0n, 3n], [3333, 0n, 3n], [10000, 3n, 0n]] as const) {
      const s = liquidarCenario(travarOferta(criarSimulacao({ queimaBps: bps, maxOfertas: 1 }), { ...pedido, valor: 3n }, 0), cert, 1)
      expect(s.queimado).toBe(queimado); expect(saldoSimulado(s, provedor)).toBe(pagamento); expect(total(s)).toBe(1000n)
    }
  })
})
