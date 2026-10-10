import { useEffect, useReducer } from 'preact/hooks'
import * as db from './db'
import type { Compartimento, EntradaDicionario, Nota } from './tipos'

/** crypto.randomUUID só existe em https/localhost; no celular via IP da rede local não. */
export function novoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID()
    } catch {
      /* contexto não seguro */
    }
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

export function notaVazia(compartimento: Compartimento = 'lei'): Nota {
  const agora = new Date().toISOString()
  return {
    id: '',
    titulo: '',
    texto: '',
    formulas: [''],
    tags: [],
    criadaEm: agora,
    atualizadaEm: agora,
    ativa: true,
    compartimento,
    grau: 'F',
    fonte: '',
    data: '',
    titular: '',
  }
}

const porData = (a: Nota, b: Nota) => b.atualizadaEm.localeCompare(a.atualizadaEm)
const porSimbolo = (a: EntradaDicionario, b: EntradaDicionario) => a.simbolo.localeCompare(b.simbolo)

/**
 * Estado do aplicativo em memória, gravado no IndexedDB a cada mudança.
 * Os arrays são sempre substituídos (nunca alterados), para os componentes
 * perceberem a mudança.
 */
export class Estado {
  notas: Nota[] = []
  dicionario: EntradaDicionario[] = []
  carregado = false
  /** datas (ms) para o lembrete de backup */
  ultimoBackup: number | undefined
  adiadoAte: number | undefined
  primeiroUso = Date.now()
  /** mensagem quando o IndexedDB não está disponível (os dados ficam só na memória) */
  erroBanco: string | null = null
  private ouvintes = new Set<() => void>()

  assinar(fn: () => void): () => void {
    this.ouvintes.add(fn)
    return () => this.ouvintes.delete(fn)
  }
  private avisar() {
    this.ouvintes.forEach((f) => f())
  }

  private async persistir(acao: () => Promise<void>) {
    if (this.erroBanco) return
    try {
      await acao()
    } catch (e) {
      this.erroBanco = `Não foi possível gravar no aparelho: ${(e as Error).message}`
      this.avisar()
    }
  }

  async carregar() {
    try {
      const [notas, dic] = await Promise.all([db.listar<Nota>('notas'), db.listar<EntradaDicionario>('dicionario')])
      this.notas = notas.sort(porData)
      this.dicionario = dic.sort(porSimbolo)
      const [ultimo, adiado, primeiro] = await Promise.all([
        db.lerConfig<number>('ultimoBackup'),
        db.lerConfig<number>('adiadoAte'),
        db.lerConfig<number>('primeiroUso'),
      ])
      this.ultimoBackup = ultimo ?? undefined
      this.adiadoAte = adiado ?? undefined
      if (primeiro) this.primeiroUso = primeiro
      else await db.gravarConfig('primeiroUso', this.primeiroUso)
    } catch (e) {
      this.erroBanco = `Armazenamento indisponível (${(e as Error).message}). Nada será salvo.`
    }
    this.carregado = true
    this.avisar()
  }

  nota(id: string): Nota | undefined {
    return this.notas.find((n) => n.id === id)
  }

  async salvarNota(n: Nota): Promise<Nota> {
    const salva: Nota = { ...n, id: n.id || novoId(), atualizadaEm: new Date().toISOString() }
    this.notas = [salva, ...this.notas.filter((x) => x.id !== salva.id)].sort(porData)
    this.avisar()
    await this.persistir(() => db.gravar('notas', salva))
    return salva
  }

  async apagarNota(id: string) {
    this.notas = this.notas.filter((n) => n.id !== id)
    this.avisar()
    await this.persistir(() => db.apagar('notas', id))
  }

  async salvarEntradas(...es: EntradaDicionario[]): Promise<EntradaDicionario[]> {
    const salvas = es.map((e) => ({ ...e, id: e.id || novoId() }))
    const ids = new Set(salvas.map((e) => e.id))
    this.dicionario = [...this.dicionario.filter((e) => !ids.has(e.id)), ...salvas].sort(porSimbolo)
    this.avisar()
    await this.persistir(() => db.gravar('dicionario', ...salvas))
    return salvas
  }

  /** Troca todo o conteúdo (importação no modo "substituir"). */
  async substituirTudo(notas: Nota[], dicionario: EntradaDicionario[]) {
    this.notas = [...notas].sort(porData)
    this.dicionario = [...dicionario].sort(porSimbolo)
    this.avisar()
    await this.persistir(() => db.substituirTudo({ notas: this.notas, dicionario: this.dicionario }))
  }

  async registrarBackup() {
    this.ultimoBackup = Date.now()
    this.adiadoAte = undefined
    this.avisar()
    await this.persistir(async () => {
      await db.gravarConfig('ultimoBackup', this.ultimoBackup)
      await db.gravarConfig('adiadoAte', null)
    })
  }

  async adiarLembrete(dias = 1) {
    this.adiadoAte = Date.now() + dias * 24 * 60 * 60 * 1000
    this.avisar()
    await this.persistir(() => db.gravarConfig('adiadoAte', this.adiadoAte))
  }

  async apagarEntrada(id: string) {
    this.dicionario = this.dicionario.filter((e) => e.id !== id)
    this.avisar()
    await this.persistir(() => db.apagar('dicionario', id))
  }
}

export const estado = new Estado()

/** Re-renderiza o componente a cada mudança do estado. */
export function useEstado(): Estado {
  const [, forcar] = useReducer((x: number) => x + 1, 0)
  useEffect(() => estado.assinar(() => forcar(undefined)), [])
  return estado
}
