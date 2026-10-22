// A conferência de uma assinatura Ed25519 (RFC 8032) pela regra estrita da seção 1 de especificacao/cadeia-v1.md: a
// chave tem de se ler como ponto e ter ordem L, S < L, e [S]B − [k]A tem de se escrever como R. A regra é escrita aqui,
// e não emprestada de uma biblioteca, porque as bibliotecas discordam nos casos de borda: a do OpenSSL (a do Node)
// aceita uma assinatura forjada para qualquer mensagem quando a chave é o ponto neutro. A assinatura em si é a do
// WebCrypto (a chave privada fica no navegador, sem poder ser exportada); aqui só se confere.

const P = 2n ** 255n - 19n
export const ORDEM = 2n ** 252n + 27742317777372353535851937790883648493n

const mod = (a: bigint, m = P) => {
  const r = a % m
  return r >= 0n ? r : r + m
}
function potencia(b: bigint, e: bigint, m = P): bigint {
  let r = 1n
  b = mod(b, m)
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m
    b = (b * b) % m
    e >>= 1n
  }
  return r
}
const inverso = (a: bigint) => potencia(a, P - 2n)
const D = mod(-121665n * inverso(121666n))
const RAIZ_DE_MENOS_UM = potencia(2n, (P - 1n) / 4n)

/** um ponto em coordenadas estendidas (X, Y, Z, T), com x = X/Z, y = Y/Z e xy = T/Z */
type Ponto = readonly [bigint, bigint, bigint, bigint]
const NEUTRO: Ponto = [0n, 1n, 1n, 0n]

/** a soma da seção 5.1.4 da RFC 8032 (a = −1); vale também para dobrar */
function somar([X1, Y1, Z1, T1]: Ponto, [X2, Y2, Z2, T2]: Ponto): Ponto {
  const A = mod((Y1 - X1) * (Y2 - X2))
  const B = mod((Y1 + X1) * (Y2 + X2))
  const C = mod(2n * D * T1 * T2)
  const DD = mod(2n * Z1 * Z2)
  const [E, F, G, H] = [B - A, DD - C, DD + C, B + A]
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)]
}
function multiplicar(n: bigint, p: Ponto): Ponto {
  let r = NEUTRO
  let q = p
  while (n > 0n) {
    if (n & 1n) r = somar(r, q)
    q = somar(q, q)
    n >>= 1n
  }
  return r
}
const oposto = ([X, Y, Z, T]: Ponto): Ponto => [mod(-X), Y, Z, mod(-T)]
const iguais = ([X1, Y1, Z1]: Ponto, [X2, Y2, Z2]: Ponto) => mod(X1 * Z2 - X2 * Z1) === 0n && mod(Y1 * Z2 - Y2 * Z1) === 0n

const lerLittleEndian = (b: Uint8Array) => b.reduceRight((n, x) => (n << 8n) | BigInt(x), 0n)

/** a leitura de um ponto (seção 5.1.3 da RFC 8032); null se os 32 bytes não são um ponto */
function lerPonto(b: Uint8Array): Ponto | null {
  if (b.length !== 32) return null
  let y = lerLittleEndian(b)
  const sinal = y >> 255n
  y &= (1n << 255n) - 1n
  if (y >= P) return null
  const u = mod(y * y - 1n)
  const v = mod(D * y * y + 1n)
  let x = mod(u * potencia(v, 3n) * potencia(u * potencia(v, 7n), (P - 5n) / 8n))
  const vx2 = mod(v * x * x)
  if (vx2 === mod(-u)) x = mod(x * RAIZ_DE_MENOS_UM)
  else if (vx2 !== u) return null
  if (x === 0n && sinal === 1n) return null
  if ((x & 1n) !== sinal) x = P - x
  return [x, y, 1n, mod(x * y)]
}

/** a escrita de um ponto (seção 5.1.2 da RFC 8032) */
function escreverPonto([X, Y, Z]: Ponto): Uint8Array {
  const zi = inverso(Z)
  const x = mod(X * zi)
  let n = mod(Y * zi) | ((x & 1n) << 255n)
  const b = new Uint8Array(32)
  for (let i = 0; i < 32; i++, n >>= 8n) b[i] = Number(n & 255n)
  return b
}

const BASE = lerPonto(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 0x58 : 0x66)))!

/** A chave como ponto, se ela se lê e tem ordem L (passos 1 e 2 da seção 1); senão null. */
export function lerChave(chave: Uint8Array): Ponto | null {
  const a = lerPonto(chave)
  return a && !iguais(a, NEUTRO) && iguais(multiplicar(ORDEM, a), NEUTRO) ? a : null
}

async function sha512(...partes: Uint8Array[]): Promise<Uint8Array> {
  const junto = new Uint8Array(partes.reduce((n, p) => n + p.length, 0))
  partes.reduce((i, p) => (junto.set(p, i), i + p.length), 0)
  return new Uint8Array(await crypto.subtle.digest('SHA-512', junto))
}

/** Se a assinatura vale para a mensagem e a chave, pela regra estrita da seção 1 de cadeia-v1.md. */
export async function conferirAssinatura(chave: Uint8Array, mensagem: Uint8Array, assinatura: Uint8Array): Promise<boolean> {
  if (assinatura.length !== 64) return false
  const a = lerChave(chave)
  if (!a) return false
  const r = assinatura.slice(0, 32)
  const s = lerLittleEndian(assinatura.slice(32))
  if (s >= ORDEM) return false
  const k = mod(lerLittleEndian(await sha512(r, chave, mensagem)), ORDEM)
  const calculado = escreverPonto(somar(multiplicar(s, BASE), oposto(multiplicar(k, a))))
  return calculado.every((x, i) => x === r[i])
}
