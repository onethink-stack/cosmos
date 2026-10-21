// O vínculo da seção 5.1 de especificacao/registros-v1.md: o problema de um certificado é a tradução t1 do conjunto
// quando os dois estão no perfil da t1 e são iguais a menos da forma. É a mesma comparação de
// especificacao/provas-t1/vinculo.py, a do verificador público, para a conferência do Caderno não recusar o que a
// especificação aceita: as asserções em outra ordem, os nomes de outra tradução (c:n e n:n), os let, a escrita dos
// números. Antes de comparar, cada problema tem de estar no perfil da t1 (os comandos, as sortes, os nomes declarados e
// os operadores que a tradução emite, na ordem dela, e bem tipados), para as normalizações só valerem para os
// operadores embutidos: uma função declarada com o nome and não é associativa.

import { escrever, lerRacional, oposto, quociente, type Racional } from './exato'

/** Uma expressão SMT-LIB lida: um símbolo (sem as barras), um número ou uma lista */
type Expr = { s: string } | { q: Racional } | Expr[]
/** A forma normal de um termo, que se compara pelo JSON */
type Norma = string | number | Norma[]

class ForaDoPerfil extends Error {}
const recusar = (msg: string): never => {
  throw new ForaDoPerfil(msg)
}
const ehSimbolo = (e: Expr | undefined): e is { s: string } => e !== undefined && !Array.isArray(e) && 's' in e
const simbolo = (e: Expr | undefined, onde: string): string => (ehSimbolo(e) ? e.s : recusar(`${onde} mal formado`))
const lista = (e: Expr | undefined): Expr[] => (Array.isArray(e) ? e : recusar('esperava uma lista'))

/** As expressões de topo do texto. Recusa um parêntese sem par e uma barra sem fim. */
export function lerSmt(texto: string): Expr[] {
  const pilha: Expr[][] = [[]]
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (c === ';') {
      while (i < texto.length && texto[i] !== '\n') i++
    } else if (/\s/.test(c)) i++
    else if (c === '(') {
      pilha.push([])
      i++
    } else if (c === ')') {
      if (pilha.length === 1) recusar('parênteses sem par')
      const feito = pilha.pop()!
      pilha[pilha.length - 1].push(feito)
      i++
    } else if (c === '|') {
      const j = texto.indexOf('|', i + 1)
      if (j < 0) recusar('barra sem fim')
      pilha[pilha.length - 1].push({ s: texto.slice(i + 1, j) })
      i = j + 1
    } else {
      let j = i
      while (j < texto.length && !/\s/.test(texto[j]) && !'()|;'.includes(texto[j])) j++
      const tok = texto.slice(i, j)
      pilha[pilha.length - 1].push(/^[0-9]+(\.[0-9]+)?$/.test(tok) ? { q: lerRacional(tok)! } : { s: tok })
      i = j
    }
  }
  if (pilha.length !== 1) recusar('parênteses sem par')
  return pilha[0]
}

/** O valor de um número escrito como literal, (- literal) ou (/ literal literal); senão null */
function numero(e: Expr): Racional | null {
  if (!Array.isArray(e)) return 'q' in e ? e.q : null
  if (e.length === 2 && ehSimbolo(e[0]) && e[0].s === '-') {
    const v = numero(e[1])
    return v && oposto(v)
  }
  if (e.length === 3 && ehSimbolo(e[0]) && e[0].s === '/') {
    const [a, b] = [numero(e[1]), numero(e[2])]
    return a && b && b.n !== 0n ? quociente(a, b) : null
  }
  return null
}

/** Todos os nomes que aparecem num termo (uma aproximação por cima dos nomes livres) */
function simbolos(e: Expr, saida = new Set<string>()): Set<string> {
  if (!Array.isArray(e)) {
    if ('s' in e) saida.add(e.s)
  } else for (const x of e) simbolos(x, saida)
  return saida
}

// ---- o perfil da t1: o que a tradução emite, e nada mais

const COMANDOS = new Set(['set-logic', 'declare-sort', 'declare-fun', 'declare-const', 'assert', 'check-sat'])
const SORTES_DECLARADAS = new Set(['Obj', 'Mundo'])
const SORTES = new Set(['Obj', 'Mundo', 'Bool', 'Real'])
const EMBUTIDOS = new Set(['true', 'false', 'not', 'and', 'or', '=>', '=', '+', '-', '*', '/', '^', '<', '<=', '>', '>=', 'is_int'])
const LIGADORES = new Set(['forall', 'exists', 'let'])
// os nomes que a t1 declara (seção 3 de traducao-z3-t1.md): w0, pertence, c:, n:, f:, fn:, p: e R:
const NOME_DECLARADO = /^(?:w0|pertence|(?:c|n):[^\s|]+|(?:f|fn|p):[^\s|\/]+\/\d+(?::[RO]+)?|R:[^\s|]+)$/
// a ordem dos comandos: um (set-logic ALL), as sortes, as funções e constantes, as asserções e, se houver, um
// (check-sat) no fim
const FASE: Record<string, number> = { 'set-logic': 0, 'declare-sort': 1, 'declare-fun': 2, 'declare-const': 2, assert: 3, 'check-sat': 4 }

