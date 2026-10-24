import { LIMITES_RAG, textoUnicodeValido, type CatalogoFontes } from './fontes'
import { autorizarRagLocal, dadosRag, FalhaRag } from './permissoes'

export function validarPerguntaRag(entrada: unknown): string {
  const d = dadosRag(entrada, ['pergunta'])
  if (typeof d.pergunta !== 'string' || !d.pergunta.trim() || !textoUnicodeValido(d.pergunta)
      || Buffer.byteLength(d.pergunta, 'utf8') > LIMITES_RAG.maxBytesPergunta) throw new FalhaRag('pedido_rag_invalido')
  return d.pergunta
}

/** Recuperação lexical determinística: todos os termos devem ocorrer no conteúdo.
 * Não é ranking semântico/confiança probabilística, resposta de LLM ou prova.
 * O envelope separa regras fixas de documentos não confiáveis; isso não demonstra
 * resistência a prompt injection em modelos reais, que não são usados neste P0.
 */
export function prepararContextoRag(configuracao: unknown, pedido: unknown, catalogo: CatalogoFontes) {
  const permissao = autorizarRagLocal(configuracao)
  const pergunta = validarPerguntaRag(pedido)
  const termos = [...new Set(pergunta.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
  if (termos.length > LIMITES_RAG.maxTermos) throw new FalhaRag('pedido_rag_invalido')
  // ACL antes de recuperar/pontuar; não há busca global seguida de pós-filtro.
  const fontes = catalogo.listarAutorizadas(configuracao)
  const correspondentes = termos.length ? fontes.flatMap(f => {
    const caracteres = Array.from(f.conteudo)
    let inicio = 0
    // Recupera um trecho que contém todos os termos, não cita um início irrelevante.
    // Janela com sobreposição; pode abster-se se termos estiverem muito dispersos.
    for (let i = 0; i < caracteres.length; i += 240) {
      const trecho = caracteres.slice(i, i + LIMITES_RAG.maxCaracteresTrecho).join('')
      const palavras = trecho.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
      const letra = (s: string | undefined) => s !== undefined && /^[\p{L}\p{N}\p{M}]$/u.test(s)
      // Não transformar pedaço de uma palavra cortada pela janela em correspondência.
      if (letra(caracteres[i - 1]) && letra(caracteres[i])) palavras.shift()
      const fimCaracteres = i + LIMITES_RAG.maxCaracteresTrecho
      if (letra(caracteres[fimCaracteres - 1]) && letra(caracteres[fimCaracteres])) palavras.pop()
      const encontrados = new Set(palavras)
      if (termos.every(t => encontrados.has(t))) return [{ f, trecho, inicio, fim: inicio + trecho.length }]
      inicio += caracteres.slice(i, i + 240).join('').length
    }
    return []
  }) : []
  // Abstenção se a seleção excederia o teto: não esconder resultados relevantes.
  const motivo = !correspondentes.length ? 'sem-fonte-suficiente' as const
    : correspondentes.length > LIMITES_RAG.maxResultados ? 'consulta-ambigua' as const : null
  const documentos = motivo ? [] : correspondentes.map(({ f, trecho, inicio, fim }) => {
    return Object.freeze({ id: f.id, versao: f.versao, titulo: f.titulo,
      hashSha256: f.hashSha256, origem: f.origem, confiabilidade: f.confiabilidade,
      trecho, inicio, fim,
      href: `/integracoes/p0/fontes/${f.id}/${f.versao}/${f.hashSha256}`,
    })
  })
  return Object.freeze({ formato: 'cosmos-contexto-rag-simulado-v1' as const, simulado: true as const,
    configuracaoId: permissao.configuracaoId, configuracaoRevisao: permissao.configuracaoRevisao,
    estado: motivo ? 'inconclusivo' as const : 'fontes-encontradas' as const, motivo,
    regras: Object.freeze({ documentosSaoInstrucoes: false as const, ferramentasPermitidas: false as const,
      envioRemoto: false as const, afirmaVerdade: false as const, provaFormal: false as const }),
    documentos: Object.freeze(documentos),
  })
}
