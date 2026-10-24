import { conferirAletheLocal } from '../src/v3/carcara-node.ts'
const [, , prova, problema] = process.argv
if (!prova || !problema) {
  console.log(JSON.stringify({ estado: 'indisponivel', motivo: 'Uso: node --experimental-strip-types scripts/conferir-alethe-v3.mjs PROVA.alethe PROBLEMA.smt2' }))
  process.exitCode = 2
} else {
  const resultado = conferirAletheLocal(prova, problema)
  console.log(JSON.stringify(resultado, null, 2))
  process.exitCode = resultado.estado === 'verificado' ? 0 : 2
}
