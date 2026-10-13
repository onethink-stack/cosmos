import type { EntradaDicionario } from '../dados/tipos'
import type { Formula, Rel, Termo } from './ast'

// Lê uma fórmula em português, com os nomes por extenso do dicionário. Serve
// para conferir uma tradução (feita no aparelho ou por um modelo de linguagem)
// sem precisar ler lógica: é determinística, não adivinha nada.

const REL: Record<Rel, string> = {
  '=': 'é igual a',
  '≠': 'é diferente de',
  '∈': 'pertence a',
  '∉': 'não pertence a',
  '⊆': 'está contido em',
  '<': 'é menor que',
  '≤': 'é menor ou igual a',
  '>': 'é maior que',
  '≥': 'é maior ou igual a',
}
const REL_NEGADA: Partial<Record<Rel, string>> = {
  '=': 'é diferente de',
  '≠': 'é igual a',
  '∈': 'não pertence a',
  '∉': 'pertence a',
  '⊆': 'não está contido em',
}

export function lerEmPortugues(f: Formula, dicionario: EntradaDicionario[]): string {
  const fichas = new Map(dicionario.map((e) => [e.simbolo, e]))
  const nome = (s: string) => fichas.get(s)?.termo.trim() || s
  const unario = (g: Formula): g is Formula & { k: 'pred' } => g.k === 'pred' && g.args.length === 1
  const naVariavel = (g: Formula, v: string): g is Formula & { k: 'pred' } => unario(g) && g.args[0].k === 'nome' && g.args[0].nome === v

  const termo = (t: Termo): string => {
    switch (t.k) {
      case 'nome':
        return nome(t.nome)
      case 'vazio':
        return 'o vazio'
      case 'num':
        return t.valor
      case 'reais':
        return 'os números reais'
      case 'inteiros':
        return 'os números inteiros'
      case 'neg':
        return `−${termo(t.t)}`
      case 'arit':
        return `(${termo(t.l)} ${t.op} ${termo(t.r)})`
      case 'inter':
        return `a interseção de ${termo(t.l)} e ${termo(t.r)}`
      case 'uniao':
        return `a união de ${termo(t.l)} e ${termo(t.r)}`
      case 'app':
        return t.args.length === 1 ? `${nome(t.fn)} de ${termo(t.args[0])}` : `${nome(t.fn)}(${t.args.map(termo).join(', ')})`
    }
  }

  const atomo = (g: Formula & { k: 'pred' }, negado: boolean): string => {
    const n = nome(g.nome)
    if (!g.args.length) return negado ? `não é verdade que ${n}` : n
    if (g.args.length === 1) return `${termo(g.args[0])} ${negado ? 'não é' : 'é'} ${n}`
    const s = `“${n}” vale para ${g.args.map(termo).join(', ')}`
    return negado ? `não é verdade que ${s}` : s
  }

  /** subfórmula dentro de um conectivo: entre parênteses se não for simples */
  const parte = (g: Formula): string => {
    const simples = g.k === 'pred' || g.k === 'rel' || g.k === 'const' || (g.k === 'not' && (g.f.k === 'pred' || g.f.k === 'rel'))
    return simples ? ler(g) : `(${ler(g)})`
  }

  const ler = (g: Formula): string => {
    switch (g.k) {
      case 'pred':
        return atomo(g, false)
      case 'rel':
        return `${termo(g.l)} ${REL[g.op]} ${termo(g.r)}`
      case 'const':
        return g.valor ? 'verdadeiro' : 'falso'
      case 'not': {
        const h = g.f
        if (h.k === 'pred') return atomo(h, true)
        if (h.k === 'rel' && REL_NEGADA[h.op]) return `${termo(h.l)} ${REL_NEGADA[h.op]} ${termo(h.r)}`
        if (h.k === 'exists' && !h.dom) {
          // ¬∃x (A(x) ∧ B(x)): nenhum A é B
          const c = h.corpo
          if (c.k === 'and' && naVariavel(c.l, h.v) && naVariavel(c.r, h.v)) return `nenhum ${nome(c.l.nome)} é ${nome(c.r.nome)}`
          if (naVariavel(c, h.v)) return `não existe ${nome(c.nome)}`
          return `não existe ${h.v} tal que ${ler(c)}`
        }
        return `não é verdade que ${parte(h)}`
      }
      case 'and':
        return `${parte(g.l)} e ${parte(g.r)}`
      case 'or':
        return `${parte(g.l)} ou ${parte(g.r)}`
      case 'imp':
        return `se ${parte(g.l)}, então ${parte(g.r)}`
      case 'iff':
        return `${parte(g.l)} se e somente se ${parte(g.r)}`
      case 'nec':
        return `necessariamente, ${parte(g.f)}`
      case 'pos':
        return `possivelmente, ${parte(g.f)}`
      case 'crenca':
        return `${g.agente} acredita que ${parte(g.f)}`
      case 'forall': {
        const c = g.corpo
        if (g.dom) return `para todo ${g.v} em ${termo(g.dom)}, ${ler(c)}`
        if (c.k === 'imp' && naVariavel(c.l, g.v)) {
          const a = nome(c.l.nome)
          // ∀x (A(x) ⟹ B(x)): todo A é B · ∀x (A(x) ⟹ ¬B(x)): nenhum A é B
          if (naVariavel(c.r, g.v)) return `todo ${a} é ${nome(c.r.nome)}`
          if (c.r.k === 'not' && naVariavel(c.r.f, g.v)) return `nenhum ${a} é ${nome(c.r.f.nome)}`
          return `para todo ${a} ${g.v}, ${ler(c.r)}`
        }
        if (naVariavel(c, g.v)) return `tudo é ${nome(c.nome)}`
        return `para todo ${g.v}, ${ler(c)}`
      }
      case 'exists': {
        const c = g.corpo
        if (g.dom) return `existe ${g.v} em ${termo(g.dom)} tal que ${ler(c)}`
        if (c.k === 'and' && naVariavel(c.l, g.v)) {
          const a = nome(c.l.nome)
          // ∃x (A(x) ∧ B(x)): algum A é B
          if (naVariavel(c.r, g.v)) return `algum ${a} é ${nome(c.r.nome)}`
          return `existe um ${a} ${g.v} tal que ${ler(c.r)}`
        }
        if (naVariavel(c, g.v)) return `existe algum ${nome(c.nome)}`
        return `existe ${g.v} tal que ${ler(c)}`
      }
    }
  }

  return ler(f)
}
