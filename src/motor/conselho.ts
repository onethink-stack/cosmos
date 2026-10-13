// O que o conselheiro sabe fazer sem guardar nada (roda também nos workers e
// no motor de fundo): julgar uma fórmula em cenários já conhecidos e sugerir
// as notas que vão primeiro ao Z3. Ele só muda a ORDEM e o RECORTE do que o
// juiz confere — nunca o veredito:
// - um cenário em que TODAS as notas valem e a fórmula é falsa é um cenário
//   real: a fórmula não segue (isso é juiz, não palpite). O cenário só é
//   usado depois de conferido contra as notas de agora.
// - as notas sugeridas vão ao Z3 sozinhas: sem modelo com menos notas = sem
//   modelo com todas; com modelo não vale nada (pode ser falta de nota).

import type { Formula, Termo } from '../logica/ast'
import { Avaliador } from './avaliar'
import type { Modelo } from './motor'

/** O que o app manda para a reação em cadeia, por conjunto (o que o conselheiro aprendeu). */
export interface ConselhoCadeia {
  /** cenários guardados (conferidos contra as notas antes de usar) */
  mundos: Modelo[]
  /** provas anteriores: os nomes da fórmula provada e as notas que a prova usou */
  provas: ProvaConhecida[]
}

export interface ProvaConhecida {
  simbolos: string[]
  notas: string[]
}

/** quantas notas o conselheiro sugere, no máximo, antes das outras */
export const MAX_SUGERIDAS = 24

/** a fórmula só usa o que o cenário interpreta de forma legítima (crenças de agentes que ele tem; ∅ como objeto, se ele tem ∅) */
function cabe(f: Formula, m: Modelo): boolean {
  const agentes = new Set((m.acessos ?? []).map((a) => a.agente))
  const temVazio = m.constantes.some((c) => c.nome === '∅')
  const termoOk = (t: Termo): boolean => {
    switch (t.k) {
      case 'vazio':
        return temVazio
      case 'app':
        return t.args.every(termoOk)
      case 'nome':
        return true
      default:
        // números, ⋂, ⋃ como objeto: o motor finito não lê
        return false
    }
  }
  const ok = (g: Formula): boolean => {
    switch (g.k) {
      case 'pred':
        return g.args.every(termoOk)
      case 'rel':
        return (g.op === '=' || g.op === '∈') && termoOk(g.l) && termoOk(g.r)
      case 'const':
        return true
      case 'not':
      case 'nec':
      case 'pos':
        return ok(g.f)
      case 'crenca':
        return agentes.has(g.agente) && ok(g.f)
      case 'and':
      case 'or':
      case 'imp':
      case 'iff':
        return ok(g.l) && ok(g.r)
      case 'forall':
      case 'exists':
        return !g.dom && ok(g.corpo)
    }
  }
  return ok(f)
}

/** a fórmula (expandida) é verdadeira no cenário? null: o cenário não a interpreta */
export function valeNoMundo(f: Formula, m: Modelo): boolean | null {
  if (!cabe(f, m)) return null
  try {
    return new Avaliador(m).avaliar(f)
  } catch {
    return null
  }
}

/** Os cenários em que todas as fórmulas valem (com prazo: os que não der tempo de conferir ficam de fora). */
export function cenariosValidos(modelos: Modelo[], formulas: Formula[], ate = Infinity): Modelo[] {
  const r: Modelo[] = []
  for (const m of modelos) {
    if (Date.now() > ate) break
    if (formulas.every((f) => valeNoMundo(f, m) === true)) r.push(m)
  }
  return r
}

/**
 * A fórmula nos cenários em que as notas valem: `falha`, um em que ela é
 * falsa (não segue); `vale`, se há um em que ela é verdadeira.
 */
