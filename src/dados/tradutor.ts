// Português → fórmula. Primeiro o tradutor do aparelho (português simples, sem
// internet); se ele não entender e o usuário tiver ligado, um modelo de
// linguagem (Claude, pela API da Anthropic, com a chave do próprio usuário).
// O modelo só TRADUZ: a resposta vem sempre do motor finito e do Z3, e a
// tradução é mostrada (com a leitura determinística) para o usuário conferir.

import { useEffect, useReducer } from 'preact/hooks'
import { traduzirPortugues, type Traducao } from '../logica/portugues'
import { validar } from '../logica/validador'
import { gravarConfig, lerConfig } from './db'
import type { EntradaDicionario } from './tipos'

export const MODELOS_CLAUDE = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5 (o mais preciso)' },
  { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5 (o mais barato)' },
]

export type TraducaoFeita = Traducao & {
  /** quem traduziu */
  por: 'aparelho' | 'claude' | 'voce'
  /** do modelo de linguagem: o que ele entendeu (ou por que não deu) */
  explicacao?: string
}

/** quantas fichas do dicionário, no máximo, vão na pergunta ao modelo */
const MAX_FICHAS = 600
const ENDERECO_API = 'https://api.anthropic.com/v1/messages'

class Tradutor {
  /** usar o Claude quando o português simples não entender */
  usarClaude = false
  modelo = MODELOS_CLAUDE[0].id
  /** a chave da API (fica só neste aparelho; não entra no backup) */
  chave = ''
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void) {
    this.ouvintes.add(fn)
    return () => {
      this.ouvintes.delete(fn)
    }
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  async carregarConfig() {
    try {
      const c = await lerConfig<{ usarClaude?: boolean; modelo?: string }>('tradutor')
      if (c?.usarClaude !== undefined) this.usarClaude = c.usarClaude
      if (c?.modelo && MODELOS_CLAUDE.some((m) => m.id === c.modelo)) this.modelo = c.modelo
      this.chave = (await lerConfig<string>('tradutorChave')) ?? ''
    } catch {
      /* sem banco: fica o padrão */
    }
    this.avisar()
  }

  definir(mudanca: { usarClaude?: boolean; modelo?: string; chave?: string }) {
    if (mudanca.usarClaude !== undefined) this.usarClaude = mudanca.usarClaude
    if (mudanca.modelo) this.modelo = mudanca.modelo
    if (mudanca.chave !== undefined) {
      this.chave = mudanca.chave.trim()
      void gravarConfig('tradutorChave', this.chave).catch(() => {})
    }
    void gravarConfig('tradutor', { usarClaude: this.usarClaude, modelo: this.modelo }).catch(() => {})
    this.avisar()
  }

  get claudePronto() {
    return this.usarClaude && !!this.chave
  }

  /** Traduz: no aparelho; se não der e o Claude estiver ligado, com ele. */
  async traduzir(texto: string, dicionario: EntradaDicionario[], sinal?: AbortSignal): Promise<TraducaoFeita> {
    const local = traduzirPortugues(texto, dicionario)
    if (local.ok || !this.claudePronto) return { ...local, por: 'aparelho' }
    return traduzirComClaude(texto, dicionario, { chave: this.chave, modelo: this.modelo }, sinal)
  }
}

export const tradutor = new Tradutor()

export function useTradutor(): Tradutor {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => tradutor.assinar(() => forcar(undefined)), [])
  return tradutor
}

