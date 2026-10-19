// Gera src/logica/unicode16.ts: as faixas de caracteres das classes L (letras) e N (números)
// do Unicode 16.0, para o léxico não depender da versão do Unicode do navegador.
// Só roda num Node cujo Unicode é 16.0 (node -p process.versions.unicode).
// Rodar: node scripts/gerar-unicode16.mjs
import { writeFileSync } from 'node:fs'

if (process.versions.unicode !== '16.0') {
  console.error(`Este Node tem Unicode ${process.versions.unicode}; a tabela precisa sair do 16.0.`)
  process.exit(1)
}
const ehLN = (cp) => /[\p{L}\p{N}]/u.test(String.fromCodePoint(cp))
const faixas = []
let ini = -1
for (let cp = 0; cp <= 0x10ffff; cp++) {
  const ok = !(cp >= 0xd800 && cp <= 0xdfff) && ehLN(cp)
  if (ok && ini < 0) ini = cp
  if (!ok && ini >= 0) {
    faixas.push([ini, cp - 1])
    ini = -1
  }
}
if (ini >= 0) faixas.push([ini, 0x10ffff])
// base 36, em pares início-fim, para o arquivo ficar curto
const texto = faixas.map(([a, b]) => `${a.toString(36)}-${b.toString(36)}`).join(' ')
writeFileSync(
  'src/logica/unicode16.ts',
  `// Gerado por scripts/gerar-unicode16.mjs. Não edite à mão.
// Faixas de caracteres das classes L e N do Unicode 16.0 (${faixas.length} faixas), em base 36.
const FAIXAS = '${texto}'

const LIMITES: number[] = FAIXAS.split(' ').flatMap((f) => f.split('-').map((x) => parseInt(x, 36)))

/** O ponto de código é letra (L) ou número (N) no Unicode 16.0? */
export function ehLetraOuNumero16(cp: number): boolean {
  let lo = 0
  let hi = LIMITES.length / 2 - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (cp < LIMITES[2 * m]) hi = m - 1
    else if (cp > LIMITES[2 * m + 1]) lo = m + 1
    else return true
  }
  return false
}

/** As faixas, para o pacote de conformidade. */
export function faixasLetraNumero16(): [number, number][] {
  const r: [number, number][] = []
  for (let i = 0; i < LIMITES.length; i += 2) r.push([LIMITES[i], LIMITES[i + 1]])
  return r
}
`,
)
console.log(`src/logica/unicode16.ts: ${faixas.length} faixas`)
