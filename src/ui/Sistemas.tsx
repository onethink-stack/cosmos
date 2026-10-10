import { useState } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { carregarSistema, NENHUM, notasPresentes, removerSistema, SISTEMAS, type Sistema } from '../dados/sistemas'

/** Sistemas prontos que vêm dentro do app: carregar, restaurar, remover e escolher o padrão. */
export function Sistemas() {
  const est = useEstado()
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = async (s: Sistema, restaurar: boolean) => {
    if (restaurar && !confirm(`Restaurar as notas do sistema "${s.nome}" ao original? Mudanças que você fez nelas serão desfeitas.`)) return
    await carregarSistema(s)
    setAviso(`${s.nome}: ${s.notas('').length} notas e ${s.dicionario.length} fichas no caderno.`)
  }

  const remover = async (s: Sistema) => {
    if (!confirm(`Tirar do caderno as notas do sistema "${s.nome}"? As fichas do dicionário ficam. Você pode carregar de novo quando quiser.`)) return
    await removerSistema(s)
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
        Conjuntos de notas e fichas que vêm dentro do app. Carregar de novo não duplica: as notas do sistema voltam ao original e o resto do
        seu caderno fica como está.
      </p>
      {aviso && <p class="status-ok">✓ {aviso}</p>}

      <ul class="lista-sistemas">
        {SISTEMAS.map((s) => {
          const total = s.notas('').length
          const presentes = notasPresentes(s, est.notas).length
          return (
            <li class="cartao c-lei">
              <div class="cartao-link">
                <div class="cartao-topo">
                  {est.sistemaPadrao === s.id && <span class="selo c-lei">padrão</span>}
                  <span class="suave">
                    {total} notas · {s.dicionario.length} fichas · {presentes ? `${presentes} de ${total} no caderno` : 'fora do caderno'}
                  </span>
                </div>
                <strong class="cartao-titulo">{s.nome}</strong>
                <p>{s.descricao}</p>
                <div class="barra-acoes">
                  {presentes ? (
                    <>
                      <button type="button" onClick={() => carregar(s, true)}>
                        Restaurar originais
                      </button>
                      <button type="button" class="discreto perigo" onClick={() => remover(s)}>
                        Remover do caderno
                      </button>
                    </>
                  ) : (
                    <button type="button" class="primario" onClick={() => carregar(s, false)}>
                      Carregar no caderno
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <h2>Caderno novo começa com</h2>
      <p class="suave">Na primeira vez que o app abre num aparelho ou navegador, o sistema escolhido aqui já vem carregado.</p>
      <div class="segmentado" role="radiogroup">
        {SISTEMAS.map((s) => (
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
    </section>
  )
}
