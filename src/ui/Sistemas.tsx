import { useState } from 'preact/hooks'
import { SenhaErrada } from '../dados/cripto'
import { useEstado } from '../dados/estado'
import { useBiblioteca } from '../dados/biblioteca'
import { descreverInstalacao } from '../dados/pacotesSite'
import {
  abrirSistema,
  carregarSistema,
  CIFRADOS,
  instalarBibliotecasDoSistema,
  NENHUM,
  notasPresentes,
  removerSistema,
  type SistemaCifrado,
} from '../dados/sistemas'

/** Pede a senha, decifra e carrega o sistema no caderno. */
export function DesbloquearSistema({ s, rotulo, onFeito }: { s: SistemaCifrado; rotulo: string; onFeito?: (msg: string) => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  // o que vem junto e é grande (o TPTP): baixa depois das notas, mostrando o andamento
  const [baixando, setBaixando] = useState<string | null>(null)
  const bib = useBiblioteca()

  const abrir = async (e: Event) => {
    e.preventDefault()
    if (!senha) return
    setAbrindo(true)
    setErro(null)
    try {
      const c = await abrirSistema(s, senha)
      await carregarSistema(c)
      setSenha('')
      const dados = c.conjuntos?.length ? `, ${c.conjuntos.length} conjunto${c.conjuntos.length > 1 ? 's' : ''} de dados no Mundo` : ''
      const msg = `${c.nome}: ${c.notas.length} notas e ${c.dicionario.length} fichas no caderno${dados}.`
      onFeito?.(msg)
      setAbrindo(false)
      if (c.bibliotecas?.length) {
        setBaixando('procurando no site…')
        try {
          const r = await instalarBibliotecasDoSistema(c, setBaixando)
          if (r) onFeito?.(`${msg} ${descreverInstalacao(r)}.`)
        } catch (x) {
          setErro(`O TPTP não foi instalado: ${(x as Error).message}. Tente de novo na Biblioteca TPTP, em Mundo.`)
        }
        setBaixando(null)
      }
    } catch (x) {
      setErro(x instanceof SenhaErrada ? 'Senha incorreta.' : (x as Error).message)
    }
    setAbrindo(false)
  }

  return (
    <form class="desbloquear" onSubmit={abrir}>
      <input
        type="password"
        autocomplete="current-password"
        placeholder={`Senha do ${s.nome}`}
        aria-label={`Senha do ${s.nome}`}
        value={senha}
        onInput={(e) => setSenha((e.target as HTMLInputElement).value)}
      />
      <button type="submit" class="primario" disabled={abrindo || !senha}>
        {abrindo ? 'Abrindo…' : rotulo}
      </button>
      {baixando && (
        <p class="suave">
          {s.nome} traz junto o TPTP: {baixando}
          {bib.abrindo && bib.abrindo.total > 0 && ` ${bib.abrindo.feitas.toLocaleString('pt-BR')} de ${bib.abrindo.total.toLocaleString('pt-BR')}`}
        </p>
      )}
      {erro && <p class="erro-texto">{erro}</p>}
    </form>
  )
}

/** Sistemas que vêm dentro do app: desbloquear, restaurar, remover e escolher o padrão. */
export function Sistemas() {
  const est = useEstado()
  const [aviso, setAviso] = useState<string | null>(null)

  const remover = async (s: SistemaCifrado) => {
    if (!confirm(`Tirar do caderno as notas do "${s.nome}"? As fichas do dicionário ficam. Para carregar de novo, será preciso a senha.`)) return
    await removerSistema(s.id)
    setAviso(`${s.nome}: notas removidas do caderno.`)
  }

  return (
    <section class="sistemas">
      <div class="barra-acoes">
        <a href="#/notas" class="botao discreto">
          ← Notas
        </a>
      </div>
      <h2>Sistemas prontos</h2>
      <p class="suave">
        Sistemas pessoais vêm cifrados: no site e no código só existe o texto embaralhado, e o conteúdo só aparece com a senha. Depois de aberto,
        fica neste aparelho como as outras notas. Carregar de novo não duplica.
      </p>
      {aviso && <p class="status-ok">✓ {aviso}</p>}
      {!CIFRADOS.length && <p class="suave">Nenhum sistema instalado.</p>}

      <ul class="lista-sistemas">
        {CIFRADOS.map((s) => {
          const presentes = notasPresentes(s.id, est.notas).length
          return (
            <li class="cartao c-lei">
              <div class="cartao-link">
                <div class="cartao-topo">
                  <span class="selo">🔒 protegido por senha</span>
                  {est.sistemaPadrao === s.id && <span class="selo c-lei">padrão</span>}
                  <span class="suave">{presentes ? `${presentes} notas no caderno` : 'fora do caderno'}</span>
                </div>
                <strong class="cartao-titulo">{s.nome}</strong>
                <DesbloquearSistema s={s} rotulo={presentes ? 'Restaurar originais' : 'Abrir e carregar'} onFeito={setAviso} />
                {presentes > 0 && (
                  <button type="button" class="discreto perigo" onClick={() => remover(s)}>
                    Remover do caderno
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {CIFRADOS.length > 0 && (
        <>
          <h2>Caderno novo começa com</h2>
          <p class="suave">Na primeira vez que o app abre num aparelho, a tela de Notas já oferece abrir este sistema (pedindo a senha).</p>
          <div class="segmentado" role="radiogroup">
            {CIFRADOS.map((s) => (
              <button
                type="button"
                role="radio"
                aria-checked={est.sistemaPadrao === s.id}
                class={est.sistemaPadrao === s.id ? 'ativo' : ''}
                onClick={() => est.definirSistemaPadrao(s.id)}
              >
                {s.nome}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={est.sistemaPadrao === NENHUM}
              class={est.sistemaPadrao === NENHUM ? 'ativo' : ''}
              onClick={() => est.definirSistemaPadrao(NENHUM)}
            >
              Caderno em branco
            </button>
          </div>
        </>
      )}
    </section>
  )
}