/** Recusa um problema fora do perfil da t1, inclusive um termo mal tipado. */
function conferirPerfil(comandos: Expr[]): void {
  const assinaturas = new Map<string, [string[], string]>()
  const sortesDeclaradas = new Set<string>()
  let fase = -1
  comandos.forEach((cmd, i) => {
    if (!Array.isArray(cmd) || !cmd.length || !ehSimbolo(cmd[0]) || !COMANDOS.has(cmd[0].s)) recusar('comando fora do perfil da t1')
    const c = cmd as Expr[]
    const nome = (c[0] as { s: string }).s
    if (FASE[nome] < fase || (FASE[nome] === fase && (nome === 'set-logic' || nome === 'check-sat')))
      recusar(`${nome} fora da ordem da t1 (set-logic, sortes, declarações, asserções, check-sat)`)
    fase = FASE[nome]
    if (i === 0 && nome !== 'set-logic') recusar('a t1 começa com (set-logic ALL)')
    if (nome === 'set-logic' && !(c.length === 2 && ehSimbolo(c[1]) && c[1].s === 'ALL')) recusar('a t1 usa (set-logic ALL)')
    if (nome === 'check-sat' && c.length !== 1) recusar('check-sat mal formado')
    if (nome === 'declare-sort') {
      const s = c.length === 3 && ehSimbolo(c[1]) ? c[1].s : ''
      const zero = c.length === 3 ? numero(c[2]) : null
      if (!SORTES_DECLARADAS.has(s) || !zero || zero.n !== 0n || sortesDeclaradas.has(s)) recusar('sorte fora do perfil da t1')
      sortesDeclaradas.add(s)
    }
    if (nome === 'declare-fun' || nome === 'declare-const') {
      if (nome === 'declare-fun' && (c.length !== 4 || !Array.isArray(c[2]))) recusar('declare-fun mal formado')
      if (nome === 'declare-const' && c.length !== 3) recusar('declare-const mal formado')
      const nomeDeclarado = simbolo(c[1], nome)
      const argumentos = nome === 'declare-fun' ? lista(c[2]).map((s) => simbolo(s, nome)) : []
      const resultado = simbolo(nome === 'declare-fun' ? c[3] : c[2], nome)
      if (!NOME_DECLARADO.test(nomeDeclarado)) recusar(`nome declarado fora do perfil da t1: ${nomeDeclarado}`)
      if (assinaturas.has(nomeDeclarado)) recusar(`${nomeDeclarado} declarado duas vezes`)
      if ([...argumentos, resultado].some((s) => !SORTES.has(s) || (SORTES_DECLARADAS.has(s) && !sortesDeclaradas.has(s))))
        recusar(`${nomeDeclarado} com sorte fora do perfil da t1, ou não declarada antes`)
      assinaturas.set(nomeDeclarado, [argumentos, resultado])
    }
  })

  const sorteLigada = (s: Expr): string => {
    if (!(ehSimbolo(s) && SORTES.has(s.s) && (!SORTES_DECLARADAS.has(s.s) || sortesDeclaradas.has(s.s))))
      recusar('variável ligada com sorte fora do perfil da t1, ou não declarada')
    return (s as { s: string }).s
  }
  /** a sorte de um termo; recusa um termo mal tipado */
  const sorte = (e: Expr, ligadas: Map<string, string>): string => {
    if (!Array.isArray(e)) {
      if ('q' in e) return 'Real' // na t1, todo número é Real
      const n = e.s
      if (ligadas.has(n)) return ligadas.get(n)!
      if (n === 'true' || n === 'false') return 'Bool'
      const a = assinaturas.get(n)
      if (a && !a[0].length) return a[1]
      return recusar(`símbolo fora do perfil da t1, ou usado sem os argumentos: ${n}`)
    }
    if (!e.length || !ehSimbolo(e[0])) return recusar('aplicação sem nome')
    const cabeca = e[0].s
    if (LIGADORES.has(cabeca)) {
      if (e.length !== 3 || !Array.isArray(e[1]) || !e[1].length) recusar(`${cabeca} mal formado`)
      const novas = new Map(ligadas)
      for (const par of e[1] as Expr[]) {
        if (!(Array.isArray(par) && par.length === 2 && ehSimbolo(par[0]))) recusar(`${cabeca} mal formado`)
        const [nome, valor] = par as [{ s: string }, Expr]
        if (EMBUTIDOS.has(nome.s) || LIGADORES.has(nome.s) || assinaturas.has(nome.s)) recusar(`${cabeca} liga um nome que esconde outro símbolo: ${nome.s}`)
        // o termo de um let vê só os nomes de fora
        novas.set(nome.s, cabeca === 'let' ? sorte(valor, ligadas) : sorteLigada(valor))
      }
      const corpo = sorte(e[2], novas)
      if (cabeca !== 'let' && corpo !== 'Bool') recusar(`o corpo de um ${cabeca} tem de ser Bool`)
      return corpo
    }
    if (ligadas.has(cabeca)) recusar(`uma variável ligada não é aplicada: ${cabeca}`)
    const args = e.slice(1).map((x) => sorte(x, ligadas))
    const a = assinaturas.get(cabeca)
    if (a) {
      if (!a[0].length || args.length !== a[0].length || args.some((s, i) => s !== a[0][i])) recusar(`${cabeca} aplicado a ${args}, esperava ${a[0]}`)
      return a[1]
    }
    const todos = (s: string, minimo: number) => {
      if (args.length < minimo || args.some((x) => x !== s)) recusar(`${cabeca} com argumentos ${args}`)
    }
    switch (cabeca) {
      case 'not':
        todos('Bool', 1)
        if (args.length !== 1) recusar('not tem um argumento')
        return 'Bool'
      case 'and':
      case 'or':
      case '=>':
        todos('Bool', 2)
        return 'Bool'
      case '=':
        if (args.length < 2 || new Set(args).size !== 1) recusar(`= com argumentos ${args}`)
        return 'Bool'
      case '+':
      case '*':
        todos('Real', 2)
        return 'Real'
      case '-':
      case '/':
        // - com um argumento (o sinal) ou dois, / com dois: as formas que a tradução emite
        todos('Real', cabeca === '-' ? 1 : 2)
        if (args.length > 2) recusar(`${cabeca} com mais de dois argumentos`)
        return 'Real'
      case '^':
        todos('Real', 2)
        if (args.length !== 2) recusar('^ tem dois argumentos')
        return 'Real'
      case '<':
      case '<=':
      case '>':
      case '>=':
        todos('Real', 2)
        return 'Bool'
      case 'is_int':
        todos('Real', 1)
        if (args.length !== 1) recusar('is_int tem um argumento')
        return 'Bool'
    }
    return recusar(`símbolo fora do perfil da t1: ${cabeca}`)
  }

  for (const cmd of comandos as Expr[][]) {
    if ((cmd[0] as { s: string }).s !== 'assert') continue
    if (cmd.length !== 2) recusar('assert mal formado')
    if (sorte(cmd[1], new Map()) !== 'Bool') recusar('uma asserção tem de ser Bool')
  }
}

