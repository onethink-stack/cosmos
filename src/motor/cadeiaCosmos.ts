import { VOCAB_COSMOS } from '../dados/vocabularioCosmos'

export interface FaseCosmos {
  id: string
  testemunha: unknown
  campo: unknown
}

/** Confere os identificadores simbólicos; não certifica uma prova matemática. */
export function validarFaseCosmos(fase: FaseCosmos): { valida: boolean; erros: string[]; aplica: boolean } {
  const aplica = fase.id === 'F2' || fase.id === 'F3'
  const erros: string[] = []
  if (aplica) {
    const testemunhas = typeof fase.testemunha === 'string' ? fase.testemunha.split('/').map((item) => item.trim()) : []
    if (!VOCAB_COSMOS.testemunha.every((item) => testemunhas.includes(item))) {
      erros.push('A testemunha deve conter Z35 e Z39 como identificadores completos.')
    }
    if (fase.campo !== VOCAB_COSMOS.campo) erros.push('O campo deve ser exatamente ℚ(√2), como expressão simbólica.')
  }
  return { valida: erros.length === 0, erros, aplica }
}

/** Validação dos metadados das fases, distinta da assinatura de elos cadeia-v1. */
export function conferirFaseCosmos(fase: Record<string, unknown>) {
  const campos = Object.keys(fase)
  const campos13Validos = campos.length === VOCAB_COSMOS.campos13.length && VOCAB_COSMOS.campos13.every((campo) => campos.includes(campo))
  const seloValido = fase.selo === VOCAB_COSMOS.selo
  const pessoaExigida = fase.id !== 'F0'
  const pessoaPresente = fase.pessoa === VOCAB_COSMOS.pessoa
  const testemunhaExigida = ['F2', 'F3', 'F4'].includes(String(fase.id))
  const simbolica = validarFaseCosmos({ id: 'F2', testemunha: fase.testemunha, campo: fase.campo })
  const erros: string[] = []
  if (!campos13Validos) erros.push('A fase deve conter exatamente os 13 campos oficiais.')
  if (!VOCAB_COSMOS.fases.some((id) => id === fase.id)) erros.push('Identificador de fase desconhecido.')
  if (!seloValido) erros.push('O selo difere de 502426c.')
  if (pessoaExigida && !pessoaPresente) erros.push('pessoa(φ) ausente ou diferente do vocabulário.')
  if (testemunhaExigida) erros.push(...simbolica.erros)
  if (!['aberto', 'fechado'].includes(String(fase.situacao))) erros.push('Situação desconhecida.')
  if (!['consistente', 'segue', 'contradiz', 'nao-segue'].includes(String(fase.afirmacao))) erros.push('Afirmação desconhecida.')
  return { valida: erros.length === 0, erros, campos13Validos, seloValido, pessoaExigida, pessoaPresente, testemunhaExigida, simbolica }
}

export function progressoCosmos(fases: ReadonlyArray<{ situacao: string }>) {
  const total = fases.length
  const fechadas = fases.filter((fase) => fase.situacao === 'fechado').length
  const abertas = fases.filter((fase) => fase.situacao === 'aberto').length
  return { total, fechadas, abertas, percentualFechado: total ? Math.round(fechadas / total * 100) : 0, percentualAberto: total ? Math.round(abertas / total * 100) : 0 }
}
