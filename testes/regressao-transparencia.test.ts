import { describe, expect, it } from 'vitest'
import { raizMerkle, provaInclusao, verificarInclusao, provaConsistencia, verificarConsistencia, avaliarCheckpoint } from '../src/v2/transparencia'
describe('transparência Merkle e checkpoints', () => {
  const folhas = Array.from({ length: 12 }, (_, i) => `registro-${i}`)
  it('confere inclusão para todos os índices e árvores assimétricas', async () => {
    for (let n = 1; n <= 12; n++) for (let i = 0; i < n; i++) {
      const tree = folhas.slice(0,n), root = await raizMerkle(tree), proof = await provaInclusao(tree,i)
      expect(await verificarInclusao(folhas[i],i,n,proof,root)).toBe(true)
      expect(await verificarInclusao('adulterado',i,n,proof,root)).toBe(false)
    }
  })
  it('confere continuidade de cada prefixo e recusa prova adulterada', async () => {
    for (let n=2;n<=12;n++) for(let m=1;m<n;m++) {
      const tree=folhas.slice(0,n), old=await raizMerkle(tree.slice(0,m)), root=await raizMerkle(tree)
      const proof=await provaConsistencia(tree,m)
      expect(await verificarConsistencia(m,n,old,root,proof)).toBe(true)
      expect(await verificarConsistencia(m,n,old,root,proof.map(()=> '0'.repeat(64)))).toBe(false)
    }
  })
  it('detecta rollback, fork no mesmo tamanho e falsa extensão', async () => {
    const old={ log:'autor-A', tamanho:4, raiz:await raizMerkle(folhas.slice(0,4)) }
    expect(await avaliarCheckpoint(old,{...old,tamanho:3},[])).toBe('rollback')
    expect(await avaliarCheckpoint(old,{...old,raiz:'0'.repeat(64)},[])).toBe('bifurcada')
    expect(await avaliarCheckpoint(old,{...old,tamanho:5},[])).toBe('continuidade_invalida')
    const next={...old,tamanho:12,raiz:await raizMerkle(folhas)}
    expect(await avaliarCheckpoint(old,next,await provaConsistencia(folhas,4))).toBe('extensao')
  })

  it('exige a raiz vazia correta nas duas árvores de tamanho zero', async () => {
    const empty = await raizMerkle([]), wrong = '0'.repeat(64)
    expect(await verificarConsistencia(0, 0, empty, empty, [])).toBe(true)
    expect(await verificarConsistencia(0, 0, wrong, wrong, [])).toBe(false)
    expect(await verificarConsistencia(0, 0, empty, wrong, [])).toBe(false)
    expect(await verificarConsistencia(0, 0, wrong, empty, [])).toBe(false)
    expect(await verificarConsistencia(0, 0, empty, empty, [wrong])).toBe(false)
  })

  it('recusa checkpoint vazio com raiz incorreta, inclusive na comparação direta', async () => {
    const empty = { log: 'autor-A', tamanho: 0, raiz: await raizMerkle([]) }
    const wrong = { ...empty, raiz: '0'.repeat(64) }
    expect(await avaliarCheckpoint(empty, empty, [])).toBe('igual')
    expect(await avaliarCheckpoint(wrong, wrong, [])).toBe('continuidade_invalida')
    expect(await avaliarCheckpoint(empty, wrong, [])).toBe('continuidade_invalida')
    expect(await avaliarCheckpoint(wrong, empty, [])).toBe('continuidade_invalida')
    const next = { ...empty, tamanho: 1, raiz: await raizMerkle(['registro']) }
    expect(await avaliarCheckpoint(empty, next, [])).toBe('extensao')
    expect(await avaliarCheckpoint(wrong, next, [])).toBe('continuidade_invalida')
  })
})
