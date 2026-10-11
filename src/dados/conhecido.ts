// O que já se sabe de um problema do TPTP: o "Status" do arquivo, decidido
// pelos provadores automáticos (para todos os tamanhos de mundo, não só até um
// limite). A conjectura de um problema carregado no caderno leva isso numa
// etiqueta, e o segundo modelo compara com o que o motor achou.

export type Sabe = 'segue' | 'nao-segue' | 'contraditorio' | 'consistente' | 'aberto' | 'desconhecido'

/** etiqueta na conjectura de um problema carregado: "tptp-sabe-segue" etc. */
export const ETIQUETA_TPTP = 'tptp-sabe-'

export const SABE: Record<Sabe, { curto: string; longo: string }> = {
  segue: { curto: 'teorema', longo: 'os provadores provaram que a conjectura segue dos axiomas' },
  'nao-segue': { curto: 'não segue', longo: 'sabe-se que a conjectura não segue dos axiomas (há contraexemplo)' },
  contraditorio: { curto: 'axiomas contraditórios', longo: 'sabe-se que os axiomas se contradizem' },
  consistente: { curto: 'consistente', longo: 'sabe-se que os axiomas não se contradizem (há mundo onde valem)' },
  aberto: { curto: 'em aberto', longo: 'problema em aberto: ninguém sabe a resposta' },
  desconhecido: { curto: 'sem resposta', longo: 'nenhum provador resolveu ainda' },
}

/**
 * O status do TPTP no que interessa ao caderno. Em CNF a conjectura vem
 * negada: "Unsatisfiable" com conjectura quer dizer que ela segue; sem
 * conjectura, que os axiomas se contradizem. `temConjectura` nulo: não se sabe.
 */
export function oQueSeSabe(status: string, temConjectura: boolean | null): Sabe {
  switch (status) {
    case 'Theorem':
      return 'segue'
    case 'CounterSatisfiable':
      return 'nao-segue'
    case 'ContradictoryAxioms':
      return 'contraditorio'
    case 'Unsatisfiable':
      return temConjectura === false ? 'contraditorio' : 'segue'
    case 'Satisfiable':
      return temConjectura === false ? 'consistente' : 'nao-segue'
    case 'Open':
      return 'aberto'
    default:
      return 'desconhecido'
  }
}

/** o que o TPTP sabe da conjectura desta nota (pela etiqueta), se for de um problema carregado */
export const sabeDaNota = (tags: string[]): Sabe | undefined =>
  tags.find((t) => t.startsWith(ETIQUETA_TPTP))?.slice(ETIQUETA_TPTP.length) as Sabe | undefined
