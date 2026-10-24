import { validarConfiguracaoIntegracao } from './politica'

export class FalhaRag extends Error {
  constructor(readonly codigo: 'pedido_rag_invalido' | 'fonte_rag_invalida' | 'rag_desativado') { super(codigo) }
}

/** Entrada JS de dados, sem executar getters. Não isola Proxy/traps. */
export function dadosRag(entrada: unknown, chaves: readonly string[]): Record<string, unknown> {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(entrada))) throw new FalhaRag('pedido_rag_invalido')
  const proprias = Reflect.ownKeys(entrada)
  if (proprias.length !== chaves.length || proprias.some(k => typeof k !== 'string' || !chaves.includes(k))) throw new FalhaRag('pedido_rag_invalido')
  const copia: Record<string, unknown> = Object.create(null)
  for (const k of chaves) {
    const d = Object.getOwnPropertyDescriptor(entrada, k)
    if (!d || !d.enumerable || !('value' in d)) throw new FalhaRag('pedido_rag_invalido')
    copia[k] = d.value
  }
  return copia
}

/** A classificação é metadado do catálogo do processo confiável, nunca do cliente.
 * P0 não implementa identidade civil ou ACL multiusuário: só público local.
 */
export function permiteClasseFonte(classe: unknown): boolean { return classe === 'publica' }

export function autorizarRagLocal(configuracao: unknown) {
  const c = validarConfiguracaoIntegracao(configuracao)
  if (!c.habilitada) throw new FalhaRag('rag_desativado')
  return Object.freeze({ configuracaoId: c.id, configuracaoRevisao: c.revisao,
    escopo: 'publico-local-simulado' as const, envioRemoto: false as const, fontesPrivadas: false as const })
}
