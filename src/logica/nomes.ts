import type { EntradaDicionario, TipoSimbolo } from '../dados/tipos'
import { nomeParecido } from './distancia'
import { usosDeNomes } from './termos'
import { validar } from './validador'

export { usosDeNomes, type UsoNome } from './termos'

/** Troca as ocorrências livres do nome `de` por `para` (variáveis ligadas não mudam). */
export function renomear(texto: string, de: string, para: string, dicionario: EntradaDicionario[] = []): string {
  const { ast } = validar(texto, dicionario)
  if (!ast) return texto
  const spans = usosDeNomes(ast)
    .filter((u) => u.nome === de)
    .sort((a, b) => b.pos - a.pos)
  let r = texto
  for (const s of spans) r = r.slice(0, s.pos) + para + r.slice(s.end)
  return r
}

export interface PropostaFicha {
  simbolo: string
  tipo: TipoSimbolo
  aridade: number
  /** usos incompatíveis entre as fórmulas (ex.: constante numa, função noutra) */
  conflito: string | null
  /** ids das notas onde aparece */
  notas: string[]
  /** nome do dicionário a até 2 letras de distância */
  parecidoCom: string | null
}

const desc = (tipo: TipoSimbolo, aridade: number) =>
  tipo === 'constante' ? 'constante' : `${tipo === 'funcao' ? 'função' : 'predicado'}/${aridade}`

/** Lista os nomes sem ficha no dicionário, deduzindo tipo e aridade pelo uso. */
export function deduzirFichas(formulas: { texto: string; notaId: string }[], dicionario: EntradaDicionario[]): PropostaFicha[] {
  const declarados = new Set(dicionario.map((e) => e.simbolo))
  const props = new Map<string, PropostaFicha & { usos: Set<string> }>()
  for (const { texto, notaId } of formulas) {
    const { ast } = validar(texto, dicionario)
    if (!ast) continue
    for (const u of usosDeNomes(ast)) {
      if (declarados.has(u.nome)) continue
      let p = props.get(u.nome)
      if (!p) {
        p = { simbolo: u.nome, tipo: u.tipo, aridade: u.aridade, conflito: null, notas: [], parecidoCom: null, usos: new Set() }
        props.set(u.nome, p)
      }
      p.usos.add(desc(u.tipo, u.aridade))
      if (!p.notas.includes(notaId)) p.notas.push(notaId)
    }
  }
  return [...props.values()]
    .map(({ usos, ...p }) => ({
      ...p,
      conflito: usos.size > 1 ? `usado como ${[...usos].join(' e como ')}` : null,
      parecidoCom: nomeParecido(p.simbolo, declarados),
    }))
    .sort((a, b) => a.simbolo.localeCompare(b.simbolo))
}
