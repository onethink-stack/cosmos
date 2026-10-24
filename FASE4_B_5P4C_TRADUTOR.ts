import { createHash } from 'node:crypto'

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
export const NOMES = Object.freeze(Array.from({ length: 20 }, (_, i) => `p${Math.floor(i / 4)}h${i % 4}`))
export type Clausula = Readonly<{ pos: number; neg: number; termos: readonly string[] }>

// Instância fechada, não um parser SMT geral. A ordem também é parte do protocolo.
function clausulasFixas(): readonly Clausula[] {
  const cs: Clausula[] = []
  const adicionar = (positivos: number[], negativos: number[]) => cs.push(Object.freeze({
    pos: positivos.reduce((m, v) => m | (1 << v), 0),
    neg: negativos.reduce((m, v) => m | (1 << v), 0),
    termos: Object.freeze([...positivos.map(v => NOMES[v]), ...negativos.map(v => `(not ${NOMES[v]})`)]),
  }))
  for (let p = 0; p < 5; p++) {
    adicionar([0, 1, 2, 3].map(h => p * 4 + h), [])
    for (let h = 0; h < 4; h++) for (let j = h + 1; j < 4; j++) adicionar([], [p * 4 + h, p * 4 + j])
  }
  for (let h = 0; h < 4; h++) for (let p = 0; p < 5; p++) for (let q = p + 1; q < 5; q++) adicionar([], [p * 4 + h, q * 4 + h])
  return Object.freeze(cs)
}
export const CLAUSULAS = clausulasFixas()
export function gerarSmt2(): Buffer {
  return Buffer.from([
    '; COSMOS B GPU 5p/4c v1; exactly one hole per pigeon; at most one pigeon per hole.',
    '; Fixed Boolean instance. UTF-8 / LF. No GPU execution is implied by this file.',
    '(set-logic QF_UF)',
    ...NOMES.map(n => `(declare-fun ${n} () Bool)`),
    ...CLAUSULAS.map(c => `(assert (or ${c.termos.join(' ')}))`),
    '(check-sat)', '',
  ].join('\n'), 'utf8')
}
export function traduzir5p4c(smt2: Buffer) {
  const esperado = gerarSmt2()
  if (!Buffer.isBuffer(smt2) || !smt2.equals(esperado)) throw new Error('smt2-divergente')
  const buffer = Buffer.alloc(616)
  ;[1, 20, 75, 1048576].forEach((v, i) => buffer.writeUInt32LE(v, i * 4))
  CLAUSULAS.forEach((c, i) => { buffer.writeUInt32LE(c.pos, 16 + i * 8); buffer.writeUInt32LE(c.neg, 20 + i * 8) })
  return { buffer, clausulas: CLAUSULAS, smt2Sha256: sha256(smt2), bufferSha256: sha256(buffer) }
}
