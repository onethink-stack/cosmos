// Uma tabela vinda de outro lugar da tela Mundo (ex.: Wikidata) para o
// quadro "Importar uma tabela", onde se confere como cada coluna entra.

export interface ParaImportar {
  texto: string
  nome: string
  fonte: string
}

const ouvintes = new Set<(p: ParaImportar) => void>()

export function enviarParaImportar(p: ParaImportar) {
  ouvintes.forEach((f) => f(p))
}

export function aoReceberTabela(fn: (p: ParaImportar) => void) {
  ouvintes.add(fn)
  return () => {
    ouvintes.delete(fn)
  }
}
