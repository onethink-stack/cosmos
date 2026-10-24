import { describe, expect, it } from 'vitest'
import { REGISTROS_PUBLICOS, pesquisarPublicos, MODULOS_V3 } from '../src/v3/catalogo'
import { conferirAletheLocal } from '../src/v3/carcara-node'
import { lerRota } from '../src/ui/rotas'
describe('catálogo público e entrada v3', () => {
  it('pesquisa por metadados, hash e chave, sem indexar campos privados', () => {
    expect(REGISTROS_PUBLICOS).toHaveLength(9)
    expect(pesquisarPublicos('f2 campo').map(r => r.id)).toEqual(['F2'])
    expect(pesquisarPublicos(REGISTROS_PUBLICOS[0].hash)).toHaveLength(1)
    expect(pesquisarPublicos(REGISTROS_PUBLICOS[0].autor)).toHaveLength(9)
    expect(pesquisarPublicos('conteúdo-privado-não-publicado')).toEqual([])
    for (const r of REGISTROS_PUBLICOS) expect(Object.keys(r).sort()).toEqual(['autor', 'dominio', 'estado', 'hash', 'id', 'titulo'])
  })
  it('mantém as rotas das fichas e oferece hub, índice e certificados', () => {
    for (const tela of ['hub', 'indice', 'certificados', 'cadeia', 'outras']) expect(lerRota(`#/${tela}?v=3`).tela).toBe(tela)
    expect(new Set(MODULOS_V3.map(m => m.tela)).size).toBe(12)
  })
})
describe('Carcara falha fechado, sem fingir execução formal', () => {
  it('não aprova arquivos quando o verificador não está configurado', () => {
    expect(conferirAletheLocal('inexistente.alethe', 'inexistente.smt2', { binario: '', sha256Binario: '' }).estado).toBe('indisponivel')
  })
  it('não executa um binário com hash diferente do pin', () => {
    expect(conferirAletheLocal('inexistente.alethe', 'inexistente.smt2', { binario: process.execPath, sha256Binario: '0'.repeat(64) }).estado).toBe('indisponivel')
  })
})
