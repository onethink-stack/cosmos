import { describe, expect, it } from 'vitest'
import { lerJsonEstrito } from '../src/motor/registro'

describe('regressão de leitura JSON v1 sem alterar os bytes assinados', () => {
  it('recusa __proto__ duplicado, inclusive com valores objeto', () => {
    expect(() => lerJsonEstrito('{"__proto__":1,"__proto__":2}')).toThrow(/repetida/)
    expect(() => lerJsonEstrito('{"__proto__":{"autor":"x"},"__proto__":{"autor":"y"}}')).toThrow(/repetida/)
  })
  it('não cria propriedade herdada a partir de __proto__', () => {
    const lido = lerJsonEstrito('{"__proto__":{"autor":"x"}}') as Record<string, unknown>
    expect(Object.getPrototypeOf(lido)).toBe(Object.prototype)
    expect(Object.hasOwn(lido, '__proto__')).toBe(true)
    expect(lido.autor).toBeUndefined()
  })
  it('recusa inteiro que seria arredondado silenciosamente', () => {
    expect(() => lerJsonEstrito('{"n":9007199254740993}')).toThrow(/seguro/)
    expect(() => lerJsonEstrito('{"n":-9007199254740993}')).toThrow(/seguro/)
  })
  it('aceita os limites de inteiros seguros sem conversão do conteúdo', () => {
    expect(lerJsonEstrito('{"n":9007199254740991}')).toEqual({ n: Number.MAX_SAFE_INTEGER })
  })
  it('recusa chaves normais, escapadas e a chave literal *proto* duplicadas', () => {
    for (const texto of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"*proto*":1,"*proto*":2}']) expect(() => lerJsonEstrito(texto)).toThrow(/repetida/)
  })
  it('preserva a rejeição anterior de decimais e expoentes', () => {
    for (const texto of ['{"n":1.0}', '{"n":1e0}']) expect(() => lerJsonEstrito(texto)).toThrow()
  })
})
