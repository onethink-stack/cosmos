// O registro do formato aberto (registro-v1, especificacao/registros-v1.md): uma afirmação (segue, contradiz,
// nao-segue, consistente) sobre uma fórmula e uma teoria, com tipo, domínio, estado, hash da teoria, versão da
// semântica, autor, compromisso e certificado. Aqui ficam a forma canônica, os textos que dão os hashes e a
// conferência do Caderno, que faz tudo menos a prova Alethe (essa é do Carcara, no verificador público).

import type { EntradaDicionario } from '../dados/tipos'
import { escreverArvore } from '../logica/arvore'
import type { Formula } from '../logica/ast'
import { renomearLigadas } from '../logica/canonica'
import { temAritmetica } from '../logica/termos'
import { falhasDoCertificado } from './certificadoModelo'
import { falhasDoModeloExato, FORMATO_EXATO } from './modeloExato'
import { diferencaDeProblemas } from './vinculo'

export const FORMATO_REGISTRO = 'registro-v1'
export const AFIRMACOES = ['segue', 'contradiz', 'nao-segue', 'consistente'] as const
export const TIPOS = ['axioma matemático', 'observação', 'hipótese', 'definição', 'norma', 'teorema'] as const
export const ESTADOS = ['proposta', 'corroborada', 'contestada', 'refutada', 'sem avaliação'] as const
export type Afirmacao = (typeof AFIRMACOES)[number]

export interface Ficha {
  simbolo: string
  tipo: 'constante' | 'funcao' | 'predicado'
  aridade: number
  numerico?: boolean
  argumentos?: ('num' | 'obj')[]
}
export interface Arquivo {
  arquivo: string
  sha256: string
}
export interface Certificado {
  refutacao?: { problema: Arquivo; prova: Arquivo }
  modeloDasPremissas?: unknown
  vazio?: { problema: Arquivo; prova: Arquivo }
  modelo?: unknown
}
export interface Registro {
  formato: typeof FORMATO_REGISTRO
  situacao: 'aberto' | 'fechado'
  afirmacao: Afirmacao
  formula?: string
  formaCanonica?: string
  teoria: { nome: string; fichas?: Ficha[]; premissas?: string[]; hash: string }
  tipo: (typeof TIPOS)[number]
  dominio: string
  estado: (typeof ESTADOS)[number]
  semantica: { gramatica: 'm2'; traducao: 't1' }
  autor: string
  compromisso: { hash: string; sal?: string }
  certificado?: Certificado
}

// ---- a forma canônica, os textos e os hashes

/** A árvore expandida escrita como na seção 6 da m2, com as variáveis ligadas trocadas por #1, #2… */
export const formaCanonica = (expandida: Formula): string => escreverArvore(renomearLigadas(expandida))

/** a ordem dos pontos de código (a do UTF-8 e a do Python), não a das unidades de UTF-16 */
export function compararPontos(a: string, b: string): number {
  const x = [...a]
  const y = [...b]
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!
    if (d) return d
  }
  return x.length - y.length
}

export const linhaDaFicha = (f: Ficha) =>
  `ficha ${f.simbolo} ${f.tipo} ${f.aridade} ${f.numerico ? 'numerico' : '-'} ${f.argumentos?.length ? f.argumentos.join(',') : '-'}`

const fichasOrdenadas = (fichas: Ficha[]) => fichas.map(linhaDaFicha).sort(compararPontos)

/** O texto cujo SHA-256 é o hash da teoria: as fichas e as premissas (formas canônicas), em ordem, sem repetir. */
export function textoDaTeoria(premissasCanonicas: string[], fichas: Ficha[]): string {
  const premissas = [...new Set(premissasCanonicas)].sort(compararPontos).map((p) => `premissa ${p}`)
  return ['teoria-v1', ...fichasOrdenadas(fichas), ...premissas].map((l) => l + '\n').join('')
}

