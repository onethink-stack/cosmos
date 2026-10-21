// Contas exatas para os modelos com números (formato modelo-exato-t1-v1): racionais com BigInt, polinômios de
// coeficientes racionais, sequências de Sturm e o corpo Q(α), com α a raiz única de um polinômio inteiro irredutível
// num intervalo aberto de extremos racionais. Nada de ponto flutuante.

/** n/d com d > 0 e mdc(|n|, d) = 1 */
export interface Racional {
  n: bigint
  d: bigint
}

const abs = (x: bigint) => (x < 0n ? -x : x)

export function mdc(a: bigint, b: bigint): bigint {
  a = abs(a)
  b = abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export function racional(n: bigint, d = 1n): Racional {
  if (d === 0n) throw new Error('denominador zero')
  if (d < 0n) [n, d] = [-n, -d]
  const g = mdc(n, d) || 1n
  return { n: n / g, d: d / g }
}

export const ZERO = racional(0n)
export const UM = racional(1n)
export const soma = (a: Racional, b: Racional) => racional(a.n * b.d + b.n * a.d, a.d * b.d)
export const oposto = (a: Racional): Racional => ({ n: -a.n, d: a.d })
export const diferenca = (a: Racional, b: Racional) => soma(a, oposto(b))
export const produto = (a: Racional, b: Racional) => racional(a.n * b.n, a.d * b.d)
export function quociente(a: Racional, b: Racional): Racional {
  if (b.n === 0n) throw new Error('divisão por zero')
  return racional(a.n * b.d, a.d * b.n)
}
export const sinal = (a: Racional) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0)
export const comparar = (a: Racional, b: Racional) => sinal(diferenca(a, b))
export const iguais = (a: Racional, b: Racional) => a.n === b.n && a.d === b.d
export const ehInteiro = (a: Racional) => a.d === 1n
export const escrever = (a: Racional) => (a.d === 1n ? `${a.n}` : `${a.n}/${a.d}`)

/** Um racional escrito como -?d+, -?d+/d+ (denominador maior que zero) ou -?d+.d+; null se a escrita é outra. */
export function lerRacional(s: unknown): Racional | null {
  if (typeof s !== 'string') return null
  let m = /^(-?)(\d+)$/.exec(s)
  if (m) return racional(BigInt(m[1] + m[2]))
  m = /^(-?)(\d+)\/(\d+)$/.exec(s)
  if (m) return BigInt(m[3]) === 0n ? null : racional(BigInt(m[1] + m[2]), BigInt(m[3]))
  m = /^(-?)(\d+)\.(\d+)$/.exec(s)
  if (m) return racional(BigInt(m[1] + m[2] + m[3]), 10n ** BigInt(m[3].length))
  return null
}

// ---- polinômios: coeficientes em grau crescente, sem zeros no fim ([] é o polinômio zero)

export type Poli = Racional[]

export function poli(cs: Racional[]): Poli {
  const p = [...cs]
  while (p.length && p[p.length - 1].n === 0n) p.pop()
  return p
}
export const grau = (p: Poli) => p.length - 1
const lider = (p: Poli) => p[p.length - 1]

export function psoma(a: Poli, b: Poli): Poli {
  return poli([...Array(Math.max(a.length, b.length)).keys()].map((i) => soma(a[i] ?? ZERO, b[i] ?? ZERO)))
}
export const pescalar = (a: Poli, c: Racional): Poli => poli(a.map((x) => produto(x, c)))
export const pdiferenca = (a: Poli, b: Poli) => psoma(a, pescalar(b, racional(-1n)))
export function pproduto(a: Poli, b: Poli): Poli {
  if (!a.length || !b.length) return []
  const r: Racional[] = Array(a.length + b.length - 1).fill(ZERO)
  a.forEach((x, i) => b.forEach((y, j) => (r[i + j] = soma(r[i + j], produto(x, y)))))
  return poli(r)
}

/** a = q·b + r, com grau(r) < grau(b) */
export function pdivisao(a: Poli, b: Poli): { q: Poli; r: Poli } {
  if (!b.length) throw new Error('divisão por polinômio zero')
  let r = [...a]
  const q: Racional[] = Array(Math.max(a.length - b.length + 1, 0)).fill(ZERO)
  while (r.length >= b.length) {
    const k = r.length - b.length
    const c = quociente(lider(r), lider(b))
    q[k] = c
    r = pdiferenca(r, pproduto([...Array(k).fill(ZERO), c], b))
  }
  return { q: poli(q), r }
}
export const presto = (a: Poli, b: Poli) => pdivisao(a, b).r
export const pderivada = (p: Poli): Poli => poli(p.slice(1).map((c, i) => produto(c, racional(BigInt(i + 1)))))

/** p(x), por Horner */
export function pvalor(p: Poli, x: Racional): Racional {
  let r = ZERO
  for (let i = p.length - 1; i >= 0; i--) r = soma(produto(r, x), p[i])
  return r
}

