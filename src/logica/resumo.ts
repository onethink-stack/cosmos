// Resumo curto de um texto longo, para usar como chave (banco de provas,
// respostas do Z3): o texto inteiro das fórmulas chegava a dezenas de KB por
// chave, e milhares de chaves enchiam a memória de cada worker.
//
// Dois cyrb53 (53 bits cada) com sementes diferentes, mais o tamanho do texto:
// a chance de dois conjuntos diferentes terem o mesmo resumo é desprezível
// (perto de 1 em 10¹⁰ mesmo com dezenas de milhares de chaves guardadas).

function cyrb53(texto: string, semente: number): number {
  let h1 = 0xdeadbeef ^ semente
  let h2 = 0x41c6ce57 ^ semente
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** "k3j9…": uns 25 caracteres, sempre os mesmos para o mesmo texto */
export function resumo(texto: string): string {
  return `${cyrb53(texto, 1).toString(36)}.${cyrb53(texto, 0x9e3779b9).toString(36)}.${texto.length.toString(36)}`
}