// ---- a forma normal

/** Expande os let; recusa se a troca capturasse uma variável ligada por um quantificador de dentro */
function semLet(e: Expr, subst: Map<string, Expr>): Expr {
  if (!Array.isArray(e)) return 's' in e ? (subst.get(e.s) ?? e) : e
  if (!e.length) return e
  const cabeca = e[0]
  if (ehSimbolo(cabeca) && cabeca.s === 'let' && e.length === 3) {
    const novos = new Map(subst)
    for (const par of e[1] as Expr[][]) novos.set((par[0] as { s: string }).s, semLet(par[1], subst))
    return semLet(e[2], novos)
  }
  if (ehSimbolo(cabeca) && (cabeca.s === 'forall' || cabeca.s === 'exists') && e.length === 3) {
    const nomes = new Set((e[1] as Expr[][]).map((par) => (par[0] as { s: string }).s))
    const resto = new Map([...subst].filter(([k]) => !nomes.has(k)))
    if ([...resto.values()].some((v) => [...simbolos(v)].some((n) => nomes.has(n)))) recusar('um let capturaria uma variável ligada')
    return [cabeca, e[1], semLet(e[2], resto)]
  }
  return e.map((x) => semLet(x, subst))
}

/** O nome-base de um símbolo da tradução: c:a, n:a → a; f:g/2, fn:g/2:RO → g; p:P/1:R → P; R:Ana → Ana */
const base = (nome: string) => /^(?:c|n|f|fn|p|R):(.+?)(?:\/\d+(?::[RO]+)?)?$/.exec(nome)?.[1] ?? nome

/** A forma normal de um termo: as ligadas numeradas na ordem dos ligadores, os números pelo valor, and e or achatados,
 * e os símbolos declarados pelo nome-base e pela assinatura */
