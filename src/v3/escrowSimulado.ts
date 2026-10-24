/** Máquina de estados de TESTE, em memória. Não é consenso, carteira ou contrato
 * de rede. Não recebe chaves, não emite moeda e não valida certificados reais.
 */
export const ATORES_DEMO = ['demo:solicitante', 'demo:provedor', 'demo:terceiro'] as const
const HEX = /^[a-f0-9]{64}$/
export interface ParametrosDemo { queimaBps: number; maxOfertas: number }
export interface UtxoDemo { id: string; dono: string; valor: bigint; trava: string | null }
export interface OfertaDemo {
  id: string; solicitante: string; valor: bigint; expira: number; hashProblema: string
  queimaBps: number; estado: 'aberta' | 'liquidada' | 'reembolsada'
}
export interface EventoDemo { id: number; tipo: 'trava' | 'liquidacao' | 'reembolso'; oferta: string; destino: string; valor: bigint; queima: bigint }
export interface EstadoDemo { parametros: ParametrosDemo; utxos: UtxoDemo[]; ofertas: OfertaDemo[]; eventos: EventoDemo[]; queimado: bigint; totalInicial: bigint }
/** O resultado de fixture é explícito: nunca confundir com uma resposta Carcara. */
export interface CertificadoDeCenario {
  fonte: 'fixture-simulada'; oferta: string; provedor: string; hashProblema: string
  hashCertificado: string; resultadoSimulado: 'valido' | 'invalido'
}
const instante = (n: number) => { if (!Number.isSafeInteger(n) || n < 0) throw new Error('Instante de teste inválido') }
const ator = (id: string) => { if (!(ATORES_DEMO as readonly string[]).includes(id)) throw new Error('Ator não reconhecido no cenário de teste') }
function conferir(s: EstadoDemo): void {
  if (!Number.isInteger(s.parametros.queimaBps) || s.parametros.queimaBps < 0 || s.parametros.queimaBps > 10000) throw new Error('Queima deve estar entre 0 e 10000 pontos-base')
  if (!Number.isInteger(s.parametros.maxOfertas) || s.parametros.maxOfertas < 1 || s.parametros.maxOfertas > 100) throw new Error('Limite de ofertas inválido')
  if (new Set(s.utxos.map(u => u.id)).size !== s.utxos.length || new Set(s.ofertas.map(o => o.id)).size !== s.ofertas.length) throw new Error('Identificador duplicado no estado')
  if (s.utxos.some(u => typeof u.valor !== 'bigint' || u.valor <= 0n) || s.queimado < 0n) throw new Error('Unidades inválidas')
  if (s.utxos.reduce((n, u) => n + u.valor, s.queimado) !== s.totalInicial) throw new Error('Conservação das unidades violada')
  for (const o of s.ofertas) {
    const travas = s.utxos.filter(u => u.trava === o.id)
    if (o.estado === 'aberta' ? travas.length !== 1 || travas[0].valor !== o.valor || travas[0].dono !== o.solicitante : travas.length !== 0) throw new Error('Trava divergente da oferta')
  }
  if (s.utxos.some(u => u.trava !== null && !s.ofertas.some(o => o.id === u.trava && o.estado === 'aberta'))) throw new Error('Trava sem oferta')
}
const copiar = (s: EstadoDemo): EstadoDemo => ({ ...s, parametros: { ...s.parametros }, utxos: s.utxos.map(u => ({ ...u })), ofertas: s.ofertas.map(o => ({ ...o })), eventos: [...s.eventos] })
export function criarSimulacao(parametros: ParametrosDemo = { queimaBps: 500, maxOfertas: 20 }): EstadoDemo {
  // Fixture reiniciável, sem correspondência com emissão, saldo ou ativo externo.
  const s: EstadoDemo = { parametros: { ...parametros }, utxos: [{ id: 'fixture-inicial', dono: ATORES_DEMO[0], valor: 1000n, trava: null }], ofertas: [], eventos: [], queimado: 0n, totalInicial: 1000n }
  conferir(s); return s
}
export const saldoSimulado = (s: EstadoDemo, dono: string): bigint => s.utxos.filter(u => u.dono === dono && u.trava === null).reduce((n, u) => n + u.valor, 0n)
export function travarOferta(s: EstadoDemo, p: { id: string; solicitante: string; valor: bigint; entradas: string[]; expira: number; hashProblema: string }, agora: number): EstadoDemo {
  conferir(s); instante(agora); instante(p.expira); ator(p.solicitante)
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || s.ofertas.some(o => o.id === p.id)) throw new Error('Identificador da oferta inválido ou repetido')
  if (s.ofertas.length >= s.parametros.maxOfertas) throw new Error('Limite total de ofertas do cenário atingido')
  if (typeof p.valor !== 'bigint' || p.valor <= 0n || p.valor > s.totalInicial || p.expira <= agora || p.expira - agora > 30 * 86400000 || !HEX.test(p.hashProblema)) throw new Error('Valor, prazo ou compromisso inválido')
  if (!p.entradas.length || new Set(p.entradas).size !== p.entradas.length) throw new Error('Entradas vazias ou duplicadas')
  const entradas = p.entradas.map(id => {
    const u = s.utxos.find(x => x.id === id)
    if (!u || u.trava !== null || u.dono !== p.solicitante) throw new Error('Entrada gasta, travada ou de outro ator')
    return u
  })
  const total = entradas.reduce((n, u) => n + u.valor, 0n)
  if (total < p.valor) throw new Error('Saldo de teste insuficiente')
  const novo = copiar(s), idEvento = s.eventos.length + 1
  novo.utxos = novo.utxos.filter(u => !p.entradas.includes(u.id))
  novo.utxos.push({ id: `sim-${idEvento}-trava`, dono: p.solicitante, valor: p.valor, trava: p.id })
  if (total > p.valor) novo.utxos.push({ id: `sim-${idEvento}-troco`, dono: p.solicitante, valor: total - p.valor, trava: null })
  novo.ofertas.push({ id: p.id, solicitante: p.solicitante, valor: p.valor, expira: p.expira, hashProblema: p.hashProblema, queimaBps: s.parametros.queimaBps, estado: 'aberta' })
  novo.eventos.push({ id: idEvento, tipo: 'trava', oferta: p.id, destino: p.solicitante, valor: p.valor, queima: 0n })
  conferir(novo); return novo
}
export function liquidarCenario(s: EstadoDemo, c: CertificadoDeCenario, agora: number): EstadoDemo {
  conferir(s); instante(agora); ator(c.provedor)
  const o = s.ofertas.find(x => x.id === c.oferta)
  if (!o || o.estado !== 'aberta') throw new Error('Oferta ausente ou já encerrada')
  if (agora >= o.expira) throw new Error('Oferta expirada')
  if (o.solicitante === c.provedor) throw new Error('Auto-pagamento recusado no cenário')
  if (c.fonte !== 'fixture-simulada' || c.resultadoSimulado !== 'valido' || c.hashProblema !== o.hashProblema || !HEX.test(c.hashCertificado)) throw new Error('Certificado de cenário inválido ou compromisso divergente')
  const novo = copiar(s), queima = o.valor * BigInt(o.queimaBps) / 10000n, pagamento = o.valor - queima, idEvento = s.eventos.length + 1
  novo.utxos = novo.utxos.filter(u => u.trava !== o.id)
  if (pagamento > 0n) novo.utxos.push({ id: `sim-${idEvento}-pagamento`, dono: c.provedor, valor: pagamento, trava: null })
  novo.queimado += queima
  novo.ofertas.find(x => x.id === o.id)!.estado = 'liquidada'
  novo.eventos.push({ id: idEvento, tipo: 'liquidacao', oferta: o.id, destino: c.provedor, valor: pagamento, queima })
  conferir(novo); return novo
}
export function reembolsarCenario(s: EstadoDemo, id: string, solicitante: string, agora: number): EstadoDemo {
  conferir(s); instante(agora); ator(solicitante)
  const o = s.ofertas.find(x => x.id === id)
  if (!o || o.estado !== 'aberta' || o.solicitante !== solicitante || agora < o.expira) throw new Error('Reembolso não autorizado ou prazo ainda aberto')
  const novo = copiar(s), idEvento = s.eventos.length + 1
  novo.utxos = novo.utxos.filter(u => u.trava !== id)
  novo.utxos.push({ id: `sim-${idEvento}-reembolso`, dono: solicitante, valor: o.valor, trava: null })
  novo.ofertas.find(x => x.id === id)!.estado = 'reembolsada'
  novo.eventos.push({ id: idEvento, tipo: 'reembolso', oferta: id, destino: solicitante, valor: o.valor, queima: 0n })
  conferir(novo); return novo
}
