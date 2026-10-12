import type { Diag } from './ast'

export type TipoToken =
  | 'nome'
  | 'subscr'
  | 'forall'
  | 'exists'
  | 'not'
  | 'and'
  | 'or'
  | 'imp'
  | 'iff'
  | 'eq'
  | 'neq'
  | 'in'
  | 'notin'
  | 'subset'
  | 'cap'
  | 'cup'
  | 'empty'
  | 'lpar'
  | 'rpar'
  | 'comma'
  | 'nec'
  | 'pos'
  | 'lbrack'
  | 'rbrack'
  | 'num'
  | 'plus'
  | 'minus'
  | 'times'
  | 'div'
  | 'pow'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'reais'
  | 'inteiros'
  | 'eof'

export interface Token {
  t: TipoToken
  /** texto do nome ou do índice subscrito (já convertido para letras normais) */
  v: string
  pos: number
  end: number
  /** havia espaço em branco logo antes deste token */
  espacoAntes: boolean
}

/** Caracteres subscritos do Unicode e a letra/dígito que representam. */
export const SUBSCRITOS: Record<string, string> = {
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm',
  'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ᵣ': 'r', 'ᵤ': 'u',
  'ᵥ': 'v', '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6',
  '₇': '7', '₈': '8', '₉': '9',
}

// Ordem importa: o mais longo primeiro quando um é prefixo de outro.
const SIMBOLOS: [string, TipoToken][] = [
  ['\\notin', 'notin'], ['\\empty', 'empty'], ['\\sub', 'subset'], ['\\cap', 'cap'],
  ['\\cup', 'cup'], ['\\in', 'in'], ['\\A', 'forall'], ['\\E', 'exists'],
  ['\\nec', 'nec'], ['\\pos', 'pos'],
  ['<->', 'iff'], ['<=>', 'iff'], ['->', 'imp'], ['!=', 'neq'], ['[]', 'nec'], ['<>', 'pos'],
  ['<=', 'le'], ['>=', 'ge'], ['<', 'lt'], ['>', 'gt'], ['≤', 'le'], ['≥', 'ge'], ['⩽', 'le'], ['⩾', 'ge'],
  ['+', 'plus'], ['−', 'minus'], ['-', 'minus'], ['·', 'times'], ['*', 'times'], ['×', 'times'], ['/', 'div'], ['^', 'pow'],
  ['\\R', 'reais'],
  ['\\Z', 'inteiros'],
  ['∀', 'forall'], ['∃', 'exists'], ['¬', 'not'], ['~', 'not'],
  ['∧', 'and'], ['&', 'and'], ['∨', 'or'], ['|', 'or'],
  ['⟹', 'imp'], ['⇒', 'imp'], ['→', 'imp'], ['⟺', 'iff'], ['⇔', 'iff'], ['↔', 'iff'],
  ['∈', 'in'], ['∉', 'notin'], ['⊆', 'subset'],
  ['⋂', 'cap'], ['∩', 'cap'], ['⋃', 'cup'], ['∪', 'cup'], ['∅', 'empty'],
  ['=', 'eq'], ['≠', 'neq'], ['(', 'lpar'], [')', 'rpar'], [',', 'comma'],
  ['□', 'nec'], ['◻', 'nec'], ['◇', 'pos'], ['◊', 'pos'], ['⋄', 'pos'], ['[', 'lbrack'], [']', 'rbrack'],
]

/** Símbolo canônico de cada tipo de token, usado nas mensagens. */
export const SIMBOLO_DE: Record<TipoToken, string> = {
  nome: 'nome', subscr: 'subscrito', forall: '∀', exists: '∃', not: '¬', and: '∧',
  or: '∨', imp: '⟹', iff: '⟺', eq: '=', neq: '≠', in: '∈', notin: '∉', subset: '⊆',
  cap: '⋂', cup: '⋃', empty: '∅', lpar: '(', rpar: ')', comma: ',', nec: '□', pos: '◇', lbrack: '[', rbrack: ']',
  num: 'número', plus: '+', minus: '−', times: '·', div: '/', pow: '^', lt: '<', le: '≤', gt: '>', ge: '≥', reais: 'ℝ', inteiros: 'ℤ',
  eof: 'fim da fórmula',
}

