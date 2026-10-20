import type { Codigo, Conectivo, Diag, Formula, OpArit, Rel, Span, Termo } from './ast'
import { SIMBOLO_DE, type TipoToken, type Token } from './lexer'

export class ErroSintaxe extends Error {
  constructor(public diag: Diag) {
    super(diag.msg)
  }
}

/** Erro de limite: não é engolido pela tentativa de ler '(' como termo (ver `parenteses`). */
export class ErroLimite extends ErroSintaxe {}

/**
 * Descidas do parser (fórmula, termo, operador prefixo, sinal) abertas ao mesmo tempo.
 * Cada nível de parênteses gasta duas; acima disso a fórmula é recusada em vez de
 * estourar a pilha do navegador.
 */
export const ANINHAMENTO_MAXIMO = 500
/**
 * Profundidade máxima da fórmula montada. Uma cadeia A ∧ B ∧ … de n termos tem
 * profundidade n, e quem percorre a fórmula depois (validador, motor, Z3) desce
 * um nível por vez.
 */
export const PROFUNDIDADE_MAXIMA = 2_000

/** Profundidade da árvore de uma fórmula ou termo, sem recursão. */
export function profundidade(raiz: Formula | Termo): number {
  let max = 0
  const pilha: [object, number][] = [[raiz, 1]]
  while (pilha.length) {
    const [no, d] = pilha.pop()!
    if (d > max) max = d
    for (const v of Object.values(no)) {
      if (Array.isArray(v)) {
        for (const x of v) if (x && typeof x === 'object' && 'k' in x) pilha.push([x, d + 1])
      } else if (v && typeof v === 'object' && 'k' in v) pilha.push([v, d + 1])
    }
  }
  return max
}

const BINARIOS: TipoToken[] = ['and', 'or', 'imp', 'iff']
const RELACOES: Partial<Record<TipoToken, Rel>> = { eq: '=', neq: '≠', in: '∈', notin: '∉', subset: '⊆', lt: '<', le: '≤', gt: '>', ge: '≥' }
const SOMA: Partial<Record<TipoToken, OpArit>> = { plus: '+', minus: '−' }
const PRODUTO: Partial<Record<TipoToken, OpArit>> = { times: '·', div: '/' }
/** tokens que podem começar um termo */
const INICIO_TERMO: TipoToken[] = ['nome', 'lpar', 'empty', 'num', 'minus']
const INICIO_FORMULA: TipoToken[] = ['nome', 'not', 'forall', 'exists', 'lpar', 'empty', 'nec', 'pos', 'num', 'minus']
/** operadores prefixos de fórmula: depois deles não pode vir relação */
const PREFIXOS: TipoToken[] = ['not', 'nec', 'pos', 'rbrack']

export interface OpcoesParser {
  /** nomes declarados como predicado de aridade 0 (proposições) */
  ehProposicao?: (nome: string) => boolean
}

export function parseTokens(tokens: Token[], op: OpcoesParser = {}): Formula {
  return new Parser(tokens, op).formulaCompleta()
}

/** O trecho cresce até os parênteses em volta; a posição do próprio nome fica guardada (renomear, E12, E13). */
function alargar<T extends { k: string; pos: number; end: number; nomePos?: number }>(n: T, pos: number, end: number): T {
  const guarda = (n.k === 'nome' || n.k === 'app' || n.k === 'pred') && n.nomePos === undefined
  return { ...n, ...(guarda ? { nomePos: n.pos } : {}), pos, end }
}

class Parser {
  private i = 0
  /** descidas abertas agora (ver ANINHAMENTO_MAXIMO) */
  private nivel = 0

  constructor(
    private toks: Token[],
    private op: OpcoesParser,
  ) {}

  // método (não getter) para o TypeScript não "fixar" o tipo do token entre avanços
  private at(): Token {
    return this.toks[this.i]
  }
  private avancar(): Token {
    const tk = this.toks[this.i]
    if (tk.t !== 'eof') this.i++
    return tk
  }
  private erro(codigo: Codigo, msg: string, span: Span): never {
    throw new ErroSintaxe({ codigo, nivel: 'erro', msg, pos: span.pos, end: Math.max(span.end, span.pos + 1) })
  }
  private col(tk: Span) {
    return `coluna ${tk.pos + 1}`
  }

