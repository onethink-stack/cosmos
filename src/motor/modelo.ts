// Segundo modelo: uma cópia das notas escolhidas em que o motor decide
// sozinho, sem pedir aprovação, rodada após rodada, até nada mais mudar:
//   1. um conjunto se contradiz → desativa a nota mais fraca do conflito
//      (uma lei adotada pelo modelo; depois grau M, D, F; entre iguais, a
//      mais recente)
//   2. as leis contradizem um teorema → refutado (desativado)
//   3. teoremas que não seguem → adota a lei que fecha mais deles, desde que
//      ela não contradiga as leis, não seja o próprio teorema disfarçado e
//      não refute outro teorema aberto (uma por conjunto e rodada; se a lei
//      vem de uma nota desativada, ativa a nota)
// Cada lei adotada pode fazer outros teoremas seguirem: a rodada seguinte
// confere de novo os que estão abertos (o banco de provas reaproveita o que
// não mudou). No ponto fixo, uma reação em cadeia completa, com
// aprimoramento, classifica cada nota e cada teorema. O caderno não é
// tocado: o resultado só vai para ele se o usuário levar.

import { inativasDoContexto, pedidoDaCadeia } from '../dados/cadeia'
import { contextoDoTeorema } from '../dados/premissas'
import type { EntradaDicionario, Nota } from '../dados/tipos'
import { canonica } from '../logica/canonica'
import { limiteTexto, tamanhoTexto } from './avaliar'
import { reacaoEmCadeia, type AjudaZ3, type ContextoCadeia, type LimitesAprimoramento, type RelatorioCadeia } from './cadeia'
import { analisar, buscarModelo, nao, type OpcoesMotor } from './motor'

/** começo do id das leis que o modelo cria (sem ":", que marca fórmula de teorema) */
export const PREFIXO_ADOTADA = 'modelo-'

/** rodadas no máximo antes do aprimoramento final */
export const MAX_RODADAS_MODELO = 15
/** quantas vezes o aprimoramento pode mandar refazer as rodadas num nível maior */
const MAX_REFEITAS = 2
/** sugestões testadas por rodada (as melhores primeiro) */
const MAX_TENTATIVAS = 6

export interface PedidoModelo {
  /** cópia das notas das pastas escolhidas */
  notas: Nota[]
  /** limites do aparelho: o ponto fixo é aprofundado até eles */
  aprimorar?: LimitesAprimoramento
  /** tempo máximo das rodadas (o aprimoramento final tem o seu) */
  orcamentoMs: number
}

export type TipoEvento = 'desativou' | 'refutou' | 'ativou' | 'adotou' | 'provou' | 'aviso'

export interface EventoModelo {
  rodada: number
  tipo: TipoEvento
  /** rótulo do conjunto ("Leis e fatos", "Visão de …") */
  conjunto: string
  notaId?: string
  titulo: string
  detalhe: string
}

export type Classe =
  /** premissa ativa, independente das outras */
  | 'lei'
  /** premissa ativa que decorre das outras */
  | 'redundante'
  /** lei criada pelo modelo para fechar teoremas */
  | 'adotada'
  /** nota desativada que o modelo ativou para fechar teoremas */
  | 'ativada'
  /** premissa que o modelo desativou (entrava em contradição) */
  | 'desativada'
  /** premissa desativada que não contradiz as leis (o modelo não precisou dela) */
  | 'compativel'
  /** premissa desativada que contradiz as leis */
  | 'incompativel'
  /** teorema que vale em todos os mundos testados */
  | 'provado'
  /** teorema que não contradiz as leis, mas não segue delas */
  | 'tese'
  /** teses que, juntas, contradizem as leis */
  | 'conflito'
  /** teorema contradito pelas leis */
  | 'refutado'
  /** usa números: decide o Z3 */
  | 'numerico'
  | 'incerto'
  /** consequência nova, que não estava escrita */
  | 'descoberta'

export interface ItemModelo {
  /** id da nota, "nota:índice" (fórmula de teorema) ou "consequencia:conjunto:k" */
  id: string
  notaId?: string
  /** conjunto: "geral" ou "visao:<titular>" */
  chave: string
  titulo: string
  formula: string
  classe: Classe
  explicacao: string
  /** de onde vem (ids de notas e de teoremas): para o grau herdado */
  apoio?: string[]
  geracao?: number
}

