import {
  FORMATO_CONFIGURACAO_INTEGRACAO, FORMATO_ESTADO_SERVICO,
  type ConfiguracaoIntegracao, type CredenciaisPublicas, type EstadoServico,
  type LimitesIntegracao, type PoliticaSaidaP0,
} from './contratos'

/** Tetos propostos para o rascunho simulado; não são quotas contratadas ou um
 * contador implementado. Reserva/reconciliação pertencem à tarefa 4.
 */
export const TETOS_P0: Readonly<LimitesIntegracao> = Object.freeze({
  requisicoesPorMinuto: 6, maxRequisicoesSessao: 20, maxBytesEntrada: 16384,
  maxTokensSaida: 1024, maxTokensSessao: 20000, maxConcorrencia: 1, prazoMs: 10000,
})
export const POLITICA_SAIDA_P0: Readonly<PoliticaSaidaP0> = Object.freeze({
  formato: 'cosmos-saida-p0-rascunho-v1', acessoRede: false,
  destinosPermitidos: Object.freeze([]) as readonly [], resolverDns: false, seguirRedirecionamentos: false,
})
const CREDENCIAIS_PUBLICAS: Readonly<CredenciaisPublicas> = Object.freeze({
  apiProvedor: 'nao-aplicavel', sessao: 'nao-incluida', carteira: 'fora-do-escopo',
})

/** Chaves exatas e descritores de dados: getters não são executados.
 * Não é isolamento contra Proxy/traps; HTTP futuro deve fornecer JSON já limitado.
 * Mensagens não refletem valores recebidos, que podem conter segredos.
 */
function dados(valor: unknown, chaves: readonly string[]): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Objeto de integração inválido')
  const proto = Object.getPrototypeOf(valor)
  if (proto !== Object.prototype && proto !== null) throw new Error('Objeto de integração inválido')
  const proprias = Reflect.ownKeys(valor)
  if (proprias.length !== chaves.length || proprias.some(k => typeof k !== 'string' || !chaves.includes(k))) throw new Error('Campos de integração inválidos')
  const copia = Object.create(null) as Record<string, unknown>
  for (const k of chaves) {
    const d = Object.getOwnPropertyDescriptor(valor, k)
    if (!d || !d.enumerable || !('value' in d)) throw new Error('Integração exige propriedades de dados')
    Object.defineProperty(copia, k, { value: d.value, enumerable: true })
  }
  return copia
}
function inteiro(valor: unknown, maximo: number): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 1 || valor > maximo) throw new Error('Limite de integração inválido')
  return valor
}
function identificador(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(valor)) throw new Error('Identificador de integração inválido')
  return valor
}
function limites(valor: unknown): Readonly<LimitesIntegracao> {
  const d = dados(valor, Object.keys(TETOS_P0))
  const resultado = Object.fromEntries(Object.entries(TETOS_P0).map(([k, max]) => [k, inteiro(d[k], max)])) as unknown as LimitesIntegracao
  if (resultado.maxTokensSaida > resultado.maxTokensSessao) throw new Error('Limites de tokens incompatíveis')
  return Object.freeze(resultado)
}

/** Reconstrói apenas campos permitidos; não retorna o objeto recebido. */
export function validarConfiguracaoIntegracao(valor: unknown): Readonly<ConfiguracaoIntegracao> {
  const d = dados(valor, ['formato', 'id', 'revisao', 'provedor', 'destino', 'modelo', 'habilitada', 'limites', 'permissoes'])
  if (d.formato !== FORMATO_CONFIGURACAO_INTEGRACAO || d.provedor !== 'simulado' || d.destino !== 'sem-rede' || d.modelo !== 'resposta-simulada-v1' || typeof d.habilitada !== 'boolean') throw new Error('Configuração fora do escopo P0 simulado')
  const p = dados(d.permissoes, ['envioRemoto', 'fontesPrivadas'])
  if (p.envioRemoto !== false || p.fontesPrivadas !== false) throw new Error('Permissão fora do escopo P0 simulado')
  return Object.freeze({
    formato: FORMATO_CONFIGURACAO_INTEGRACAO, id: identificador(d.id), revisao: inteiro(d.revisao, Number.MAX_SAFE_INTEGER),
    provedor: 'simulado', destino: 'sem-rede', modelo: 'resposta-simulada-v1', habilitada: d.habilitada,
    limites: limites(d.limites), permissoes: Object.freeze({ envioRemoto: false, fontesPrivadas: false }),
  })
}

