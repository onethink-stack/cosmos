import type { ConfiguracaoIntegracao, CredenciaisPublicas } from './contratos'
import { validarConfiguracaoIntegracao } from './politica'

/** Resolução server-only. O catálogo P0 não possui provedor que exija segredo.
 * Não recebe valores de API key, token de sessão, seed ou referência de arquivo.
 * Um futuro cofre de provedores exige outro contrato e autorização explícita.
 */
export function resolverCredencialSimulada(entrada: unknown) {
  const c: Readonly<ConfiguracaoIntegracao> = validarConfiguracaoIntegracao(entrada)
  const metadados: Readonly<CredenciaisPublicas> = Object.freeze({
    apiProvedor: 'nao-aplicavel', sessao: 'nao-incluida', carteira: 'fora-do-escopo',
  })
  return Object.freeze({ configuracaoId: c.id, configuracaoRevisao: c.revisao, metadados })
}
