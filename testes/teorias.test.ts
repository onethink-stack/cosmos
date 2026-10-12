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
tff(t, axiom, $floor(n) = n).`

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

  it('"X != X" do TPTP vira ¬(x = x), que o validador aceita', () => {
    const r = importarTptp('fof(a, axiom, ![X]: (X != X | p(X))).\nfof(c, conjecture, p(k)).', 'e9.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    expect(r.notas[0].formulas[0]).toBe('∀x ((¬(x = x) ∨ p(x)))')
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    expect(perguntar(leis, 'p(k)', comId(r.fichas), { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('segue')
  })
})

describe('TPTP com tipos (TFF)', () => {
  const pergunta = (texto: string, N = 4) => {
    const r = importarTptp(texto, 'tff.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    const conj = r.notas.find((n) => n.compartimento === 'teorema')!
    return { r, res: perguntar(leis, conj.formulas[0], comId(r.fichas), { ...OPCOES_PADRAO, N }).tipo }
  }
  const DOIS_TIPOS = `tff(a_type, type, a: $tType).
tff(b_type, type, b: $tType).
tff(c_type, type, c: a).
tff(d_type, type, d: b).
tff(um_so, axiom, ![X: a, Y: a]: X = Y).`

  it('cada tipo é um predicado: "o tipo a tem um elemento só" não diz nada sobre o tipo b', () => {
    // apagando os tipos, "∀x ∀y x = y" valeria para tudo, e o b também ficaria com um só
    const { r, res } = pergunta(`${DOIS_TIPOS}\ntff(conj, conjecture, ![X: b, Y: b]: X = Y).`)
    expect(res).toBe('nao-segue')
    expect(r.notas.find((n) => n.titulo === 'um_so (axiom)')!.formulas[0]).toBe('∀x ∀y ((tipoA(x) ∧ tipoA(y)) ⟹ (x = y))')
    expect(r.fichas.find((f) => f.simbolo === 'tipoB')).toMatchObject({ tipo: 'predicado', aridade: 1, termo: 'tipo b' })
    const outra = pergunta(`${DOIS_TIPOS}\ntff(conj, conjecture, ![X: a]: X = c).`)
    expect(outra.res).toBe('segue')
    // a constante usada ganha a lei do seu tipo (as que não aparecem, não)
    expect(outra.r.notas.find((n) => n.titulo === 'c_type (type)')!.formulas[0]).toBe('tipoA(c)')
    expect(outra.r.notas.some((n) => n.titulo === 'd_type (type)')).toBe(false)
  })

  it('as funções devolvem o seu tipo, e nenhum tipo é vazio', () => {
    const base = `tff(a_type, type, a: $tType).
tff(b_type, type, b: $tType).
tff(f_type, type, f: a > b).
tff(g_type, type, g: (a * a) > b).
tff(q_type, type, q: b > $o).
tff(todo_b, axiom, ![Y: b]: q(Y)).`
    // f(x) é do tipo b para todo x do tipo a: sem essa lei, q(f(x)) não seguiria
    const { r, res } = pergunta(`${base}\ntff(conj, conjecture, ![X: a]: q(f(X))).`)
    expect(res).toBe('segue')
    expect(r.notas.find((n) => n.titulo === 'f_type (type)')!.formulas[0]).toBe('∀x1 (tipoA(x1) ⟹ (tipoB(f(x1))))')
    // o tipo a não tem constante: entra "existe algo do tipo a"
    expect(r.notas.find((n) => n.titulo === 'a_type (type)')!.formulas[0]).toBe('∃x (tipoA(x))')
    const outra = pergunta(`${base}\ntff(conj, conjecture, ?[X: a, Y: a]: q(g(X, Y))).`)
    expect(outra.res).toBe('segue')
    expect(outra.r.notas.find((n) => n.titulo === 'g_type (type)')!.formulas[0]).toBe('∀x1 ∀x2 ((tipoA(x1) ∧ tipoA(x2)) ⟹ (tipoB(g(x1, x2))))')
  })

  it('tipo com nome entre aspas é o mesmo tipo onde aparecer', () => {
    const { r, res } = pergunta(`tff('$ki_world_type', type, '$ki_world': $tType).
