import { useEffect, useState } from 'preact/hooks'
import { criarBackup, diasDesde, lerBackup, mesclarDicionario, mesclarPorId, nomeArquivo, type Backup as DadosBackup } from '../dados/backup'
import { estado, useEstado } from '../dados/estado'
import { useVerificacao, verificacao } from '../dados/verificacao'
import { Offline } from './Offline'

/** Baixa o backup como arquivo .json e registra a data. */
export async function exportarBackup() {
  const b = criarBackup(estado.notas, estado.dicionario, verificacao.N)
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  await estado.registrarBackup()
}

const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const resumo = (notas: number, fichas: number) => `${contar(notas, 'nota', 'notas')} e ${contar(fichas, 'ficha', 'fichas')}`

const dataHora = (ms: number | string) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function Backup() {
  const est = useEstado()
  const ver = useVerificacao()
  const [lido, setLido] = useState<{ backup: DadosBackup; avisos: string[]; nome: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [persistente, setPersistente] = useState<boolean | null>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersistente, () => setPersistente(null))
  }, [])

  const escolher = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const arq = input.files?.[0]
    input.value = ''
    setFeito(null)
    if (!arq) return
    const r = lerBackup(await arq.text())
    if (!r.ok) {
      setErro(r.erro)
      setLido(null)
      return
    }
    setErro(null)
    setLido({ backup: r.backup, avisos: r.avisos, nome: arq.name })
  }

  const aplicarN = (b: DadosBackup) => {
    if (b.config.N) ver.definirN(b.config.N)
  }

  const substituir = async () => {
    if (!lido) return
    const b = lido.backup
    if (!confirm(`Substituir TUDO o que está neste aparelho (${resumo(est.notas.length, est.dicionario.length)}) pelo conteúdo do backup? Isto não pode ser desfeito.`))
      return
    await est.substituirTudo(b.notas, b.dicionario)
    aplicarN(b)
    setLido(null)
    setFeito(`Importado: ${resumo(b.notas.length, b.dicionario.length)}.`)
  }

  const mesclar = async () => {
    if (!lido) return
    const b = lido.backup
    await est.substituirTudo(mesclarPorId(est.notas, b.notas), mesclarDicionario(est.dicionario, b.dicionario))
    aplicarN(b)
    setLido(null)
    setFeito(`Mesclado: ${resumo(b.notas.length, b.dicionario.length)} do backup (novas ou atualizadas).`)
  }

  const pedirPersistencia = async () => {
    const ok = await navigator.storage?.persist?.()
    setPersistente(!!ok)
  }

  return (
    <>
    <Offline />
    <section>
      <h2>Backup: exportar</h2>
      <p>
        Todos os dados ficam só neste aparelho. Baixe um backup de vez em quando e guarde-o em outro lugar (nuvem, e-mail, computador).
      </p>
      <p class="suave">
        {est.ultimoBackup
          ? `Último backup: ${dataHora(est.ultimoBackup)} (há ${diasDesde(est.ultimoBackup)} dia${diasDesde(est.ultimoBackup) === 1 ? '' : 's'}).`
          : 'Nenhum backup feito ainda neste aparelho.'}{' '}
        Lembrete a cada 7 dias.
      </p>
      <button type="button" class="primario" onClick={exportarBackup}>
        Baixar backup (.json) — {resumo(est.notas.length, est.dicionario.length)}
      </button>

      <h2>Backup: importar</h2>
      <label class="botao-arquivo">
        <input type="file" accept=".json,application/json" onChange={escolher} />
        Escolher arquivo de backup…
      </label>
      {erro && <p class="erro-texto">{erro}</p>}
      {feito && <p class="status-ok">✓ {feito}</p>}
      {lido && (
        <div class="resultado">
          <strong>{lido.nome}</strong>
          <p>
            {resumo(lido.backup.notas.length, lido.backup.dicionario.length)}
            {lido.backup.exportadoEm && `, exportado em ${dataHora(lido.backup.exportadoEm)}`}.
          </p>
          {lido.avisos.length > 0 && (
            <ul class="aviso-texto">
              {lido.avisos.map((a) => (
                <li>{a}</li>
              ))}
            </ul>
          )}
          <div class="barra-acoes">
            <button type="button" class="primario" onClick={mesclar}>
              Mesclar
            </button>
            <button type="button" class="perigo" onClick={substituir}>
              Substituir tudo
            </button>
            <button type="button" class="discreto" onClick={() => setLido(null)}>
              Cancelar
            </button>
          </div>
          <p class="suave">
            <b>Mesclar</b>: notas e fichas do backup entram; as de mesma identificação (ou mesmo símbolo) são atualizadas; as demais deste
            aparelho ficam. <b>Substituir tudo</b>: apaga o que está aqui e deixa só o backup.
          </p>
        </div>
      )}

      <h2>Armazenamento</h2>
      {persistente === true && <p class="status-ok">✓ O navegador marcou estes dados como persistentes (não serão apagados para liberar espaço).</p>}
      {persistente === false && (
        <p>
          O navegador pode apagar dados de sites para liberar espaço.{' '}
          <button type="button" class="mini" onClick={pedirPersistencia}>
            Pedir armazenamento persistente
          </button>
          <span class="suave"> Instalar o app na tela inicial também ajuda.</span>
        </p>
      )}
    </section>
    </>
  )
}
