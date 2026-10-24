// Oráculo sintético SOMENTE para testes da ponte. Não importar no host GPU.
import { CLAUSULAS, gerarSmt2 } from '../FASE4_B_5P4C_TRADUTOR.ts'
import { falsa5p4c } from '../FASE4_B_5P4C_VALIDADOR.ts'
export function fixture5p4c() {
  const saida = Buffer.alloc(4194304)
  for (let a = 0; a < 1048576; a++) {
    const indice = CLAUSULAS.findIndex(c => falsa5p4c(c, a))
    saida.writeUInt32LE(indice < 0 ? 0xffffffff : indice, a * 4)
  }
  return { smt2: gerarSmt2(), saida }
}
