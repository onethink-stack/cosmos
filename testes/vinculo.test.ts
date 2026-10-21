// O vínculo da seção 5.1 de especificacao/registros-v1.md na conferência do Caderno (src/motor/vinculo.ts), a mesma
// comparação de especificacao/provas-t1/vinculo.py: os controles do verificador público (adversarios/comparador/) e os
// 42 problemas da t1, com as mudanças de forma que a comparação ignora e os estragos que ela tem de ver.
import { describe, expect, it } from 'vitest'
import { diferencaDeProblemas, lerSmt } from '../src/motor/vinculo'

const comparador = import.meta.glob<string>('../especificacao/provas-t1/adversarios/comparador/*.smt2', { eager: true, query: '?raw', import: 'default' })
const problemas = import.meta.glob<string>('../especificacao/provas-t1/problemas/*.smt2', { eager: true, query: '?raw', import: 'default' })
const NL = String.fromCharCode(10)

/** os comandos de topo de um problema, um por item, como no texto (um comando pode ter linhas de continuação) */
function comandos(texto: string): string[] {
  const saida: string[] = []
  let atual = ''
  let nivel = 0
  for (const linha of texto.split(NL)) {
    if (!atual && (linha.startsWith(';') || !linha.trim())) continue
    atual += (atual ? NL : '') + linha
    nivel += [...linha].filter((c) => c === '(').length - [...linha].filter((c) => c === ')').length
    if (nivel === 0) {
      saida.push(atual)
      atual = ''
    }
  }
  return saida
}
const juntar = (cs: string[]) => cs.join(NL) + NL

describe('o vínculo da seção 5.1 na conferência do Caderno', () => {
  it('recusa os controles do verificador público: os pares de sentido diferente e os problemas fora do perfil', () => {
    const nomes = Object.keys(comparador)
    expect(nomes.length).toBeGreaterThanOrEqual(8)
    for (const a of nomes.filter((n) => n.endsWith('-a.smt2'))) {
      const b = a.replace(/-a\.smt2$/, '-b.smt2')
      expect(diferencaDeProblemas(comparador[a], comparador[b]), a).not.toBe('')
    }
    for (const n of nomes.filter((n) => n.endsWith('-recusar.smt2'))) expect(diferencaDeProblemas(comparador[n], comparador[n]), n).toMatch(/não deu para comparar/)
    expect(diferencaDeProblemas(comparador['../especificacao/provas-t1/adversarios/comparador/parentese-a-mais-recusar.smt2'], '')).toMatch(/parênteses sem par/)
  })

  it('dá como iguais os 42 problemas com outra forma: asserções em outra ordem, sem comentários, sem barras e com let', () => {
    const lista = Object.entries(problemas)
    expect(lista.length).toBe(42)
    for (const [nome, texto] of lista) {
      expect(diferencaDeProblemas(texto, texto), nome).toBe('')
      const cs = comandos(texto)
      const asserts = cs.filter((c) => c.startsWith('(assert '))
      const outros = cs.filter((c) => !c.startsWith('(assert '))
      const checkSat = outros.filter((c) => c === '(check-sat)')
      const semCheck = outros.filter((c) => c !== '(check-sat)')
      // as asserções em ordem inversa e as declarações também (as sortes e o set-logic ficam na frente)
      const declaracoes = semCheck.filter((c) => c.startsWith('(declare-fun') || c.startsWith('(declare-const'))
      const cabeca = semCheck.filter((c) => !declaracoes.includes(c))
      expect(diferencaDeProblemas(texto, juntar([...cabeca, ...[...declaracoes].reverse(), ...[...asserts].reverse(), ...checkSat])), nome).toBe('')
      expect(diferencaDeProblemas(texto, texto.replaceAll('|', '')), nome).toBe('')
      // cada asserção dentro de um let que não muda nada
      const comLet = asserts.map((a) => `(assert (let ((sobra!0 true)) ${a.slice('(assert '.length, -1)}))`)
      expect(diferencaDeProblemas(texto, juntar([...cabeca, ...declaracoes, ...comLet, ...checkSat])), nome).toBe('')
    }
  })

  it('vê nos 42 problemas uma asserção a menos, uma repetida e uma negada', () => {
    for (const [nome, texto] of Object.entries(problemas)) {
      const cs = comandos(texto)
      const i = cs.findIndex((c) => c.startsWith('(assert '))
      const sem = [...cs.slice(0, i), ...cs.slice(i + 1)]
      const repetida = [...cs.slice(0, i + 1), cs[i], ...cs.slice(i + 1)]
      const negada = [...cs.slice(0, i), `(assert (not ${cs[i].slice('(assert '.length, -1)}))`, ...cs.slice(i + 1)]
      expect(diferencaDeProblemas(texto, juntar(sem)), nome).not.toBe('')
      expect(diferencaDeProblemas(texto, juntar(repetida)), nome).not.toBe('')
      expect(diferencaDeProblemas(texto, juntar(negada)), nome).not.toBe('')
    }
  })

  it('compara os símbolos pelo nome-base e pela assinatura, e os números pelo valor', () => {
    const p = (nome: string, valor: string) => `(set-logic ALL)\n(declare-fun |${nome}| () Real)\n(assert (> |${nome}| ${valor}))\n(check-sat)\n`
    expect(diferencaDeProblemas(p('n:n', '2'), p('c:n', '2'))).toBe('')
    expect(diferencaDeProblemas(p('n:n', '2'), p('n:n', '(/ 4 2)'))).toBe('')
    expect(diferencaDeProblemas(p('n:n', '(- 2)'), p('n:n', '(- 2.0)'))).toBe('')
    expect(diferencaDeProblemas(p('n:n', '2'), p('n:m', '2'))).not.toBe('')
    expect(diferencaDeProblemas(p('n:n', '2'), p('n:n', '3'))).not.toBe('')
    // and e or aninhados se achatam, sem mudar a ordem
    const q = (corpo: string) => `(set-logic ALL)\n(declare-fun |p:A/0| () Bool)\n(declare-fun |p:B/0| () Bool)\n(declare-fun |p:C/0| () Bool)\n(assert ${corpo})\n`
    expect(diferencaDeProblemas(q('(and |p:A/0| (and |p:B/0| |p:C/0|))'), q('(and |p:A/0| |p:B/0| |p:C/0|)'))).toBe('')
    expect(diferencaDeProblemas(q('(and |p:A/0| |p:B/0|)'), q('(or |p:A/0| |p:B/0|)'))).not.toBe('')
  })

  it('lê os comentários, as barras e os números como o verificador público', () => {
    expect(lerSmt('; nada\n(assert |c:a b|) 2.50')).toEqual([[{ s: 'assert' }, { s: 'c:a b' }], { q: { n: 5n, d: 2n } }])
    expect(() => lerSmt('(assert true')).toThrow(/parênteses sem par/)
    expect(() => lerSmt('(assert |c:a)')).toThrow(/barra sem fim/)
  })
})
