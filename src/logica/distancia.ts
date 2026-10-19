/**
 * Distância de edição com transposição de vizinhos (Damerau, versão OSA):
 * "Amgio" → "Amigo" = 1. Conta caracteres Unicode (pontos de código).
 */
export function distancia(x: string, y: string): number {
  const a = [...x]
  const b = [...y]
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

/** Tamanho mínimo dos nomes comparados: entre nomes de 1–2 letras (x, A, f) tudo seria "parecido". */
export const TAMANHO_MINIMO = 3

/**
 * Nome existente a até 2 edições de distância de `nome` (o mais próximo; no
 * empate, o primeiro). Só compara nomes com 3 caracteres ou mais, e com no
 * máximo 2 de diferença no tamanho.
 */
export function nomeParecido(nome: string, existentes: Iterable<string>): string | null {
  const tamanho = (s: string) => [...s].length
  if (tamanho(nome) < TAMANHO_MINIMO) return null
  let melhor: string | null = null
  let melhorD = 3
  for (const e of existentes) {
    if (e === nome || tamanho(e) < TAMANHO_MINIMO) continue
    if (Math.abs(tamanho(e) - tamanho(nome)) > 2) continue
    const d = distancia(nome, e)
    if (d < melhorD) {
      melhor = e
      melhorD = d
    }
  }
  return melhor
}
