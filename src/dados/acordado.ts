// Manter a tela acesa enquanto a reação em cadeia roda no modo de horas: no
// celular, com a tela apagada, o navegador congela a aba e o motor para.
// (Wake Lock API; onde não há, o app só avisa para deixar a tela ligada.)

interface Trava {
  release(): Promise<void>
  addEventListener(tipo: 'release', fn: () => void): void
}

let trava: Trava | null = null
let querAcordado = false

async function pedir() {
  const wl = (navigator as Navigator & { wakeLock?: { request(tipo: 'screen'): Promise<Trava> } }).wakeLock
  if (!wl || trava || !querAcordado || document.visibilityState !== 'visible') return
  try {
    trava = await wl.request('screen')
    trava.addEventListener('release', () => (trava = null))
  } catch {
    trava = null // sem permissão (bateria fraca, aba escondida): fica sem
  }
}

// ao voltar para a aba, a trava (solta pelo navegador quando a aba some) é pedida de novo
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => void pedir())

/** liga (ou desliga) a tela acesa; pode ser chamada à vontade: só muda quando precisa */
export function manterAcordado(sim: boolean) {
  if (sim === querAcordado) return
  querAcordado = sim
  if (sim) void pedir()
  else if (trava) {
    void trava.release().catch(() => {})
    trava = null
  }
}

/** este navegador consegue manter a tela acesa? */
export const podeManterAcordado = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator
