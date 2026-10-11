// Correções de notas que vieram das bibliotecas com um defeito já corrigido,
// feitas ao abrir o app (só mexe no que precisa; as notas do usuário ficam).

import { estado } from './estado'

const QUANTIFICADORES = /(?:[∀∃]\s*[\p{L}][\p{L}\p{N}_]*(?:\s*∈\s*[\p{L}\p{N}_]+)?\s*)+\(/gu

/**
 * Na linguagem do caderno o escopo de um quantificador vai até o fim:
 * "∃x (A) ⟹ B" é "∃x (A ⟹ B)". O tradutor do TPTP e duas fórmulas da
 * biblioteca de teorias escreviam assim querendo dizer "(∃x (A)) ⟹ B" — o
 * grupo do quantificador seguido de um conectivo ganha os parênteses que
 * faltavam (é o aviso E14 do validador).
 */
export function parentesesNoEscopo(f: string): string {
  for (let guarda = 0; guarda < 200; guarda++) {
    let mudou = false
    QUANTIFICADORES.lastIndex = 0
    for (let m = QUANTIFICADORES.exec(f); m; m = QUANTIFICADORES.exec(f)) {
      // o parêntese que fecha o grupo do quantificador
      let fim = -1
      for (let j = m.index + m[0].length - 1, d = 0; j < f.length; j++) {
        if (f[j] === '(') d++
        else if (f[j] === ')' && --d === 0) {
          fim = j
          break
        }
      }
      if (fim < 0) break
      if (/^\s*[⟹∧∨⟺]/.test(f.slice(fim + 1))) {
        f = `${f.slice(0, m.index)}(${f.slice(m.index, fim + 1)})${f.slice(fim + 1)}`
        mudou = true
        break
      }
      // o próximo quantificador pode começar dentro deste grupo
      QUANTIFICADORES.lastIndex = m.index + 1
    }
    if (!mudou) return f
  }
  return f
}

/** As notas das bibliotecas (TPTP e teorias embutidas) com o defeito de escopo: conserta e grava. */
export async function corrigirNotasDasBibliotecas(): Promise<number> {
  let corrigidas = 0
  for (const n of estado.notas) {
    if (!n.tags.some((t) => t === 'tptp' || t === 'teoria')) continue
    const formulas = n.formulas.map(parentesesNoEscopo)
    if (formulas.every((f, i) => f === n.formulas[i])) continue
    await estado.salvarNota({ ...n, formulas })
    corrigidas++
  }
  return corrigidas
}
