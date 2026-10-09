import type { EntradaDicionario, TipoSimbolo } from '../dados/tipos'
import type { Diag, Formula, Span, Termo } from './ast'
import { checarParenteses, lex } from './lexer'
import { ErroSintaxe, parseTokens } from './parser'
import { termosIguais } from './termos'

export interface ResultadoValidacao {
  ast: Formula | null
  diags: Diag[]
  /** true se não há nenhum diagnóstico de nível "erro" (avisos são permitidos) */
  ok: boolean
}

const DESC_TIPO: Record<TipoSimbolo, string> = { constante: 'constante', predicado: 'predicado', funcao: 'função' }

function descrever(tipo: TipoSimbolo, aridade: number): string {
  return tipo === 'constante' ? 'constante' : `${DESC_TIPO[tipo]} de aridade ${aridade}`
}

export function validar(texto: string, dicionario: EntradaDicionario[] = []): ResultadoValidacao {
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
    throw e
  }

  return fim(checarSemantica(ast, dic), ast)
}

/** Checagens que dependem da árvore inteira: E4, E5, E6, E9, E10, E11. */
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

  const termo = (t: Termo, escopo: string[], permiteConj: boolean): void => {
    switch (t.k) {
      case 'nome':
        if (escopo.includes(t.nome)) return
        if (ligados.has(t.nome))
          add('E6', 'aviso', `'${t.nome}' aparece fora do escopo do seu quantificador; aqui é uma constante livre`, t)
        registrar(t.nome, 'constante', 0, t)
        return
      case 'app':
        if (escopo.includes(t.fn)) add('E10', 'erro', `'${t.fn}' é variável quantificada e não pode ser usada como função`, t)
        else registrar(t.fn, 'funcao', t.args.length, t)
        t.args.forEach((a) => termo(a, escopo, false))
        return
      case 'inter':
      case 'uniao':
        if (!permiteConj)
          add('E11', 'erro', `'${t.k === 'inter' ? '⋂' : '⋃'}' só é suportado à direita de ∈/∉, nos lados de ⊆ ou em ∀x∈…`, t)
        termo(t.l, escopo, permiteConj)
        termo(t.r, escopo, permiteConj)
        return
      case 'vazio':
        return
    }
  }

  const formula = (f: Formula, escopo: string[]): void => {
    switch (f.k) {
      case 'pred':
        if (escopo.includes(f.nome)) add('E10', 'erro', `'${f.nome}' é variável quantificada e não pode ser usada como predicado`, f)
        else registrar(f.nome, 'predicado', f.args.length, f)
        f.args.forEach((a) => termo(a, escopo, false))
        return
      case 'rel':
        if (f.op === '≠' && termosIguais(f.l, f.r))
          add('E9', 'erro', 'Contradição imediata: um termo diferente de si mesmo (t ≠ t) é sempre falso', f)
        termo(f.l, escopo, f.op === '⊆')
        termo(f.r, escopo, f.op !== '=' && f.op !== '≠')
        return
      case 'not':
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
        if (escopo.includes(f.v))
          add('E5', 'aviso', `'${f.v}' já está quantificada num escopo externo; este quantificador esconde o anterior`, vSpan)
        if (f.dom) termo(f.dom, escopo, true)
        formula(f.corpo, [...escopo, f.v])
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
