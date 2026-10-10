import { useVerificacao } from '../dados/verificacao'

/** Linha curta no editor com o resultado da verificação feita ao salvar. */
export function StatusVerificacao({ chave, bloqueado }: { chave: string | null; bloqueado: boolean }) {
  const ver = useVerificacao()
  if (!chave) return null
  if (bloqueado)
    return (
      <div class="status-ver res-aviso">
        Há nomes sem ficha confirmada; o motor não rodou. <a href="#/contradicoes">Confirmar nomes</a>
      </div>
    )
  if (ver.rodando?.chave === chave && !ver.perguntando)
    return (
      <div class="status-ver res-rodando" aria-live="polite">
        <span class="girando" aria-hidden="true" /> Verificando contradições: {ver.rodando.msg}…
      </div>
    )
  const r = ver.resultados.get(chave)
  if (!r) return null
  const res = r.resultado
  if (!res || r.erro)
    return <div class="status-ver res-erro">Falha no motor: {r.erro}</div>
  if (res.tipo === 'consistente')
    return (
      <div class="status-ver res-ok">
        ✓ Consistente (modelo com {res.n} objeto{res.n > 1 ? 's' : ''}). <a href="#/contradicoes">Ver</a>
      </div>
    )
  if (res.tipo === 'sem-modelo')
    return (
      <div class="status-ver res-conflito">
        ⚠ Sem modelo até {res.N} objetos — provável contradição entre {res.conflito.length} nota{res.conflito.length > 1 ? 's' : ''}.{' '}
        <a href="#/contradicoes">Ver conflito</a>
      </div>
    )
  if (res.tipo === 'grande-demais')
    return (
      <div class="status-ver res-aviso">
        Grande demais para a versão 1. <a href="#/contradicoes">Detalhes</a>
      </div>
    )
  return null
}