  /** Desce um nível; aninhamento demais vira erro, não estouro de pilha. */
  private descer<T>(f: () => T): T {
    if (++this.nivel > ANINHAMENTO_MAXIMO) {
      const tk = this.at()
      throw new ErroLimite({
        codigo: 'E0',
        nivel: 'erro',
        msg: `Fórmula aninhada demais (${this.col(tk)}): mais de ${ANINHAMENTO_MAXIMO / 2} níveis. Divida em fórmulas menores.`,
        pos: tk.pos,
        end: Math.max(tk.end, tk.pos + 1),
      })
    }
    try {
      return f()
    } finally {
      this.nivel--
    }
  }

  /**
   * Erro para um token que sobrou onde se esperava fim, ')', ',' ou conectivo. Só
   * depois de uma fórmula completa (no fim do texto ou dentro de um grupo) um começo
   * de fórmula é E3; dentro de um termo ou dos argumentos, é um símbolo inesperado.
   */
  private erroInesperado(tk: Token, esperado: string, depoisDeFormula = true): never {
    if (depoisDeFormula && INICIO_FORMULA.includes(tk.t))
      this.erro('E3', `Duas fórmulas lado a lado sem conectivo (${this.col(tk)}): falta ∧, ∨, ⟹ ou ⟺`, tk)
    if (depoisDeFormula && RELACOES[tk.t])
      this.erro('E0', `Relação '${SIMBOLO_DE[tk.t]}' aplicada a uma fórmula, ou relações encadeadas (${this.col(tk)})`, tk)
    if (tk.t === 'rpar') this.erro('E7', `')' na ${this.col(tk)} não tem '(' correspondente`, tk)
    this.erro('E0', `'${SIMBOLO_DE[tk.t]}' inesperado na ${this.col(tk)}; esperava ${esperado}`, tk)
  }

  private faltaOperando(tk: Token): boolean {
    const a = this.at().t
    return a === 'eof' || a === 'rpar' || a === 'comma' || a === 'rbrack' || BINARIOS.includes(a) || (!PREFIXOS.includes(tk.t) && !!RELACOES[a])
  }

  formulaCompleta(): Formula {
    if (this.at().t === 'eof') this.erro('E0', 'Fórmula vazia', this.at())
    const f = this.formula()
    if (this.at().t !== 'eof') this.erroInesperado(this.at(), 'um conectivo ou o fim da fórmula')
    const p = profundidade(f)
    if (p > PROFUNDIDADE_MAXIMA)
      throw new ErroLimite({
        codigo: 'E0',
        nivel: 'erro',
        msg: `Fórmula grande demais: ${p} níveis (o máximo é ${PROFUNDIDADE_MAXIMA}). Divida em várias fórmulas.`,
        pos: f.pos,
        end: Math.max(f.end, f.pos + 1),
      })
    return f
  }

  // formula := iff ; precedência ¬ > ∧ > ∨ > ⟹ > ⟺
  private formula(): Formula {
    return this.descer(() => this.iff())
  }

  private operandoDireita(opTk: Token, prox: () => Formula): Formula {
    if (this.faltaOperando(opTk))
      this.erro('E1', `Operador '${SIMBOLO_DE[opTk.t]}' sem operando à direita (${this.col(opTk)})`, opTk)
    return prox()
  }

  private bin(k: Conectivo, l: Formula, r: Formula): Formula {
    return { k, l, r, pos: l.pos, end: r.end }
  }

  private iff(): Formula {
    let l = this.imp()
    while (this.at().t === 'iff') {
      const tk = this.avancar()
      l = this.bin('iff', l, this.operandoDireita(tk, () => this.imp()))
    }
    return l
  }