const LETRA = /[\p{L}\p{N}']/u

export function ehCharDeNome(c: string): boolean {
  return LETRA.test(c) && !(c in SUBSCRITOS) && c !== "'"
}

export function lex(texto: string): { tokens: Token[]; erros: Diag[] } {
  const tokens: Token[] = []
  const erros: Diag[] = []
  let i = 0
  let espaco = false
  const n = texto.length

  const push = (t: TipoToken, v: string, pos: number, end: number) => {
    tokens.push({ t, v, pos, end, espacoAntes: espaco })
    espaco = false
  }

  while (i < n) {
    const c = texto[i]
    if (/\s/.test(c)) {
      espaco = true
      i++
      continue
    }
    if (c in SUBSCRITOS) {
      const ini = i
      let v = ''
      while (i < n && texto[i] in SUBSCRITOS) v += SUBSCRITOS[texto[i++]]
      push('subscr', v, ini, i)
      continue
    }
    if (c === '_') {
      const ini = i++
      let v = ''
      while (i < n && (ehCharDeNome(texto[i]) || texto[i] === "'")) v += texto[i++]
      if (!v) {
        erros.push({ codigo: 'E8', nivel: 'erro', pos: ini, end: ini + 1, msg: "'_' sem índice depois (use f_i para fᵢ)" })
        espaco = false
        continue
      }
      push('subscr', v, ini, i)
      continue
    }
    // número: 2, 10, 0.5 (um nome que começa com dígito não existe)
    if (/[0-9]/.test(c)) {
      const ini = i
      while (i < n && /[0-9]/.test(texto[i])) i++
      if (texto[i] === '.' && /[0-9]/.test(texto[i + 1] ?? '')) {
        i++
        while (i < n && /[0-9]/.test(texto[i])) i++
      }
      push('num', texto.slice(ini, i), ini, i)
      continue
    }
    if (c === 'ℝ') {
      push('reais', c, i, i + 1)
      i++
      continue
    }
    if (c === 'ℤ') {
      push('inteiros', c, i, i + 1)
      i++
      continue
    }
    if (ehCharDeNome(c)) {
      const ini = i
      while (i < n && (ehCharDeNome(texto[i]) || texto[i] === "'")) i++
      push('nome', texto.slice(ini, i), ini, i)
      continue
    }
    const sim = SIMBOLOS.find(([s]) => texto.startsWith(s, i))
    if (sim) {
      push(sim[1], sim[0], i, i + sim[0].length)
      i += sim[0].length
      continue
    }
    // símbolo desconhecido: se for comando com barra, pega o comando inteiro
    let fim = i + 1
    if (c === '\\') while (fim < n && /[A-Za-z]/.test(texto[fim])) fim++
    const trecho = texto.slice(i, fim)
    erros.push({
      codigo: 'E8',
      nivel: 'erro',
      pos: i,
      end: fim,
      msg: `Símbolo desconhecido '${trecho}' na coluna ${i + 1}`,
    })
    i = fim
    espaco = false
  }
  tokens.push({ t: 'eof', v: '', pos: n, end: n, espacoAntes: espaco })
  return { tokens, erros }
}

/** E7: confere o balanceamento de parênteses. Devolve no máximo um erro. */
export function checarParenteses(tokens: Token[]): Diag | null {
  const pilha: Token[] = []
  for (const tk of tokens) {
    if (tk.t === 'lpar') pilha.push(tk)
    else if (tk.t === 'rpar') {
      if (!pilha.length)
        return { codigo: 'E7', nivel: 'erro', pos: tk.pos, end: tk.end, msg: `')' na coluna ${tk.pos + 1} não tem '(' correspondente` }
      pilha.pop()
    }
  }
  if (pilha.length) {
    const tk = pilha[pilha.length - 1]
    return { codigo: 'E7', nivel: 'erro', pos: tk.pos, end: tk.end, msg: `'(' na coluna ${tk.pos + 1} não foi fechado` }
  }
  return null
}