export interface RelatorioModelo {
  situacao: 'rodadas' | 'final' | 'pronto'
  rodada: number
  /** nível das rodadas (o aprimoramento final vai além: ver `final`) */
  N: number
  K: number
  /** as notas do modelo como estão agora (ativadas, desativadas, adotadas) */
  notas: Nota[]
  eventos: EventoModelo[]
  itens: ItemModelo[]
  /** a reação em cadeia completa do ponto fixo */
  final: RelatorioCadeia[] | null
  /** por que as rodadas pararam */
  parouPor: string
}

/** "x" ou "x:0" → id da nota */
const notaDe = (id: string) => {
  const k = id.lastIndexOf(':')
  return k > 0 && /^\d+$/.test(id.slice(k + 1)) ? id.slice(0, k) : id
}

const FORCA = { M: 1, D: 2, F: 3 } as const

/** 0 = lei adotada pelo modelo; depois M, D e F (fatos contam como F) */
const forcaDe = (n: Nota, criadas: Set<string>) => (criadas.has(n.id) ? 0 : FORCA[n.compartimento === 'fato' ? 'F' : n.grau])

/**
 * As buscas do conjunto mínimo tiram antes os primeiros grupos da lista.
 * `fortesPrimeiro`: num conflito, sobram as notas fracas (é delas que uma sai);
 * senão, no apoio de um teorema sobram as fortes (o grau herdado fica o mais alto possível).
 */
function ordenar(c: ContextoCadeia, notas: Nota[], criadas: Set<string>, fortesPrimeiro: boolean): ContextoCadeia {
  const forca = new Map(notas.map((n) => [n.id, forcaDe(n, criadas)]))
  const f = (id: string) => forca.get(id) ?? 3
  return { ...c, grupos: [...c.grupos].sort((a, b) => (fortesPrimeiro ? f(b.id) - f(a.id) : f(a.id) - f(b.id))) }
}

/** A nota que sai de um conflito: a adotada pelo modelo, depois a de grau mais fraco, depois a mais recente. */
function maisFraca(ids: string[], notas: Nota[], criadas: Set<string>): { nota: Nota; porque: string } | null {
  const forca = (n: Nota) => forcaDe(n, criadas)
  const cs = ids.map((id) => notas.find((n) => n.id === id)).filter((n): n is Nota => !!n)
  if (!cs.length) return null
  cs.sort((a, b) => forca(a) - forca(b) || b.atualizadaEm.localeCompare(a.atualizadaEm))
  const n = cs[0]
  const iguais = cs.filter((x) => forca(x) === forca(n)).length > 1
  const porque = criadas.has(n.id)
    ? 'é uma lei que o próprio modelo tinha adotado'
    : n.compartimento !== 'fato' && n.grau === 'M'
      ? 'tem grau M (mapeamento não medido), o mais fraco'
      : n.compartimento !== 'fato' && n.grau === 'D'
        ? 'tem grau D (decisão), mais fraco que as estabelecidas'
        : iguais
          ? 'todas têm o mesmo grau; é a mais recente'
          : 'é a mais fraca do conflito'
  return { nota: n, porque }
}

