import { instalar, podeInstalar, rodandoInstalado, useInstalacao } from '../dados/instalacao'
import { disponibilidadeZ3, useZ3 } from '../dados/z3'

/** Seção "Usar offline": instalar, baixar o arquivo único e guardar o Z3 no aparelho. */
export function Offline() {
  useInstalacao()
  const z = useZ3()

  if (__MODO_ARQUIVO__)
    return (
      <section>
        <h2>Usar offline</h2>
        <p class="status-ok">✓ Você está usando o arquivo único: ele já funciona sem internet, de qualquer pasta.</p>
        <p class="suave">O Z3 (prova sem limite de tamanho, 35 MB) não cabe neste arquivo. Para usá-lo, abra a versão publicada e instale o app.</p>
      </section>
    )

  const disp = disponibilidadeZ3()
  const mb = (b: number) => `${(b / 1_000_000).toFixed(0)} MB`

  return (
    <section class="offline">
      <h2>Usar offline</h2>

      <h3>1. Instalar o app</h3>
      {rodandoInstalado() ? (
        <p class="status-ok">✓ Você está no app instalado. Ele abre e funciona sem internet.</p>
      ) : podeInstalar() ? (
        <>
          <p>Instala na tela inicial: abre como um app e funciona sem internet.</p>
          <button type="button" class="primario" onClick={() => instalar()}>
            Instalar app
          </button>
        </>
      ) : (
        <p class="suave">
          No Chrome do Android: menu ⋮ → <b>Instalar app</b> (ou "Adicionar à tela inicial"). No computador: ícone de instalar na barra de endereço.
          Depois de aberto uma vez, já funciona sem internet.
        </p>
      )}

      <h3>2. Baixar o app num arquivo só</h3>
      <p class="suave">
        Um único arquivo .html (cerca de 170 KB) com tudo dentro. Abra com duplo clique no computador, mesmo sem internet. Os dados dele ficam
        separados dos daqui — leve suas notas com o backup abaixo.
      </p>
      <a class="botao" href="./caderno-logico.html" download="caderno-logico.html">
        ⬇ Baixar caderno-logico.html
      </a>

      <h3>3. Z3 (prova sem limite de tamanho)</h3>
      <p class="suave">
        O motor normal procura cenários de até N objetos: "sem modelo até N" é forte indício, não prova. O Z3 prova de verdade, em qualquer tamanho.
        Ele tem 35 MB e só é baixado se você ligar.
      </p>
      <label class="alternar grande">
        <input type="checkbox" checked={z.ativo} onChange={() => z.definirAtivo(!z.ativo)} />
        Provar com o Z3 os conflitos, as perguntas e as consequências
      </label>
      {!disp.ok && (
        <p class="aviso-texto">
          {disp.motivo}{' '}
          {disp.recarregar && (
            <button type="button" class="mini" onClick={() => location.reload()}>
              Recarregar
            </button>
          )}
        </p>
      )}
      {z.status === 'carregando' && <p class="suave">Carregando o Z3…</p>}
      {z.status === 'pronto' && <p class="status-ok">✓ Z3 pronto.</p>}
      {z.erro && <p class="erro-texto">Z3: {z.erro}</p>}
      {z.guardado ? (
        <p class="status-ok">✓ O Z3 está guardado neste aparelho e funciona sem internet.</p>
      ) : z.download ? (
        <p aria-live="polite">
          Baixando… {mb(z.download.feito)} de {mb(z.download.total)}
          <progress max={z.download.total} value={z.download.feito} />
        </p>
      ) : (
        <button type="button" disabled={!disp.ok} onClick={() => z.baixarParaOffline()}>
          ⬇ Guardar o Z3 no aparelho para usar sem internet (35 MB)
        </button>
      )}
    </section>
  )
}