tff(local, type, '$ki_local_world': '$ki_world').
tff(acc, type, '$ki_accessible': ('$ki_world' * '$ki_world') > $o).
tff(serial, axiom, ![W: '$ki_world']: ?[V: '$ki_world']: '$ki_accessible'(W, V)).
tff(conj, conjecture, ?[V: '$ki_world']: '$ki_accessible'('$ki_local_world', V)).
fof(outro, axiom, ![X]: p(X)).`)
    expect(res).toBe('segue')
    // dois tipos ($ki_world e o $i do fof): dois predicados, não três
    expect(r.fichas.filter((f) => f.simbolo.startsWith('tipo')).map((f) => f.simbolo).sort()).toEqual(['tipoI', 'tipoKiWorld'])
  })

  it('com um tipo só, fica como em FOF (sem predicados de tipo)', () => {
    const { r, res } = pergunta(`tff(a_type, type, a: $tType).
tff(c_type, type, c: a).
tff(p_type, type, p: a > $o).
tff(ax, axiom, ![X: a]: p(X)).
tff(conj, conjecture, p(c)).`)
    expect(res).toBe('segue')
    expect(r.notas.map((n) => n.formulas[0])).toEqual(['∀x (p(x))', 'p(c)'])
    expect(r.fichas.some((f) => f.simbolo.startsWith('tipo'))).toBe(false)
  })

  it('não lê divisão inteira nem if/let: avisa', () => {
    const { formulas, avisos } = lerTptp(`tff(n, axiom, $floor(n) = n).
tff(i, axiom, $ite(p, a, b) = a).
tff(ok, axiom, p(c)).`)
    expect(formulas.map((f) => f.nome)).toEqual(['ok'])
    expect(avisos.join('\n')).toMatch(/divisão inteira[^]*if\/let/)
  })

  it('o mesmo nome com aridades diferentes vira dois símbolos (color e color2)', () => {
    const r = importarTptp('fof(a, axiom, color(x) => color(x, y)).\nfof(b, axiom, color(z)).\nfof(c, conjecture, color(z, y)).', 'sob.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    expect(r.notas[0].formulas[0]).toBe('(color(x) ⟹ color2(x, y))')
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    expect(perguntar(leis, r.notas[2].formulas[0], comId(r.fichas), { ...OPCOES_PADRAO, N: 3 }).tipo).toBe('nao-segue')
  })
})

describe('TPTP com tipos polimórficos (TF1)', () => {
  const LISTAS = `tff(list_t, type, list: $tType > $tType).
tff(nil_t, type, nil: !>[A: $tType]: list(A)).
tff(cons_t, type, cons: !>[A: $tType]: (A * list(A)) > list(A)).
tff(hd_t, type, hd: !>[A: $tType]: list(A) > A).
tff(hd_ax, axiom, ![A: $tType, X: A, L: list(A)]: hd(A, cons(A, X, L)) = X).
tff(a_t, type, a: $i).`
  const pergunta = (conj: string) => {
    const r = importarTptp(`${LISTAS}\n${conj}`, 'tf1.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    const dic = comId(r.fichas)
    for (const n of r.notas) for (const f of n.formulas) expect(validar(f, dic).ok, f).toBe(true)
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    const t = r.notas.find((n) => n.compartimento === 'teorema')!
    return { r, res: perguntar(leis, t.formulas[0], dic, { ...OPCOES_PADRAO, N: 3 }).tipo }
  }

  it('cada símbolo polimórfico vira um por tipo: hd($i, cons($i, a, nil($i))) = a', () => {
    const { r, res } = pergunta('tff(conj, conjecture, hd($i, cons($i, a, nil($i))) = a).')
    expect(res).toBe('segue')
    expect(r.aproximada).toBe(true)
    expect(r.fichas.map((f) => f.simbolo)).toEqual(expect.arrayContaining(['consI', 'hdI', 'nilI']))
  })

  it('conjectura polimórfica: vale para um tipo novo, sem nada de especial', () => {
    expect(pergunta('tff(conj, conjecture, ![B: $tType, Y: B, M: list(B)]: hd(B, cons(B, Y, M)) = Y).').res).toBe('segue')
    expect(pergunta('tff(conj, conjecture, ![B: $tType, Y: B]: hd(B, nil(B)) = Y).').res).toBe('nao-segue')
  })
})

describe('TPTP de ordem superior (THF)', () => {
  const pergunta = (texto: string, N = 3) => {
    const r = importarTptp(texto, 'thf.p', 'tptp', [])
    expect(r.avisos).toEqual([])
    const dic = comId(r.fichas)
    for (const n of r.notas) for (const f of n.formulas) expect(validar(f, dic).ok, f).toBe(true)
    const leis = r.notas.filter((n) => n.compartimento === 'lei').map((n) => ({ id: n.id, rotulo: n.titulo, formulas: n.formulas }))
    const conj = r.notas.find((n) => n.compartimento === 'teorema')!
    return { r, res: perguntar(leis, conj.formulas[0], dic, { ...OPCOES_PADRAO, N }).tipo }
  }

  it('abre as definições: a igualdade de Leibniz é transitiva (SYO001^1)', () => {
    const { r, res } = pergunta(`thf(leibeq_decl, type, leibeq: $i > $i > $o).
