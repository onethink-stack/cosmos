import { criarApiIntegracoes, type OpcoesApiIntegracoes, type SessaoIntegracoesLocal } from './api-node'

/** Início explícito pelo processo local confiável. Importar não abre porta.
 * Não lê ambiente, arquivos, .env, privado/ ou chaves da carteira. Não instala
 * handlers globais, não importa o servidor v2 e não imprime a capacidade de sessão.
 * A origem deve ser fornecida explicitamente, por exemplo a origem local da UI.
 * Não chamar pela UI ou expor o retorno em HTTP; a ponte T6 retém a capacidade.
 */
export async function iniciarServidorIntegracoes(opcoes: OpcoesApiIntegracoes & { porta?: number }) {
  const { porta = 0, ...opcoesApi } = opcoes
  const api = criarApiIntegracoes(opcoesApi)
  try {
    const endereco = await api.iniciar(porta)
    const sessao: Readonly<SessaoIntegracoesLocal> = api.emitirSessaoLocal()
    return Object.freeze({ endereco, sessao, encerrar: api.encerrar, revogarSessaoLocal: api.revogarSessaoLocal, emitirSessaoLocal: api.emitirSessaoLocal, diagnosticoLocal: api.diagnosticoLocal })
  } catch (erro) {
    await api.encerrar()
    throw erro
  }
}
