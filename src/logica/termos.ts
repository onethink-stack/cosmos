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