  private imp(): Formula {
    // ⟹ associa à direita (a ⟹ b ⟹ c é a ⟹ (b ⟹ c)), mas é lida num laço: uma cadeia longa
    // chega ao limite de profundidade em vez de esgotar a pilha
    const termos = [this.or()]
    while (this.at().t === 'imp') {
      const tk = this.avancar()
      termos.push(this.operandoDireita(tk, () => this.or()))
    }
    let r = termos.pop()!
    while (termos.length) r = this.bin('imp', termos.pop()!, r)
    return r
  }

  private or(): Formula {
    let l = this.and()
    while (this.at().t === 'or') {
      const tk = this.avancar()
      l = this.bin('or', l, this.operandoDireita(tk, () => this.and()))
    }
    return l
  }

  private and(): Formula {
    let l = this.unaria(null)
    while (this.at().t === 'and') {
      const tk = this.avancar()
      l = this.bin('and', l, this.operandoDireita(tk, () => this.unaria(null)))
    }
    return l
  }

  /** `apos`: símbolo do operador prefixo logo antes (¬, □, ◇, B[…]), para a mensagem de E2 */
  private unaria(apos: string | null): Formula {
    return this.descer(() => this.unariaDentro(apos))
  }

  private unariaDentro(apos: string | null): Formula {
    const tk = this.at()
    switch (tk.t) {
      case 'not': {
        this.avancar()
        const f = this.operandoDireita(tk, () => this.unaria('¬'))
        return { k: 'not', f, pos: tk.pos, end: f.end }
      }
      case 'nec':
      case 'pos': {
        this.avancar()
        const f = this.operandoDireita(tk, () => this.unaria(SIMBOLO_DE[tk.t]))
        return { k: tk.t, f, pos: tk.pos, end: f.end }
      }
      case 'forall':
      case 'exists':
        return this.quantificador()
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        this.erro('E1', `Operador '${SIMBOLO_DE[tk.t]}' sem operando à esquerda (${this.col(tk)})`, tk)
      case 'eq':
      case 'neq':
      case 'in':
      case 'notin':
      case 'subset':
      case 'lt':
      case 'le':
      case 'gt':
      case 'ge':
        this.erro('E1', `Relação '${SIMBOLO_DE[tk.t]}' sem termo à esquerda (${this.col(tk)})`, tk)
      case 'plus':
      case 'times':
      case 'div':
      case 'pow':
        this.erro('E1', `Operador '${SIMBOLO_DE[tk.t]}' sem número à esquerda (${this.col(tk)})`, tk)
      case 'cap':
      case 'cup':
        this.erro('E1', `Operador '${SIMBOLO_DE[tk.t]}' sem termo à esquerda (${this.col(tk)})`, tk)
      case 'lpar':
        return this.parenteses()
      case 'nome':
        if (tk.v === 'B' && this.toks[this.i + 1]?.t === 'lbrack' && !this.toks[this.i + 1].espacoAntes) return this.crenca()
        if (tk.v === 'B' && this.toks[this.i + 1]?.v === '[]' && !this.toks[this.i + 1].espacoAntes)
          this.erro('E0', `B[] sem titular: escreva quem acredita, ex.: B[cristãos] φ (${this.col(tk)})`, { pos: tk.pos, end: this.toks[this.i + 1].end })
        return this.atomo(apos)
      case 'empty':
      case 'subscr':
      case 'num':
      case 'minus':
        return this.atomo(apos)
      case 'reais':
      case 'inteiros':
        this.erro('E0', `'${tk.v}' só pode aparecer como domínio de quantificador: ∀x∈${tk.v} ou ∃x∈${tk.v} (${this.col(tk)})`, tk)
      case 'rbrack':
        this.erro('E0', `']' sem '[' correspondente (${this.col(tk)})`, tk)
      case 'eof':
        this.erro('E1', 'A fórmula termina sem operando', tk)
      default:
        this.erroInesperado(tk, 'uma fórmula')
    }
  }

