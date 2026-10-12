// Correções de notas que vieram das bibliotecas com um defeito já corrigido,
// feitas ao abrir o app (só mexe no que precisa; as notas do usuário ficam).

import { forma } from './deduzida'
import { estado } from './estado'
import { semMarcaDesativada } from './lacunas'
import type { Nota } from './tipos'

const QUANTIFICADORES = /(?:[∀∃]\s*[\p{L}][\p{L}\p{N}_]*(?:\s*∈\s*[\p{L}\p{N}_]+)?\s*)+\(/gu

/**
 * Na linguagem do caderno o escopo de um quantificador vai até o fim:
 * "∃x (A) ⟹ B" é "∃x (A ⟹ B)". O tradutor do TPTP e duas fórmulas da
 * biblioteca de teorias escreviam assim querendo dizer "(∃x (A)) ⟹ B" — o
 * grupo do quantificador seguido de um conectivo ganha os parênteses que
 * faltavam (é o aviso E14 do validador).
 */
export function parentesesNoEscopo(f: string): string {
  for (let guarda = 0; guarda < 200; guarda++) {
    let mudou = false
    QUANTIFICADORES.lastIndex = 0
    for (let m = QUANTIFICADORES.exec(f); m; m = QUANTIFICADORES.exec(f)) {
      // o parêntese que fecha o grupo do quantificador
      let fim = -1
      for (let j = m.index + m[0].length - 1, d = 0; j < f.length; j++) {
        if (f[j] === '(') d++
        else if (f[j] === ')' && --d === 0) {
          fim = j
          break
        }
      }
      if (fim < 0) break
      if (/^\s*[⟹∧∨⟺]/.test(f.slice(fim + 1))) {
        f = `${f.slice(0, m.index)}(${f.slice(m.index, fim + 1)})${f.slice(fim + 1)}`
        mudou = true
        break
      }
      // o próximo quantificador pode começar dentro deste grupo
      QUANTIFICADORES.lastIndex = m.index + 1
    }
    if (!mudou) return f
  }
  return f
}

/** As notas das bibliotecas (TPTP e teorias embutidas) com o defeito de escopo: conserta e grava. */
export async function corrigirNotasDasBibliotecas(): Promise<number> {
  let corrigidas = 0
  for (const n of estado.notas) {
    if (!n.tags.some((t) => t === 'tptp' || t === 'teoria')) continue
    const formulas = n.formulas.map(parentesesNoEscopo)
    if (formulas.every((f, i) => f === n.formulas[i])) continue
    await estado.salvarNota({ ...n, formulas })
    corrigidas++
  }
  return corrigidas
}

/** marcas das notas que o próprio app criou (as escritas pelo usuário nunca são mexidas aqui) */
const FEITAS_PELO_APP = ['deduzida', 'sugerida', 'gerado', 'segundo-modelo']
const feitaPeloApp = (n: Nota) => n.tags.some((t) => FEITAS_PELO_APP.includes(t))

export interface CorrecaoConclusoes {
  /** deduzidas (conferidas só até N objetos) que eram leis e viraram teoremas */
  viraramTeorema: number
  /** cópias iguais apagadas */
  copiasApagadas: number
  /** leis gerais que diziam o mesmo que uma conclusão ou crença de uma visão: desativadas */
  vindasDeVisao: number
  /** títulos "(… — desativada)" de notas ativas, consertados */
  titulos: number
}

/**
 * Conserta o que versões anteriores deixaram no caderno, só nas notas que o
 * app criou:
 *  - a deduzida que virou lei tendo sido conferida só em cenários até N
 *    objetos vira teorema (uma lei assim contaminava tudo o que vinha dela);
 *  - cópias iguais (cada rodada salvava de novo) saem, fica a mais antiga;
 *  - a lei geral que diz o mesmo que uma conclusão ou crença de uma visão é
 *    desativada (uma conclusão de Spinoza não é lei geral): o motivo fica na
 *    nota, e ela pode ser ativada de novo;
 *  - "(… — desativada)" sai do título de uma nota que está ativa.
 */
export async function corrigirConclusoes(): Promise<CorrecaoConclusoes> {
  const r: CorrecaoConclusoes = { viraramTeorema: 0, copiasApagadas: 0, vindasDeVisao: 0, titulos: 0 }
  const hoje = new Date().toLocaleDateString('pt-BR')
  const linha = (texto: string, nova: string) => [texto.trim(), `— ${nova} —`].filter(Boolean).join('\n\n')

  // 1. deduzida conferida só até N, que estava como lei (ou crença), vira teorema
  for (const n of estado.notas) {
    if (!n.tags.includes('deduzida') || (n.compartimento !== 'lei' && n.compartimento !== 'visao') || n.texto.includes('Provada para qualquer número')) continue
    await estado.salvarNota({
      ...n,
      compartimento: 'teorema',
      texto: linha(n.texto, `Passou a teorema em ${hoje}: foi conferida só em cenários finitos; como teorema, é conferida a cada rodada em vez de servir de premissa`),
    })
    r.viraramTeorema++
  }

  // 2. cópias iguais (mesmo compartimento, mesmo titular, mesmas fórmulas): fica a mais antiga
  const grupos = new Map<string, Nota[]>()
  for (const n of estado.notas) {
    if (!feitaPeloApp(n)) continue
    const fs = n.formulas.filter((f) => f.trim())
    if (!fs.length) continue
    const k = [n.compartimento, n.titular.trim(), ...fs.map(forma).sort()].join('|')
    grupos.set(k, [...(grupos.get(k) ?? []), n])
  }
  for (const iguais of grupos.values()) {
    if (iguais.length < 2) continue
    const [fica, ...saem] = [...iguais].sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))
    for (const n of saem) await estado.apagarNota(n.id)
    const atual = estado.nota(fica.id)
    if (atual) await estado.salvarNota({ ...atual, texto: linha(atual.texto, `${saem.length} cópia${saem.length > 1 ? 's iguais foram apagadas' : ' igual foi apagada'} em ${hoje}`) })
    r.copiasApagadas += saem.length
  }

  // 3. lei geral que diz o mesmo que uma conclusão ou crença de uma visão
  const daVisao = new Map<string, Nota>()
  for (const n of estado.notas)
    if (n.titular.trim() && (n.compartimento === 'visao' || n.compartimento === 'teorema')) for (const f of n.formulas.filter((x) => x.trim())) daVisao.set(forma(f), n)
  for (const n of estado.notas) {
    if (!feitaPeloApp(n) || !n.ativa || (n.compartimento !== 'lei' && n.compartimento !== 'fato')) continue
    const origem = n.formulas.filter((f) => f.trim()).map((f) => daVisao.get(forma(f))).find((x) => !!x)
    if (!origem) continue
    await estado.salvarNota({
      ...n,
      ativa: false,
      texto: linha(
        n.texto,
        `Desativada em ${hoje}: diz o mesmo que “${origem.titulo || 'Sem título'}”, da visão de ${origem.titular.trim()} — uma conclusão de uma visão não é lei geral. Se for mesmo uma lei geral, ative de novo`,
      ),
    })
    r.vindasDeVisao++
  }

  // 4. título "(… — desativada)" numa nota ativa
  for (const n of estado.notas) {
    if (!n.ativa) continue
    const titulo = semMarcaDesativada(n.titulo)
    if (titulo === n.titulo) continue
    await estado.salvarNota({ ...n, titulo })
    r.titulos++
  }
  return r
}