/** A sequência de Sturm de p: p, p', e os restos com o sinal trocado, até o zero. */
export function sturm(p: Poli): Poli[] {
  const s = [p, pderivada(p)]
  while (s[s.length - 1].length) s.push(pescalar(presto(s[s.length - 2], s[s.length - 1]), racional(-1n)))
  s.pop()
  return s
}

function variacoes(s: Poli[], x: Racional): number {
  let n = 0
  let anterior = 0
  for (const q of s) {
    const v = sinal(pvalor(q, x))
    if (v === 0) continue
    if (anterior && v !== anterior) n++
    anterior = v
  }
  return n
}

/** Quantas raízes reais distintas p tem no intervalo aberto (a, b), com a < b e p(a), p(b) diferentes de zero. */
export function raizesEntre(p: Poli, a: Racional, b: Racional): number {
  const s = sturm(p)
  return variacoes(s, a) - variacoes(s, b)
}

// ---- o polinômio de α: inteiro, primitivo, de líder positivo e irredutível

/** Os coeficientes inteiros (grau crescente) como polinômio racional. */
export const doInteiro = (cs: bigint[]): Poli => poli(cs.map((c) => racional(c)))

/** ⌊√x⌋, por Newton, só com inteiros */
function raizInteira(x: bigint): bigint {
  if (x < 2n) return x
  let r = x
  let s = (x + 1n) / 2n
  while (s < r) {
    r = s
    s = (r + x / r) / 2n
  }
  return r
}

/** Até onde a conferência procura divisores, para a raiz racional dos polinômios de grau 3 */
const MAIOR_PARA_DIVISORES = 10n ** 6n

function divisores(x: bigint): bigint[] {
  x = abs(x)
  const ds: bigint[] = []
  for (let i = 1n; i * i <= x; i++)
    if (x % i === 0n) {
      ds.push(i)
      if (i * i !== x) ds.push(x / i)
    }
  return ds
}

/**
 * Se o polinômio inteiro (grau crescente) é irredutível sobre Q: true ou false até o grau 3; null acima do grau 3,
 * ou no grau 3 com coeficientes grandes demais para a procura de raiz racional (esta conferência não sabe dizer).
 */
export function irredutivel(coeficientes: bigint[]): boolean | null {
  const p = doInteiro(coeficientes)
  const g = grau(p)
  const cs = coeficientes.slice(0, g + 1)
  if (g < 1) return false
  if (g === 1) return true
  if (g === 2) {
    // ax² + bx + c é redutível sobre Q se e só se o discriminante é um quadrado
    const [c, b, a] = cs
    const disc = b * b - 4n * a * c
    return disc < 0n || raizInteira(disc) ** 2n !== disc
  }
  if (g === 3) {
    // de grau 3, é redutível se e só se tem raiz racional r/s, com r dividindo o termo constante e s o líder
    if (cs[0] === 0n) return false
    if (abs(cs[0]) > MAIOR_PARA_DIVISORES || abs(cs[3]) > MAIOR_PARA_DIVISORES) return null
    for (const r of divisores(cs[0]))
      for (const s of divisores(cs[3]))
        for (const x of [racional(r, s), racional(-r, s)]) if (sinal(pvalor(p, x)) === 0) return false
    return true
  }
  return null
}

/** Uma potência de 2 maior que o módulo de toda raiz de p: 1 + max|aᵢ/aₙ| (Cauchy), arredondado para cima. */
function limiteDasRaizes(p: Poli): Racional {
  let limite = UM
  for (const c of p.slice(0, -1)) {
    const q = quociente(c, lider(p))
    const m = soma(UM, q.n < 0n ? oposto(q) : q)
    if (comparar(m, limite) > 0) limite = m
  }
  let B = UM
  while (comparar(B, limite) <= 0) B = produto(B, racional(2n))
  return B
}

/** O número da raiz que está logo acima de a (1 = a menor): 1 + as raízes reais menores que a, com p(a) ≠ 0. */
export function indiceAcimaDe(p: Poli, a: Racional): number {
  const B = limiteDasRaizes(p)
  return 1 + (comparar(a, oposto(B)) > 0 ? raizesEntre(p, oposto(B), a) : 0)
}

/**
 * Um intervalo (a, b) de extremos racionais com só a raiz real de número `indice` (1 = a menor) de p, e p(a), p(b)
 * diferentes de zero; null se p não tem tantas raízes reais. É como o Caderno escreve o root-obj do Z3.
 */
