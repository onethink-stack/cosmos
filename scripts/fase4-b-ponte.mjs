// Ponte proposicional fechada. Não executa solver, GPU, rede ou comandos.
import { createHash } from 'node:crypto'
export const SHA_SMT2_B = '5ead6b1b65836e0610ab91e657ad35b4c57122211f07126383ade24afd875edd'
export const shaB = b => createHash('sha256').update(b).digest('hex')
export const nomesB = Object.freeze(Array.from({ length: 12 }, (_, i) => `p${Math.floor(i / 3)}h${i % 3}`))
const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function traduzirSmt2B(bytes) {
  if (!Buffer.isBuffer(bytes) || shaB(bytes) !== SHA_SMT2_B) throw new Error('smt2-divergente')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const tokens = [...text.matchAll(/;[^\r\n]*|[()]|[^\s();]+/g)].map(m => m[0]).filter(t => !t.startsWith(';'))
  let i = 0
  function expr() {
    const t = tokens[i++]
    if (t === undefined || t === ')') throw new Error('smt2-malformado')
    if (t !== '(') return t
    const a = []
    while (i < tokens.length && tokens[i] !== ')') a.push(expr())
    if (tokens[i++] !== ')') throw new Error('smt2-incompleto')
    return a
  }
  const comandos = []
  while (i < tokens.length) comandos.push(expr())
  if (comandos.length !== 48 || !iguais(comandos[0], ['set-logic', 'QF_UF']) || !iguais(comandos.at(-1), ['check-sat'])) throw new Error('comandos-divergentes')
  for (let v = 0; v < 12; v++) if (!iguais(comandos[v + 1], ['declare-fun', nomesB[v], [], 'Bool'])) throw new Error('declaracoes-divergentes')
  const clausulas = comandos.slice(13, -1).map(cmd => {
    if (!Array.isArray(cmd) || cmd.length !== 2 || cmd[0] !== 'assert' || !Array.isArray(cmd[1]) || cmd[1][0] !== 'or'
      || ![3, 4].includes(cmd[1].length)) throw new Error('assert-nao-suportado')
    let pos = 0, neg = 0
    const literais = cmd[1].slice(1).map(l => {
      const negativo = Array.isArray(l)
      if (negativo && (l.length !== 2 || l[0] !== 'not')) throw new Error('literal-invalido')
      const v = nomesB.indexOf(negativo ? l[1] : l)
      if (v < 0 || ((pos | neg) & (1 << v))) throw new Error('literal-repetido-ou-desconhecido')
      if (negativo) neg |= 1 << v; else pos |= 1 << v
      return { v, negativo }
    })
    return { pos, neg, literais }
  })
  if (clausulas.length !== 34 || new Set(clausulas.map(c => `${c.pos}:${c.neg}`)).size !== 34) throw new Error('clausulas-divergentes')
  const buffer = Buffer.alloc(288)
  ;[1, 12, 34, 4096].forEach((v, j) => buffer.writeUInt32LE(v, j * 4))
  clausulas.forEach((c, j) => { buffer.writeUInt32LE(c.pos, 16 + j * 8); buffer.writeUInt32LE(c.neg, 20 + j * 8) })
  return { clausulas, buffer, entradaSha256: shaB(bytes), bufferSha256: shaB(buffer) }
}
export const falsaB = (c, a) => (a & c.pos) === 0 && ((~a) & c.neg & 0xFFF) === 0
export function validarTestemunhosB(saida, clausulas) {
  if (!Buffer.isBuffer(saida) || saida.length !== 16384) throw new Error('saida-tamanho-invalido')
  const w = []
  for (let a = 0; a < 4096; a++) {
    const c = saida.readUInt32LE(a * 4)
    if (c === 0xFFFFFFFE) throw new Error('slot-nao-escrito')
    if (c === 0xFFFFFFFF) throw new Error('sentinela-sat')
    if (c >= 34) throw new Error('indice-fora-do-dominio')
    if (!falsaB(clausulas[c], a)) throw new Error('testemunho-nao-falsifica-clausula')
    w.push(c)
  }
  return w
}
const lit = (v, negativo) => negativo ? `(not ${nomesB[v]})` : nomesB[v]
const termos = c => nomesB.flatMap((_, v) => c.pos & (1 << v) ? [lit(v, false)] : c.neg & (1 << v) ? [lit(v, true)] : [])