  /** B[agente] φ — o agente pode ter várias palavras: B[Igreja Católica] φ */
  private crenca(): Formula {
    const b = this.avancar()
    const abre = this.avancar()
    const palavras: string[] = []
    while (this.at().t === 'nome') palavras.push(this.avancar().v)
    if (this.at().t !== 'rbrack') {
      if (this.at().t === 'eof') this.erro('E0', `'[' na ${this.col(abre)} não foi fechado: escreva B[titular] φ`, abre)
      this.erro('E0', `Em B[…] só cabe o nome do titular (${this.col(this.at())})`, this.at())
    }
    const fecha = this.avancar()
    if (!palavras.length) this.erro('E0', `B[] sem titular: escreva quem acredita, ex.: B[cristãos] φ (${this.col(b)})`, { pos: b.pos, end: fecha.end })
    const agente = palavras.join(' ')
    const f = this.operandoDireita({ ...fecha, t: 'rbrack' }, () => this.unaria(`B[${agente}]`))
    return { k: 'crenca', agente, f, pos: b.pos, end: f.end }
  }

  private quantificador(): Formula {
    const q = this.avancar()
    const qs = SIMBOLO_DE[q.t]
    if (this.at().t !== 'nome')
      this.erro('E0', `Esperava uma variável depois de '${qs}' (${this.col(q)})`, this.at().t === 'eof' ? q : this.at())
    const v = this.avancar()
    if (this.at().t === 'subscr')
      this.erro('E0', `A variável de '${qs}' deve ser um nome simples, sem subscrito (${this.col(this.at())})`, this.at())
    let dom: Termo | undefined
    if (this.at().t === 'in') {
      const inTk = this.avancar()
      if (this.faltaOperando(inTk) || this.at().t === 'not')
        this.erro('E1', `'∈' sem termo depois de '${qs}${v.v}' (${this.col(inTk)})`, inTk)
      if (this.at().t === 'reais' || this.at().t === 'inteiros') {
        const r = this.avancar()
        dom = { k: r.t === 'reais' ? 'reais' : 'inteiros', pos: r.pos, end: r.end }
      } else dom = this.termo()
    }
    if (this.faltaOperando(q))
      this.erro('E1', `Quantificador '${qs}${v.v}' sem fórmula depois (${this.col(q)})`, q)
    // "∃y (…) ⟹ P": o escopo vai até o fim, não até o ")"; guardamos para avisar (E14)
    const fecha = this.at().t === 'lpar' ? this.fechamento(this.i) : -1
    const corpo = this.formula()
    const enganoso = fecha >= 0 && corpo.end > this.toks[fecha].end ? this.toks[fecha].pos : undefined
    // "∀x P(x) ⟹ Q": sem parêntese logo depois, o conectivo do topo fica dentro do escopo (E16)
    const aberto = fecha < 0 && (corpo.k === 'and' || corpo.k === 'or' || corpo.k === 'imp' || corpo.k === 'iff')
    return {
      k: q.t as 'forall' | 'exists',
      v: v.v,
      vPos: v.pos,
      dom,
      corpo,
      pos: q.pos,
      end: corpo.end,
      parentesesEnganoso: enganoso,
      ...(aberto ? { corpoAberto: true as const } : {}),
    }
  }

  /** Índice do ")" que fecha o "(" na posição i (os parênteses já foram conferidos). */
  private fechamento(i: number): number {
    let nivel = 0
    for (let k = i; k < this.toks.length; k++) {
      if (this.toks[k].t === 'lpar') nivel++
      else if (this.toks[k].t === 'rpar' && --nivel === 0) return k
    }
    return -1
  }

  /** '(' pode abrir um termo, ex. "(A ⋂ B) ⊆ C", ou uma fórmula. Tenta termo + relação primeiro. */
  private parenteses(): Formula {
    const salvo = this.i
    try {
      const t = this.termo()
      if (RELACOES[this.at().t]) return this.relacao(t)
    } catch (e) {
      if (!(e instanceof ErroSintaxe) || e instanceof ErroLimite) throw e
    }
    this.i = salvo
    const abre = this.avancar()
    if (this.at().t === 'rpar') this.erro('E0', `Parênteses vazios (${this.col(abre)})`, { pos: abre.pos, end: this.at().end })
    const f = this.formula()
    if (this.at().t !== 'rpar') this.erroInesperado(this.at(), "')' ou um conectivo")
    const fecha = this.avancar()
    return alargar(f, abre.pos, fecha.end)
  }

