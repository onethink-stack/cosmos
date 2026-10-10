import { preparar } from '../dados/premissas'
import { lex } from '../logica/lexer'
import type { EntradaDicionario, Nota } from '../dados/tipos'
import { descobrir, type ResultadoDescoberta } from './descobrir'
import { perguntar, verificar, type Grupo, type OpcoesMotor, type ResultadoMotor, type ResultadoPergunta } from './motor'

/** Um conjunto checado separadamente: o geral (lei + fato) ou uma visão de mundo. */
export interface Tarefa {
  /** "geral" ou "visao:<titular>" */
  chave: string
  rotulo: string
  grupos: Grupo[]
}

export interface PedidoMotor {
  id: number
  tarefas: Tarefa[]
  dicionario: EntradaDicionario[]
  opcoes: OpcoesMotor
  /** se presente, em vez de verificar consistência, pergunta se a fórmula segue da (única) tarefa */
  pergunta?: string
  /** se true, descobre consequências da (única) tarefa */
  descobrir?: boolean
}

export type RespostaMotor =
  | { id: number; tipo: 'progresso'; chave: string; msg: string }
  | { id: number; tipo: 'resultado'; chave: string; resultado: ResultadoMotor; ms: number }
  | { id: number; tipo: 'resposta'; chave: string; resultado: ResultadoPergunta; ms: number }
  | { id: number; tipo: 'descobertas'; chave: string; resultado: ResultadoDescoberta; ms: number }
  | { id: number; tipo: 'erro'; chave: string; msg: string }
  | { id: number; tipo: 'fim' }

export function executarTarefas(p: PedidoMotor, enviar: (r: RespostaMotor) => void) {
  for (const t of p.tarefas) {
    const ini = Date.now()
    const progresso = (msg: string) => enviar({ id: p.id, tipo: 'progresso', chave: t.chave, msg })
    try {
      if (p.descobrir) {
        const resultado = descobrir(t.grupos, p.dicionario, p.opcoes, progresso)
        enviar({ id: p.id, tipo: 'descobertas', chave: t.chave, resultado, ms: Date.now() - ini })
        continue
      }
      if (p.pergunta !== undefined) {
        const resultado = perguntar(t.grupos, p.pergunta, p.dicionario, p.opcoes, progresso)
        enviar({ id: p.id, tipo: 'resposta', chave: t.chave, resultado, ms: Date.now() - ini })
        continue
      }
      const resultado = verificar(t.grupos, p.dicionario, p.opcoes, progresso)
      enviar({ id: p.id, tipo: 'resultado', chave: t.chave, resultado, ms: Date.now() - ini })
    } catch (e) {
      enviar({ id: p.id, tipo: 'erro', chave: t.chave, msg: (e as Error).message })
    }
  }
  enviar({ id: p.id, tipo: 'fim' })
}

/** Monta as tarefas: o conjunto geral (lei + fato) e uma por titular de visão. */
export function montarTarefas(notas: Nota[], dicionario: EntradaDicionario[]): { tarefas: Tarefa[]; pronto: boolean } {
  const p = preparar(notas, dicionario)
  const porNota = (fs: { notaId: string; titulo: string; texto: string }[]) => {
    const m = new Map<string, { id: string; rotulo: string; formulas: string[] }>()
    for (const f of fs) {
      if (!m.has(f.notaId)) m.set(f.notaId, { id: f.notaId, rotulo: f.titulo || 'Sem título', formulas: [] })
      m.get(f.notaId)!.formulas.push(f.texto)
    }
    // notas mais antigas são testadas primeiro na busca do conflito mínimo
    const criada = new Map(notas.map((n) => [n.id, n.criadaEm]))
    return [...m.values()].sort((a, b) => criada.get(a.id)!.localeCompare(criada.get(b.id)!))
  }
  const tarefas: Tarefa[] = [{ chave: 'geral', rotulo: 'Leis e fatos', grupos: porNota(p.premissas) }]
  const visoes = [...p.visoes].sort(([a], [b]) => a.localeCompare(b))
  for (const [titular, fs] of visoes) tarefas.push({ chave: `visao:${titular}`, rotulo: `Visão de ${titular}`, grupos: porNota(fs) })

  // Tudo junto: leis e fatos como estão, e cada crença como B[titular] (φ).
  // Titulares que não são um nome válido na linguagem ficam de fora.
  const comoCrenca = visoes
    .filter(([titular]) => titularValido(titular))
    .flatMap(([titular, fs]) => fs.map((f) => ({ ...f, texto: `B[${titular}] (${f.texto})` })))
  if (comoCrenca.length)
    tarefas.push({ chave: 'tudo', rotulo: 'Tudo junto (leis, fatos e crenças)', grupos: porNota([...p.premissas, ...comoCrenca]) })
  return { tarefas, pronto: p.pronto }
}

/** `limites`: N, ou "N/K" quando o número de mundos também importa */
export function assinatura(t: Tarefa, dicionario: EntradaDicionario[], limites: number | string, pergunta?: string): string {
  return JSON.stringify([limites, t.grupos, dicionario.map((e) => [e.simbolo, e.tipo, e.aridade]), pergunta ?? null])
}

/** O titular cabe em B[…]? (uma ou mais palavras, sem símbolos lógicos) */
export function titularValido(titular: string): boolean {
  const { tokens, erros } = lex(titular)
  return !erros.length && tokens.length > 1 && tokens.every((t) => t.t === 'nome' || t.t === 'eof')
}