/** O texto da fórmula, que o compromisso esconde: as fichas do dicionário e a forma canônica. */
export function textoDaFormula(canonica: string, fichas: Ficha[]): string {
  return ['formula-v1', ...fichasOrdenadas(fichas), `formula ${canonica}`].map((l) => l + '\n').join('')
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256(dados: string | Uint8Array): Promise<string> {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

/** SHA-256 dos 32 bytes do sal seguidos do texto da fórmula em UTF-8 */
export async function compromissoDe(sal: string, textoFormula: string): Promise<string> {
  const s = sal.match(/../g)!.map((h) => parseInt(h, 16))
  const t = new TextEncoder().encode(textoFormula)
  const junto = new Uint8Array(s.length + t.length)
  junto.set(s)
  junto.set(t, s.length)
  return sha256(junto)
}

/** O conjunto que o certificado confere: as premissas, na ordem, e depois ¬φ (segue, nao-segue) ou φ (contradiz, consistente). */
export function conjuntoDoCertificado(afirmacao: Afirmacao, premissas: Formula[], formula: Formula): Formula[] {
  const negada = afirmacao === 'segue' || afirmacao === 'nao-segue'
  return [...premissas, negada ? { k: 'not', f: formula, pos: 0, end: 0 } : formula]
}

/** As fichas no formato do dicionário do Caderno (para ler as fórmulas) */
export const comoDicionario = (fichas: Ficha[]): EntradaDicionario[] =>
  fichas.map((f) => ({ id: f.simbolo, termo: f.simbolo, definicao: '', ...f }) as EntradaDicionario)

// ---- a conferência do Caderno

export interface AmbienteDaConferencia {
  /** a árvore expandida da fórmula lida pela m2 com estas fichas; null se a m2 recusa */
  ler: (texto: string, fichas: Ficha[]) => Formula | null
  /** os bytes de um arquivo do conjunto de registros; null se não existe */
  arquivo: (caminho: string) => Uint8Array | null
  /** o problema que a tradução t1 do Caderno manda ao Z3 (sem set-logic e sem check-sat) */
  traduzir: (fs: Formula[], numericos: Set<string>) => string
}

export interface Conferencia {
  /** o código do primeiro passo que falhou (R1 a R12), ou null */
  motivo: string | null
  detalhe: string
  /** as provas Alethe que ficaram sem conferir (o Carcara não roda aqui) */
  provasSemConferir: number
}

const SHA = /^[0-9a-f]{64}$/
const ehTexto = (x: unknown): x is string => typeof x === 'string' && x.length > 0
const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const soEstes = (o: Record<string, unknown>, campos: string[]) => Object.keys(o).every((k) => campos.includes(k))

class Falha extends Error {
  constructor(
    readonly motivo: string,
    detalhe: string,
  ) {
    super(detalhe)
  }
}
const falhar = (motivo: string, detalhe: string): never => {
  throw new Falha(motivo, detalhe)
}

function conferirFicha(f: unknown): Ficha {
  if (!ehObjeto(f) || !soEstes(f, ['simbolo', 'tipo', 'aridade', 'numerico', 'argumentos'])) falhar('R1', `ficha mal formada: ${JSON.stringify(f)}`)
  const x = f as Record<string, unknown>
  if (!ehTexto(x.simbolo) || /\s/.test(x.simbolo)) falhar('R1', `ficha sem símbolo: ${JSON.stringify(f)}`)
  if (!['constante', 'funcao', 'predicado'].includes(x.tipo as string)) falhar('R1', `ficha de tipo desconhecido: ${JSON.stringify(f)}`)
  // a constante tem aridade 0, a função 1 ou mais, e o predicado 0 ou mais (o de aridade 0 é uma proposição)
  if (!Number.isInteger(x.aridade) || (x.aridade as number) < 0 || (x.tipo === 'constante' ? x.aridade !== 0 : x.tipo === 'funcao' && x.aridade === 0))
    falhar('R1', `ficha com aridade errada: ${JSON.stringify(f)}`)
  if ('numerico' in x && (typeof x.numerico !== 'boolean' || x.tipo === 'predicado')) falhar('R1', `numerico só em constante ou função: ${JSON.stringify(f)}`)
  if ('argumentos' in x) {
    const a = x.argumentos
    if (x.tipo === 'constante' || !Array.isArray(a) || a.length !== x.aridade || !a.every((y) => y === 'num' || y === 'obj'))
      falhar('R1', `argumentos mal formados: ${JSON.stringify(f)}`)
  }
  return x as unknown as Ficha
}

/**
 * O valor de um texto JSON, recusando (R1) uma chave repetida em qualquer objeto: os leitores de JSON discordam sobre
 * qual valor fica (uns o primeiro, outros o último), e duas conferências leriam registros diferentes. Pela mesma
 * razão, recusa o número escrito com ponto ou expoente.
 */
export function lerJsonEstrito(texto: string): unknown {
  let i = 0
  const erro = (msg: string): never => falhar('R1', `JSON: ${msg} (posição ${i})`)
  const espaco = () => {
    while (i < texto.length && ' \t\n\r'.includes(texto[i])) i++
  }
  const literal = (s: string, v: unknown) => (texto.startsWith(s, i) ? ((i += s.length), v) : erro('valor inválido'))
  const cadeia = (): string => {
    let fim = i + 1
    while (fim < texto.length && texto[fim] !== '"') fim += texto[fim] === '\\' ? 2 : 1
    if (fim >= texto.length) erro('texto sem fim')
    const v = JSON.parse(texto.slice(i, fim + 1)) as string
    i = fim + 1
    return v
  }
  const valor = (): unknown => {
    espaco()
    const c = texto[i]
    if (c === '{') {
      i++
      const o: Record<string, unknown> = {}
      const vistas = new Set<string>()
      espaco()
      if (texto[i] === '}') return i++, o
      for (;;) {
        espaco()
        if (texto[i] !== '"') erro('chave sem aspas')
        const k = cadeia()
        if (vistas.has(k)) erro(`chave repetida: ${k}`)
        vistas.add(k)
        espaco()
        if (texto[i++] !== ':') erro('falta o :')
        Object.defineProperty(o, k, { value: valor(), enumerable: true, writable: true, configurable: true })
        espaco()
        if (texto[i] === ',') i++
        else if (texto[i] === '}') return i++, o
        else erro('falta , ou }')
      }
    }
    if (c === '[') {
      i++
      const a: unknown[] = []
      espaco()
      if (texto[i] === ']') return i++, a
      for (;;) {
        a.push(valor())
        espaco()
        if (texto[i] === ',') i++
        else if (texto[i] === ']') return i++, a
        else erro('falta , ou ]')
      }
    }
    if (c === '"') return cadeia()
    if (c === 't') return literal('true', true)
    if (c === 'f') return literal('false', false)
    if (c === 'n') return literal('null', null)
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(texto.slice(i))
    if (!m) return erro('valor inválido')
    // os números dos formatos são inteiros: 1.0 e 1e0 seriam o inteiro 1 aqui e uma fração num leitor em Python
    if (m[2] || m[3]) return erro(`número que não é inteiro: ${m[0]}`)
    const numero = Number(m[0])
    if (!Number.isSafeInteger(numero)) return erro('inteiro fora do intervalo seguro')
    i += m[0].length
    return numero
  }
  const v = valor()
  espaco()
  if (i !== texto.length) erro('sobra depois do valor')
  return v
}

/** A conferência de um registro escrito como texto JSON (o que chega de fora): a leitura estrita, depois o resto. */
export async function conferirRegistroTexto(texto: string, amb: AmbienteDaConferencia): Promise<Conferencia> {
  try {
    return await conferirRegistro(lerJsonEstrito(texto), amb)
  } catch (erro) {
    if (erro instanceof Falha) return { motivo: erro.motivo, detalhe: erro.message, provasSemConferir: 0 }
    throw erro
  }
}

/** A conferência de um registro, sem a prova Alethe (que o Carcara confere no verificador público). */
export async function conferirRegistro(r: unknown, amb: AmbienteDaConferencia): Promise<Conferencia> {
  const conta = { provas: 0 }
  try {
    await conferir(r, amb, conta)
    return { motivo: null, detalhe: '', provasSemConferir: conta.provas }
  } catch (erro) {
    if (erro instanceof Falha) return { motivo: erro.motivo, detalhe: erro.message, provasSemConferir: conta.provas }
    throw erro
  }
}

async function conferir(r: unknown, amb: AmbienteDaConferencia, conta: { provas: number }): Promise<void> {
  // R1 e R2: a forma
  if (!ehObjeto(r)) return falhar('R1', 'o registro não é um objeto')
  const aberto = r.situacao === 'aberto'
  if (r.situacao !== 'aberto' && r.situacao !== 'fechado') falhar('R1', 'situacao é aberto ou fechado')
  const campos = ['formato', 'situacao', 'afirmacao', 'teoria', 'tipo', 'dominio', 'estado', 'semantica', 'autor', 'compromisso']
  const camposAbertos = [...campos, 'formula', 'formaCanonica', 'certificado']
  const esperados = aberto ? camposAbertos : campos
  const sobra = Object.keys(r).find((k) => !esperados.includes(k))
  if (sobra) falhar('R1', `campo que não vai ${aberto ? 'no registro aberto' : 'no registro fechado'}: ${sobra}`)
  const falta = esperados.find((k) => !(k in r))
  if (falta) falhar('R1', `falta o campo ${falta}`)
  if (!AFIRMACOES.includes(r.afirmacao as Afirmacao)) falhar('R1', `afirmação desconhecida: ${JSON.stringify(r.afirmacao)}`)
  if (!TIPOS.includes(r.tipo as Registro['tipo'])) falhar('R1', `tipo desconhecido: ${JSON.stringify(r.tipo)}`)
  if (!ESTADOS.includes(r.estado as Registro['estado'])) falhar('R1', `estado desconhecido: ${JSON.stringify(r.estado)}`)
  if (!ehTexto(r.dominio) || !r.dominio.trim()) falhar('R1', 'dominio é um texto não vazio')
  if (!ehTexto(r.autor) || !SHA.test(r.autor)) falhar('R1', 'autor: o SHA-256 da chave pública, em 64 dígitos hexadecimais minúsculos')
  const teoria = ehObjeto(r.teoria) ? r.teoria : falhar('R1', 'teoria é um objeto')
  if (!soEstes(teoria, aberto ? ['nome', 'fichas', 'premissas', 'hash'] : ['nome', 'hash'])) falhar('R1', 'teoria com campo a mais')
  if (!ehTexto(teoria.nome) || !teoria.nome.trim()) falhar('R1', 'teoria sem nome')
  if (!ehTexto(teoria.hash) || !SHA.test(teoria.hash)) falhar('R1', 'teoria.hash: 64 dígitos hexadecimais minúsculos')
  const comp = ehObjeto(r.compromisso) ? r.compromisso : falhar('R1', 'compromisso é um objeto')
  if (!soEstes(comp, aberto ? ['hash', 'sal'] : ['hash'])) falhar('R1', 'compromisso com campo a mais')
  if (!ehTexto(comp.hash) || !SHA.test(comp.hash)) falhar('R1', 'compromisso.hash: 64 dígitos hexadecimais minúsculos')
  if (aberto && (!ehTexto(comp.sal) || !SHA.test(comp.sal))) falhar('R1', 'compromisso.sal: 64 dígitos hexadecimais minúsculos')
  if (r.formato !== FORMATO_REGISTRO) falhar('R2', `formato desconhecido: ${JSON.stringify(r.formato)}`)
  const sem = ehObjeto(r.semantica) ? r.semantica : falhar('R1', 'semantica é um objeto')
  if (!soEstes(sem, ['gramatica', 'traducao']) || sem.gramatica !== 'm2' || sem.traducao !== 't1')
    falhar('R2', `semântica que esta versão não conhece: ${JSON.stringify(sem)}`)
  // R3: tipo e afirmação
  if ((r.tipo === 'teorema') !== (r.afirmacao === 'segue')) falhar('R3', `tipo ${r.tipo} com afirmação ${r.afirmacao}`)
  if (!aberto) return

  const afirmacao = r.afirmacao as Afirmacao
  if (!Array.isArray(teoria.fichas)) falhar('R1', 'teoria.fichas é uma lista')
  const fichas = (teoria.fichas as unknown[]).map(conferirFicha)
  if (new Set(fichas.map((f) => f.simbolo)).size !== fichas.length) falhar('R1', 'duas fichas com o mesmo símbolo')
  if (!Array.isArray(teoria.premissas) || !teoria.premissas.every(ehTexto)) falhar('R1', 'teoria.premissas é uma lista de textos')
  if (!ehTexto(r.formula) || !ehTexto(r.formaCanonica)) falhar('R1', 'formula e formaCanonica são textos')
  const cert = ehObjeto(r.certificado) ? r.certificado : falhar('R1', 'certificado é um objeto')

  // R4: a leitura, com o dicionário da teoria
  const premissas = (teoria.premissas as string[]).map((p) => amb.ler(p, fichas) ?? falhar('R4', `a m2 recusa a premissa ${p}`))
  const formula = amb.ler(r.formula as string, fichas) ?? falhar('R4', `a m2 recusa a fórmula ${r.formula}`)
  // R5, R6, R7: a forma canônica e os hashes
  const canonica = formaCanonica(formula)
  if (r.formaCanonica !== canonica) falhar('R5', `a forma canônica é ${canonica}`)
  const hashTeoria = await sha256(textoDaTeoria(premissas.map(formaCanonica), fichas))
  if (teoria.hash !== hashTeoria) falhar('R6', `o hash da teoria é ${hashTeoria}`)
  if (comp.hash !== (await compromissoDe(comp.sal as string, textoDaFormula(canonica, fichas)))) falhar('R7', 'o compromisso não é o da fórmula com o sal')

  // o certificado: a combinação, depois arquivos, vínculo e modelos
  const numericos = new Set(fichas.filter((f) => f.numerico).map((f) => f.simbolo))
  const tem = (k: string) => k in cert
  if (!soEstes(cert, ['refutacao', 'modeloDasPremissas', 'vazio', 'modelo'])) falhar('R1', 'certificado com campo desconhecido')
  const refuta = afirmacao === 'segue' || afirmacao === 'contradiz'
  const combinacao = Object.keys(cert).sort().join('+')
  if (refuta) {
    const validas = ['modeloDasPremissas+refutacao', 'vazio', ...(premissas.length ? [] : ['refutacao'])]
    if (combinacao === 'refutacao' && premissas.length) falhar('R12', 'segue ou contradiz com premissas, sem modelo das premissas e sem a marca vazio')
    if (!validas.includes(combinacao)) falhar('R1', `certificado de ${afirmacao} com ${combinacao || 'nada'}`)
  } else if (combinacao !== 'modelo') falhar('R1', `certificado de ${afirmacao} com ${combinacao || 'nada'}`)
  const conjunto = conjuntoDoCertificado(afirmacao, premissas, formula)

  const lerArquivo = async (a: unknown, onde: string): Promise<string> => {
    if (!ehObjeto(a) || !soEstes(a, ['arquivo', 'sha256']) || !ehTexto(a.arquivo) || !ehTexto(a.sha256)) return falhar('R1', `${onde}: {arquivo, sha256}`)
    // relativo à raiz do conjunto, com /, sem segmento vazio, . ou ..
    if (a.arquivo.includes('\\') || a.arquivo.split('/').some((s) => s === '' || s === '.' || s === '..')) return falhar('R8', `${onde}: caminho inválido ${a.arquivo}`)
    const bytes = amb.arquivo(a.arquivo) ?? falhar('R8', `${onde}: o arquivo ${a.arquivo} não existe`)
    if ((await sha256(bytes)) !== a.sha256) falhar('R8', `${onde}: o SHA-256 de ${a.arquivo} não bate`)
    return new TextDecoder().decode(bytes)
  }
  const refutacao = async (x: unknown, fs: Formula[], onde: string) => {
    if (!ehObjeto(x) || !soEstes(x, ['problema', 'prova'])) return falhar('R1', `${onde}: {problema, prova}`)
    const problema = await lerArquivo(x.problema, `${onde}.problema`)
    await lerArquivo(x.prova, `${onde}.prova`)
    // o vínculo da seção 5.1: o problema é a tradução t1 do conjunto a menos da forma (a comparação do verificador
    // público, com a tradução do Caderno de um lado)
    const diferenca = diferencaDeProblemas(['(set-logic ALL)', amb.traduzir(fs, numericos), '(check-sat)', ''].join('\n'), problema)
    if (diferenca) falhar('R9', `${onde}: o problema não é a tradução t1 do conjunto (${diferenca})`)
    conta.provas++
  }
  const modelo = (m: unknown, fs: Formula[], onde: string) => {
    const exato = ehObjeto(m) && m.formato === FORMATO_EXATO
    // o modelo finito não lê números: um conjunto com números pede o exato
    if (!exato && fs.some((f) => temAritmetica(f, (n) => numericos.has(n)))) falhar('R11', `${onde}: modelo finito para um conjunto com números`)
    const falhas = exato ? falhasDoModeloExato(m, fs, numericos) : falhasDoCertificado(m, fs)
    if (falhas.length) falhar('R11', `${onde}: ${falhas.join('; ')}`)
  }
  if (tem('vazio')) await refutacao(cert.vazio, premissas, 'vazio')
  if (tem('refutacao')) await refutacao(cert.refutacao, conjunto, 'refutacao')
  if (tem('modeloDasPremissas')) modelo(cert.modeloDasPremissas, premissas, 'modeloDasPremissas')
  if (tem('modelo')) modelo(cert.modelo, conjunto, 'modelo')
}
