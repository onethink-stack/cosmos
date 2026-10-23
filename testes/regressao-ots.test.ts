import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { conferirProvaLocal } from '../src/v2/ots-node'
const alvo = readFileSync('public/cosmos-502426c-resumo.txt')
const prova = readFileSync('public/cosmos-502426c-resumo.txt.ots')
describe('OTS: vínculo real e estados sem confirmação inventada', () => {
  it('a leitura local da prova real não inventa confirmação Bitcoin', () => {
    expect(conferirProvaLocal(prova, alvo)).toMatchObject({ vinculoValido: true, confirmacaoVerificada: false })
  })
  it('recusa prova vinculada a outros bytes', () => {
    expect(() => conferirProvaLocal(prova, new Uint8Array([0]))).toThrow(/vínculo/)
  })
  it('recusa bytes que não são um arquivo OTS', () => {
    expect(() => conferirProvaLocal(new Uint8Array([1,2,3]), alvo)).toThrow()
  })
})