/** a variável livre de uma pergunta de "quem" (uma letra que não é nome do dicionário) */
export function variavelLivre(dicionario: EntradaDicionario[]): string {
  const ocupados = new Set(dicionario.map((e) => e.simbolo))
  for (let n = 0; ; n++) for (const b of ['x', 'y', 'z', 'w']) if (!ocupados.has(n ? `${b}${n}` : b)) return n ? `${b}${n}` : b
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** as fichas que vão para o modelo: todas, ou (num dicionário enorme) primeiro as que aparecem na pergunta */
function fichasParaOModelo(texto: string, dicionario: EntradaDicionario[]): EntradaDicionario[] {
  if (dicionario.length <= MAX_FICHAS) return dicionario
  const palavras = new Set(normal(texto).match(/[\p{L}\p{N}]+/gu) ?? [])
  const pontos = (e: EntradaDicionario) => (normal(`${e.termo} ${e.simbolo}`).match(/[\p{L}\p{N}]+/gu) ?? []).filter((p) => p.length > 2 && palavras.has(p)).length
  return [...dicionario].sort((a, b) => pontos(b) - pontos(a)).slice(0, MAX_FICHAS)
}

const SINTAXE = `Sintaxe das fórmulas do Caderno Lógico:
- quantificadores: ∀x (…), ∃x (…). O escopo vai o mais longe possível para a direita: ponha entre parênteses um quantificador usado dentro de ∧, ∨ ou ⟹, ex.: (∀x P(x)) ⟹ Q(a).
- conectivos: ¬ (não), ∧ (e), ∨ (ou), ⟹ (se… então), ⟺ (se e somente se).
- relações entre objetos: =, ≠, ∈, ∉, ⊆; ∅ é o conjunto vazio.
- predicado: P(a), R(a, b); predicado sem argumentos (proposição): Chove. Função: f(a).
- variáveis: letras minúsculas que não sejam nomes do dicionário (x, y, z…).
- só use nomes do dicionário abaixo, exatamente como escritos na coluna "símbolo", com o tipo e o número de argumentos de cada um.`

function instrucoes(fichas: EntradaDicionario[], livre: string): string {
  const linhas = fichas.map((e) => `${e.simbolo} | ${e.tipo}${e.tipo === 'constante' ? '' : `/${e.aridade}`}${e.numerico ? ' (número)' : ''} | ${e.termo}`)
  return [
    'Você traduz perguntas em português para uma fórmula da lógica de primeira ordem do Caderno Lógico.',
    'Você NÃO responde a pergunta e não usa conhecimento próprio sobre o assunto: só traduz o que a pergunta diz, com os nomes do dicionário.',
    'Quem decide se é verdade é um provador automático, a partir das notas do usuário.',
    '',
    SINTAXE,
    '',
    'Tipos de pergunta:',
    '- "sim-ou-nao": perguntas de sim ou não ("Todo homem é mortal?"). A fórmula não tem variáveis livres.',
    `- "quem": perguntas que pedem nomes ("Quem é mortal?", "Quais homens são sábios?"). A fórmula tem exatamente uma variável livre, chamada ${livre}, no lugar do que se pergunta (ex.: Mortal(${livre})).`,
    '- "fora": a pergunta precisa de algo que não está no dicionário, ou não é uma pergunta sobre o que as notas dizem. Diga na explicação o que falta. Não invente nomes.',
    '',
    'Na explicação, diga em uma frase curta, em português, como você leu a pergunta.',
    '',
    'Dicionário (símbolo | tipo/argumentos | nome por extenso):',
    ...linhas,
  ].join('\n')
}

interface RespostaApi {
  content?: { type: string; id?: string; input?: { tipo?: string; formula?: string; explicacao?: string } }[]
  error?: { message?: string }
}

/** Traduz com o Claude. Confere a fórmula com o validador; se não passar, pede de novo uma vez, com o erro. */
export async function traduzirComClaude(
  texto: string,
  dicionario: EntradaDicionario[],
  cfg: { chave: string; modelo: string },
  sinal?: AbortSignal,
  buscar: typeof fetch = fetch,
): Promise<TraducaoFeita> {
  const livre = variavelLivre(dicionario)
  const sistema = instrucoes(fichasParaOModelo(texto, dicionario), livre)
  const mensagens: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: texto }]
  const falha = (erro: string, explicacao?: string): TraducaoFeita => ({ ok: false, erro, desconhecidas: [], por: 'claude', ...(explicacao ? { explicacao } : {}) })

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let r: Response
    try {
      r = await buscar(ENDERECO_API, {
        method: 'POST',
        signal: sinal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.chave,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: cfg.modelo,
          max_tokens: 1024,
          system: sistema,
          tools: [
            {
              name: 'traduzir',
              description: 'Devolve a tradução da pergunta para uma fórmula.',
              input_schema: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['sim-ou-nao', 'quem', 'fora'] },
                  formula: { type: 'string', description: 'a fórmula (vazia se tipo = fora)' },
                  explicacao: { type: 'string', description: 'como a pergunta foi lida, ou o que falta' },
                },
                required: ['tipo', 'formula', 'explicacao'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'traduzir' },
          messages: mensagens,
        }),
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return falha('cancelado')
      return falha('Sem conexão com a Anthropic (o Claude precisa de internet).')
    }
    const corpo = (await r.json().catch(() => ({}))) as RespostaApi
    if (!r.ok) {
      const msg = corpo.error?.message ?? `erro ${r.status}`
      if (r.status === 401) return falha('A chave da API não foi aceita. Confira a chave em “Tradutor”.')
      if (r.status === 429) return falha('O limite de uso da API foi atingido. Tente daqui a pouco.')
      return falha(`A API da Anthropic recusou: ${msg}`)
    }
    const uso = corpo.content?.find((c) => c.type === 'tool_use')
    const dados = uso?.input
    if (!dados?.tipo) return falha('O Claude não devolveu uma tradução.')
    const explicacao = dados.explicacao?.trim() || undefined
    if (dados.tipo === 'fora') return falha('O Claude disse que a pergunta não cabe no dicionário.', explicacao)
    const formula = (dados.formula ?? '').trim()
    const v = validar(formula, dicionario, { exigirFichas: true })
    const quem = dados.tipo === 'quem'
    // numa pergunta de "quem", a variável livre é de propósito (o validador a vê como um nome sem ficha)
    const livreDeProposito = (d: { codigo: string; pos: number; end: number }) => quem && (d.codigo === 'E6' || d.codigo === 'E12') && formula.slice(d.pos, d.end) === livre
    const erros = v.diags.filter((d) => !livreDeProposito(d) && (d.nivel === 'erro' || d.codigo === 'E12' || d.codigo === 'E13'))
    if (v.ast && !erros.length) return quem ? { ok: true, tipo: 'quem', formula, variavel: livre, por: 'claude', explicacao } : { ok: true, tipo: 'sim-ou-nao', formula, por: 'claude', explicacao }
    // não passou no validador: mostra o erro e pede de novo
    const problema = erros.map((d) => d.msg).join('; ') || 'fórmula inválida'
    if (tentativa === 1) return falha(`O Claude devolveu uma fórmula que não passa no validador (${problema}): ${formula}`, explicacao)
    mensagens.push(
      { role: 'assistant', content: [{ type: 'tool_use', id: uso?.id ?? 'traducao', name: 'traduzir', input: dados }] },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: uso?.id ?? 'traducao',
            is_error: true,
            content: `A fórmula não passou no validador: ${problema}. Corrija usando só os símbolos do dicionário.`,
          },
        ],
      },
    )
  }
  return falha('O Claude não devolveu uma tradução.')
}