function normal(e: Expr, ligadas: Map<string, number>, contador: { n: number }, canon: Map<string, string>): Norma {
  const v = numero(e)
  if (v) return ['num', escrever(v)]
  if (!Array.isArray(e)) {
    const nome = (e as { s: string }).s
    return ligadas.has(nome) ? ['ligada', ligadas.get(nome)!] : ['sim', canon.get(nome) ?? nome]
  }
  if (!e.length) return []
  const cabeca = e[0]
  if (ehSimbolo(cabeca) && (cabeca.s === 'forall' || cabeca.s === 'exists') && e.length === 3) {
    const novas = new Map(ligadas)
    const variaveis: Norma[] = []
    for (const par of e[1] as Expr[][]) {
      contador.n++
      novas.set((par[0] as { s: string }).s, contador.n)
      variaveis.push([contador.n, (par[1] as { s: string }).s])
    }
    return [cabeca.s, variaveis, normal(e[2], novas, contador, canon)]
  }
  if (ehSimbolo(cabeca) && (cabeca.s === 'and' || cabeca.s === 'or')) {
    const args: Norma[] = []
    for (const x of e.slice(1)) {
      const nx = normal(x, ligadas, contador, canon)
      if (Array.isArray(nx) && nx.length === 2 && nx[0] === cabeca.s && Array.isArray(nx[1])) args.push(...nx[1])
      else args.push(nx)
    }
    return [cabeca.s, args]
  }
  return ['app', ...e.map((x) => normal(x, ligadas, contador, canon))]
}

/** As declarações usadas e as asserções (um multiconjunto) de um problema, comparáveis sem ligar para a ordem */
function forma(texto: string): { declaracoes: Set<string>; assercoes: Map<string, number> } {
  const comandos = lerSmt(texto)
  conferirPerfil(comandos)
  const decl = new Map<string, [string[], string]>()
  const corpos: Expr[] = []
  for (const cmd of comandos as Expr[][]) {
    const nome = (cmd[0] as { s: string }).s
    if (nome === 'declare-const') decl.set(simbolo(cmd[1], nome), [[], simbolo(cmd[2], nome)])
    else if (nome === 'declare-fun') decl.set(simbolo(cmd[1], nome), [lista(cmd[2]).map((s) => simbolo(s, nome)), simbolo(cmd[3], nome)])
    else if (nome === 'assert') corpos.push(semLet(cmd[1], new Map()))
  }
  const canon = new Map([...decl].map(([n, [a, r]]) => [n, `${base(n)}|${a.join(',')}|${r}`]))
  if (new Set(canon.values()).size !== canon.size) recusar('dois símbolos declarados com o mesmo nome-base e a mesma assinatura')
  const usados = new Set<string>()
  for (const c of corpos) simbolos(c, usados)
  const declaracoes = new Set([...decl.keys()].filter((n) => usados.has(n)).map((n) => canon.get(n)!))
  // cada asserção numera as próprias variáveis ligadas a partir de zero
  const assercoes = new Map<string, number>()
  for (const c of corpos) {
    const k = JSON.stringify(normal(c, new Map(), { n: 0 }, canon))
    assercoes.set(k, (assercoes.get(k) ?? 0) + 1)
  }
  return { declaracoes, assercoes }
}

/**
 * '' se os dois problemas são o mesmo a menos da forma (seção 5.1); senão, a primeira diferença. Um problema fora do
 * perfil da t1, ou que nem se lê, é diferente: a comparação falha fechada.
 */
export function diferencaDeProblemas(a: string, b: string): string {
  let fa, fb
  try {
    fa = forma(a)
    fb = forma(b)
  } catch (erro) {
    return `não deu para comparar: ${erro instanceof ForaDoPerfil ? erro.message : `problema mal formado (${String(erro)})`}`
  }
  const soNoPrimeiro = [...fa.declaracoes].filter((d) => !fb.declaracoes.has(d))
  const soNoSegundo = [...fb.declaracoes].filter((d) => !fa.declaracoes.has(d))
  if (soNoPrimeiro.length || soNoSegundo.length) return `declarações diferentes: só no primeiro ${soNoPrimeiro.slice(0, 3)}; só no segundo ${soNoSegundo.slice(0, 3)}`
  const chaves = new Set([...fa.assercoes.keys(), ...fb.assercoes.keys()])
  for (const k of chaves)
    if ((fa.assercoes.get(k) ?? 0) !== (fb.assercoes.get(k) ?? 0))
      return `asserções diferentes (contando as repetidas): ${k.slice(0, 160)} aparece ${fa.assercoes.get(k) ?? 0} e ${fb.assercoes.get(k) ?? 0} vezes`
  return ''
}
