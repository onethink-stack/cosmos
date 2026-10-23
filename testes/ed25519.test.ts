// A conferência Ed25519 estrita (src/motor/ed25519.ts, seção 1 de especificacao/cadeia-v1.md), contra o Ed25519 do
// Node (OpenSSL): as assinaturas certas valem nos dois; uma assinatura mexida não vale em nenhum; e nos casos de
// borda a regra estrita recusa o que o OpenSSL aceita (a chave neutra, com uma assinatura forjada).
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { conferirAssinatura, lerChave, ORDEM } from '../src/motor/ed25519'

const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'))
const PKCS8 = '302e020100300506032b657004220420'
const SPKI = '302a300506032b6570032100'
const privada = (segredo: string) => createPrivateKey({ key: Buffer.from(PKCS8 + segredo, 'hex'), format: 'der', type: 'pkcs8' })
const publicaDe = (k: ReturnType<typeof privada>) => new Uint8Array(createPublicKey(k).export({ format: 'der', type: 'spki' }).subarray(-32))
const doNode = (chave: Uint8Array) => createPublicKey({ key: Buffer.concat([Buffer.from(SPKI, 'hex'), chave]), format: 'der', type: 'spki' })
const littleEndian = (n: bigint) => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 255n))

// os testes 1, 2 e 3 da seção 7.1 da RFC 8032
const RFC = [
  { segredo: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', publica: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', mensagem: '' },
  { segredo: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', publica: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', mensagem: '72' },
  { segredo: 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', publica: 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', mensagem: 'af82' },
]

describe('a conferência Ed25519 estrita', () => {
  it('aceita as assinaturas dos testes da RFC 8032 e recusa as mexidas', async () => {
    for (const t of RFC) {
      const k = privada(t.segredo)
      expect(Buffer.from(publicaDe(k)).toString('hex')).toBe(t.publica)
      const msg = hex(t.mensagem)
      const assinatura = new Uint8Array(sign(null, msg, k))
      expect(await conferirAssinatura(hex(t.publica), msg, assinatura)).toBe(true)
      const mexida = assinatura.slice()
      mexida[10] ^= 1
      expect(await conferirAssinatura(hex(t.publica), msg, mexida)).toBe(false)
      expect(await conferirAssinatura(hex(t.publica), Uint8Array.of(...msg, 0), assinatura)).toBe(false)
    }
  })

  it('dá o mesmo que o Node em chaves e mensagens sorteadas', async () => {
    for (let i = 0; i < 40; i++) {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519')
      const chave = new Uint8Array(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32))
      const msg = Uint8Array.from({ length: i * 7 }, (_, j) => (j * 31 + i) & 255)
      const assinatura = new Uint8Array(sign(null, msg, privateKey))
      expect(await conferirAssinatura(chave, msg, assinatura), `sorteio ${i}`).toBe(true)
      const outra = Uint8Array.of(...msg, i)
      expect(await conferirAssinatura(chave, outra, assinatura)).toBe(verify(null, outra, publicKey, assinatura))
    }
  })

  it('recusa S fora do intervalo (S + L), como o Node', async () => {
    const k = privada(RFC[0].segredo)
    const msg = new TextEncoder().encode('cadeia')
    const assinatura = new Uint8Array(sign(null, msg, k))
    const s = assinatura.slice(32).reduceRight((n, x) => (n << 8n) | BigInt(x), 0n)
    const fora = Uint8Array.of(...assinatura.slice(0, 32), ...littleEndian(s + ORDEM))
    expect(verify(null, msg, doNode(hex(RFC[0].publica)), fora)).toBe(false)
    expect(await conferirAssinatura(hex(RFC[0].publica), msg, fora)).toBe(false)
  })

  it('recusa a chave neutra, com que o Node aceita uma assinatura forjada para qualquer mensagem', async () => {
    const neutro = new Uint8Array(32)
    neutro[0] = 1
    const forjada = Uint8Array.of(...neutro, ...new Uint8Array(32))
    for (const texto of ['cadeia', 'qualquer outra coisa']) {
      const msg = new TextEncoder().encode(texto)
      expect(verify(null, msg, doNode(neutro), forjada)).toBe(true)
      expect(await conferirAssinatura(neutro, msg, forjada)).toBe(false)
    }
    expect(lerChave(neutro)).toBeNull()
  })

  it('recusa como chave os pontos de ordem pequena e o que não se lê como ponto', () => {
    // y = −1: o ponto de ordem 2; y = p (fora do intervalo); e um y sem raiz de x
    expect(lerChave(hex('ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f'))).toBeNull()
    expect(lerChave(hex('edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f'))).toBeNull()
    expect(lerChave(hex('0200000000000000000000000000000000000000000000000000000000000000'))).toBeNull()
    for (const t of RFC) expect(lerChave(hex(t.publica))).not.toBeNull()
  })
})
