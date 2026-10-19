import type { EntradaDicionario, TipoSimbolo } from '../dados/tipos'
import { ORDEM, type Diag, type Formula, type Span, type Termo } from './ast'
import { imprimir } from './impressao'
import { checarParenteses, lex, type Token } from './lexer'
import { ErroSintaxe, parseTokens } from './parser'
import { nomeParecido } from './distancia'
import { termosIguais, usosDeNomes } from './termos'

export interface ResultadoValidacao {
  ast: Formula | null
  diags: Diag[]
  /** true se não há nenhum diagnóstico de nível "erro" (avisos são permitidos) */
  ok: boolean
}

const DESC_TIPO: Record<TipoSimbolo, string> = { constante: 'constante', predicado: 'predicado', funcao: 'função' }

function descrever(tipo: TipoSimbolo, aridade: number, numerico?: boolean): string {
  const base = tipo === 'constante' ? 'constante' : `${DESC_TIPO[tipo]} de aridade ${aridade}`
  return numerico ? `${base} numérica` : base
}

/** número ou objeto (null = ainda não se sabe: nome sem ficha) */
type Sorte = 'num' | 'obj' | null

export interface OpcoesValidacao {
  /** avisar (E12/E13) sobre nomes sem ficha no dicionário */
  exigirFichas?: boolean
}

/** E16 ligado: o app guarda a escolha da pessoa (avisos.ts) e a repassa aqui. */
let avisarEscopo = true
export function definirAvisoDeEscopo(ligado: boolean) {
  avisarEscopo = ligado
}

/** Sobrescritos que parecem expoente; dentro de um nome, são parte do nome (E17). */
const SOBRESCRITOS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', 'ⁿ': 'n', 'ⁱ': 'i',
}

function avisosDeSobrescrito(tokens: Token[]): Diag[] {
  return tokens
    .filter((tk) => tk.t === 'nome' && [...tk.v].some((c) => c in SOBRESCRITOS))
    .map((tk) => {
      const m = /^(.*?)([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱ]+)$/u.exec(tk.v)
      const dica = m?.[1] ? ` Para potência, escreva ${m[1]}^${[...m[2]].map((c) => SOBRESCRITOS[c]).join('')}.` : ' Para potência, use ^.'
      return { codigo: 'E17', nivel: 'aviso', msg: `'${tk.v}' é um nome: o sobrescrito faz parte dele, não é potência.${dica}`, pos: tk.pos, end: tk.end }
    })
}

export function validar(texto: string, dicionario: EntradaDicionario[] = [], opcoes: OpcoesValidacao = {}): ResultadoValidacao {
  const dic = new Map(dicionario.map((e) => [e.simbolo, e]))
  const fim = (diags: Diag[], ast: Formula | null): ResultadoValidacao => {
    diags.sort((a, b) => a.pos - b.pos)
    return { ast, diags, ok: !diags.some((d) => d.nivel === 'erro') }
  }

  if (!texto.trim()) return fim([], null)

  const { tokens, erros } = lex(texto)
  if (erros.length) return fim(erros, null)
  const par = checarParenteses(tokens)
  if (par) return fim([par], null)

  let ast: Formula
  try {
    ast = parseTokens(tokens, {
      ehProposicao: (n) => {
        const d = dic.get(n)
        return !!d && d.tipo === 'predicado' && d.aridade === 0
      },
    })
  } catch (e) {
    if (e instanceof ErroSintaxe) return fim([e.diag], null)
    if (e instanceof RangeError) return fim([grandeDemais(texto)], null)
    throw e
  }

  try {
    const diags = checarSemantica(ast, dic)
    if (opcoes.exigirFichas) diags.push(...checarFichas(ast, dic))
    diags.push(...avisosDeSobrescrito(tokens))
    return fim(diags, ast)
  } catch (e) {
    // a pilha deste aparelho acabou antes do limite do parser: recusa em vez de quebrar a tela
    if (e instanceof RangeError) return fim([grandeDemais(texto)], null)
    throw e
  }
}

