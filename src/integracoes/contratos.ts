/** P0 / tarefa 1: rascunho de contrato. Não é integração ativa ou autorização de rede.
 * Independente dos formatos históricos, da carteira e da admissão Ed25519 v2.
 */
export const FORMATO_CONFIGURACAO_INTEGRACAO = 'cosmos-integracao-rascunho-v1' as const
export const FORMATO_ESTADO_SERVICO = 'cosmos-servico-rascunho-v1' as const

export interface LimitesIntegracao {
  readonly requisicoesPorMinuto: number
  readonly maxRequisicoesSessao: number
  readonly maxBytesEntrada: number
  readonly maxTokensSaida: number
  readonly maxTokensSessao: number
  readonly maxConcorrencia: number
  readonly prazoMs: number
}

/** Catálogo fechado: não recebe URL, hostname ou endpoint enviado pelo navegador.
 * Outros provedores/destinos exigem versão/política posterior e revisão explícita.
 */
export interface ConfiguracaoIntegracao {
  readonly formato: typeof FORMATO_CONFIGURACAO_INTEGRACAO
  readonly id: string
  readonly revisao: number
  readonly provedor: 'simulado'
  readonly destino: 'sem-rede'
  readonly modelo: 'resposta-simulada-v1'
  readonly habilitada: boolean
  readonly limites: Readonly<LimitesIntegracao>
  readonly permissoes: Readonly<{
    envioRemoto: false
    fontesPrivadas: false
  }>
}

/** Somente metadados públicos. Nem valor nem referência de segredo nesta resposta.
 * O resolvedor de credenciais no servidor pertence à tarefa 3.
 */
export interface CredenciaisPublicas {
  readonly apiProvedor: 'nao-aplicavel'
  readonly sessao: 'nao-incluida'
  readonly carteira: 'fora-do-escopo'
}

export type EstadoTeste = 'ok' | 'invalido' | 'indisponivel' | 'sem-quota'
export interface TesteServicoSimulado {
  readonly escopo: 'adaptador-simulado'
  readonly simulado: true
  /** UTC em milissegundos. Não é carimbo OTS nem horário autenticado. */
  readonly executadoEmMs: number
  /** Vincula o teste à configuração; alteração de revisão invalida o vínculo. */
  readonly configuracaoId: string
  readonly configuracaoRevisao: number
  readonly resultado: EstadoTeste
}

interface ServicoConfigurado {
  readonly formato: typeof FORMATO_ESTADO_SERVICO
  readonly configuracaoId: string
  readonly configuracaoRevisao: number
  readonly credenciais: Readonly<CredenciaisPublicas>
}
export type EstadoServico =
  | Readonly<{ formato: typeof FORMATO_ESTADO_SERVICO; estado: 'sem-configuracao' }>
  | Readonly<ServicoConfigurado & { estado: 'local'; teste: null }>
  | Readonly<ServicoConfigurado & { estado: 'conectado'; teste: Readonly<TesteServicoSimulado & { resultado: 'ok' }> }>
  | Readonly<ServicoConfigurado & { estado: 'invalido'; teste: Readonly<TesteServicoSimulado & { resultado: 'invalido' }> }>
  | Readonly<ServicoConfigurado & { estado: 'indisponivel'; teste: Readonly<TesteServicoSimulado & { resultado: 'indisponivel' }> }>
  | Readonly<ServicoConfigurado & { estado: 'sem-quota'; teste: Readonly<TesteServicoSimulado & { resultado: 'sem-quota' }> }>

/** Guardrail declarativo, não um proxy seguro implementado.
 * Não faz fetch, DNS, redirecionamento, leitura de ambiente ou de credenciais.
 */
export interface PoliticaSaidaP0 {
  readonly formato: 'cosmos-saida-p0-rascunho-v1'
  readonly acessoRede: false
  readonly destinosPermitidos: readonly []
  readonly resolverDns: false
  readonly seguirRedirecionamentos: false
}
