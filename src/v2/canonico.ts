import { lerJsonEstrito } from '../motor/registro'

export const FORMATO_V2 = 'cosmos-provenance-v2'
export const MAX_BYTES_V2 = 262144
export const MAX_DEPTH_V2 = 32

/** Limite lexical antes de chamar o parser recursivo; conteúdo não é alterado. */
export function limitarJsonV2(texto: string): void {
  if (new TextEncoder().encode(texto).length > MAX_BYTES_V2) throw new Error('Limite de tamanho v2 excedido')
  let depth = 0, string = false, escape = false
  for (const c of texto) {
    if (string) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') string = false
    } else if (c === '"') string = true
    else if (c === '{' || c === '[') { if (++depth > MAX_DEPTH_V2) throw new Error('Limite de profundidade v2 excedido') }
    else if (c === '}' || c === ']') depth--
  }
}
function textoNfc(s: string): string {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s)) throw new Error('Unicode inválido')
  if (s.normalize('NFC') !== s) throw new Error('Perfil v2 exige NFC; JCS não normaliza Unicode')
  return JSON.stringify(s)
}
/** Subconjunto JCS (RFC 8785): somente inteiros seguros, JSON puro e NFC explícito.
 * Não usar no histórico v1. A ordenação de chaves JCS é por unidades UTF-16.
 */
export function canonicalizarV2(valor: unknown): string {
  const visit = (v: unknown, depth: number): string => {
    if (depth > MAX_DEPTH_V2) throw new Error('Limite de profundidade v2 excedido')
    if (v === null) return 'null'
    if (typeof v === 'string') return textoNfc(v)
    if (typeof v === 'boolean') return String(v)
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v)) throw new Error('Perfil v2 exige inteiro seguro')
      return JSON.stringify(v)
    }
    if (!v || typeof v !== 'object') throw new Error('Valor não JSON')
    if (Array.isArray(v)) {
      // Contagem sozinha permite trocar um índice ausente por uma chave extra.
      // Conferir descritores antes de ler elementos também evita executar getters.
      const chaves = Reflect.ownKeys(v)
      if (chaves.length !== v.length + 1 || chaves.some((k) => typeof k !== 'string')) throw new Error('Array esparso ou com propriedades extras')
      const elementos: unknown[] = []
      for (let i = 0; i < v.length; i++) {
        const d = Object.getOwnPropertyDescriptor(v, String(i))
        if (!d || !d.enumerable) throw new Error('Array esparso ou com propriedades extras')
        if (!('value' in d)) throw new Error('Accessor não é dado JSON')
        elementos.push(d.value)
      }
      return '[' + elementos.map((item) => visit(item, depth + 1)).join(',') + ']'
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw new Error('Objeto não JSON puro')
    if (Object.getOwnPropertySymbols(v).length) throw new Error('Símbolos não são JSON')
    return '{' + Object.keys(v).sort().map((k) => {
      const d = Object.getOwnPropertyDescriptor(v, k)!
      if (!('value' in d)) throw new Error('Accessor não é dado JSON')
      return textoNfc(k) + ':' + visit(d.value, depth + 1)
    }).join(',') + '}'
  }
  const result = visit(valor, 0)
  limitarJsonV2(result)
  return result
}
export function lerCanonicoV2(texto: string): unknown {
  limitarJsonV2(texto)
  const result = lerJsonEstrito(texto)
  if (canonicalizarV2(result) !== texto) throw new Error('Documento não está no perfil JCS v2 canônico')
  return result
}
