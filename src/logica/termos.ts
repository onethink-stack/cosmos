import type { TipoSimbolo } from '../dados/tipos'
import { ORDEM, type Formula, type Termo } from './ast'

/** Igualdade estrutural de termos (ignora posições e a forma subscrita/parênteses). */
export function termosIguais(a: Termo, b: Termo): boolean {
  switch (a.k) {
    case 'nome':
      return b.k === 'nome' && a.nome === b.nome
    case 'app':
      return b.k === 'app' && a.fn === b.fn && a.args.length === b.args.length && a.args.every((x, i) => termosIguais(x, b.args[i]))
    case 'inter':
    case 'uniao':
      return b.k === a.k && termosIguais(a.l, b.l) && termosIguais(a.r, b.r)
    case 'vazio':
      return b.k === 'vazio'
    case 'reais':
    case 'inteiros':
      return b.k === a.k
    case 'num':
      return b.k === 'num' && Number(a.valor) === Number(b.valor)
    case 'arit':
      return b.k === 'arit' && a.op === b.op && termosIguais(a.l, b.l) && termosIguais(a.r, b.r)
    case 'neg':
      return b.k === 'neg' && termosIguais(a.t, b.t)
  }
}

/** O termo é claramente um número (tem número ou conta)? */
export function termoNumerico(t: Termo): boolean {
  return t.k === 'num' || t.k === 'arit' || t.k === 'neg'
}

/** A fórmula usa números: contas, números, <, ≤, >, ≥ ou ∀x∈ℝ (o motor finito não lê; o Z3 lê). */
export function temAritmetica(f: Formula, numericos?: (nome: string) => boolean): boolean {
  const t = (x: Termo): boolean => {
    switch (x.k) {
      case 'num':
      case 'arit':
      case 'neg':
      case 'reais':
      case 'inteiros':
        return true
      case 'nome':
        return !!numericos?.(x.nome)
      case 'app':
        return !!numericos?.(x.fn) || x.args.some(t)
      case 'inter':
      case 'uniao':
        return t(x.l) || t(x.r)
      case 'vazio':
        return false
    }
  }
  switch (f.k) {
    case 'pred':
      return f.args.some(t)
    case 'rel':
      return ORDEM.includes(f.op) || t(f.l) || t(f.r)
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      return temAritmetica(f.f, numericos)
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      return temAritmetica(f.l, numericos) || temAritmetica(f.r, numericos)
    case 'forall':
    case 'exists':
      return (!!f.dom && t(f.dom)) || temAritmetica(f.corpo, numericos)
    case 'const':
      return false
  }
}

/** Todos os nomes que aparecem na fórmula (constantes, variáveis, funções, predicados). */
export function nomesUsados(f: Formula, s = new Set<string>()): Set<string> {
  const t = (x: Termo): void => {
    if (x.k === 'nome') s.add(x.nome)
    else if (x.k === 'app') {
      s.add(x.fn)
      x.args.forEach(t)
    } else if (x.k === 'inter' || x.k === 'uniao' || x.k === 'arit') {
      t(x.l)
      t(x.r)
    } else if (x.k === 'neg') t(x.t)
  }
  switch (f.k) {
    case 'pred':
      s.add(f.nome)
      f.args.forEach(t)
      break
    case 'rel':
      t(f.l)
      t(f.r)
      break
    case 'not':
    case 'nec':
    case 'pos':
    case 'crenca':
      nomesUsados(f.f, s)
      break
    case 'and':
    case 'or':
    case 'imp':
    case 'iff':
      nomesUsados(f.l, s)
      nomesUsados(f.r, s)
      break
    case 'forall':
    case 'exists':
      s.add(f.v)
      if (f.dom) t(f.dom)
      nomesUsados(f.corpo, s)
      break
    case 'const':
      break
  }
  return s
}

/** Ocorrência de um nome que não é variável ligada. O span cobre só o nome. */
export interface UsoNome {
  nome: string
  tipo: TipoSimbolo
  aridade: number
  pos: number
  end: number
  /** usado como número (numa conta, comparação ou igualdade com número) */
  numerico?: boolean
}

export function usosDeNomes(f: Formula): UsoNome[] {
  const usos: UsoNome[] = []
  // `num`: o termo está num lugar de número
  const termo = (t: Termo, escopo: string[], num = false): void => {
    switch (t.k) {
      case 'nome': {
        const p = t.nomePos ?? t.pos
        if (!escopo.includes(t.nome)) usos.push({ nome: t.nome, tipo: 'constante', aridade: 0, pos: p, end: p + t.nome.length, numerico: num || undefined })
        return
      }
      case 'app':
        if (!escopo.includes(t.fn)) {
          const p = t.nomePos ?? t.pos
          usos.push({ nome: t.fn, tipo: 'funcao', aridade: t.args.length, pos: p, end: p + t.fn.length, numerico: num || undefined })
        }
        // uma função numérica recebe números
        t.args.forEach((a) => termo(a, escopo, num))
        return
      case 'inter':
      case 'uniao':
        termo(t.l, escopo)
        termo(t.r, escopo)
        return
      case 'arit':
        termo(t.l, escopo, true)
        termo(t.r, escopo, true)
        return
      case 'neg':
        termo(t.t, escopo, true)
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
        if (!escopo.includes(f.nome)) {
          const p = f.nomePos ?? f.pos
          usos.push({ nome: f.nome, tipo: 'predicado', aridade: f.args.length, pos: p, end: p + f.nome.length })
        }
        f.args.forEach((a) => termo(a, escopo))
        return
      case 'rel': {
        const num = ORDEM.includes(f.op) || ((f.op === '=' || f.op === '≠') && (termoNumerico(f.l) || termoNumerico(f.r)))
        termo(f.l, escopo, num)
        termo(f.r, escopo, num)
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
      case 'exists':
        if (f.dom) termo(f.dom, escopo)
        formula(f.corpo, [...escopo, f.v])
        return
      case 'const':
        return
    }
  }
  formula(f, [])
  return usos
}