const grandeDemais = (texto: string): Diag => ({
  codigo: 'E0',
  nivel: 'erro',
  msg: 'Fórmula grande demais para conferir neste aparelho. Divida em fórmulas menores.',
  pos: 0,
  end: Math.max(texto.length, 1),
})

/** E12/E13: um aviso por nome sem ficha (na primeira ocorrência). */
export function checarFichas(ast: Formula, dic: Map<string, EntradaDicionario>): Diag[] {
  const diags: Diag[] = []
  // nomes que também aparecem ligados já recebem E6; não repetir com E12
  const vistos = new Set<string>()
  coletarLigados(ast, vistos)
  for (const u of usosDeNomes(ast)) {
    if (dic.has(u.nome) || vistos.has(u.nome)) continue
    vistos.add(u.nome)
    const ficha = { simbolo: u.nome, tipo: u.tipo, aridade: u.aridade, ...(u.numerico && u.tipo !== 'predicado' ? { numerico: true } : {}) }
    const parecido = nomeParecido(u.nome, dic.keys())
    if (parecido)
      diags.push({ codigo: 'E13', nivel: 'aviso', pos: u.pos, end: u.end, ficha, sugestao: parecido, msg: `'${u.nome}' não está no dicionário. Você quis dizer '${parecido}'?` })
    else
      diags.push({ codigo: 'E12', nivel: 'aviso', pos: u.pos, end: u.end, ficha, msg: `'${u.nome}' não declarado no dicionário (seria ${descrever(u.tipo, u.aridade, ficha.numerico)})` })
  }
  return diags
}

