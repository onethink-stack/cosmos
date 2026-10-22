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
