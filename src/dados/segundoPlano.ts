// O motor trabalhando "em segundo plano": avisa quando termina, mantém a tela
// acesa se pedido, retoma a reação em cadeia que o sistema interrompeu e
// abre a tela certa ao tocar numa notificação.

import { avisos } from './avisos'
import { estado } from './estado'
import { verificacao, type Conclusao } from './verificacao'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Resumo do que o trabalho que acabou achou (null = nada a avisar). */
export function resumoDaConclusao(c: Conclusao): { titulo: string; corpo: string; rota: string } | null {
  const ver = verificacao
  switch (c.tipo) {
    case 'cadeia': {
      const r = ver.rodadas.at(-1)
      if (!r || r.interrompida) return null
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
            if (a && a.resultado.tipo !== 'segue' && t.resultado.tipo === 'segue') novos++
          }
      if (conflitos) partes.push(`⚠ ${plural(conflitos, 'contradição', 'contradições')}`)
      if (novos) partes.push(`${plural(novos, 'teorema passou', 'teoremas passaram')} a seguir`)
      if (seguem) partes.push(`${plural(seguem, 'teorema segue', 'teoremas seguem')}${geracao > 1 ? ` (até a geração ${geracao})` : ''}`)
      if (naoSeguem) partes.push(`${plural(naoSeguem, 'não segue', 'não seguem')}`)
      if (sugestoes) partes.push(`${plural(sugestoes, 'lei sugerida', 'leis sugeridas')} para aprovar`)
      if (redundantes) partes.push(`${plural(redundantes, 'lei redundante', 'leis redundantes')}`)
      if (consequencias) partes.push(`${plural(consequencias, 'consequência nova', 'consequências novas')}`)
      return {
        titulo: `Reação em cadeia — rodada ${r.numero} terminada`,
        corpo: partes.length ? partes.join(' · ') : 'Nada de novo.',
        rota: '#/cadeia',
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

  verificacao.aoConcluir((c) => {
    const r = resumoDaConclusao(c)
    if (r) avisos.avisar(r.titulo, r.corpo, r.rota)
  })

  verificacao.assinar(() => void ajustarTela())
  avisos.assinar(() => void ajustarTela())
  document.addEventListener('visibilitychange', () => void ajustarTela())

  // retoma a reação em cadeia que o sistema interrompeu (no máximo 2 vezes seguidas)
  let retomou = false
  const tentarRetomar = () => {
    if (retomou || !estado.carregado || !verificacao.configCarregada) return
    retomou = true
    const p = verificacao.interrompida
    if (!p || verificacao.ocupado) return
    if (p.tentativas >= 2) return // deixa o botão "Retomar" na tela da cadeia
    avisos.avisar('Retomando a reação em cadeia', `A rodada ${p.numero} tinha parado no meio (o app foi fechado). Recomeçando.`, '#/cadeia')
    verificacao.retomarCadeia()
  }
  estado.assinar(tentarRetomar)
  verificacao.assinar(tentarRetomar)

  // tocar numa notificação: o service worker pede para abrir a tela do resultado
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.tipo === 'ir' && typeof e.data.url === 'string') location.hash = new URL(e.data.url).hash || '#/notas'
  })
}
