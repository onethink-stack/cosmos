import { traduzir5p4c } from './FASE4_B_5P4C_TRADUTOR.ts'
import type { Clausula } from './FASE4_B_5P4C_TRADUTOR.ts'

export const falsa5p4c = (c: Pick<Clausula, 'pos' | 'neg'>, a: number): boolean =>
  (a & c.pos) === 0 && ((~a) & c.neg & 0xfffff) === 0

// Valida todos os slots antes de permitir qualquer corte/compartilhamento de prova.
// Não procura cláusula alternativa nem modifica bytes recebidos.
export function validar5p4c(smt2: Buffer, saida: Buffer) {
  const traducao = traduzir5p4c(smt2)
  if (!Buffer.isBuffer(saida) || saida.length !== 4194304) throw new Error('saida-tamanho-invalido')
  const usados = new Set<number>()
  for (let a = 0; a < 1048576; a++) {
    const indice = saida.readUInt32LE(a * 4)
    if (indice === 0xfffffffe) throw new Error('slot-nao-escrito')
    if (indice === 0xffffffff) throw new Error('sentinela-sat')
    if (indice >= 75) throw new Error('indice-fora-do-dominio')
    if (!falsa5p4c(traducao.clausulas[indice], a)) throw new Error('testemunho-nao-falsifica-clausula')
    usados.add(indice)
  }
  return { ...traducao, usados }
}