/** Construção sem teste: salvar configuração nunca produz "conectado". */
export function criarEstadoLocal(valor: unknown): EstadoServico {
  const c = validarConfiguracaoIntegracao(valor)
  return Object.freeze({ formato: FORMATO_ESTADO_SERVICO, estado: 'local', configuracaoId: c.id, configuracaoRevisao: c.revisao, credenciais: CREDENCIAIS_PUBLICAS, teste: null })
}
export function criarEstadoSemConfiguracao(): EstadoServico {
  return Object.freeze({ formato: FORMATO_ESTADO_SERVICO, estado: 'sem-configuracao' })
}

/** Valida coerência de um snapshot público. Não executa nem autentica o teste;
 * a tarefa 3 deve produzir o resultado no backend. "Conectado" aqui continua
 * explicitamente SIMULADO e descreve um instante, não disponibilidade contínua.
 * agoraMs é fornecido pelo chamador; não prova tempo confiável ou OTS.
 */
export function validarEstadoServico(valor: unknown, configuracao: unknown | null, agoraMs: number): EstadoServico {
  if (!Number.isSafeInteger(agoraMs) || agoraMs < 0) throw new Error('Referência temporal inválida')
  if (configuracao === null) {
    const d = dados(valor, ['formato', 'estado'])
    if (d.formato !== FORMATO_ESTADO_SERVICO || d.estado !== 'sem-configuracao') throw new Error('Estado de serviço incompatível')
    return criarEstadoSemConfiguracao()
  }
  const c = validarConfiguracaoIntegracao(configuracao)
  const d = dados(valor, ['formato', 'estado', 'configuracaoId', 'configuracaoRevisao', 'credenciais', 'teste'])
  if (d.formato !== FORMATO_ESTADO_SERVICO || d.configuracaoId !== c.id || d.configuracaoRevisao !== c.revisao) throw new Error('Estado de outra configuração ou revisão')
  const cr = dados(d.credenciais, ['apiProvedor', 'sessao', 'carteira'])
  if (cr.apiProvedor !== 'nao-aplicavel' || cr.sessao !== 'nao-incluida' || cr.carteira !== 'fora-do-escopo') throw new Error('Metadados de credenciais inválidos')
  if (d.estado === 'local') {
    if (d.teste !== null) throw new Error('Estado local não admite teste de conexão')
    return criarEstadoLocal(c)
  }
  if (!c.habilitada) throw new Error('Configuração desativada não admite resultado de conexão')
  const t = dados(d.teste, ['escopo', 'simulado', 'executadoEmMs', 'configuracaoId', 'configuracaoRevisao', 'resultado'])
  if (t.escopo !== 'adaptador-simulado' || t.simulado !== true || t.configuracaoId !== c.id || t.configuracaoRevisao !== c.revisao || typeof t.executadoEmMs !== 'number' || !Number.isSafeInteger(t.executadoEmMs) || t.executadoEmMs < 0 || t.executadoEmMs > agoraMs) throw new Error('Teste simulado incompatível ou sem data válida')
  const base = { formato: FORMATO_ESTADO_SERVICO, configuracaoId: c.id, configuracaoRevisao: c.revisao, credenciais: CREDENCIAIS_PUBLICAS }
  const teste = { escopo: 'adaptador-simulado' as const, simulado: true as const, executadoEmMs: t.executadoEmMs, configuracaoId: c.id, configuracaoRevisao: c.revisao }
  switch (d.estado) {
    case 'conectado': if (t.resultado === 'ok') return Object.freeze({ ...base, estado: 'conectado', teste: Object.freeze({ ...teste, resultado: 'ok' }) }); break
    case 'invalido': if (t.resultado === 'invalido') return Object.freeze({ ...base, estado: 'invalido', teste: Object.freeze({ ...teste, resultado: 'invalido' }) }); break
    case 'indisponivel': if (t.resultado === 'indisponivel') return Object.freeze({ ...base, estado: 'indisponivel', teste: Object.freeze({ ...teste, resultado: 'indisponivel' }) }); break
    case 'sem-quota': if (t.resultado === 'sem-quota') return Object.freeze({ ...base, estado: 'sem-quota', teste: Object.freeze({ ...teste, resultado: 'sem-quota' }) }); break
  }
  throw new Error('Estado de serviço ou resultado incompatível')
}
