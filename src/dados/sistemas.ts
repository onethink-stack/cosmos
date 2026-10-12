// Sistemas prontos: conjuntos de notas e fichas que vêm dentro do app.
// Sistemas pessoais vêm CIFRADOS (src/dados/cifrado/*.json): no código e no
// site só existe o texto embaralhado; o conteúdo aparece só com a senha.
// Toda nota de um sistema tem id "<sistema>-…", então carregar de novo
// atualiza (não duplica) e remover não precisa da senha.

import { mesclarDicionario, mesclarPorId } from './backup'
import { decifrar, type Cifrado } from './cripto'
import { estado, notaVazia } from './estado'
import { mundo } from './mundo'
import { instalarDoSite, type PacoteDoSite } from './pacotesSite'
import type { EntradaDicionario, Nota } from './tipos'
import type { ConjuntoDados } from '../motor/dados'

/** Conteúdo de um sistema (o que fica dentro do arquivo cifrado). */
export interface ConteudoSistema {
  id: string
  nome: string
  descricao: string
  /** notas sem as datas (preenchidas ao carregar) */
  notas: Omit<Nota, 'criadaEm' | 'atualizadaEm'>[]
  dicionario: EntradaDicionario[]
  /** conjuntos de dados do Mundo que vão junto (entram no aparelho ao carregar) */
  conjuntos?: ConjuntoDados[]
  /** pacotes do site que vão junto (biblioteca e problemas do TPTP): o app baixa e instala */
  bibliotecas?: PacoteDoSite[]
}

/** Sistema cifrado: só o nome é visível; o resto precisa da senha. */
export interface SistemaCifrado extends Cifrado {
  id: string
  nome: string
}

/** id especial: começar um caderno sem nenhum sistema */
export const NENHUM = 'nenhum'

export const CIFRADOS: SistemaCifrado[] = Object.values(
  import.meta.glob<SistemaCifrado>('./cifrado/*.json', { eager: true, import: 'default' }),
).sort((a, b) => a.nome.localeCompare(b.nome))

export const sistemaCifrado = (id: string) => CIFRADOS.find((s) => s.id === id)

/** Abre o sistema com a senha (lança SenhaErrada se não conferir). */
export async function abrirSistema(s: SistemaCifrado, senha: string): Promise<ConteudoSistema> {
  const c = JSON.parse(await decifrar(s, senha)) as ConteudoSistema
  if (c.id !== s.id || !Array.isArray(c.notas)) throw new Error('Conteúdo do sistema inválido.')
  return c
}

const prefixo = (id: string) => `${id}-`

/** Notas do sistema que estão no caderno (pelo prefixo do id; não precisa da senha). */
export function notasPresentes(id: string, notas: Nota[]): Nota[] {
  return notas.filter((n) => n.id.startsWith(prefixo(id)))
}

/**
 * Coloca o sistema no caderno. As notas e fichas do sistema voltam ao
 * original (mesmo id); o resto do caderno fica como está.
 */
export async function carregarSistema(c: ConteudoSistema) {
  const agora = new Date().toISOString()
  const novas: Nota[] = c.notas.map((n) => {
    const antiga = estado.nota(n.id)
    return { ...notaVazia(), ...n, criadaEm: antiga?.criadaEm ?? agora, atualizadaEm: agora }
  })
  await estado.substituirTudo(mesclarPorId(estado.notas, novas), mesclarDicionario(estado.dicionario, c.dicionario))
  // os dados do Mundo que vêm com o sistema (os do mesmo id voltam ao original)
  if (c.conjuntos?.length) {
    if (!mundo.carregado) await mundo.carregar()
    for (const d of c.conjuntos) await mundo.adicionar(d)
  }
}

/** Instala os pacotes do site que o sistema inclui (o TPTP, no Principia). */
export const instalarBibliotecasDoSistema = (c: ConteudoSistema, progresso?: (msg: string) => void) =>
  c.bibliotecas?.length ? instalarDoSite(c.bibliotecas, false, progresso) : Promise.resolve(null)

/** Tira do caderno as notas do sistema (as fichas ficam, podem ser usadas por outras notas). */
export async function removerSistema(id: string) {
  await estado.substituirTudo(
    estado.notas.filter((n) => !n.id.startsWith(prefixo(id))),
    estado.dicionario,
  )
}
