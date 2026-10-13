// O motor trabalhando "em segundo plano": avisa quando termina, mantém a tela
// acesa se pedido, retoma a reação em cadeia que o sistema interrompeu e
// abre a tela certa ao tocar numa notificação.

import { avisos } from './avisos'
import { estado } from './estado'
import { perfil } from './perfil'
import { limiteTexto } from '../motor/avaliar'
import { useEffect, useReducer } from 'preact/hooks'
import { verificacao, assinaturaCadeia, type Conclusao, type Ocupacao } from './verificacao'
import { formulasDoApoio, prepararCadeia } from './cadeia'
import { preparar } from './premissas'
import { chaveZ3, PRIORIDADE, z3 } from './z3'
import { assinaturaModelo, configModelo } from './modelo'
import { entradaDoModelo, mundo, type EntradaModelo } from './mundo'
import type { Classe } from '../motor/modelo'
import { completarComZ3 } from './modeloZ3'
import { motorFundo } from './motorFundo'
import { verdades } from './verdades'

/** espera depois da última mudança nas notas antes de rodar a reação sozinha */
const ESPERA_AUTOMATICA_MS = 20_000

/** O que o modo automático está fazendo agora (para a tela mostrar). */
class Agenda {
  /** quando o automático confere de novo (ms), se marcado */
  proximoEm: number | null = null
  /** por que está esperando (o motor ocupado com outra coisa), se está */
  esperando: string | null = null
  private ouvintes = new Set<() => void>()
  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  mudar(m: Partial<Pick<Agenda, 'proximoEm' | 'esperando'>>) {
    Object.assign(this, m)
    this.ouvintes.forEach((f) => f())
  }
}
export const agenda = new Agenda()

export function useAgenda(): Agenda {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => agenda.assinar(() => forcar(undefined)), [])
  return agenda
}

