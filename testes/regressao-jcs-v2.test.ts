import { describe, expect, it } from 'vitest'
import { canonicalizarV2, lerCanonicoV2 } from '../src/v2/canonico'
describe('perfil JCS v2 com restrição NFC adicional', () => {
  it('ordena por unidades UTF-16 e usa serialização ECMAScript', () => {
    expect(canonicalizarV2({ b: 2, a: 'é' })).toBe('{"a":"é","b":2}')
    expect(canonicalizarV2({ '\ue000': 1, '😀': 2 })).toBe('{"😀":2,"":1}')
  })
  it('rejeita Unicode fora de NFC, sem normalizar bytes', () => {
    expect(() => canonicalizarV2({ texto: 'e\u0301' })).toThrow(/NFC/)
    expect(() => canonicalizarV2({ texto: '\ud800' })).toThrow(/Unicode/)
  })
  it('rejeita duplicação, número inseguro e documento não canônico', () => {
    for (const texto of ['{"a":1,"a":2}', '{"n":9007199254740993}', '{ "a":1 }']) expect(() => lerCanonicoV2(texto)).toThrow()
  })
  it('limita tamanho e profundidade antes da leitura recursiva', () => {
    expect(() => lerCanonicoV2('['.repeat(10000))).toThrow(/profundidade/)
    expect(() => lerCanonicoV2(' '.repeat(262145))).toThrow(/tamanho/)
  })

  it('rejeita getters em arrays sem executar o getter', () => {
    let chamadas = 0
    const array: number[] = []
    Object.defineProperty(array, '0', { enumerable: true, get() { chamadas++; return 1 } })
    expect(() => canonicalizarV2(array)).toThrow(/Accessor/)
    expect(chamadas).toBe(0)
  })

  it('rejeita lacuna mascarada por propriedade extra e símbolos em arrays', () => {
    const esparso = Object.assign(new Array(1), { extra: 1 })
    expect(() => canonicalizarV2(esparso)).toThrow()
    expect(() => canonicalizarV2(Object.assign([1], { [Symbol('extra')]: 2 }))).toThrow()
    expect(() => canonicalizarV2(Object.defineProperty([1], 'extra', { value: 2 }))).toThrow()
    expect(canonicalizarV2([3, 1, null, { b: 2, a: 1 }])).toBe('[3,1,null,{"a":1,"b":2}]')
  })
})