export function isolarRaiz(p: Poli, indice: number): [Racional, Racional] | null {
  const B = limiteDasRaizes(p)
  let a = oposto(B)
  let b = B
  let k = indice
  if (!Number.isInteger(k) || k < 1 || raizesEntre(p, a, b) < k) return null
  for (let passo = 0; raizesEntre(p, a, b) > 1; passo++) {
    if (passo > 10_000) return null
    let m = quociente(soma(a, b), racional(2n))
    // um meio que é raiz (só acontece com raiz racional) é empurrado um pouco para a direita
    for (let e = racional(1n, 4n); sinal(pvalor(p, m)) === 0; e = quociente(e, racional(2n)))
      m = soma(m, produto(e, diferenca(b, m)))
    const esquerda = raizesEntre(p, a, m)
    if (k <= esquerda) b = m
    else {
      a = m
      k -= esquerda
    }
  }
  // estreita até a largura 1/2, para o intervalo ser fácil de ler (o meio que é raiz fica de fora: ele já é exato)
  const meio = racional(1n, 2n)
  while (comparar(diferenca(b, a), meio) > 0) {
    const m = quociente(soma(a, b), racional(2n))
    if (sinal(pvalor(p, m)) === 0) break
    if (raizesEntre(p, a, m) === 1) b = m
    else a = m
  }
  return [a, b]
}

// ---- o corpo Q(α), ou só Q quando não há α

/** Um elemento de Q(α): um polinômio em α de grau menor que o de p (só a constante, sem α). */
export type Elemento = Poli

/** Quantas vezes, no máximo, o intervalo de α é cortado ao meio para decidir um sinal */
const MAIOR_REFINO = 4000

export class Corpo {
  private a: Racional
  private b: Racional
  private sinalEmA: number

  /** p: o polinômio de α, irredutível, de grau ≥ 1; (a, b): o intervalo com só α. Sem p, o corpo é Q. */
  constructor(
    readonly p: Poli | null = null,
    intervalo: [Racional, Racional] | null = null,
  ) {
    const [a, b] = intervalo ?? [ZERO, ZERO]
    this.a = a
    this.b = b
    this.sinalEmA = p ? sinal(pvalor(p, a)) : 0
  }

  reduzir(q: Poli): Elemento {
    return this.p ? presto(q, this.p) : q
  }
  constante(r: Racional): Elemento {
    return poli([r])
  }
  alfa(): Elemento {
    if (!this.p) throw new Error('alpha sem o polinômio de α')
    return this.reduzir([ZERO, UM])
  }
  soma(x: Elemento, y: Elemento) {
    return psoma(x, y)
  }
  oposto(x: Elemento) {
    return pescalar(x, racional(-1n))
  }
  diferenca(x: Elemento, y: Elemento) {
    return pdiferenca(x, y)
  }
  produto(x: Elemento, y: Elemento) {
    return this.reduzir(pproduto(x, y))
  }
  ehZero(x: Elemento) {
    return x.length === 0
  }
  iguais(x: Elemento, y: Elemento) {
    return this.ehZero(this.diferenca(x, y))
  }
  /** 1/x, para x diferente de zero: com p irredutível, x e p não têm fator comum (Euclides estendido) */
  inverso(x: Elemento): Elemento {
    if (this.ehZero(x)) throw new Error('inverso de zero')
    if (!this.p || grau(x) === 0) return this.constante(quociente(UM, x[0]))
    // invariante: r0 = s0·x (mod p), r1 = s1·x (mod p)
    let [r0, r1] = [this.p, x]
    let [s0, s1]: [Poli, Poli] = [[], [UM]]
    while (grau(r1) > 0) {
      const { q, r } = pdivisao(r0, r1)
      ;[r0, r1] = [r1, r]
      ;[s0, s1] = [s1, pdiferenca(s0, pproduto(q, s1))]
    }
    if (!r1.length) throw new Error('o polinômio de α não é irredutível')
    return this.reduzir(pescalar(s1, quociente(UM, r1[0])))
  }
  /** −1, 0 ou 1: o sinal de x(α), cortando o intervalo de α até x não ter raiz nele */
  sinal(x: Elemento): number {
    if (this.ehZero(x)) return 0
    if (!this.p || grau(x) === 0) return sinal(x[0])
    for (let i = 0; i < MAIOR_REFINO; i++) {
      if (sinal(pvalor(x, this.a)) !== 0 && sinal(pvalor(x, this.b)) !== 0 && raizesEntre(x, this.a, this.b) === 0)
        return sinal(pvalor(x, this.a))
      const m = quociente(soma(this.a, this.b), racional(2n))
      const v = sinal(pvalor(this.p, m))
      if (v === 0) throw new Error('α é racional: o polinômio de α não é irredutível')
      if (v === this.sinalEmA) this.a = m
      else this.b = m
    }
    throw new Error('o sinal não se decidiu')
  }
  comparar(x: Elemento, y: Elemento) {
    return this.sinal(this.diferenca(x, y))
  }
  /** x é um inteiro: com p irredutível de grau ≥ 2, só as constantes são racionais */
  ehInteiro(x: Elemento) {
    return grau(x) <= 0 && ehInteiro(x[0] ?? ZERO)
  }
}
