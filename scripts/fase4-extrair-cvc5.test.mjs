import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extrairCorpoCvc5 } from './fase4-extrair-cvc5.mjs'

test('extração da prova pinada é reversível byte a byte; nenhum passo é reescrito', () => {
  const b = readFileSync(new URL('../evidencias/fase4-cpu-referencia/proof.alethe', import.meta.url))
  assert.equal(createHash('sha256').update(b).digest('hex'), '68c77a0feaaf9bc8ecb06a4b28b0bc8fca83225ce7f93c69fe5bff8b8e9db934')
  const r = extrairCorpoCvc5(b)
  assert.equal(r.corpo.length, 5351)
  assert.deepEqual(Buffer.concat([Buffer.from(r.prefixoHex, 'hex'), r.corpo, Buffer.from(r.sufixoHex, 'hex')]), b)
  assert.ok(r.corpo.subarray(0, 10).equals(Buffer.from('(assume a0')))
})
test('não normaliza CRLF nem remove whitespace interno', () => {
  const b = Buffer.from('(\r\n(assume x true)  \r\n)\r\n')
  assert.deepEqual(extrairCorpoCvc5(b).corpo, Buffer.from('(assume x true)  \r\n'))
})
test('aceita o mesmo contêiner com LF, sem confundir com prova já extraída', () => {
  assert.deepEqual(extrairCorpoCvc5(Buffer.from('(\n(step x)\n)\n')).corpo, Buffer.from('(step x)\n'))
  assert.throws(() => extrairCorpoCvc5(Buffer.from('(step x)\n')))
})
test('rejeita contêiner ausente, truncado, com sobra ou corpo vazio', () => {
  for (const b of [Buffer.alloc(0), Buffer.from('(\n)\n'), Buffer.from('(\n(step x)\n'), Buffer.from('(\n(step x)\n)\nextra')])
    assert.throws(() => extrairCorpoCvc5(b))
})
test('extração não corrige passo inválido nem atribui validade lógica', () => {
  const r = extrairCorpoCvc5(Buffer.from('(\n(step errado :rule inexistente)\n)\n'))
  assert.deepEqual(r.corpo, Buffer.from('(step errado :rule inexistente)\n'))
  assert.equal(r.estado, undefined)
})
