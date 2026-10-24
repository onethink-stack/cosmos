import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { traduzirSmt2B, gerarTestemunhosSinteticosB, converterTestemunhosB, validarTestemunhosB, shaB } from './fase4-b-ponte.mjs'
const smt2 = readFileSync(new URL('../src/fase4/entrada-4-pombos-3-caixas.smt2', import.meta.url))
test('traduz toda a entrada fixa em 288 bytes little-endian, com 34 cláusulas', () => {
  const t = traduzirSmt2B(smt2)
  assert.equal(t.buffer.length, 288); assert.equal(t.clausulas.length, 34)
  assert.deepEqual([0, 4, 8, 12].map(o => t.buffer.readUInt32LE(o)), [1, 12, 34, 4096])
  assert.equal(t.buffer.readUInt32LE(16), 7); assert.equal(t.buffer.readUInt32LE(20), 0)
})
test('recusa qualquer alteração do SMT2, inclusive bytes extras ou CRLF', () => {
  for (const b of [Buffer.concat([smt2, Buffer.from(' ')]), Buffer.from(smt2.toString().replaceAll('\n', '\r\n')), Buffer.from('(check-sat)')]) assert.throws(() => traduzirSmt2B(b))
})
test('testemunhos sintéticos cobrem 4096 slots e geram prova limitada e determinística', () => {
  const s = gerarTestemunhosSinteticosB(smt2), a = converterTestemunhosB(smt2, s), b = converterTestemunhosB(smt2, s)
  assert.equal(s.length, 16384); assert.equal(validarTestemunhosB(s, traduzirSmt2B(smt2).clausulas).length, 4096)
  assert.ok(a.prova.length < 1048576); assert.deepEqual(a.prova, b.prova)
  assert.ok(a.prova.toString().trim().endsWith('true))')); assert.equal(shaB(s), a.saidaSha256)
  assert.ok(a.prova.toString().includes('(cl) :rule resolution'))
})
for (const [n, v, erro] of [['slot', 0xFFFFFFFE, 'slot-nao-escrito'], ['sat', 0xFFFFFFFF, 'sentinela-sat'], ['indice', 34, 'indice-fora-do-dominio']]) test(`recusa ${n} sem corrigir na CPU`, () => {
  const s = gerarTestemunhosSinteticosB(smt2); s.writeUInt32LE(v, 0)
  assert.throws(() => converterTestemunhosB(smt2, s), new RegExp(erro))
})
test('recusa cláusula verdadeira indicada como falsa', () => {
  const s = gerarTestemunhosSinteticosB(smt2); s.writeUInt32LE(0, 4095 * 4)
  assert.throws(() => converterTestemunhosB(smt2, s), /testemunho-nao-falsifica/)
})
test('recusa saída curta ou excedente', () => {
  for (const s of [Buffer.alloc(16383), Buffer.alloc(16385)]) assert.throws(() => converterTestemunhosB(smt2, s), /tamanho/)
})
