// Dados do mundo guardados no aparelho (tabelas importadas, bases públicas)
// e o que eles fazem no segundo modelo: as leis que o observado derruba
// saem; as leis que os dados sugerem entram como hipótese (grau M).

import { useEffect, useReducer } from 'preact/hooks'
import { canonica } from '../logica/canonica'
import { induzirCasos, induzirObjetos, type ConjuntoDados } from '../motor/dados'
import { PREFIXO_INDUZIDA, vereditoDosDados } from '../motor/modelo'
import { analisar } from '../motor/motor'
import { gravarConfig, lerConfig } from './db'
import { notasDoModelo } from './modelo'
import type { EntradaDicionario, Nota } from './tipos'

class MundoDados {
  conjuntos: ConjuntoDados[] = []
  carregado = false
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private mudou() {
    this.ouvintes.forEach((f) => f())
  }

  async carregar() {
    try {
      this.conjuntos = (await lerConfig<ConjuntoDados[]>('mundoDados')) ?? []
    } catch {
      /* sem banco */
    }
    this.carregado = true
    this.mudou()
  }

  private async gravar() {
    this.mudou()
    await gravarConfig('mundoDados', this.conjuntos).catch(() => {})
  }

  adicionar(c: ConjuntoDados) {
    this.conjuntos = [...this.conjuntos.filter((x) => x.id !== c.id), c]
    return this.gravar()
  }

  atualizar(c: ConjuntoDados) {
    this.conjuntos = this.conjuntos.map((x) => (x.id === c.id ? c : x))
    return this.gravar()
  }

  /** troca todos os conjuntos (restaurar um backup) */
  substituir(conjuntos: ConjuntoDados[]) {
    this.conjuntos = conjuntos
    return this.gravar()
  }

  remover(id: string) {
    this.conjuntos = this.conjuntos.filter((x) => x.id !== id)
    return this.gravar()
  }
}

export const mundo = new MundoDados()

export function useMundo(): MundoDados {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => mundo.assinar(() => forcar(undefined)), [])
  return mundo
}

/** Os dados que entram no modelo: os das pastas escolhidas (sem pasta escolhida, todos). */
export const dadosDasPastas = (conjuntos: ConjuntoDados[], pastas: string[]) => conjuntos.filter((c) => !pastas.length || pastas.includes(c.pasta))

/** Variáveis para as leis induzidas que não colidem com nomes do dicionário. */
function variaveisLivres(dicionario: EntradaDicionario[]): [string, string, string] {
  const usados = new Set(dicionario.map((e) => e.simbolo))
  const livres = ['x', 'y', 'z', 'u', 'v', 'w', 's', 't'].filter((v) => !usados.has(v))
  for (let i = 1; livres.length < 3; i++) if (!usados.has(`x${i}`)) livres.push(`x${i}`)
  return [livres[0], livres[1], livres[2]]
}

/** leis induzidas por conjunto de dados que entram no modelo (as mais apoiadas) */
export const MAX_INDUZIDAS = 15

/** Leis que os dados de um conjunto sugerem, prontas para entrar como notas (grau M). */
export function leisInduzidas(c: ConjuntoDados, dicionario: EntradaDicionario[], jaExistem: Set<string> = new Set()): Nota[] {
  const agora = c.criadoEm
  const leis = [...induzirObjetos(c, variaveisLivres(dicionario)), ...induzirCasos(c)].sort((a, b) => b.apoio - a.apoio)
  const notas: Nota[] = []
  for (const [k, l] of leis.entries()) {
    if (notas.length >= MAX_INDUZIDAS) break
    const p = analisar([l.formula], dicionario, true)[0]
    if (!p) continue
    const forma = canonica(p.original)
    if (jaExistem.has(forma)) continue
    jaExistem.add(forma)
    notas.push({
      id: `${PREFIXO_INDUZIDA}${c.id}-${k}`,
      titulo: `Induzida: ${l.leitura}`,
      texto:
        `lei induzida dos dados “${c.nome}”: ${l.leitura} — apoiada por ${l.apoio} de ${l.total}, nenhum contraexemplo observado\n\n` +
        `É uma hipótese (grau M): vale em tudo o que foi observado, mas os casos ainda não observados podem derrubá-la.`,
      formulas: [l.formula],
      tags: [c.pasta, 'induzida'],
      criadaEm: agora,
      atualizadaEm: agora,
      ativa: true,
      compartimento: 'lei',
      grau: 'M',
      fonte: c.fonte,
      data: '',
      titular: '',
    })
  }
  return notas
}

export interface EntradaModelo {
  notas: Nota[]
  pastas: string[]
  dados: ConjuntoDados[]
  desativadasPelosDados: Record<string, string>
  /** o que identifica os dados usados (entra na assinatura do modelo) */
  marcaDados: string
}

/**
 * A entrada do segundo modelo: as notas das pastas, com o mundo — leis e
 * fatos que os dados contradizem saem (com o porquê), e as leis induzidas dos
 * dados entram como hipóteses (grau M).
 */
export function entradaDoModelo(notasCaderno: Nota[], pastas: string[], dicionario: EntradaDicionario[], conjuntos: ConjuntoDados[], usarDados = true): EntradaModelo {
  const base = notasDoModelo(notasCaderno, pastas)
  const dados = usarDados ? dadosDasPastas(conjuntos, pastas) : []
  const desativadasPelosDados: Record<string, string> = {}
  if (!dados.length) return { notas: base, pastas, dados, desativadasPelosDados, marcaDados: '' }
  const notas = base.map((n) => {
    if (!n.ativa || (n.compartimento !== 'lei' && n.compartimento !== 'fato')) return n
    const v = vereditoDosDados(
      n.formulas.filter((f) => f.trim()),
      dicionario,
      dados,
    )
    if (v?.tipo !== 'falha') return n
    desativadasPelosDados[n.id] = `${v.texto}: o mundo observado derruba esta ${n.compartimento === 'fato' ? 'afirmação' : 'lei'}`
    return { ...n, ativa: false }
  })
  // as induzidas que já estão escritas (como lei ativa) não entram de novo
  const jaExistem = new Set(
    notas
      .filter((n) => n.ativa && n.compartimento !== 'teorema')
      .flatMap((n) => analisar(n.formulas, dicionario, true).map((f) => canonica(f.original))),
  )
  const induzidas = dados.flatMap((c) => leisInduzidas(c, dicionario, jaExistem))
  const marcaDados = JSON.stringify(dados.map((c) => [c.id, c.linhas.length, c.tolerancia, c.colunas.map((x) => [x.tipo, x.simbolo])]))
  return { notas: [...notas, ...induzidas], pastas, dados, desativadasPelosDados, marcaDados }
}