/** Checagens que dependem da árvore inteira: E4, E5, E6, E9, E10, E11, E15. */
export function checarSemantica(ast: Formula, dic: Map<string, EntradaDicionario>): Diag[] {
  const diags: Diag[] = []
  const add = (codigo: Diag['codigo'], nivel: Diag['nivel'], msg: string, span: Span) =>
    diags.push({ codigo, nivel, msg, pos: span.pos, end: span.end })

  const ligados = new Set<string>()
  coletarLigados(ast, ligados)

  const usos = new Map<string, { tipo: TipoSimbolo; aridade: number }>()
  const registrar = (nome: string, tipo: TipoSimbolo, aridade: number, span: Span) => {
    const d = dic.get(nome)
    if (d && (d.tipo !== tipo || (tipo !== 'constante' && d.aridade !== aridade))) {
      add('E10', 'erro', `'${nome}' está no dicionário como ${descrever(d.tipo, d.aridade)}, mas aqui é usado como ${descrever(tipo, aridade)}`, span)
      return
    }
    const u = usos.get(nome)
    if (!u) usos.set(nome, { tipo, aridade })
    else if (u.tipo !== tipo || u.aridade !== aridade)
      add('E10', 'erro', `'${nome}' é usado como ${descrever(u.tipo, u.aridade)} e também como ${descrever(tipo, aridade)}`, span)
  }

  // variáveis de ∀x∈ℝ / ∃x∈ℝ são números; as outras, objetos
  let reais: string[] = []
  const sorteDoNome = (nome: string, escopo: string[]): Sorte => {
    if (escopo.includes(nome)) return reais.includes(nome) ? 'num' : 'obj'
    const d = dic.get(nome)
    return d ? (d.numerico ? 'num' : 'obj') : null
  }
  /** o que o i-ésimo argumento do símbolo recebe, se a ficha disser (mistura números e objetos) */
  const argumentoDe = (nome: string, i: number, escopo: string[]): Sorte => (escopo.includes(nome) ? null : (dic.get(nome)?.argumentos?.[i] ?? null))
  /** a sorte que o termo tem por si (sem olhar onde está) */
  const sorte = (t: Termo, escopo: string[]): Sorte => {
    switch (t.k) {
      case 'num':
      case 'arit':
      case 'neg':
        return 'num'
      case 'nome':
        return sorteDoNome(t.nome, escopo)
      case 'app':
        return escopo.includes(t.fn) ? null : sorteDoNome(t.fn, [])
      default:
        return 'obj'
    }
  }
  const DESC_SORTE = { num: 'número', obj: 'objeto' }
  const conferirSorte = (t: Termo, tem: Sorte, esperado: Sorte, escopo: string[]) => {
    if (!tem || !esperado || tem === esperado) return
    const nome = t.k === 'nome' ? t.nome : t.k === 'app' ? t.fn : null
    let dica = ''
    if (nome && !escopo.includes(nome))
      dica = esperado === 'num' ? ` Se '${nome}' é um número, marque "número" na ficha dele no dicionário.` : ` '${nome}' está no dicionário como número.`
    else if (nome && esperado === 'num') dica = ` Para '${nome}' ser número, quantifique com ∀${nome}∈ℝ ou ∃${nome}∈ℝ.`
    add('E15', 'erro', `${nome ? `'${nome}'` : 'Este termo'} é ${DESC_SORTE[tem]}, mas aqui precisa ser ${DESC_SORTE[esperado]}.${dica}`, t)
  }

  /** `esperado`: o lugar pede número ou objeto (null = qualquer um) */
  const termo = (t: Termo, escopo: string[], permiteConj: boolean, esperado: Sorte = 'obj'): void => {
    conferirSorte(t, sorte(t, escopo), esperado, escopo)
    switch (t.k) {
      case 'nome':
        if (escopo.includes(t.nome)) return
        if (ligados.has(t.nome))
          add('E6', 'aviso', `'${t.nome}' aparece fora do escopo do seu quantificador; aqui é uma constante livre`, t)
        registrar(t.nome, 'constante', 0, t)
        return
      case 'app': {
        if (escopo.includes(t.fn)) add('E10', 'erro', `'${t.fn}' é variável quantificada e não pode ser usada como função`, t)
        else registrar(t.fn, 'funcao', t.args.length, t)
        // função numérica recebe números; as outras, objetos (a não ser que a ficha diga argumento a argumento)
        const s = sorte(t, escopo)
        const num = s === 'num' || (s === null && esperado === 'num')
        t.args.forEach((a, i) => termo(a, escopo, false, argumentoDe(t.fn, i, escopo) ?? (num ? 'num' : 'obj')))
        return
      }
      case 'inter':
      case 'uniao':
        if (!permiteConj)
          add('E11', 'erro', `'${t.k === 'inter' ? '⋂' : '⋃'}' só é suportado à direita de ∈/∉, nos lados de ⊆ ou em ∀x∈…`, t)
        termo(t.l, escopo, permiteConj)
        termo(t.r, escopo, permiteConj)
        return
      case 'arit':
        termo(t.l, escopo, false, 'num')
        termo(t.r, escopo, false, 'num')
        return
      case 'neg':
        termo(t.t, escopo, false, 'num')
        return
      case 'vazio':
      case 'num':
      case 'reais':
      case 'inteiros':
        return
    }
  }

  const formula = (f: Formula, escopo: string[]): void => {
    switch (f.k) {
      case 'pred':
        if (escopo.includes(f.nome)) add('E10', 'erro', `'${f.nome}' é variável quantificada e não pode ser usada como predicado`, f)
        else registrar(f.nome, 'predicado', f.args.length, f)
        f.args.forEach((a, i) => termo(a, escopo, false, argumentoDe(f.nome, i, escopo) ?? 'obj'))
        return
      case 'rel': {
        if (f.op === '≠' && termosIguais(f.l, f.r))
          add('E9', 'erro', 'Contradição imediata: um termo diferente de si mesmo (t ≠ t) é sempre falso', f)
        if (ORDEM.includes(f.op)) {
          termo(f.l, escopo, false, 'num')
          termo(f.r, escopo, false, 'num')
          return
        }
        if (f.op === '=' || f.op === '≠') {
          // os dois lados do mesmo tipo: número com número, objeto com objeto
          const sl = sorte(f.l, escopo)
          const sr = sorte(f.r, escopo)
          if (sl && sr && sl !== sr) {
            add('E15', 'erro', `Igualdade entre ${DESC_SORTE[sl]} e ${DESC_SORTE[sr]}: os dois lados precisam ser do mesmo tipo`, f)
            termo(f.l, escopo, false, null)
            termo(f.r, escopo, false, null)
            return
          }
          const esperado: Sorte = sl === 'num' || sr === 'num' ? 'num' : sl === 'obj' || sr === 'obj' ? 'obj' : null
          termo(f.l, escopo, false, esperado)
          termo(f.r, escopo, false, esperado)
          return
        }
        termo(f.l, escopo, f.op === '⊆')
        termo(f.r, escopo, true)
        return
      }
      case 'not':
      case 'nec':
      case 'pos':
      case 'crenca':
        formula(f.f, escopo)
        return
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        formula(f.l, escopo)
        formula(f.r, escopo)
        return
      case 'forall':
      case 'exists': {
        const vSpan = { pos: f.vPos, end: f.vPos + f.v.length }
        const d = dic.get(f.v)
        if (d?.tipo === 'constante')
          add('E4', 'erro', `'${f.v}' é constante no dicionário e não pode ser quantificada`, vSpan)
        else if (d) add('E10', 'erro', `'${f.v}' é ${DESC_TIPO[d.tipo]} no dicionário e não pode ser quantificada`, vSpan)
        if (f.parentesesEnganoso !== undefined)
          add(
            'E14',
            'aviso',
            `O escopo de '${f.k === 'forall' ? '∀' : '∃'}${f.v}' não termina no ')' da coluna ${f.parentesesEnganoso + 1}: vai até o fim da fórmula. Se queria que terminasse ali, envolva o quantificador em parênteses: (${f.k === 'forall' ? '∀' : '∃'}${f.v} (…)) …`,
            { pos: f.pos, end: f.vPos + f.v.length },
          )
        else if (f.corpoAberto && avisarEscopo && (f.corpo.k === 'and' || f.corpo.k === 'or' || f.corpo.k === 'imp' || f.corpo.k === 'iff')) {
          const op = { and: '∧', or: '∨', imp: '⟹', iff: '⟺' }[f.corpo.k]
          const direita = imprimir(f.corpo.r)
          const so = `(${imprimir({ ...f, corpo: f.corpo.l })}) ${op} ${f.corpo.r.k === 'and' || f.corpo.r.k === 'or' || f.corpo.r.k === 'imp' || f.corpo.r.k === 'iff' ? `(${direita})` : direita}`
          add(
            'E16',
            'aviso',
            `Lido como ${imprimir(f)}: o escopo de '${f.k === 'forall' ? '∀' : '∃'}${f.v}' vai até o fim. Escrito assim, com o corpo inteiro entre parênteses, o aviso some e o sentido é o mesmo. Se o quantificador devia valer só para ${imprimir(f.corpo.l)}, a fórmula é outra: ${so}.`,
            { pos: f.pos, end: f.vPos + f.v.length },
          )
        }
        if (escopo.includes(f.v))
          add('E5', 'aviso', `'${f.v}' já está quantificada num escopo externo; este quantificador esconde o anterior`, vSpan)
        const antes = reais
        if (f.dom?.k === 'reais' || f.dom?.k === 'inteiros') reais = [...reais, f.v]
        else {
          if (reais.includes(f.v)) reais = reais.filter((x) => x !== f.v)
          if (f.dom) termo(f.dom, escopo, true)
        }
        formula(f.corpo, [...escopo, f.v])
        reais = antes
        return
      }
      case 'const':
        return
    }
  }

  formula(ast, [])
  return diags
}

function coletarLigados(f: Formula, s: Set<string>): void {
  switch (f.k) {
    case 'forall':
    case 'exists':
      s.add(f.v)
      coletarLigados(f.corpo, s)
      return
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      coletarLigados(f.f, s)
      return
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      coletarLigados(f.l, s)
      coletarLigados(f.r, s)
      return
    default:
      return
  }
}
