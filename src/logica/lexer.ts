import type { Diag } from './ast'
import { ehLetraOuNumero16 } from './unicode16'

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

// Ordem importa: o mais longo primeiro quando um é prefixo de outro. (Exportada para o
// pacote de conformidade em especificacao/, que lista as grafias aceitas.)
export const SIMBOLOS: [string, TipoToken][] = [
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

/**
 * Espaço em branco: os 25 caracteres do \s do ECMAScript, fixados aqui para o léxico não
 * depender do ambiente. U+0085 e U+001F não estão (são E8); U+FEFF está.
 */
export const ESPACOS: ReadonlySet<number> = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
])

/** Caractere de nome: letra (L) ou número (N) do Unicode 16.0, menos os subscritos. O apóstrofo só continua um nome. */
export function ehCharDeNome(c: string): boolean {
  const cp = c.codePointAt(0)
  return cp !== undefined && ehLetraOuNumero16(cp) && !(c in SUBSCRITOS)
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
  // o caractere Unicode inteiro na posição k: 𝑥 (fora do plano básico) ocupa duas unidades de UTF-16
  const car = (k: number) => String.fromCodePoint(texto.codePointAt(k)!)

  while (i < n) {
    const c = car(i)
    if (ESPACOS.has(c.codePointAt(0)!)) {
      espaco = true
      i += c.length
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
      while (i < n && (ehCharDeNome(car(i)) || texto[i] === "'")) {
        const d = car(i)
        v += d
        i += d.length
      }
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
      while (i < n && (ehCharDeNome(car(i)) || texto[i] === "'")) i += car(i).length
      push('nome', texto.slice(ini, i), ini, i)
      continue
    }
    const sim = SIMBOLOS.find(([s]) => texto.startsWith(s, i))
    if (sim) {
      push(sim[1], sim[0], i, i + sim[0].length)
      i += sim[0].length
      continue
    }
    // símbolo desconhecido (um caractere inteiro); se for comando com barra, pega o comando inteiro
    let fim = i + c.length
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