thf(leibeq, definition, (leibeq = (^ [X: $i, Y: $i]: ! [P: $i > $o]: ((P @ X) => (P @ Y))))).
thf(conj, conjecture, ! [X: $i, Y: $i, Z: $i]: (((leibeq @ X @ Y) & (leibeq @ Y @ Z)) => (leibeq @ X @ Z))).`)
    expect(res).toBe('segue')
    // a definição sumiu (foi aberta); o predicado P virou objeto aplicado por ap
    expect(r.notas.some((n) => n.titulo.startsWith('leibeq'))).toBe(false)
    expect(r.notas.find((n) => n.compartimento === 'teorema')!.formulas[0]).toContain('vale(ap')
  })

  it('constante usada como valor e lambda como argumento: entram com a sua definição', () => {
    const base = `thf(p_t, type, p: $i > $o).
thf(a_t, type, a: $i).
thf(b_t, type, b: $i).
thf(q_t, type, q: ($i > $o) > $o).
thf(ax2, axiom, ! [F: $i > $o]: ((q @ F) => (F @ a))).`
    expect(pergunta(`${base}\nthf(ax1, axiom, q @ p).\nthf(c, conjecture, p @ a).`).res).toBe('segue')
    expect(pergunta(`${base}\nthf(ax1, axiom, q @ (^ [X: $i]: (p @ X))).\nthf(c, conjecture, p @ a).`).res).toBe('segue')
    expect(pergunta(`${base}\nthf(ax1, axiom, q @ p).\nthf(c, conjecture, p @ b).`).res).toBe('nao-segue')
  })

  it('fórmula como argumento (valor lógico como objeto): says @ a @ (p @ a)', () => {
    const { res } = pergunta(`thf(p_t, type, p: $i > $o).
thf(a_t, type, a: $i).
thf(says_t, type, says: $i > $o > $o).
thf(ax1, axiom, says @ a @ (p @ a)).
thf(ax2, axiom, ! [X: $i, P: $o]: ((says @ X @ P) => P)).
thf(c, conjecture, p @ a).`)
    expect(res).toBe('segue')
  })

  it('marca a tradução como aproximada (cenário onde falha pode não valer no original)', () => {
    expect(importarTptp('thf(p_t, type, p: $i > $o).\nthf(a, axiom, ! [X: $i]: (p @ X)).', 'x.p', 'tptp', []).aproximada).toBe(true)
    expect(importarTptp('fof(a, axiom, p(a)).', 'x.p', 'tptp', []).aproximada).toBeUndefined()
  })

  it('não lê tipos polimórficos nem escolha: avisa', () => {
    const r = importarTptp('thf(c, axiom, ! [A: $tType, X: A]: (X = X)).\nthf(d, axiom, (@+ [X: $i]: (p @ X)) = a).', 'x.p', 'tptp', [])
    expect(r.avisos.join('\n')).toMatch(/TH1[^]*escolha/)
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
