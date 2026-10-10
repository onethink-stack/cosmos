// Forma canônica de uma fórmula: o texto com as variáveis ligadas renomeadas
// em ordem (∀x P(x) e ∀y P(y) dão o mesmo). Serve para comparar fórmulas e
// como chave do banco de provas.

import type { Formula, Termo } from './ast'
import { imprimir } from './impressao'

/** Texto da fórmula com as variáveis ligadas renomeadas em ordem (∀x P(x) e ∀y P(y) dão o mesmo). */
export function canonica(f: Formula): string {
  let k = 0
  const termo = (t: Termo, env: Map<string, string>): Termo => {
    switch (t.k) {
      case 'nome':
        return env.has(t.nome) ? { ...t, nome: env.get(t.nome)! } : t
      case 'app':
        return { ...t, args: t.args.map((a) => termo(a, env)) }
      case 'inter':
      case 'uniao':
      case 'arit':
        return { ...t, l: termo(t.l, env), r: termo(t.r, env) }
      case 'neg':
        return { ...t, t: termo(t.t, env) }
      case 'vazio':
      case 'num':
      case 'reais':
        return t
    }
  }
  const ir = (g: Formula, env: Map<string, string>): Formula => {
    switch (g.k) {
      case 'const':
        return g
      case 'pred':
        return { ...g, args: g.args.map((a) => termo(a, env)) }
      case 'rel':
        return { ...g, l: termo(g.l, env), r: termo(g.r, env) }
      case 'not':
      case 'nec':
      case 'pos':
      case 'crenca':
        return { ...g, f: ir(g.f, env) }
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        return { ...g, l: ir(g.l, env), r: ir(g.r, env) }
      case 'forall':
      case 'exists': {
        const nome = `#${++k}`
        return { ...g, v: nome, dom: g.dom && termo(g.dom, env), corpo: ir(g.corpo, new Map(env).set(g.v, nome)) }
      }
    }
  }
  return imprimir(ir(f, new Map()))
}
