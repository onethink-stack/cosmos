import { performance } from 'node:perf_hooks'
import { NOMES, sha256 } from './FASE4_B_5P4C_TRADUTOR.ts'
import { falsa5p4c, validar5p4c } from './FASE4_B_5P4C_VALIDADOR.ts'

type Conclusao = { pos: number; neg: number; id: string }
export const FORMATO_PONTE = 'cosmos-b-gpu-5p4c-ponte-corte-mascara-v1'

export function converter5p4c(smt2: Buffer, saida: Buffer) {
  const inicio = performance.now()
  const prazo = () => { if (performance.now() - inicio >= 20000) throw new Error('timeout-ponte') }
  const t = validar5p4c(smt2, saida)
  // Máscaras de conclusões já demonstradas, não prefixos de atribuições.
  const demonstradas = new Map<string, Conclusao>()
  const chave = (c: { pos: number; neg: number }) => `${c.pos}:${c.neg}`
  const linhas: string[] = []
  let bytes = 0, resolucoes = 0, cortes = 0, compartilhamentos = 0, visitas = 0
  const emitir = (s: string) => {
    bytes += Buffer.byteLength(s, 'utf8') + 1
    if (bytes > 1048576) throw new Error('prova-excede-limite')
    linhas.push(s)
  }
  t.clausulas.forEach((c, i) => emitir(`(assume a${i} (or ${c.termos.join(' ')}))`))
  const folhas = t.clausulas.map((c, i) => {
    emitir(`(step c${i} (cl ${c.termos.join(' ')}) :rule or :premises (a${i}))`)
    const folha = { pos: c.pos, neg: c.neg, id: `c${i}` }
    demonstradas.set(chave(c), folha)
    return folha
  })
  const termos = (c: Conclusao) => NOMES.flatMap((n, i) => c.pos & (1 << i) ? [n] : c.neg & (1 << i) ? [`(not ${n})`] : [])
  function arvore(prefixo: number, profundidade: number): Conclusao {
    if ((++visitas & 1023) === 0) prazo()
    const conhecidos = (1 << profundidade) - 1
    const folha = folhas[saida.readUInt32LE(prefixo * 4)]
    // O testemunho deste slot demonstra uma cláusula já falsa em TODAS as
    // extensões do prefixo. Não exige que os outros slots escolham o mesmo índice.
    if (((folha.pos | folha.neg) & ~conhecidos) === 0 && falsa5p4c(folha, prefixo)) {
      cortes++
      return folha
    }
    if (profundidade >= 20) throw new Error('cobertura-invalida')
    const bit = 1 << profundidade
    const e = arvore(prefixo, profundidade + 1)
    const d = arvore(prefixo | bit, profundidade + 1)
    if (!(e.pos & bit)) return e
    if (!(d.neg & bit)) return d
    const pos = (e.pos & ~bit) | d.pos, neg = e.neg | (d.neg & ~bit)
    if ((pos & neg) || ((pos | neg) & ~conhecidos) || !falsa5p4c({ pos, neg }, prefixo)) throw new Error('resolvente-invalido')
    const anterior = demonstradas.get(`${pos}:${neg}`)
    if (anterior) { compartilhamentos++; return anterior }
    const c = { pos, neg, id: `r${resolucoes++}` }
    const xs = termos(c)
    emitir(`(step ${c.id} (cl${xs.length ? ' ' + xs.join(' ') : ''}) :rule resolution :premises (${e.id} ${d.id}) :args (${NOMES[profundidade]} true))`)
    demonstradas.set(chave(c), c)
    return c
  }
  const fim = arvore(0, 0)
  prazo()
  if (fim.pos || fim.neg || !linhas.at(-1)?.startsWith(`(step ${fim.id} (cl) `)) throw new Error('conclusao-nao-vazia')
  const prova = Buffer.from(linhas.join('\n') + '\n')
  return { formato: FORMATO_PONTE, prova, provaSha256: sha256(prova), saidaSha256: sha256(saida),
    smt2Sha256: t.smt2Sha256, bufferSha256: t.bufferSha256, resolucoes, cortes, compartilhamentos, visitas,
    clausulasTestemunhadas: t.usados.size, duracaoMs: Math.ceil(performance.now() - inicio),
    limiteProvaBytes: 1048576, limiteMs: 20000 }
}
