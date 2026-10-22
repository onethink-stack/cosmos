import { PACOTE_COSMOS } from '../dados/pacoteCosmos'
import { conferirElosCosmos } from './elosCosmos'

export type Notebook = 'A' | 'B' | 'C'
export interface ArquivosNotebooks {
  salvar(notebook: Notebook, nome: string, bytes: Uint8Array): Promise<void>
  ler(notebook: Notebook, nome: string): Promise<Uint8Array>
  log(mensagem: string): void
}

/** Altera exatamente um byte ASCII de F2 no registro assinado, preservando o JSON. */
export function adulterarUmByteF2(original: Uint8Array): Uint8Array {
  const texto = new TextDecoder('utf-8', { fatal: true }).decode(original)
  const marcador = '\\"fase\\":\\"F2\\"'
  const indice = texto.indexOf(marcador)
  if (indice < 0) throw new Error('Registro assinado de F2 não encontrado.')
  const posicao = new TextEncoder().encode(texto.slice(0, indice + marcador.indexOf('F2') + 1)).length
  const alterado = new Uint8Array(original)
  if (alterado[posicao] !== 50) throw new Error('Byte de F2 inesperado.')
  alterado[posicao] = 51
  return alterado
}

/** Simulação de três aparelhos com arquivos independentes; nenhuma chave é criada. */
export async function testeTresNotebooks(arquivos: ArquivosNotebooks) {
  const nome = 'cosmos-502426c.json'
  const conferirArquivo = async (bytes: Uint8Array) => {
    const pacote = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    return conferirElosCosmos(pacote, pacote.fases)
  }
  // A monta o arquivo com as nove fases e assinaturas já publicadas da mesma chave.
  const original = new TextEncoder().encode(JSON.stringify(PACOTE_COSMOS))
  await arquivos.salvar('A', nome, original)
  const resultadoA = await conferirArquivo(await arquivos.ler('A', nome))
  if (!resultadoA.verificado) throw new Error(`Notebook A: ${resultadoA.detalhe}`)
  await arquivos.salvar('B', nome, await arquivos.ler('A', nome))
  const resultadoB = await conferirArquivo(await arquivos.ler('B', nome))
  if (!resultadoB.verificado) throw new Error(`Notebook B: ${resultadoB.detalhe}`)
  await arquivos.salvar('C', nome, await arquivos.ler('B', nome))
  const resultadoC = await conferirArquivo(await arquivos.ler('C', nome))
  if (!resultadoC.verificado) throw new Error(`Notebook C: ${resultadoC.detalhe}`)
  const adulterado = adulterarUmByteF2(await arquivos.ler('C', nome))
  if (adulterado.filter((byte, i) => byte !== original[i]).length !== 1) throw new Error('A adulteração deve mudar exatamente um byte.')
  for (const notebook of ['C', 'B', 'A'] as const) {
    await arquivos.salvar(notebook, 'alterada.json', adulterado)
    const resultado = await conferirArquivo(await arquivos.ler(notebook, 'alterada.json'))
    if (resultado.verificado || !resultado.detalhe.startsWith('C8:')) throw new Error(`Notebook ${notebook} não acusou assinatura inválida em F2: ${resultado.detalhe}`)
    arquivos.log(`Notebook ${notebook}: alteração de 1 byte em F2 detectada — C8, assinatura inválida.`)
  }
  const mensagem = '3 notebooks trocam cadeias por arquivo e cada um acusa qualquer alteração - OK'
  arquivos.log('Simulação local A/B/C; não representa três aparelhos físicos nem carimbo Bitcoin.')
  arquivos.log(mensagem)
  return { simulacao: true, aceitos: 3, bytesAlterados: 1, motivo: 'C8', resumo_final: resultadoA.cabeca, mensagem }
}
