import { converterNoCursor, converterTudo } from '../logica/atalhos'

export interface Edicao {
  texto: string
  cursor: number
}

/**
 * Insere um símbolo da barra no lugar da seleção. Espaços nas pontas de " ∧ "
 * são omitidos quando já existe espaço (ou um '(') daquele lado.
 */
export function inserirTexto(valor: string, ini: number, fim: number, ins: string): Edicao {
  const antes = valor.slice(0, ini)
  const depois = valor.slice(fim)
  if (ins.startsWith(' ') && (antes === '' || /[\s(]$/.test(antes))) ins = ins.slice(1)
  if (ins.endsWith(' ') && /^[\s)]/.test(depois)) ins = ins.slice(0, -1)
  // '‸' marca onde o cursor fica (ex.: "B[‸] " deixa o cursor entre os colchetes)
  const marca = ins.indexOf('‸')
  if (marca >= 0) {
    ins = ins.replace('‸', '')
    return { texto: antes + ins + depois, cursor: antes.length + marca }
  }
  return { texto: antes + ins + depois, cursor: antes.length + ins.length }
}

/**
 * Trata um evento `input` do campo de fórmula. Devolve a edição a aplicar, ou
 * null se o texto deve ficar como está.
 * - digitação: converte o atalho que termina no cursor;
 * - colar/arrastar: converte tudo e troca quebras de linha por espaço;
 * - apagar: não converte nada (para não "ressuscitar" atalhos);
 * - durante composição do teclado (IME), espera o compositionend.
 */
export function processarEntrada(valor: string, cursor: number, inputType: string, compondo: boolean): Edicao | null {
  if (compondo || !inputType.startsWith('insert')) return null
  const colar = inputType === 'insertFromPaste' || inputType === 'insertFromDrop' || inputType === 'insertReplacementText'
  const limpar = (s: string) => (colar ? s.replace(/\r?\n/g, ' ') : s)
  // O teclado do celular pode inserir vários caracteres num só evento:
  // converte tudo antes do cursor e, em seguida, o atalho que termina nele (ex.: "_i").
  let antes = converterTudo(limpar(valor.slice(0, cursor)))
  antes = converterNoCursor(antes, antes.length)?.texto ?? antes
  const depois = colar ? converterTudo(limpar(valor.slice(cursor))) : valor.slice(cursor)
  const texto = antes + depois
  return texto === valor ? null : { texto, cursor: antes.length }
}
