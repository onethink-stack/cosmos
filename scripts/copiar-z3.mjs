// Copia o Z3 (WebAssembly, ~35 MB) para public/z3, de onde o app o carrega sob demanda.
import { copyFileSync, mkdirSync, statSync } from 'node:fs'

const origem = 'node_modules/z3-solver/build'
mkdirSync('public/z3', { recursive: true })
for (const f of ['z3-built.js', 'z3-built.wasm']) {
  const de = `${origem}/${f}`
  const para = `public/z3/${f}`
  let igual = false
  try {
    igual = statSync(para).size === statSync(de).size && statSync(para).mtimeMs >= statSync(de).mtimeMs
  } catch {
    /* ainda não copiado */
  }
  if (!igual) copyFileSync(de, para)
}
console.log('Z3 em public/z3/')