const NOME_OCUPACAO: Record<Ocupacao, string> = {
  verificar: 'a verificação',
  perguntar: 'uma pergunta',
  descobrir: 'a busca de consequências',
  teoremas: 'a conferência dos teoremas',
  lacunas: 'a busca da lei que falta',
  cadeia: 'a reação em cadeia',
  modelo: 'o segundo modelo',
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Resumo do que o trabalho que acabou achou (null = nada a avisar). */
export function resumoDaConclusao(c: Conclusao): { titulo: string; corpo: string; rota: string } | null {
  const ver = verificacao
  switch (c.tipo) {
    case 'cadeia': {
      const r = ver.rodadas.at(-1)
      if (!r || r.interrompida) return null
      const aps = r.relatorios.filter((x) => x.aprimoramento)
      const automatica = r.motivo.startsWith('automático')
      // a rodada automática avisa uma vez só, no fim (já aprofundada), e só se trouxe novidade
      if (c.parcial && automatica) return null
      // fim do aprimoramento (a rodada em si já foi avisada)
      if (!c.parcial && aps.length) {
        const virada = aps.find((x) => x.aprimoramento!.virada)
        if (virada)
          return {
            titulo: `⚠ Aprimoramento — rodada ${r.numero}`,
            corpo: `${virada.aprimoramento!.parouPor}. Refazendo a rodada com ${virada.aprimoramento!.virada!.N} objetos.`,
            rota: '#/cadeia',
          }
        if (!automatica) {
          const niveis = aps.map((x) => `${x.rotulo}: até ${limiteTexto(x.N, x.K)}`).join(' · ')
          return { titulo: `Aprimoramento da rodada ${r.numero} terminado`, corpo: `Tudo confirmado — ${niveis}.`, rota: '#/cadeia' }
        }
      }
      if (r.erro) return { titulo: `Reação em cadeia — rodada ${r.numero}`, corpo: `Falha no motor: ${r.erro}`, rota: '#/cadeia' }
      const partes: string[] = []
      let seguem = 0
      let naoSeguem = 0
      let sugestoes = 0
      let redundantes = 0
      let consequencias = 0
      let conflitos = 0
      let geracao = 0
      for (const rel of r.relatorios) {
        if (rel.consistencia?.tipo === 'sem-modelo') conflitos++
        if (rel.conflitoTeoremas) conflitos++
        for (const t of rel.teoremas) {
          if (t.resultado.tipo === 'segue') seguem++
          else if (t.resultado.tipo === 'nao-segue' || t.resultado.tipo === 'contradiz') naoSeguem++
          geracao = Math.max(geracao, t.geracao ?? 0)
        }
        sugestoes += rel.sugestoes.length
        redundantes += rel.leis.filter((l) => l.tipo === 'decorre').length
        consequencias += rel.consequencias?.length ?? 0
      }
      // o que mudou desde a rodada anterior
      const ant = ver.rodadas.find((x) => x.numero === r.numero - 1)
      let novos = 0
      if (ant)
        for (const rel of r.relatorios)
          for (const t of rel.teoremas) {
            const a = ant.relatorios.find((x) => x.chave === rel.chave)?.teoremas.find((x) => x.id === t.id)
            // passou a seguir, ou é um teorema novo que já segue
            if ((!a || a.resultado.tipo !== 'segue') && t.resultado.tipo === 'segue') novos++
          }
      // rodada automática: só avisa se apareceu algo novo (uma lei sugerida que não havia, um teorema que passou a seguir, um conflito)
      if (automatica) {
        const antes = new Set(ant?.relatorios.flatMap((x) => x.sugestoes.map((s) => s.lei.formula)) ?? [])
        const sugNovas = r.relatorios.flatMap((x) => x.sugestoes).filter((s) => !antes.has(s.lei.formula)).length
        if (!conflitos && !novos && !sugNovas) return null
      }
      if (conflitos) partes.push(`⚠ ${plural(conflitos, 'contradição', 'contradições')}`)
      if (novos) partes.push(`${plural(novos, 'teorema novo seguindo', 'teoremas novos seguindo')}`)
      if (seguem) partes.push(`${plural(seguem, 'teorema segue', 'teoremas seguem')}${geracao > 1 ? ` (até a geração ${geracao})` : ''}`)
      if (naoSeguem) partes.push(`${plural(naoSeguem, 'não segue', 'não seguem')}`)
      if (sugestoes) partes.push(`${plural(sugestoes, 'lei sugerida', 'leis sugeridas')} para aprovar`)
      if (redundantes) partes.push(`${plural(redundantes, 'lei redundante', 'leis redundantes')}`)
      if (consequencias) partes.push(`${plural(consequencias, 'consequência nova', 'consequências novas')}`)
      return {
        titulo: `Reação em cadeia — rodada ${r.numero} terminada`,
        corpo: (partes.length ? partes.join(' · ') : 'Nada de novo.') + (c.parcial ? ' · aprimorando em cenários maiores…' : ''),
        rota: '#/cadeia',
      }
    }
    case 'modelo': {
      const m = ver.modelo
      if (!m || m.interrompida) return null
      if (m.erro) return { titulo: 'Segundo modelo', corpo: `Falha no motor: ${m.erro}`, rota: '#/modelo' }
      const rel = m.relatorio
      if (!rel) return null
      const conta = (c: Classe) => rel.itens.filter((i) => i.classe === c).length
      // o que mudou desde a execução anterior (itens novos ou com outra classe)
      const mudaram = m.anterior ? rel.itens.filter((i) => m.anterior![i.id] !== i.classe).length : rel.itens.length
      // execução automática em que nada mudou: sem aviso
      if (m.motivo.startsWith('automático') && m.anterior && !mudaram) return null
      const partes = [
        conta('provado') && `${plural(conta('provado'), 'provado', 'provados')}`,
        conta('tese') && `${plural(conta('tese'), 'tese aberta', 'teses abertas')}`,
        conta('conflito') && `⚠ ${plural(conta('conflito'), 'tese em conflito', 'teses em conflito')}`,
        conta('refutado') && `${plural(conta('refutado'), 'refutado', 'refutados')}`,
        conta('adotada') + conta('ativada') && `${plural(conta('adotada') + conta('ativada'), 'lei adotada', 'leis adotadas')}`,
        conta('desativada') && `${plural(conta('desativada'), 'desativada', 'desativadas')}`,
        conta('descoberta') && `${plural(conta('descoberta'), 'consequência nova', 'consequências novas')}`,
      ].filter(Boolean)
      return {
        titulo: `Segundo modelo pronto (${plural(rel.rodada, 'rodada', 'rodadas')})`,
        corpo:
          (m.anterior ? `${plural(mudaram, 'mudança', 'mudanças')} desde a última vez · ` : '') +
          (partes.length ? partes.join(' · ') : 'Nada a classificar.'),
        rota: '#/modelo',
      }
    }
    case 'teoremas': {
      const rs = [...ver.teoremas.values()].map((t) => t.resultado.tipo)
      const seguem = rs.filter((t) => t === 'segue').length
      const nao = rs.filter((t) => t === 'nao-segue' || t === 'contradiz').length
      return {
        titulo: 'Teoremas conferidos',
        corpo: [seguem && plural(seguem, 'segue', 'seguem'), nao && plural(nao, 'não segue', 'não seguem')].filter(Boolean).join(' · ') || 'Pronto.',
        rota: '#/contradicoes',
      }
    }
    case 'lacunas': {
      const r = [...ver.lacunas.values()].at(-1)?.resultado
      if (!r) return null
      const corpo =
        r.tipo === 'sugestoes'
          ? r.itens.length
            ? `${plural(r.itens.length, 'lei fecha', 'leis fecham')} o teorema — falta você aprovar.`
            : 'Nenhuma lei simples fecha o teorema.'
          : r.tipo === 'ja-segue'
            ? 'O teorema já segue.'
            : r.tipo === 'contradiz'
              ? 'As leis contradizem o teorema.'
              : 'Pronto.'
      return { titulo: 'Lei que falta', corpo, rota: '#/contradicoes' }
    }
    case 'descobrir': {
      const r = ver.descoberta?.resultado
      if (!r || r.tipo !== 'consequencias') return null
      return {
        titulo: 'Consequências',
        corpo: r.itens.length ? `${plural(r.itens.length, 'consequência nova encontrada', 'consequências novas encontradas')}.` : 'Nenhuma consequência simples nova.',
        rota: '#/contradicoes',
      }
    }
    case 'perguntar': {
      const r = ver.pergunta?.resultado
      if (!r) return null
      const nome = { segue: '✓ segue', 'nao-segue': '✗ não segue', contradiz: '✗ as notas contradizem' }[r.tipo as string] ?? 'pronto'
      return { titulo: 'Pergunta respondida', corpo: `${ver.pergunta!.formula}: ${nome}`, rota: '#/contradicoes' }
    }
    case 'verificar': {
      const conflitos = [...ver.resultados.values()].filter((r) => r.resultado?.tipo === 'sem-modelo')
      if (conflitos.length)
        return { titulo: '⚠ Contradição encontrada', corpo: conflitos.map((r) => r.rotulo).join(', '), rota: '#/contradicoes' }
      // a checagem automática ao salvar uma nota é rápida: só avisa as demoradas
      if (c.ms < 5000) return null
      return { titulo: 'Verificação terminada', corpo: 'Nenhuma contradição.', rota: '#/contradicoes' }
    }
  }
  return null
}

let wakeLock: { release: () => Promise<void> } | null = null
let pedindo = false

/** Mantém a tela acesa enquanto o motor trabalha (se a opção estiver ligada e o app visível). */
async function ajustarTela() {
  const quer = avisos.telaAcesa && !!verificacao.ocupado && document.visibilityState === 'visible'
  const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
  if (quer && !wakeLock && !pedindo && wl) {
    pedindo = true
    try {
      wakeLock = await wl.request('screen')
      ;(wakeLock as unknown as EventTarget).addEventListener?.('release', () => (wakeLock = null))
    } catch {
      wakeLock = null
    }
    pedindo = false
  } else if (!quer && wakeLock) {
    const w = wakeLock
    wakeLock = null
    await w.release().catch(() => {})
  }
}

export function iniciarSegundoPlano() {
  void avisos.carregarConfig()
  void perfil.carregarConfig()
  void configModelo.carregar()
  void mundo.carregar()
  void motorFundo.carregarConfig()
  // o gerador do motor de fundo trabalha sempre sobre as leis de agora
  estado.assinar(() => verdades.agendarEnvio())
  // (desligou: quando voltar, manda de novo — ele pode ter sido reiniciado)
  motorFundo.assinar(() => (motorFundo.conectado ? verdades.agendarEnvio() : verdades.esquecerEnvio()))

  verificacao.aoConcluir((c) => {
    const r = resumoDaConclusao(c)
    if (r) avisos.avisar(r.titulo, r.corpo, r.rota)
    if (c.tipo === 'cadeia') conferirNumerosNoFundo()
    // o Z3 já vai decidindo o que tem números no segundo modelo, mesmo com a tela fechada
    if (c.tipo === 'modelo') faseZ3DoModelo()
  })

  // reação automática: as notas mudaram (ou a última rodada ficou desatualizada) → nova rodada
  let espera: ReturnType<typeof setTimeout> | null = null
  let avisouNomes = ''
  const agendar = () => {
    if (espera) clearTimeout(espera)
    espera = setTimeout(rodarSePreciso, ESPERA_AUTOMATICA_MS)
    agenda.mudar({ proximoEm: Date.now() + ESPERA_AUTOMATICA_MS })
  }
  const rodarSePreciso = () => {
    espera = null
    agenda.mudar({ proximoEm: null, esperando: null })
    if (!estado.carregado || !verificacao.configCarregada) return
    if (!perfil.automatico && !configModelo.automatico) return
    if (verificacao.ocupado) {
      // um trabalho que ficou velho (as notas mudaram), ou a cadeia só aprofundando
      // enquanto o segundo modelo precisa rodar, dá lugar; o resto termina antes
      const motivo = deveCeder()
      if (!motivo) {
        agenda.mudar({ esperando: NOME_OCUPACAO[verificacao.ocupado] })
        return agendar()
      }
      verificacao.cancelar(false, motivo)
    }
    if (perfil.automatico && cadeiaSePreciso()) return
    if (configModelo.automatico) {
      const m = modeloPendente()
      if (m) verificacao.iniciarModelo(m.entrada, estado.dicionario, m.motivo)
    }
  }
  /** o trabalho em andamento pode ser parado para o automático rodar? (devolve o motivo, ou null) */
  const deveCeder = (): string | null => {
    if (verificacao.ocupado === 'cadeia') {
      const r = verificacao.rodadas.at(-1)
      if (!r) return null
      const { pedido, pronto } = prepararCadeia(estado.notas, estado.dicionario)
      if (perfil.automatico && pronto && r.assinatura !== assinaturaCadeia(pedido, estado.dicionario)) return 'parado: as notas mudaram'
      // a rodada já acabou e só aprofunda: o segundo modelo aprofunda as mesmas conclusões (e o banco guarda o que já foi feito)
      if (r.baseTerminada && configModelo.automatico && modeloPendente())
        return 'deu a vez ao segundo modelo, que aprofunda as mesmas conclusões (o que já foi conferido fica no banco)'
      return null
    }
    if (verificacao.ocupado === 'modelo') {
      const m = verificacao.modelo
      const p = modeloPendente()
      if (m && p && configModelo.automatico && m.assinatura !== assinaturaModelo(p.entrada.notas, estado.dicionario, p.entrada.pastas, p.entrada.marcaDados))
        return 'parado: as notas ou os dados mudaram'
    }
    return null
  }
  /** a reação em cadeia automática; true se começou uma rodada */
  const cadeiaSePreciso = (): boolean => {
    const { pedido, pronto } = prepararCadeia(estado.notas, estado.dicionario)
    if (!pronto) {
      // avisa uma vez por conjunto de nomes pendentes
      const nomes = preparar(estado.notas, estado.dicionario).semFicha.map((p) => p.simbolo).join(', ')
      if (nomes !== avisouNomes)
        avisos.avisar('Reação automática esperando', `Confirme no dicionário os nomes sem ficha: ${nomes}.`, '#/contradicoes')
      avisouNomes = nomes
      return false
    }
    avisouNomes = ''
    if (!pedido.contextos.length) return false
    const ultima = verificacao.rodadas.at(-1)
    const assinatura = assinaturaCadeia(pedido, estado.dicionario)
    // uma rodada que parou no meio (app fechado) não trava o automático: se as notas
    // mudaram, começa outra; se não, é retomada (até 2 vezes; depois espera o botão Retomar)
    const p = verificacao.interrompida
    if (p) {
      if (ultima?.assinatura === assinatura && p.tentativas >= 2) return false
      verificacao.descartarInterrompida()
    }
    if (ultima && ultima.assinatura === assinatura && !ultima.interrompida) return false
    verificacao.continuarCadeia(
      ultima?.interrompida && ultima.assinatura === assinatura
        ? `${ultima.motivo.replace(/ \(retomada\)$/, '')} (retomada)`
        : ultima
          ? 'automático: as notas mudaram'
          : 'automático: primeira rodada',
      p && ultima?.assinatura === assinatura ? p.tentativas + 1 : 0,
    )
    return true
  }
  /** o segundo modelo precisa rodar? (as notas das pastas mudaram, ou ele parou no meio sem ser pelo usuário) */
  const modeloPendente = (): { entrada: EntradaModelo; motivo: string } | null => {
    const entrada = entradaDoModelo(estado.notas, configModelo.pastas, estado.dicionario, mundo.conjuntos, configModelo.usarDados)
    if (!entrada.notas.length || !preparar(entrada.notas, estado.dicionario).pronto) return null
    const m = verificacao.modelo
    if (m && m.assinatura === assinaturaModelo(entrada.notas, estado.dicionario, entrada.pastas, entrada.marcaDados)) {
      if (!m.interrompida || m.interrompida === 'usuario' || m.tentativas >= 2) return null
      return { entrada, motivo: `${m.motivo.replace(/ \(retomado\)$/, '')} (retomado)` }
    }
    return { entrada, motivo: m ? 'automático: as notas ou os dados mudaram' : 'automático: primeira vez' }
  }
  let notasAntes = estado.notas
  let dicAntes = estado.dicionario
  estado.assinar(() => {
    if (estado.notas === notasAntes && estado.dicionario === dicAntes) return
    notasAntes = estado.notas
    dicAntes = estado.dicionario
    agendar()
  })
  perfil.assinar(() => perfil.automatico && agendar())
  configModelo.assinar(() => configModelo.automatico && agendar())
  mundo.assinar(() => mundo.carregado && configModelo.automatico && agendar())
  verificacao.assinar(() => {
    if (!verificacao.configCarregada || espera || !(perfil.automatico || configModelo.automatico)) return
    // motor livre, ou a cadeia já terminou a rodada e só aprofunda (o segundo modelo pode querer a vez)
    const soAprofundando = verificacao.ocupado === 'cadeia' && !!verificacao.rodadas.at(-1)?.baseTerminada && configModelo.automatico
    if (!verificacao.ocupado || soAprofundando) agendar()
  })

  verificacao.assinar(() => void ajustarTela())
  avisos.assinar(() => void ajustarTela())
  document.addEventListener('visibilitychange', () => void ajustarTela())

  // retoma a reação em cadeia que o sistema interrompeu (no máximo 2 vezes seguidas)
  let retomou = false
  const tentarRetomar = () => {
    if (retomou || !estado.carregado || !verificacao.configCarregada || !motorFundo.sondado) return
    retomou = true
    // a rodada ficou rodando no motor de fundo do PC: volta a ser acompanhada, sem recomeçar
    if (verificacao.reatarNoMotorDeFundo()) return
    const p = verificacao.interrompida
    if (!p || verificacao.ocupado) return
    if (p.tentativas >= 2) return // deixa o botão "Retomar" na tela da cadeia
    avisos.avisar('Retomando a reação em cadeia', `A rodada ${p.numero} tinha parado no meio (o app foi fechado). Recomeçando.`, '#/cadeia')
    verificacao.retomarCadeia()
  }
  estado.assinar(tentarRetomar)
  verificacao.assinar(tentarRetomar)
  motorFundo.assinar(tentarRetomar)

  // tocar numa notificação: o service worker pede para abrir a tela do resultado
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.tipo === 'ir' && typeof e.data.url === 'string') location.hash = new URL(e.data.url).hash || '#/notas'
  })
}

