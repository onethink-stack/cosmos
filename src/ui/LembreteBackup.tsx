import { diasDesde, precisaLembrete } from '../dados/backup'
import { useEstado } from '../dados/estado'
import { exportarBackup } from './Backup'

export function LembreteBackup() {
  const est = useEstado()
  if (!est.carregado) return null
  const mostrar = precisaLembrete({
    agora: Date.now(),
    ultimoBackup: est.ultimoBackup,
    adiadoAte: est.adiadoAte,
    primeiroUso: est.primeiroUso,
    temDados: est.notas.length > 0 || est.dicionario.length > 0,
  })
  if (!mostrar) return null
  const dias = diasDesde(est.ultimoBackup ?? est.primeiroUso)
  return (
    <div class="faixa-lembrete" role="status">
      <span>
        {est.ultimoBackup ? `Último backup há ${dias} dias.` : 'Você ainda não fez backup.'} Os dados ficam só neste aparelho.
      </span>
      <span class="faixa-botoes">
        <button type="button" class="primario mini" onClick={exportarBackup}>
          Baixar backup
        </button>
        <button type="button" class="mini" onClick={() => est.adiarLembrete(1)}>
          Amanhã
        </button>
      </span>
    </div>
  )
}