export function converterTestemunhosB(smt2, saida) {
  const t = traduzirSmt2B(smt2), w = validarTestemunhosB(saida, t.clausulas)
  const linhas = t.clausulas.map((c, j) => `(assume a${j} (or ${c.literais.map(l => lit(l.v, l.negativo)).join(' ')}))`), folhas = []
  t.clausulas.forEach((c, j) => {
    const ls = c.literais.map(l => lit(l.v, l.negativo))
    linhas.push(`(step c${j} (cl ${ls.join(' ')}) :rule or :premises (a${j}))`)
    folhas.push({ pos: c.pos, neg: c.neg, id: `c${j}` })
  })
  let resolucoes = 0, comprimidos = 0, descartes = 0
  function arvore(prefixo, profundidade) {
    const indice = w[prefixo]
    const c = t.clausulas[indice]
    const conhecidos = (1 << profundidade) - 1
    const jaFalsa = ((c.pos | c.neg) & ~conhecidos) === 0 && falsaB(c, prefixo)
    if (jaFalsa) {
      let mesmo = true
      for (let s = 0; s < (1 << (12 - profundidade)); s++) if (w[prefixo | (s << profundidade)] !== indice) { mesmo = false; break }
      if (mesmo) { comprimidos++; return folhas[indice] }
    }
    if (profundidade === 12) return folhas[indice]
    const bit = 1 << profundidade
    const e = arvore(prefixo, profundidade + 1)
    const d = arvore(prefixo | bit, profundidade + 1)
    // Se uma conclusão já independe do pivô, ela é válida sob o prefixo pai.
    // As outras saídas GPU continuam verificadas integralmente antes da conversão.
    if (!(e.pos & bit)) { descartes++; return e }
    if (!(d.neg & bit)) { descartes++; return d }
    const pos = (e.pos & ~bit) | d.pos, neg = e.neg | (d.neg & ~bit)
    if ((pos & neg) !== 0 || ((pos | neg) & ~conhecidos) !== 0 || !falsaB({ pos, neg }, prefixo)) throw new Error('resolvente-interno-invalido')
    const id = `r${resolucoes++}`
    const xs = termos({ pos, neg })
    linhas.push(`(step ${id} (cl${xs.length ? ' ' + xs.join(' ') : ''}) :rule resolution :premises (${e.id} ${d.id}) :args (${nomesB[profundidade]} true))`)
    return { pos, neg, id }
  }
  const fim = arvore(0, 0)
  if (fim.pos || fim.neg || linhas.at(-1)?.startsWith(`(step ${fim.id} (cl) `) !== true) throw new Error('conclusao-nao-vazia')
  const prova = Buffer.from(linhas.join('\n') + '\n', 'utf8')
  if (prova.length > 1048576) throw new Error('prova-excede-limite')
  return { prova, buffer: t.buffer, entradaSha256: t.entradaSha256, bufferSha256: t.bufferSha256,
    saidaSha256: shaB(saida), provaSha256: shaB(prova), resolucoes, prefixosComprimidos: comprimidos, ramosDispensadosPorConclusaoMaisForte: descartes }
}

/** Somente fixture sintética/oráculo de teste. Nunca chamar como fallback do host GPU. */
export function gerarTestemunhosSinteticosB(smt2) {
  const { clausulas } = traduzirSmt2B(smt2)
  const saida = Buffer.alloc(16384)
  for (let a = 0; a < 4096; a++) {
    const c = clausulas.findIndex(cl => falsaB(cl, a))
    saida.writeUInt32LE(c < 0 ? 0xFFFFFFFF : c, a * 4)
  }
  return saida
}
