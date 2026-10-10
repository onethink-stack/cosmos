import type { TipoSimbolo } from '../dados/tipos'
import type { Formula, Termo } from './ast'

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
  }
}

/** Todos os nomes que aparecem na fórmula (constantes, variáveis, funções, predicados). */
export function nomesUsados(f: Formula, s = new Set<string>()): Set<string> {
  const t = (x: Termo): void => {
    if (x.k === 'nome') s.add(x.nome)
    else if (x.k === 'app') {
      s.add(x.fn)
      x.args.forEach(t)
    } else if (x.k === 'inter' || x.k === 'uniao') {
      t(x.l)
      t(x.r)
    }
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
}

export function usosDeNomes(f: Formula): UsoNome[] {
  const usos: UsoNome[] = []
  const termo = (t: Termo, escopo: string[]): void => {
    switch (t.k) {
      case 'nome':
        if (!escopo.includes(t.nome)) usos.push({ nome: t.nome, tipo: 'constante', aridade: 0, pos: t.pos, end: t.end })
        return
      case 'app':
        if (!escopo.includes(t.fn)) usos.push({ nome: t.fn, tipo: 'funcao', aridade: t.args.length, pos: t.pos, end: t.pos + t.fn.length })
        t.args.forEach((a) => termo(a, escopo))
        return
      case 'inter':
      case 'uniao':
        termo(t.l, escopo)
        termo(t.r, escopo)
        return
      case 'vazio':
        return
    }
  }
  const formula = (f: Formula, escopo: string[]): void => {
    switch (f.k) {
      case 'pred':
        if (!escopo.includes(f.nome)) usos.push({ nome: f.nome, tipo: 'predicado', aridade: f.args.length, pos: f.pos, end: f.pos + f.nome.length })
        f.args.forEach((a) => termo(a, escopo))
        return
      case 'rel':
        termo(f.l, escopo)
        termo(f.r, escopo)
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