  private atomo(apos: string | null): Formula {
    const ini = this.at()
    const t = this.termo()
    if (RELACOES[this.at().t]) return this.relacao(t)
    // aplicação sem relação depois → predicado
    if (t.k === 'app' && !t.subscrito) return { k: 'pred', nome: t.fn, args: t.args, pos: t.pos, end: t.end }
    if (t.k === 'nome' && this.op.ehProposicao?.(t.nome)) return { k: 'pred', nome: t.nome, args: [], pos: t.pos, end: t.end }
    const txt = t.k === 'nome' ? t.nome : t.k === 'app' ? `${t.fn}${t.subscrito ? '_' : '('}…` : t.k === 'num' ? t.valor : 'termo'
    let dica = ''
    if (t.k === 'nome' && this.at().t === 'lpar' && this.at().espacoAntes)
      dica = ` Para aplicar '${t.nome}', escreva ${t.nome}(…) sem espaço antes do '('.`
    else if (t.k === 'nome')
      dica = ` Se '${t.nome}' é uma proposição, declare-a no dicionário como predicado de aridade 0.`
    if (apos === '¬') this.erro('E2', `Negação aplicada a um termo ('${txt}'), não a uma fórmula (${this.col(ini)}).${dica}`, t)
    if (apos) this.erro('E2', `'${apos}' aplicado a um termo ('${txt}'), não a uma fórmula (${this.col(ini)}).${dica}`, t)
    this.erro('E2', `'${txt}' é um termo, não uma fórmula: falta uma relação (=, ≠, <, ≤, ∈, ∉, ⊆) ou um predicado (${this.col(ini)}).${dica}`, t)
  }

  private relacao(l: Termo): Formula {
    const opTk = this.avancar()
    const op = RELACOES[opTk.t]!
    if (this.faltaOperando(opTk) || this.at().t === 'not' || this.at().t === 'forall' || this.at().t === 'exists')
      this.erro('E1', `Relação '${op}' sem termo à direita (${this.col(opTk)})`, opTk)
    const r = this.termo()
    return { k: 'rel', op, l, r, pos: l.pos, end: r.end }
  }

  // termo := produto { (+|−) produto } ; produto := sinal { (·|/) sinal } ; sinal := − sinal | potencia
  // potencia := conjunto [ ^ sinal ] ; conjunto := inter { ⋃ inter } ; inter := prim { ⋂ prim }
  private termo(): Termo {
    return this.descer(() => this.termoDentro())
  }

  private termoDentro(): Termo {
    let l = this.produto()
    for (let op = SOMA[this.at().t]; op; op = SOMA[this.at().t]) {
      const tk = this.avancar()
      const r = this.operandoTermo(tk, () => this.produto())
      l = { k: 'arit', op, l, r, pos: l.pos, end: r.end }
    }
    return l
  }

  private produto(): Termo {
    let l = this.sinal()
    for (let op = PRODUTO[this.at().t]; op; op = PRODUTO[this.at().t]) {
      const tk = this.avancar()
      const r = this.operandoTermo(tk, () => this.sinal())
      l = { k: 'arit', op, l, r, pos: l.pos, end: r.end }
    }
    return l
  }

  private sinal(): Termo {
    return this.descer(() => this.sinalDentro())
  }

  private sinalDentro(): Termo {
    const tk = this.at()
    if (tk.t === 'minus') {
      this.avancar()
      const t = this.operandoTermo(tk, () => this.sinal())
      return { k: 'neg', t, pos: tk.pos, end: t.end }
    }
    return this.potencia()
  }

