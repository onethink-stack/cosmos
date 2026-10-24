import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gerarSmt2, traduzir5p4c, CLAUSULAS, NOMES, sha256 } from '../FASE4_B_5P4C_TRADUTOR.ts'
import { validar5p4c, falsa5p4c } from '../FASE4_B_5P4C_VALIDADOR.ts'
import { converter5p4c } from '../FASE4_B_5P4C_PONTE_B_FINAL.ts'
import { fixture5p4c } from './fase4-b-5p4c-fixture.mjs'
const { smt2, saida } = fixture5p4c()

test('WGSL não introduz padding vec4 que exigiria 624 bytes em binding de 616', () => {
  const kernel = readFileSync(new URL('../fase4-b-5p4c/host/kernel.wgsl', import.meta.url), 'utf8')
  assert.match(kernel, /cabecalho: array<u32, 4>/)
  assert.match(kernel, /clausulas: array<vec2<u32>, 75>/)
  assert.doesNotMatch(kernel, /cabecalho: vec4/)
  // Regras de layout WGSL storage: array<u32,4> align4 size16;
  // array<vec2<u32>,75> align8 stride8 size600; struct align8 size616.
  const tamanho = Math.ceil((16 + 75 * 8) / 8) * 8
  assert.equal(tamanho, traduzir5p4c(smt2).buffer.length)
  assert.match(kernel, /@workgroup_size\(64\)/)
})

test('SMT2 fechado: 20 variáveis, 75 cláusulas, 616 bytes e pins determinísticos', () => {
  const t = traduzir5p4c(smt2)
  assert.equal(NOMES.length, 20); assert.equal(CLAUSULAS.length, 75)
  assert.equal(CLAUSULAS.filter(c => c.pos !== 0).length, 5)
  assert.equal(new Set(CLAUSULAS.map(c => `${c.pos}:${c.neg}`)).size, 75)
  assert.equal(t.buffer.length, 616)
  assert.deepEqual([0, 4, 8, 12].map(o => t.buffer.readUInt32LE(o)), [1, 20, 75, 1048576])
  assert.equal(t.smt2Sha256, 'bdb80f5683e3276ebb22b1154fce30d389c94e139ad6b27c110e578905ee851a')
  assert.equal(t.bufferSha256, 'affa7efa353813570254cfa98cab972e84889843f0cd7348962b3e76ee4813c1')
  assert.deepEqual(smt2, gerarSmt2())
})
test('recusa entrada modificada, bytes extras e CRLF', () => {
  for (const b of [Buffer.concat([smt2, Buffer.from(' ')]), Buffer.from(smt2.toString().replaceAll('\n', '\r\n')), Buffer.from('(check-sat)')]) {
    assert.throws(() => traduzir5p4c(b), /smt2-divergente/)
  }
})
test('todos os 1M slots sintéticos validados, sem alteração da entrada', () => {
  const antes = sha256(saida)
  assert.equal(validar5p4c(smt2, saida).usados.size, 75)
  assert.equal(sha256(saida), antes)
  assert.equal(antes, 'd92ccfe9ce8e5614ffa10a93bd8b52502489aa005a987713622bc61d4864cfec')
})
for (const [nome, valor, erro] of [
  ['slot', 0xfffffffe, 'slot-nao-escrito'], ['SAT', 0xffffffff, 'sentinela-sat'],
  ['limite', 75, 'indice-fora-do-dominio'], ['clausula verdadeira', 0, 'testemunho-nao-falsifica-clausula'],
]) test(`recusa ${nome} no último slot mesmo quando a árvore faria corte antes`, () => {
  const b = Buffer.from(saida); b.writeUInt32LE(valor, b.length - 4)
  assert.throws(() => converter5p4c(smt2, b), new RegExp(erro))
  assert.equal(b.readUInt32LE(b.length - 4), valor)
})
test('recusa saída curta ou excedente', () => {
  for (const n of [4194303, 4194305]) assert.throws(() => validar5p4c(smt2, Buffer.alloc(n)), /saida-tamanho-invalido/)
})
test('prova sintética determinística 29073 bytes, teto 1MiB preservado', () => {
  const a = converter5p4c(smt2, saida), b = converter5p4c(smt2, saida)
  assert.deepEqual(a.prova, b.prova); assert.equal(a.prova.length, 29073)
  assert.equal(a.provaSha256, '235013e58aa06eece569b5c1395995ae78f1dfb3a52443a6a9f6f0cc2d757adf')
  assert.equal(a.resolucoes, 203); assert.ok(a.compartilhamentos > 0)
  assert.equal(a.limiteProvaBytes, 1048576); assert.equal(a.limiteMs, 20000)
})
test('recomputação estrutural de cada resolução; não substitui Carcara independente', () => {
  const a = converter5p4c(smt2, saida), cs = new Map()
  CLAUSULAS.forEach((c, i) => cs.set(`c${i}`, c))
  let numero = 0, ultimo
  for (const linha of a.prova.toString().split('\n')) {
    const m = /^\(step (r\d+) \(cl(.*?)\) :rule resolution :premises \((\w+) (\w+)\) :args \((p\dh\d) true\)\)$/.exec(linha)
    if (!m) continue
    const [, id, texto, esquerdo, direito, pivo] = m
    const e = cs.get(esquerdo), d = cs.get(direito), bit = 1 << NOMES.indexOf(pivo)
    assert.ok(e && d); assert.ok(e.pos & bit); assert.ok(d.neg & bit)
    const c = { pos: (e.pos & ~bit) | d.pos, neg: e.neg | (d.neg & ~bit) }
    assert.equal(c.pos & c.neg, 0)
    const termos = NOMES.flatMap((n, i) => c.pos & (1 << i) ? [n] : c.neg & (1 << i) ? [`(not ${n})`] : [])
    assert.equal(texto.trim(), termos.join(' ')); cs.set(id, c); ultimo = c; numero++
  }
  assert.equal(numero, 203); assert.deepEqual(ultimo, { pos: 0, neg: 0 })
})
test('aceita testemunho válido alternativo; não exige primeira cláusula nem repara saída', () => {
  const b = Buffer.from(saida)
  for (let a = 0; a < 1048576; a++) {
    const outra = CLAUSULAS.findIndex((c, i) => i !== b.readUInt32LE(a * 4) && falsa5p4c(c, a))
    if (outra >= 0) { b.writeUInt32LE(outra, a * 4); break }
  }
  const hash = sha256(b), r = converter5p4c(smt2, b)
  assert.equal(r.saidaSha256, hash); assert.equal(sha256(b), hash)
  assert.ok(r.prova.length <= 1048576)
})
