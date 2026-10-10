import { preparar } from '../dados/premissas'
import { lex } from '../logica/lexer'
import type { EntradaDicionario, Nota } from '../dados/tipos'
import { bancoAtual, type EstatisticasBanco } from './bancoProvas'
import { reacaoEmCadeia, type PedidoCadeia, type RelatorioCadeia } from './cadeia'
import { descobrir, type ResultadoDescoberta } from './descobrir'
import { procurarLeis, type ResultadoLacunas } from './lacunas'
import { rodarModelo, type PedidoModelo, type RelatorioModelo } from './modelo'
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
  /** se presente, confere cada teorema (id → fórmula) contra a tarefa do seu contexto (padrão: a primeira) */
  teoremas?: { id: string; formula: string; contexto?: string }[]
  /** se presente, procura leis que fariam o teorema seguir da (única) tarefa; `inativas` são candidatas do caderno */
  lacuna?: { teoremaId: string; formula: string; inativas: Grupo[] }
  /** se presente, roda a reação em cadeia (as tarefas são ignoradas) */
  cadeia?: PedidoCadeia
  /** se presente, roda o segundo modelo (as tarefas são ignoradas) */
  modelo?: PedidoModelo
}

export type RespostaMotor =
  | { id: number; tipo: 'progresso'; chave: string; msg: string }
  | { id: number; tipo: 'resultado'; chave: string; resultado: ResultadoMotor; ms: number }
  | { id: number; tipo: 'resposta'; chave: string; resultado: ResultadoPergunta; ms: number }
  | { id: number; tipo: 'descobertas'; chave: string; resultado: ResultadoDescoberta; ms: number }
  | { id: number; tipo: 'teorema'; chave: string; teoremaId: string; resultado: ResultadoPergunta; ms: number }
  | { id: number; tipo: 'lacunas'; chave: string; teoremaId: string; resultado: ResultadoLacunas; ms: number }
  | { id: number; tipo: 'cadeia'; relatorios: RelatorioCadeia[]; ms: number }
  | { id: number; tipo: 'modelo'; relatorio: RelatorioModelo; ms: number }
  | { id: number; tipo: 'erro'; chave: string; msg: string }
  /** quanto o banco de provas guardou e reaproveitou */
  | { id: number; tipo: 'banco'; estatisticas: EstatisticasBanco }
  | { id: number; tipo: 'fim' }

export function executarTarefas(p: PedidoMotor, enviar: (r: RespostaMotor) => void) {
  if (p.modelo) {
    const ini = Date.now()
    try {
      rodarModelo(
        p.modelo,
        p.dicionario,
        p.opcoes,
        (relatorio) => enviar({ id: p.id, tipo: 'modelo', relatorio, ms: Date.now() - ini }),
        (msg) => enviar({ id: p.id, tipo: 'progresso', chave: 'modelo', msg }),
      )
    } catch (e) {
      enviar({ id: p.id, tipo: 'erro', chave: 'modelo', msg: (e as Error).message })
    }
    terminar(p.id, enviar)
    return
  }
  if (p.cadeia) {
    const ini = Date.now()
    try {
      reacaoEmCadeia(
        p.cadeia,
        p.dicionario,
        p.opcoes,
        (relatorios) => enviar({ id: p.id, tipo: 'cadeia', relatorios, ms: Date.now() - ini }),
        (chave, msg) => enviar({ id: p.id, tipo: 'progresso', chave, msg }),
      )
    } catch (e) {
      enviar({ id: p.id, tipo: 'erro', chave: 'cadeia', msg: (e as Error).message })
    }
    terminar(p.id, enviar)
    return
  }
  // teoremas: cada um contra a tarefa do seu contexto
  if (p.teoremas) {
    p.teoremas.forEach((th, k) => {
      const t = p.tarefas.find((x) => x.chave === (th.contexto ?? p.tarefas[0].chave)) ?? p.tarefas[0]
      const ini = Date.now()
      try {
        const resultado = perguntar(t.grupos, th.formula, p.dicionario, p.opcoes, (msg) =>
          enviar({ id: p.id, tipo: 'progresso', chave: t.chave, msg: `teorema ${k + 1} de ${p.teoremas!.length}: ${msg}` }),
        )
        enviar({ id: p.id, tipo: 'teorema', chave: t.chave, teoremaId: th.id, resultado, ms: Date.now() - ini })
      } catch (e) {
        enviar({ id: p.id, tipo: 'erro', chave: t.chave, msg: (e as Error).message })
      }
    })
    terminar(p.id, enviar)
    return
  }
  for (const t of p.tarefas) {
    const ini = Date.now()
    const progresso = (msg: string) => enviar({ id: p.id, tipo: 'progresso', chave: t.chave, msg })
    try {
      if (p.lacuna) {
        const { teoremaId, formula, inativas } = p.lacuna
        const resultado = procurarLeis(t.grupos, inativas, formula, p.dicionario, p.opcoes, progresso)
        enviar({ id: p.id, tipo: 'lacunas', chave: t.chave, teoremaId, resultado, ms: Date.now() - ini })
        continue
      }
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
  terminar(p.id, enviar)
}

/** Fim do pedido: manda antes os números do banco de provas. */
function terminar(id: number, enviar: (r: RespostaMotor) => void) {
  const b = bancoAtual()
  if (b) enviar({ id, tipo: 'banco', estatisticas: { ...b.estatisticas } })
  enviar({ id, tipo: 'fim' })
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

/** A tarefa de um contexto ("geral" ou "visao:<titular>"); vazia se o titular não tem visões ativas. */
export function tarefaDoContexto(tarefas: Tarefa[], chave: string): Tarefa {
  return tarefas.find((t) => t.chave === chave) ?? { chave, rotulo: chave.startsWith('visao:') ? `Visão de ${chave.slice(6)}` : chave, grupos: [] }
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