  private potencia(): Termo {
    const base = this.conjunto()
    if (this.at().t !== 'pow') return base
    const tk = this.avancar()
    const exp = this.operandoTermo(tk, () => this.sinal())
    return { k: 'arit', op: '^', l: base, r: exp, pos: base.pos, end: exp.end }
  }

  private conjunto(): Termo {
    let l = this.inter()
    while (this.at().t === 'cup') {
      const tk = this.avancar()
      const r = this.operandoTermo(tk, () => this.inter())
      l = { k: 'uniao', l, r, pos: l.pos, end: r.end }
    }
    return l
  }

  private inter(): Termo {
    let l = this.prim()
    while (this.at().t === 'cap') {
      const tk = this.avancar()
      const r = this.operandoTermo(tk, () => this.prim())
      l = { k: 'inter', l, r, pos: l.pos, end: r.end }
    }
    return l
  }

  private operandoTermo(tk: Token, prox: () => Termo): Termo {
    if (!INICIO_TERMO.includes(this.at().t))
      this.erro('E1', `Operador '${SIMBOLO_DE[tk.t]}' sem termo à direita (${this.col(tk)})`, tk)
    return prox()
  }

  private prim(): Termo {
    const tk = this.at()
    if (tk.t === 'empty') {
      this.avancar()
      return { k: 'vazio', pos: tk.pos, end: tk.end }
    }
    if (tk.t === 'num') {
      this.avancar()
      return { k: 'num', valor: tk.v, pos: tk.pos, end: tk.end }
    }
    if (tk.t === 'reais' || tk.t === 'inteiros')
      this.erro('E0', `'${tk.v}' só pode aparecer como domínio de quantificador: ∀x∈${tk.v} ou ∃x∈${tk.v} (${this.col(tk)})`, tk)
    if (tk.t === 'nome') {
      this.avancar()
      const prox = this.at()
      if (prox.t === 'lpar' && !prox.espacoAntes) return this.aplicacao(tk)
      if (prox.t === 'subscr' && !prox.espacoAntes) {
        this.avancar()
        const arg: Termo = { k: 'nome', nome: prox.v, pos: prox.pos, end: prox.end }
        return { k: 'app', fn: tk.v, args: [arg], subscrito: true, pos: tk.pos, end: prox.end }
      }
      return { k: 'nome', nome: tk.v, pos: tk.pos, end: tk.end }
    }
    if (tk.t === 'lpar') {
      this.avancar()
      const t = this.termo()
      if (this.at().t !== 'rpar') this.erroInesperado(this.at(), "')'", false)
      const fecha = this.avancar()
      return alargar(t, tk.pos, fecha.end)
    }
    if (tk.t === 'subscr') this.erro('E0', `Subscrito '${tk.v}' sem nome antes (${this.col(tk)})`, tk)
    if (tk.t === 'eof' || tk.t === 'rpar' || tk.t === 'comma' || BINARIOS.includes(tk.t))
      this.erro('E1', `Falta um termo na ${this.col(tk)}`, tk)
    this.erro('E0', `Esperava um termo na ${this.col(tk)}, encontrei '${SIMBOLO_DE[tk.t]}'`, tk)
  }

  private aplicacao(nome: Token): Termo {
    const abre = this.avancar()
    if (this.at().t === 'rpar') this.erro('E0', `'${nome.v}()' sem argumentos (${this.col(abre)})`, { pos: abre.pos, end: this.at().end })
    const args: Termo[] = []
    for (;;) {
      args.push(this.termo())
      if (this.at().t === 'comma') {
        this.avancar()
        continue
      }
      if (this.at().t === 'rpar') break
      if (this.at().t === 'nome' || this.at().t === 'lpar' || this.at().t === 'num')
        this.erro('E0', `Falta ',' entre argumentos de '${nome.v}' (${this.col(this.at())})`, this.at())
      this.erroInesperado(this.at(), `',' ou ')' nos argumentos de '${nome.v}'`, false)
    }
    const fecha = this.avancar()
    return { k: 'app', fn: nome.v, args, subscrito: false, pos: nome.pos, end: fecha.end }
  }
}
