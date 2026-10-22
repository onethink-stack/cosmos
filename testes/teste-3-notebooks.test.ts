import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adulterarUmByteF2, testeTresNotebooks } from '../src/motor/teste-3-notebooks'
import { PACOTE_COSMOS } from '../src/dados/pacoteCosmos'

describe('critério SUMA: simulação de três notebooks trocando arquivos', () => {
  it('A exporta, B e C importam, e os três recusam a adulteração de um byte em F2', async () => {
    const raiz = await mkdtemp(join(tmpdir(), 'cosmos-3-notebooks-'))
    try {
      const relatorio = await testeTresNotebooks({
        async salvar(notebook, nome, bytes) { await mkdir(join(raiz, notebook), { recursive: true }); await writeFile(join(raiz, notebook, nome), bytes) },
        async ler(notebook, nome) { return new Uint8Array(await readFile(join(raiz, notebook, nome))) },
        log: (mensagem) => console.log(mensagem),
      })
      expect(relatorio).toMatchObject({ simulacao: true, aceitos: 3, bytesAlterados: 1, motivo: 'C8', resumo_final: PACOTE_COSMOS.resumo_final })
      for (const notebook of ['A', 'B', 'C']) {
        expect(JSON.parse(await readFile(join(raiz, notebook, 'cosmos-502426c.json'), 'utf8')).fases).toHaveLength(9)
      }
    } finally {
      const alvo = resolve(raiz)
      if (alvo.startsWith(resolve(tmpdir()) + sep) && alvo.split(sep).at(-1)?.startsWith('cosmos-3-notebooks-')) await rm(alvo, { recursive: true, force: true })
    }
  }, 15000)
  it('altera um único byte sem invalidar o JSON nem mudar seu tamanho', () => {
    const original = new TextEncoder().encode(JSON.stringify(PACOTE_COSMOS))
    const alterado = adulterarUmByteF2(original)
    expect(alterado.length).toBe(original.length)
    expect(alterado.filter((byte, i) => byte !== original[i])).toHaveLength(1)
    expect(() => JSON.parse(new TextDecoder().decode(alterado))).not.toThrow()
  })
})