export function julgarNosMundos(modelos: Modelo[], phi: Formula): { falha: Modelo | null; vale: boolean } {
  let falha: Modelo | null = null
  let vale = false
  for (const m of modelos) {
    const v = valeNoMundo(phi, m)
    if (v === false) falha ??= m
    if (v === true) vale = true
    if (falha && vale) break
  }
  return { falha, vale }
}

/** quantas vezes a mais que o nome mais raro de uma nota um nome dela pode aparecer e ainda puxá-la (SInE) */
export const TOLERANCIA_SINE = 1.5
/** quantas camadas a seleção pelos nomes avança a partir da pergunta */
export const PROFUNDIDADE_SINE = 3

/**
 * Escolhe as leis pela pergunta (SInE, de Hoder e Voronkov, usado pelo Vampire
 * e pelo E nos problemas com milhares de axiomas): uma nota é puxada por um
 * nome só se ele está entre os mais raros dela (aparece em no máximo
 * `tolerancia` vezes mais notas que o nome mais raro dela) — um nome que está
 * em quase tudo não puxa tudo. Começa pelos nomes da pergunta; cada nota
 * puxada traz os nomes dela para a camada seguinte. Devolve a camada (1, 2, …)
 * de cada nota puxada.
 */
export function selecaoSine(
  disponiveis: { id: string; simbolos: string[] }[],
  alvo: string[],
  tolerancia = TOLERANCIA_SINE,
  profundidade = PROFUNDIDADE_SINE,
): Map<string, number> {
  const ocorre = new Map<string, number>()
  for (const d of disponiveis) for (const s of new Set(d.simbolos)) ocorre.set(s, (ocorre.get(s) ?? 0) + 1)
  // de cada nome, as notas que ele puxa
  const puxa = new Map<string, string[]>()
  for (const d of disponiveis) {
    const raros = [...new Set(d.simbolos)]
    if (!raros.length) continue
    const minimo = Math.min(...raros.map((s) => ocorre.get(s)!))
    for (const s of raros) if (ocorre.get(s)! <= tolerancia * minimo) puxa.set(s, [...(puxa.get(s) ?? []), d.id])
  }
  const simbolosDe = new Map(disponiveis.map((d) => [d.id, d.simbolos]))
  const camada = new Map<string, number>()
  const vistos = new Set(alvo)
  let frente = [...vistos]
  for (let k = 1; k <= profundidade && frente.length; k++) {
    const proxima: string[] = []
    for (const s of frente)
      for (const id of puxa.get(s) ?? []) {
        if (camada.has(id)) continue
        camada.set(id, k)
        for (const t of simbolosDe.get(id) ?? [])
          if (!vistos.has(t)) {
            vistos.add(t)
            proxima.push(t)
          }
      }
    frente = proxima
  }
  return camada
}

/**
 * As notas que vão primeiro ao Z3, da mais promissora para a menos: as que
 * provaram perguntas parecidas (pontos pela semelhança dos nomes) e as que a
 * seleção pelos nomes raros (SInE) puxa a partir da pergunta — as das
 * primeiras camadas antes. Vazio: nada a sugerir.
 */
export function sugerirNotas(provas: ProvaConhecida[], simbolos: string[], disponiveis: { id: string; simbolos: string[] }[], max = MAX_SUGERIDAS): string[] {
  const alvo = new Set(simbolos)
  const existe = new Set(disponiveis.map((d) => d.id))
  const pontos = new Map<string, number>()
  for (const p of provas) {
    let comum = 0
    for (const s of p.simbolos) if (alvo.has(s)) comum++
    if (!comum) continue
    const semelhanca = comum / (alvo.size + p.simbolos.length - comum)
    for (const n of p.notas) if (existe.has(n)) pontos.set(n, (pontos.get(n) ?? 0) + 1 + semelhanca)
  }
  // as que a seleção pelos nomes raros puxa (valem menos que as que já provaram algo parecido)
  for (const [id, k] of selecaoSine(disponiveis, simbolos)) pontos.set(id, (pontos.get(id) ?? 0) + 0.9 / k)
  return [...pontos]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => id)
}