const lista = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`)

export async function rodarModelo(
  p: PedidoModelo,
  dicionario: EntradaDicionario[],
  op: OpcoesMotor,
  enviar: (r: RelatorioModelo) => void,
  progresso: (msg: string) => void,
  ajudaZ3?: AjudaZ3,
): Promise<void> {
  const ini = Date.now()
  let notas = p.notas.map((n) => ({ ...n, formulas: [...n.formulas], tags: [...n.tags] }))
  const eventos: EventoModelo[] = []
  /** leis criadas pelo modelo */
  const criadas = new Set<string>()
  const ativadas = new Map<string, string>()
  /** id → por que saiu */
  const desativadas = new Map<string, string>()
  const refutados = new Map<string, string>()
  /** formas canônicas de leis desativadas: não voltam pela porta dos fundos */
  const proibidas = new Set<string>()
  /** teoremas que já seguem: enquanto nenhuma premissa sair, continuam seguindo */
  const provados = new Set<string>()
  /** resultado de cada teorema na rodada anterior */
  const ultimo = new Map<string, string>()
  let nivel: OpcoesMotor = { ...op }
  let seq = 0
  const r: RelatorioModelo = { situacao: 'rodadas', rodada: 0, N: op.N, K: op.K, notas, eventos, itens: [], final: null, parouPor: '' }
  const mandar = () => enviar({ ...r, notas, eventos: [...eventos] })
  const nota = (id: string) => notas.find((n) => n.id === notaDe(id))
  const titulo = (id: string) => {
    const n = nota(id)
    const fs = n?.formulas.filter((f) => f.trim()).length ?? 0
    const i = id !== notaDe(id) ? Number(id.slice(id.lastIndexOf(':') + 1)) : -1
    return (n?.titulo || 'Sem título') + (i >= 0 && fs > 1 ? ` (fórmula ${i + 1})` : '')
  }
  const mudar = (id: string, m: Partial<Nota>) => (notas = notas.map((n) => (n.id === id ? { ...n, ...m } : n)))
  const evento = (e: Omit<EventoModelo, 'rodada'>) => eventos.push({ ...e, rodada: r.rodada })

  for (let refeitas = 0; ; refeitas++) {
    // rodadas até o ponto fixo
    for (;;) {
      if (r.rodada >= MAX_RODADAS_MODELO) {
        r.parouPor = `chegou a ${MAX_RODADAS_MODELO} rodadas`
        break
      }
      if (Date.now() - ini > p.orcamentoMs) {
        r.parouPor = `atingiu o tempo das rodadas (${Math.round(p.orcamentoMs / 60000)} min)`
        break
      }
      r.rodada++
      r.N = nivel.N
      r.K = nivel.K
      mandar()
      let mudou = false
      for (const c0 of pedidoDaCadeia(notas, dicionario).contextos) {
        // só os teoremas ainda abertos são conferidos de novo
        const c: ContextoCadeia = ordenar({ ...c0, teoremas: c0.teoremas.filter((t) => !provados.has(t.id)) }, notas, criadas, true)
        let rel: RelatorioCadeia | null = null
        await reacaoEmCadeia(
          { contextos: [c], inativas: inativasDoContexto(notas, c.chave), rapida: true },
          dicionario,
          nivel,
          (rs) => (rel = rs[0]),
          (_, msg) => progresso(`rodada ${r.rodada} · ${c.rotulo}: ${msg}`),
        )
        const rc = rel as RelatorioCadeia | null
        if (!rc) continue

        // 1. contradição: sai a nota mais fraca do conflito
        if (rc.consistencia?.tipo === 'sem-modelo') {
          const v = maisFraca(rc.consistencia.conflito, notas, criadas)
          if (!v) continue
          const outras = rc.consistencia.conflito.filter((id) => id !== v.nota.id).map(titulo)
          const motivo = `${outras.length ? `junto com ${lista(outras.map((t) => `“${t}”`))}, levava` : 'leva'} a uma contradição (em todos os mundos até ${limiteTexto(nivel.N, rc.K)}); saiu porque ${v.porque}`
          mudar(v.nota.id, { ativa: false })
          desativadas.set(v.nota.id, motivo)
          for (const f of analisar(v.nota.formulas, dicionario)) proibidas.add(canonica(f.original))
          provados.clear() // sem uma premissa, o que seguia precisa ser conferido de novo
          evento({ tipo: 'desativou', conjunto: c.rotulo, notaId: v.nota.id, titulo: v.nota.titulo || 'Sem título', detalhe: motivo })
          mudou = true
          continue
        }
        if (rc.consistencia?.tipo === 'grande-demais') {
          evento({ tipo: 'aviso', conjunto: c.rotulo, titulo: c.rotulo, detalhe: 'o conjunto é grande demais para este aparelho; ficou como está' })
          continue
        }

        // 2. teoremas: refutados saem; os que passaram a seguir entram no diário
        for (const t of rc.teoremas) {
          const antes = ultimo.get(t.id)
          ultimo.set(t.id, t.resultado.tipo)
          if (t.resultado.tipo === 'segue') {
            provados.add(t.id)
            if (antes && antes !== 'segue') {
              const de = t.resultado.notas.map(titulo)
              evento({
                tipo: 'provou',
                conjunto: c.rotulo,
                notaId: t.notaId,
                titulo: titulo(t.id),
                detalhe: `passou a seguir${de.length ? ` de ${lista(de)}` : ''}`,
              })
            }
          } else if (t.resultado.tipo === 'contradiz') {
            const por = t.resultado.notas.map(titulo)
            const motivo = `as leis implicam o contrário${por.length ? ` (${lista(por)})` : ''}, em todos os mundos até ${limiteTexto(nivel.N, rc.K)}`
            refutados.set(t.id, motivo)
            mudar(t.notaId, { ativa: false })
            evento({ tipo: 'refutou', conjunto: c.rotulo, notaId: t.notaId, titulo: titulo(t.id), detalhe: motivo })
          }
        }

        // 3. a lei que fecha mais teoremas abertos, se não estraga nada
        const abertos = rc.teoremas
          .filter((t) => t.resultado.tipo === 'nao-segue')
          .map((t) => ({ t, f: analisar([t.formula], dicionario)[0] }))
          .filter((x) => !!x.f)
        if (!abertos.length || !rc.sugestoes.length) continue
        const premissas = analisar(
          c.grupos.flatMap((g) => g.formulas),
          dicionario,
        ).map((x) => x.expandida)
        // as que fecham mais teoremas e não estragam nada (as sugestões vêm das que fecham mais para as que fecham menos)
        const boas: { s: (typeof rc.sugestoes)[number]; L: NonNullable<ReturnType<typeof analisar>[number]> }[] = []
        let tentativas = 0
        for (const s of rc.sugestoes) {
          if (s.lei.equivalente) continue // seria assumir o próprio teorema
          if (s.lei.notaId && desativadas.has(s.lei.notaId)) continue
          if (boas.length && s.fecha.length < boas[0].s.fecha.length) break
          const L = analisar([s.lei.formula], dicionario)[0]
          if (!L || proibidas.has(canonica(L.original))) continue
          if (++tentativas > MAX_TENTATIVAS) break
          progresso(`rodada ${r.rodada} · ${c.rotulo}: a lei "${s.lei.nome}" refuta algum teorema aberto?`)
          const refuta = abertos.find(
            (x) => !s.fecha.includes(x.t.id) && buscarModelo([...premissas, L.expandida, x.f!.expandida], nivel).status === 'sem-modelo',
          )
          if (!refuta) boas.push({ s, L })
        }
        // uma nota do próprio caderno vem antes; entre leis novas, a mais fraca (a que menos se compromete):
        // se, com as leis, A implica B e B não implica A, fica B
        const implica = (a: (typeof boas)[number], b: (typeof boas)[number]) =>
          buscarModelo([...premissas, a.L.expandida, nao(b.L.expandida)], nivel).status === 'sem-modelo'
        const escolhida =
          boas.find((b) => b.s.lei.notaId) ??
          boas.find((a) => !boas.some((b) => b !== a && implica(a, b) && !implica(b, a))) ??
          boas[0]
        if (escolhida) {
          const { s } = escolhida
          const fecha = lista(s.fecha.map((id) => `“${titulo(id)}”`))
          const conferido = `não contradiz as leis nem refuta outro teorema aberto (todos os mundos até ${limiteTexto(nivel.N, rc.K)})`
          const inativa = s.lei.notaId ? notas.find((n) => n.id === s.lei.notaId && !n.ativa) : undefined
          if (inativa) {
            const detalhe = `estava desativada; ativada porque fecha ${fecha} e ${conferido}`
            mudar(inativa.id, { ativa: true })
            ativadas.set(inativa.id, detalhe)
            evento({ tipo: 'ativou', conjunto: c.rotulo, notaId: inativa.id, titulo: inativa.titulo || 'Sem título', detalhe })
          } else {
            const titular = c.chave.startsWith('visao:') ? c.chave.slice('visao:'.length) : ''
            const agora = new Date().toISOString()
            const id = `${PREFIXO_ADOTADA}${++seq}`
            const detalhe = `diz que ${s.lei.leitura}; adotada porque fecha ${fecha} e ${conferido}`
            notas = [
              ...notas,
              {
                id,
                titulo: s.lei.nome,
                texto:
                  `Lei adotada pelo segundo modelo (rodada ${r.rodada}).\n\nO que diz: ${s.lei.leitura}.\n\n` +
                  `Por que: fecha ${fecha}. Sem ela, há um cenário (${tamanhoTexto(s.lei.n)}) em que as leis valem e o teorema falha. ` +
                  `Ela ${conferido}.`,
                formulas: [s.lei.formula],
                tags: ['segundo-modelo'],
                criadaEm: agora,
                atualizadaEm: agora,
                ativa: true,
                compartimento: titular ? 'visao' : 'lei',
                grau: 'D',
                fonte: '',
                data: '',
                titular,
              },
            ]
            criadas.add(id)
            evento({ tipo: 'adotou', conjunto: c.rotulo, notaId: id, titulo: s.lei.nome, detalhe })
          }
          mudou = true
        }
      }
      mandar()
      if (!mudou) {
        r.parouPor = 'ponto fixo: nada mais a desativar, ativar ou adotar'
        break
      }
    }

    // ponto fixo: a reação em cadeia completa, aprofundando até o limite do aparelho
    r.situacao = 'final'
    mandar()
    // os refutados voltam só para a conferência (o aprofundamento também os reconfere)
    const notaRefutada = new Set([...refutados.keys()].map(notaDe))
    const pedido = pedidoDaCadeia(
      notas.map((n) => (notaRefutada.has(n.id) ? { ...n, ativa: true } : n)),
      dicionario,
    )
    await reacaoEmCadeia(
      { ...pedido, contextos: pedido.contextos.map((c) => ordenar(c, notas, criadas, false)), aprimorar: p.aprimorar },
      dicionario,
      nivel,
      (rs) => {
        r.final = rs
        // a conferência no nível das rodadas acabou: a classificação já aparece
        // (provisória) enquanto o aprimoramento aprofunda
        if (!r.itens.length && rs.length && rs.every((x) => x.etapa === 'fim'))
          r.itens = classificar(notas, rs, dicionario, nivel, { criadas, ativadas, desativadas, refutados, titulo })
        mandar()
      },
      (_, msg) => progresso(`classificando: ${msg}`),
      ajudaZ3,
    )
    const virada = r.final?.map((x) => x.aprimoramento?.virada).find((v) => !!v)
    if (virada && refeitas < MAX_REFEITAS) {
      // uma conclusão caiu num cenário maior: as rodadas recomeçam nesse nível
      evento({
        tipo: 'aviso',
        conjunto: '',
        titulo: 'Aprimoramento',
        detalhe: `com ${virada.N} objetos, ${virada.descricao}: deixou de valer. As rodadas recomeçam nesse nível.`,
      })
      // recomeça pelo menos 2 tamanhos acima (cair de novo no tamanho seguinte custaria outra volta)
      const teto = p.aprimorar?.N ?? virada.N
      nivel = { ...nivel, N: Math.min(teto, Math.max(virada.N, nivel.N + 2)), K: Math.max(nivel.K, virada.K) }
      provados.clear()
      r.situacao = 'rodadas'
      r.itens = []
      continue
    }
    break
  }

  r.itens = classificar(notas, r.final ?? [], dicionario, nivel, { criadas, ativadas, desativadas, refutados, titulo })
  r.situacao = 'pronto'
  mandar()
}

interface Decisoes {
  criadas: Set<string>
  ativadas: Map<string, string>
  desativadas: Map<string, string>
  refutados: Map<string, string>
  titulo: (id: string) => string
}

/** Cada nota e cada teorema do modelo, com a classe e o porquê. */
function classificar(notas: Nota[], finais: RelatorioCadeia[], dicionario: EntradaDicionario[], op: OpcoesMotor, d: Decisoes): ItemModelo[] {
  const itens: ItemModelo[] = []
  const contextos = pedidoDaCadeia(notas, dicionario).contextos
  const de = (ids: string[]) => lista(ids.map((id) => `“${d.titulo(id)}”`))
  for (const n of notas) {
    const formulas = n.formulas.filter((f) => f.trim())
    if (!formulas.length) continue
    const chave = n.compartimento === 'teorema' ? contextoDoTeorema(n) : n.compartimento === 'visao' ? `visao:${n.titular.trim()}` : 'geral'
    const rel = finais.find((x) => x.chave === chave)
    const base = { notaId: n.id, chave, titulo: n.titulo || 'Sem título' }

    if (n.compartimento !== 'teorema') {
      const item = (classe: Classe, explicacao: string, apoio?: string[]) =>
        itens.push({ ...base, id: n.id, formula: formulas.join(' ; '), classe, explicacao, apoio })
      if (d.criadas.has(n.id)) {
        item(n.ativa ? 'adotada' : 'desativada', n.ativa ? 'lei criada pelo modelo (grau D: é uma decisão do modelo)' : (d.desativadas.get(n.id) ?? ''))
      } else if (d.desativadas.has(n.id)) item('desativada', d.desativadas.get(n.id)!)
      else if (n.ativa) {
        const l = rel?.leis.find((x) => x.id === n.id)
        if (d.ativadas.has(n.id)) item('ativada', d.ativadas.get(n.id)!)
        else if (l?.tipo === 'decorre') item('redundante', `decorre de ${de(l.notas) || 'nada (vale sempre)'}: pode virar teorema`, l.notas)
        else if (l?.tipo === 'independente') item('lei', 'independente: diz algo que as outras leis não dizem')
        else item('lei', rel?.consistencia?.tipo === 'consistente' ? 'ativa e consistente com as outras' : 'ativa')
      } else {
        // desativada pelo usuário: cabe junto com as leis?
        const ctx = contextos.find((c) => c.chave === chave)
        const fs = analisar(formulas, dicionario)
        if (!fs.length) item('incerto', 'usa números ou tem erro: o motor finito não decide')
        else {
          const premissas = analisar(ctx?.grupos.flatMap((g) => g.formulas) ?? [], dicionario).map((x) => x.expandida)
          const b = buscarModelo([...premissas, ...fs.map((x) => x.expandida)], op)
          if (b.status === 'modelo') item('compativel', 'desativada; não contradiz as leis ativas, mas nenhum teorema precisou dela')
          else if (b.status === 'sem-modelo') item('incompativel', `desativada; contradiz as leis ativas (todos os mundos até ${limiteTexto(op.N, op.K)})`)
          else item('incerto', 'desativada; grande demais para conferir')
        }
      }
      continue
    }

    n.formulas.forEach((formula, i) => {
      if (!formula.trim()) return
      const id = `${n.id}:${i}`
      const item = (classe: Classe, explicacao: string, extra: Partial<ItemModelo> = {}) =>
        itens.push({ ...base, id, titulo: d.titulo(id), formula, classe, explicacao, ...extra })
      const t = rel?.teoremas.find((x) => x.id === id)
      if (d.refutados.has(id) && t?.resultado.tipo !== 'contradiz') return item('refutado', d.refutados.get(id)!)
      if (!t) return item('incerto', n.ativa ? 'não foi conferido' : 'a nota saiu porque outra fórmula dela foi refutada')
      const nivel = rel ? limiteTexto(rel.N, rel.K) : ''
      switch (t.resultado.tipo) {
        case 'segue': {
          const apoio = t.apoio?.length ? t.apoio : t.resultado.notas
          return item('provado', `vale em todos os mundos até ${nivel}; ${apoio.length ? `vem de ${de(apoio)}` : 'vale sempre, sem precisar de lei'}`, {
            apoio,
            geracao: t.geracao,
          })
        }
        case 'nao-segue': {
          const outros = rel!.conflitoTeoremas?.filter((x) => x !== id) ?? []
          if (rel!.conflitoTeoremas?.includes(id))
            return item('conflito', `não segue, e junto com ${de(outros)} contradiz as leis: não podem valer todos`)
          return item('tese', `não contradiz as leis (há mundo onde vale), mas não segue delas: há um cenário (${tamanhoTexto(t.resultado.mundo.n)}) onde falha`)
        }
        case 'contradiz':
          return item('refutado', `as leis implicam o contrário (${de(t.resultado.notas)}), em todos os mundos até ${nivel}`)
        case 'aritmetica':
          return item('numerico', 'usa números: o motor finito não decide; o Z3 decide (ligue-o em Contradições)')
        case 'premissas-contraditorias':
          return item('incerto', 'as leis do conjunto se contradizem')
        default:
          return item('incerto', 'grande demais ou com erro')
      }
    })
  }
  for (const rel of finais)
    (rel.consequencias ?? []).forEach((q, k) =>
      itens.push({
        id: `consequencia:${rel.chave}:${k}`,
        chave: rel.chave,
        titulo: q.descricao,
        formula: q.formula,
        classe: 'descoberta',
        explicacao: `consequência nova, ainda não escrita: segue de ${de(q.notas) || 'nada (vale sempre)'} (todos os mundos até ${limiteTexto(rel.N, rel.K)})`,
        apoio: q.notas,
      }),
    )
  return itens
}
