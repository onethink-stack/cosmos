import { describe, expect, it } from 'vitest'
import { CODATA, constantesComoFatos } from '../src/dados/codata'
import { notasDaTeoria, TEORIAS } from '../src/dados/teorias'
import { importarTptp, lerTptp } from '../src/dados/tptp'
import { lerTar } from '../src/dados/arquivos'
import type { EntradaDicionario } from '../src/dados/tipos'
import { validar } from '../src/logica/validador'
import { OPCOES_PADRAO, perguntar } from '../src/motor/motor'

const comId = (es: EntradaDicionario[]) => es.map((e) => ({ ...e, id: e.simbolo }))

describe('biblioteca de teorias', () => {
  for (const t of TEORIAS)
    it(`${t.nome}: fórmulas válidas e teoremas conferidos`, () => {
      const { fichas, notas } = notasDaTeoria(t, [])
      const dic = comId(fichas)
      for (const n of notas)
        for (const f of n.formulas) {
          const v = validar(f, dic)
          expect(v.ok, `${n.titulo}: ${f}`).toBe(true)
          // E14: "∃x (…) ⟹ P" — o quantificador pegaria o resto da fórmula
          expect(v.diags.map((d) => d.codigo), `${n.titulo}: ${f}`).not.toContain('E14')
        }
      const grupos = notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
      for (const n of notas.filter((x) => x.compartimento === 'teorema')) {
        // o grupo não comutativo menor tem 6 elementos
        const r = perguntar(grupos, n.formulas[0], dic, { ...OPCOES_PADRAO, N: /6 elementos/.test(n.titulo) ? 6 : 4 })
        // os de título com "(não)" ou "não há" são exemplos de teses que não seguem
        const esperado = /\(não|Não há/.test(n.titulo) ? 'nao-segue' : 'segue'
        expect(r.tipo, `${t.nome} — ${n.titulo}`).toBe(esperado)
      }
      // grupos com 6 elementos: ~2,5 s sozinho; com a suíte inteira, passava dos 5 s padrão
    }, 30_000)

  it('um símbolo já usado com outro sentido ganha sufixo, e variáveis não colidem com constantes', () => {
    const dic: EntradaDicionario[] = [
      { id: 'p', simbolo: 'ParteDe', termo: 'outra', tipo: 'predicado', aridade: 1, definicao: '' },
      { id: 'x', simbolo: 'x', termo: 'xis', tipo: 'constante', aridade: 0, definicao: '' },
    ]
    const { fichas, notas } = notasDaTeoria(TEORIAS[0], dic)
    expect(fichas.map((f) => f.simbolo)).toContain('ParteDe2')
    const todos = [...dic, ...comId(fichas)]
    for (const n of notas) for (const f of n.formulas) expect(validar(f, todos).ok, f).toBe(true)
    expect(notas[0].formulas[0]).toBe('∀x1 ParteDe2(x1, x1)')
  })
})

describe('TPTP', () => {
  const ARQUIVO = `% teste
fof(transitiva, axiom, ![X,Y,Z]: ((less_than(X,Y) & less_than(Y,Z)) => less_than(X,Z))).
fof(irreflexiva, axiom, ![X]: ~ less_than(X,X)).
fof(assimetrica, conjecture, ![X,Y]: (less_than(X,Y) => ~less_than(Y,X))).
cnf(c1, axiom, f(X) != a | p(X)).
include('Axioms/SET001-0.ax').
tff(t, type, n: $int).`

  it('lê FOF e CNF e avisa o que não lê', () => {
    const { formulas, avisos } = lerTptp(ARQUIVO)
    expect(formulas.map((f) => f.nome)).toEqual(['transitiva', 'irreflexiva', 'assimetrica', 'c1'])
    expect(avisos.some((a) => a.includes('include'))).toBe(true)
    expect(avisos.some((a) => a.includes('tff'))).toBe(true)
  })

  it('traduz para a linguagem do caderno e o motor confere a conjectura', () => {
    const r = importarTptp(ARQUIVO, 'teste.p', 'tptp', [])
    const leis = r.notas.filter((n) => n.compartimento === 'lei')
    const conj = r.notas.find((n) => n.compartimento === 'teorema')!
    expect(conj.formulas[0]).toBe('∀x ∀y ((lessThan(x, y) ⟹ ¬(lessThan(y, x))))')
    expect(r.notas.find((n) => n.titulo.startsWith('c1'))!.formulas[0]).toBe('∀x ((f(x) ≠ a ∨ p(x)))')
    const dic = comId(r.fichas)
    const res = perguntar(
      leis.map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas })),
      conj.formulas[0],
      dic,
      { ...OPCOES_PADRAO, N: 4 },
    )
    expect(res.tipo).toBe('segue')
  })

  it('a conjectura negada do CNF volta como teorema, e o motor confere', () => {
    // problema em CNF: a ordem é transitiva e irreflexiva; a conjectura (negada) diz que há um par simétrico
    const cnf = `cnf(t, axiom, ~r(X,Y) | ~r(Y,Z) | r(X,Z)).
cnf(i, axiom, ~r(X,X)).
cnf(n1, negated_conjecture, r(a,b)).
cnf(n2, negated_conjecture, r(b,a)).`
    const r = importarTptp(cnf, 'cnf.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    const conj = r.notas.find((n) => n.compartimento === 'teorema')!
    expect(conj.titulo).toBe('conjectura (conjecture)')
    expect(conj.formulas[0]).toBe('¬((r(a, b) ∧ r(b, a)))')
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    expect(perguntar(leis, conj.formulas[0], comId(r.fichas), { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('segue')
  })

  it('proposições (sem argumentos) viram p(mundo), e a conclusão continua a mesma', () => {
    const r = importarTptp('fof(a, axiom, p => q).\nfof(b, axiom, p | r).\nfof(c, axiom, ~r).\nfof(d, conjecture, q).', 'prop.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    expect(r.notas[0].formulas[0]).toBe('(p(mundo) ⟹ q(mundo))')
    expect(r.fichas.find((f) => f.simbolo === 'mundo')?.tipo).toBe('constante')
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    const conj = r.notas.find((n) => n.compartimento === 'teorema')!
    expect(perguntar(leis, conj.formulas[0], comId(r.fichas), { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('segue')
    // sem o ~r, não segue
    expect(perguntar(leis.slice(0, 2), conj.formulas[0], comId(r.fichas), { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('nao-segue')
  })

  it('quantificador ao lado de um conectivo ganha parênteses (o escopo não engole o resto)', () => {
    // "(? [X] : p(X)) => r(c)": se existe algum p, então r(c) — e não "existe x tal que p(x) ⟹ r(c)"
    const r = importarTptp(['fof(a, axiom, (? [X] : p(X)) => r(c)).', 'fof(b, axiom, p(d)).', 'fof(c, conjecture, r(c)).'].join('\n'), 'escopo.p', 'tptp', [])
    expect(r.notas[0].formulas[0]).toBe('((∃x (p(x))) ⟹ r(c))')
    const dic = comId(r.fichas)
    for (const n of r.notas) expect(validar(n.formulas[0], dic).diags.map((d) => d.codigo)).not.toContain('E14')
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    expect(perguntar(leis, 'r(c)', dic, { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('segue')
  })

  it('variáveis não viram constantes do dicionário', () => {
    const dic: EntradaDicionario[] = [{ id: 'x', simbolo: 'x', termo: 'x', tipo: 'constante', aridade: 0, definicao: '' }]
    const r = importarTptp('fof(a, axiom, ![X]: p(X)).', 't.p', 'tptp', dic)
    expect(r.notas[0].formulas[0]).toBe('∀x1 (p(x1))')
  })
})

describe('constantes físicas', () => {
  it('viram fatos válidos com o valor inteiro', () => {
    const { fichas, fatos } = constantesComoFatos(CODATA, [])
    const dic = comId(fichas)
    for (const f of fatos) expect(validar(f.formulas[0], dic).ok, f.formulas[0]).toBe(true)
    expect(fatos.find((f) => f.formulas[0].startsWith('cLuz'))!.formulas[0]).toBe('cLuz = 299792458')
    expect(fatos.find((f) => f.formulas[0].startsWith('gNewton'))!.formulas[0]).toBe('gNewton = 0.000000000066743')
    expect(fatos.find((f) => f.formulas[0].startsWith('nAvogadro'))!.formulas[0]).toBe('nAvogadro = 602214076000000000000000')
  })
})

describe('arquivos compactados do TPTP', () => {
  /** um .tar mínimo (ustar) com os arquivos dados */
  const tar = (arqs: { nome: string; texto: string }[]) => {
    const enc = new TextEncoder()
    const blocos: Uint8Array[] = []
    for (const a of arqs) {
      const dados = enc.encode(a.texto)
      const h = new Uint8Array(512)
      h.set(enc.encode(a.nome), 0)
      h.set(enc.encode(dados.length.toString(8).padStart(11, '0')), 124)
      h[156] = 48 // '0': arquivo comum
      h.set(enc.encode('ustar'), 257)
      blocos.push(h, dados, new Uint8Array((512 - (dados.length % 512)) % 512))
    }
    blocos.push(new Uint8Array(1024))
    const total = new Uint8Array(blocos.reduce((s, b) => s + b.length, 0))
    let i = 0
    for (const b of blocos) {
      total.set(b, i)
      i += b.length
    }
    return total
  }

  it('lê os arquivos de dentro de um .tar', () => {
    const r = lerTar(tar([{ nome: 'TPTPWorld/TPTP/Axioms/ABC001+0.ax', texto: 'fof(a, axiom, p(c)).' }, { nome: 'B.p', texto: 'x'.repeat(700) }]))
    expect(r.map((x) => x.nome)).toEqual(['ABC001+0.ax', 'B.p'])
    expect(r[0].texto).toBe('fof(a, axiom, p(c)).')
    expect(r[1].texto.length).toBe(700)
  })

  it('o include de um arquivo aberto junto não gera aviso', () => {
    const texto = "% === arquivo: P.p ===\ninclude('Axioms/ABC001+0.ax').\nfof(c, conjecture, p(c)).\n% === arquivo: ABC001+0.ax ===\nfof(a, axiom, p(c))."
    const { formulas, avisos } = lerTptp(texto)
    expect(formulas.map((f) => f.nome)).toEqual(['c', 'a'])
    expect(avisos).toEqual([])
  })
})
