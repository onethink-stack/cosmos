import { createHash } from 'node:crypto'
import { autorizarRagLocal, dadosRag, FalhaRag, permiteClasseFonte } from './permissoes'

export interface FonteRag {
  readonly id: string
  readonly versao: number
  readonly titulo: string
  readonly conteudo: string
  readonly hashSha256: string
  readonly origem: 'catalogo-local-simulado'
  readonly confiabilidade: 'dado-nao-confiavel'
}
export const LIMITES_RAG = Object.freeze({ maxFontes: 128, maxBytesFonte: 16384,
  maxBytesCatalogo: 262144, maxBytesPergunta: 2048, maxTermos: 24, maxResultados: 3, maxCaracteresTrecho: 320 })

export function textoUnicodeValido(texto: string): boolean {
  for (const caractere of texto) {
    const n = caractere.codePointAt(0)!
    if (n >= 0xd800 && n <= 0xdfff) return false
  }
  return true
}

/** Snapshot em memória de fixtures do processo confiável. Nunca percorre diretórios,
 * abre arquivos, URLs ou lê /comprovados/. Hash é dos bytes UTF-8 exatos, sem NFC.
 * Classificação privada é descartada ANTES de ler título, conteúdo, hash ou versão.
 */
export function criarCatalogoFontes(entrada: readonly unknown[] = []) {
  if (!Array.isArray(entrada) || entrada.length > LIMITES_RAG.maxFontes) throw new FalhaRag('fonte_rag_invalida')
  const fontes = new Map<string, Map<number, Readonly<FonteRag> | null>>()
  let bytesCatalogo = 0
  for (let i = 0; i < entrada.length; i++) {
    const item = Object.getOwnPropertyDescriptor(entrada, String(i))
    if (!item || !('value' in item)) throw new FalhaRag('fonte_rag_invalida')
    const valor: unknown = item.value
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) throw new FalhaRag('fonte_rag_invalida')
    const classe = Object.getOwnPropertyDescriptor(valor, 'visibilidade')
    if (!classe || !classe.enumerable || !('value' in classe)) throw new FalhaRag('fonte_rag_invalida')
    if (!permiteClasseFonte(classe.value)) continue
    let d: Record<string, unknown>
    try {
      const estado = Object.getOwnPropertyDescriptor(valor, 'estado')
      if (!estado || !('value' in estado)) throw new Error()
      d = dadosRag(valor, estado.value === 'revogada'
        ? ['id', 'versao', 'visibilidade', 'estado']
        : ['id', 'versao', 'visibilidade', 'estado', 'titulo', 'conteudo', 'hashSha256'])
    } catch { throw new FalhaRag('fonte_rag_invalida') }
    if (typeof d.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(d.id)
        || typeof d.versao !== 'number' || !Number.isSafeInteger(d.versao) || d.versao < 1
        || !['ativa', 'revogada'].includes(d.estado as string)) throw new FalhaRag('fonte_rag_invalida')
    let fonte: Readonly<FonteRag> | null = null
    if (d.estado === 'ativa') {
      if (typeof d.titulo !== 'string' || d.titulo.trim().length === 0 || d.titulo.length > 160
          || typeof d.conteudo !== 'string' || d.conteudo.trim().length === 0
          || !textoUnicodeValido(d.titulo) || !textoUnicodeValido(d.conteudo)
          || Buffer.byteLength(d.conteudo, 'utf8') > LIMITES_RAG.maxBytesFonte
          || typeof d.hashSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(d.hashSha256)
          || createHash('sha256').update(d.conteudo, 'utf8').digest('hex') !== d.hashSha256) throw new FalhaRag('fonte_rag_invalida')
      bytesCatalogo += Buffer.byteLength(d.conteudo, 'utf8')
      if (bytesCatalogo > LIMITES_RAG.maxBytesCatalogo) throw new FalhaRag('fonte_rag_invalida')
      fonte = Object.freeze({ id: d.id, versao: d.versao, titulo: d.titulo, conteudo: d.conteudo,
        hashSha256: d.hashSha256, origem: 'catalogo-local-simulado', confiabilidade: 'dado-nao-confiavel' })
    }
    const versoes = fontes.get(d.id) ?? new Map<number, Readonly<FonteRag> | null>()
    if (versoes.has(d.versao)) {
      const anterior = versoes.get(d.versao)!
      if (JSON.stringify(anterior) !== JSON.stringify(fonte)) throw new FalhaRag('fonte_rag_invalida')
    } else versoes.set(d.versao, fonte)
    fontes.set(d.id, versoes)
  }
  // Uma revogação na versão mais recente impede fallback para versão antiga.
  const atuais: Readonly<FonteRag>[] = []
  for (const versoes of fontes.values()) {
    const atual = versoes.get(Math.max(...versoes.keys()))!
    if (atual) atuais.push(atual)
  }
  atuais.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const snapshot = Object.freeze(atuais)
  return Object.freeze({
    listarAutorizadas(configuracao: unknown): readonly Readonly<FonteRag>[] {
      autorizarRagLocal(configuracao)
      return snapshot
    },
    obter(configuracao: unknown, id: string, versao: number, hashSha256: string): Readonly<FonteRag> | null {
      autorizarRagLocal(configuracao)
      return snapshot.find(f => f.id === id && f.versao === versao && f.hashSha256 === hashSha256) ?? null
    },
  })
}
export type CatalogoFontes = ReturnType<typeof criarCatalogoFontes>
