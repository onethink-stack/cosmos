// Os pacotes do TPTP (biblioteca e problemas) também ficam no site, em tptp/:
// o app baixa e instala sozinho (ao abrir um sistema que os inclui, como o
// Principia, ou pelo botão da Biblioteca TPTP). São públicos (o TPTP é), e o
// service worker não os baixa junto com o app: só quando pedidos. Depois de
// instalados, ficam no aparelho (funcionam offline).

import { biblioteca } from './biblioteca'
import { gravarConfig, lerConfig } from './db'

export type PacoteDoSite = 'biblioteca-tptp' | 'problemas-tptp'
export const PACOTES_DO_SITE: PacoteDoSite[] = ['biblioteca-tptp', 'problemas-tptp']

/** o que o site tem: quando cada pacote foi gerado e o tamanho */
interface VersaoSite {
  pacotes: Record<PacoteDoSite, { gerado: string; bytes: number }>
}

const CHAVE_INSTALADOS = 'tptpDoSite'

async function versaoDoSite(): Promise<VersaoSite | null> {
  try {
    const r = await fetch('tptp/versao.json', { cache: 'no-store' })
    return r.ok ? ((await r.json()) as VersaoSite) : null
  } catch {
    return null
  }
}

export interface Instalacao {
  /** baixados e instalados agora */
  instalados: PacoteDoSite[]
  /** já estavam no aparelho, na mesma versão */
  jaTinha: PacoteDoSite[]
  /** o site não tem (ou não respondeu) */
  faltaram: PacoteDoSite[]
}

/**
 * Baixa do site e instala os pacotes que faltam ou mudaram. `forcar`: baixa
 * de novo mesmo se a versão for a mesma. `progresso`: o que está fazendo.
 */
export async function instalarDoSite(pacotes: PacoteDoSite[], forcar = false, progresso?: (msg: string) => void): Promise<Instalacao> {
  const r: Instalacao = { instalados: [], jaTinha: [], faltaram: [] }
  if (!biblioteca.carregado) await biblioteca.carregar()
  const site = await versaoDoSite()
  const instalados = (await lerConfig<Record<string, string>>(CHAVE_INSTALADOS).catch(() => undefined)) ?? {}
  for (const p of pacotes) {
    const v = site?.pacotes[p]
    if (!v) {
      r.faltaram.push(p)
      continue
    }
    const temNoAparelho = p === 'biblioteca-tptp' ? biblioteca.catalogo.length > 0 : biblioteca.problemas.length > 0
    if (!forcar && temNoAparelho && instalados[p] === v.gerado) {
      r.jaTinha.push(p)
      continue
    }
    progresso?.(`baixando ${p} do site (${(v.bytes / 1e6).toFixed(1)} MB)…`)
    const resp = await fetch(`tptp/${p}.jsonl.gz`)
    if (!resp.ok) {
      r.faltaram.push(p)
      continue
    }
    const blob = await resp.blob()
    progresso?.(`instalando ${p}…`)
    await biblioteca.abrirPacote(new File([blob], `${p}.jsonl.gz`))
    instalados[p] = v.gerado
    await gravarConfig(CHAVE_INSTALADOS, instalados).catch(() => {})
    r.instalados.push(p)
  }
  return r
}

/** "biblioteca e problemas do TPTP instalados" etc., para avisar na tela */
export function descreverInstalacao(r: Instalacao): string {
  const nome = (p: PacoteDoSite) => (p === 'biblioteca-tptp' ? 'a biblioteca do TPTP' : 'os problemas do TPTP')
  const partes: string[] = []
  if (r.instalados.length) partes.push(`${r.instalados.map(nome).join(' e ')}: baixado${r.instalados.length > 1 ? 's' : ''} e instalado${r.instalados.length > 1 ? 's' : ''}`)
  if (r.jaTinha.length) partes.push(`${r.jaTinha.map(nome).join(' e ')}: já estava${r.jaTinha.length > 1 ? 'm' : ''} no aparelho`)
  if (r.faltaram.length) partes.push(`${r.faltaram.map(nome).join(' e ')}: o site não respondeu (tente de novo na Biblioteca TPTP, em Mundo)`)
  return partes.join('; ')
}
