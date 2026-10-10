import { useAvisos } from '../dados/avisos'
import { useVerificacao, type Ocupacao } from '../dados/verificacao'

const NOME_TRABALHO: Record<Ocupacao, string> = {
  verificar: 'verificando',
  perguntar: 'respondendo',
  descobrir: 'descobrindo',
  teoremas: 'conferindo teoremas',
  lacunas: 'procurando a lei que falta',
  cadeia: 'reação em cadeia',
}

/** No topo, em qualquer tela: o motor está trabalhando (toque para ver). */
export function MotorOcupado() {
  const ver = useVerificacao()
  if (!ver.ocupado) return null
  const rota = ver.ocupado === 'cadeia' ? '#/cadeia' : '#/contradicoes'
  return (
    <a class="motor-ocupado" href={rota} title={ver.rodando?.msg}>
      <span class="girando" aria-hidden="true" /> {NOME_TRABALHO[ver.ocupado]}…
    </a>
  )
}

/** Avisos dentro do app quando o motor termina enquanto você está em outra tela. */
export function AvisosNaTela() {
  const av = useAvisos()
  if (!av.lista.length) return null
  return (
    <div class="avisos-na-tela" role="status" aria-live="polite">
      {av.lista.map((a) => (
        <div class="aviso-na-tela">
          <a href={a.rota} onClick={() => av.fechar(a.id)}>
            <strong>{a.titulo}</strong>
            <span>{a.corpo}</span>
          </a>
          <button type="button" class="discreto" aria-label="Fechar aviso" onClick={() => av.fechar(a.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Opções: notificações do sistema e tela acesa enquanto calcula. */
export function ConfigSegundoPlano() {
  const av = useAvisos()
  const perm = av.permissao()
  const temWakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  return (
    <details class="config-segundo-plano">
      <summary>🔔 Avisos e segundo plano{av.notificar ? ' — avisos ligados' : ''}</summary>
      <p class="suave">
        O motor continua trabalhando enquanto você usa as outras telas do app, e avisa quando termina. Com o app minimizado, o celular pode
        pausá-lo depois de um tempo; se o sistema fechar o app no meio de uma reação em cadeia, ela recomeça sozinha quando você abrir de novo.
      </p>
      <label class="alternar">
        <input
          type="checkbox"
          checked={av.notificar}
          disabled={perm === 'indisponivel' || perm === 'denied'}
          onChange={(e) => ((e.target as HTMLInputElement).checked ? void av.ligarNotificacoes() : av.desligarNotificacoes())}
        />
        Notificar quando o motor achar algo (com o app em segundo plano)
      </label>
      {perm === 'denied' && (
        <p class="aviso-texto">
          O navegador está bloqueando as notificações deste site. Libere em: configurações do navegador → Configurações do site → Notificações.
        </p>
      )}
      {perm === 'indisponivel' && <p class="aviso-texto">Este navegador não tem notificações. No celular, use o app instalado.</p>}
      <label class="alternar">
        <input type="checkbox" checked={av.telaAcesa} disabled={!temWakeLock} onChange={(e) => av.definirTelaAcesa((e.target as HTMLInputElement).checked)} />
        Manter a tela acesa enquanto o motor calcula (o celular não bloqueia no meio)
      </label>
      {!temWakeLock && <p class="suave">Este navegador não permite manter a tela acesa.</p>}
    </details>
  )
}