/**
 * Depois do segundo modelo, o Z3 decide o que tem números e ativa as notas
 * desativadas com números que fecham teses (avisa o que ativou).
 */
export function faseZ3DoModelo() {
  const m = verificacao.modelo
  if (!m?.relatorio || m.relatorio.situacao !== 'pronto') return
  const quando = m.quando
  void completarComZ3(
    quando,
    estado.dicionario,
    () => verificacao.modelo,
    (r) => verificacao.atualizarModelo(quando, r),
  ).then((ativadas) => {
    if (ativadas.length) avisos.avisar('Segundo modelo — Z3', `Ativou ${ativadas.join('; ')}.`, '#/modelo')
  })
}

/**
 * Depois de uma rodada, confere no Z3 (se ligado) os teoremas com números, em
 * segundo plano: as respostas ficam guardadas e a tela da cadeia já abre com elas.
 */
function conferirNumerosNoFundo() {
  if (!z3.ativo) return
  const r = verificacao.rodadas.at(-1)
  if (!r) return
  const { pedido } = prepararCadeia(estado.notas, estado.dicionario)
  for (const rel of r.relatorios) {
    const ctx = pedido.contextos.find((c) => c.chave === rel.chave)
    if (!ctx) continue
    const formulas = ctx.grupos.flatMap((g) => g.formulas)
    for (const t of rel.teoremas) {
      // checagens em lote, de fundo: uma pergunta passa na frente
      if (t.resultado.tipo === 'aritmetica')
        z3.confirmar(chaveZ3(formulas, t.formula, estado.dicionario), formulas, estado.dicionario, t.formula, true, undefined, PRIORIDADE.fundo)
      // o que seguiu até N objetos: o Z3 tenta provar para qualquer tamanho
      if (t.resultado.tipo === 'segue') {
        const apoio = formulasDoApoio(t, rel, ctx.grupos)
        z3.confirmar(chaveZ3(apoio, t.formula, estado.dicionario), apoio, estado.dicionario, t.formula, false, undefined, PRIORIDADE.fundo)
      }
    }
  }
}
