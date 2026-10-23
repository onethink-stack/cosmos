/** Representação limitada de ℤ[√2] = {a + b√2 | a,b ∈ ℤ}.
 * Coeficientes são Number inteiros seguros; operações usam BigInt intermediário
 * e rejeitam estouro ao retornar. Não implementa o corpo ℚ(√2) completo:
 * não há coeficientes racionais gerais ou divisão. Não é função hash.
 * O nome histórico é preservado para compatibilidade com a v1.
 */
export type Qsqrt2 = { a: number; b: number }
export const qsqrt2 = (a: number, b: number): Qsqrt2 => {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) throw new RangeError('Coeficientes devem ser inteiros seguros; aproximações decimais não são aceitas.')
  return { a, b }
}
const coeficiente = (n: bigint) => {
  const valor = Number(n)
  if (!Number.isSafeInteger(valor) || BigInt(valor) !== n) throw new RangeError('Resultado fora do intervalo inteiro exato.')
  return valor
}
export const add = (x: Qsqrt2, y: Qsqrt2): Qsqrt2 => {
  qsqrt2(x.a, x.b); qsqrt2(y.a, y.b)
  return qsqrt2(coeficiente(BigInt(x.a) + BigInt(y.a)), coeficiente(BigInt(x.b) + BigInt(y.b)))
}
export const sub = (x: Qsqrt2, y: Qsqrt2): Qsqrt2 => add(x, qsqrt2(-y.a, -y.b))
export const mul = (x: Qsqrt2, y: Qsqrt2): Qsqrt2 => {
  qsqrt2(x.a, x.b); qsqrt2(y.a, y.b)
  return qsqrt2(coeficiente(BigInt(x.a) * BigInt(y.a) + 2n * BigInt(x.b) * BigInt(y.b)), coeficiente(BigInt(x.a) * BigInt(y.b) + BigInt(x.b) * BigInt(y.a)))
}
export const toString = (x: Qsqrt2): string => {
  qsqrt2(x.a, x.b)
  return `${x.a} ${x.b < 0 ? '-' : '+'} ${Math.abs(x.b)}√2`
}
