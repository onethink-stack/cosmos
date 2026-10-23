import { useEffect, useState } from 'preact/hooks'
import { conferirFaseCosmos, verificarHashTeoria, verificarSelosCosmos, type ResultadoVerificacao } from '../motor/cadeiaCosmos'
import { PACOTE_COSMOS } from '../dados/pacoteCosmos'
import { add, mul, qsqrt2, toString } from '../motor/qsqrt2'
import { conferirElosCosmos, type ConferenciaElosCosmos } from '../motor/elosCosmos'
import elos from '../dados/elos-assinados.json'
import cadeia from '../dados/cadeia-F0-F4.json'
import outras from '../dados/cadeia-outras-F5-F8.json'

const fasesAssinadas = [...cadeia.fases, ...outras.fases]
const conferenciaAssinaturas = conferirElosCosmos(elos, fasesAssinadas)

export function textoCosmos(valor: unknown): string {
  if (valor === null || valor === undefined) return 'Não informado'
  if (Array.isArray(valor)) return valor.length ? valor.join(' / ') : 'Nenhuma'
  if (typeof valor === 'object') {
    const c = valor as { a: number; b: number }
    try { return `${toString(c)} ∈ ℚ(√2)` } catch { return JSON.stringify(valor) }
  }
  return String(valor)
}
export function VerificacaoCosmos({ fase }: { fase: Record<string, unknown> }) {
  const conferencia = conferirFaseCosmos(fase)
  const [hash, setHash] = useState('Verificando hash…')
  const [assinatura, setAssinatura] = useState<ConferenciaElosCosmos | null>(null)
  const [selos, setSelos] = useState<ResultadoVerificacao | null>(null)
  useEffect(() => {
    let ativo = true
    setAssinatura(null)
    setSelos(null)
    void verificarSelosCosmos(fase, PACOTE_COSMOS).then((r) => { if (ativo) setSelos(r) })
    const publicada = fasesAssinadas.find((f) => f.id === fase.id)
    void verificarHashTeoria(fase).then(async (valido) => {
      if (ativo) setHash(valido ? '✓ hash_teoria confere' : '✕ hash_teoria divergente')
      if (publicada) {
        const resultado = await conferenciaAssinaturas
        if (ativo) setAssinatura(valido && conferirFaseCosmos(fase).valida && publicada.hash_teoria === fase.hash_teoria ? resultado : { verificado: false, detalhe: 'Fase atual divergente do conteúdo assinado.', cabeca: null })
      }
    }).catch(() => {
      if (ativo) {
        setHash('Hash não verificado: SHA-256 indisponível')
        setAssinatura({ verificado: false, detalhe: 'C1–C8 não verificado: falha na conferência criptográfica.', cabeca: null })
      }
    })
    return () => { ativo = false }
  }, [fase])
  const raiz = qsqrt2(0, 1)
  const conta = fase.id === 'F2' ? `${toString(raiz)} × ${toString(raiz)} = ${toString(mul(raiz, raiz))}`
    : fase.id === 'F3' ? `1 + (0 + 1√2) = ${toString(add(qsqrt2(1, 0), raiz))}`
    : fase.id === 'F4' ? `1 + (1 + 1√2) = ${toString(add(qsqrt2(1, 0), qsqrt2(1, 1)))}` : null
  return <section class="cosmos-motor" aria-label={`Verificação da fase ${fase.id}`}>
    <h3>Motor Cosmos</h3>
    {selos && <dl class="cosmos-quatro-selos" aria-label="Escopos de verificação">
      <div><dt>Integridade · SHA-256</dt><dd>{selos.integridade}</dd></div>
      <div><dt>Autoria · Ed25519</dt><dd>{selos.assinatura}</dd></div>
      <div><dt>Prova formal</dt><dd>não aplicável à ficha v1</dd></div>
      <div><dt>Timestamp · Bitcoin</dt><dd>{selos.timestamp}</dd></div>
      <div><dt>Conclusão sobre conteúdo</dt><dd>{selos.conclusao}</dd></div>
    </dl>}
    <p>{conferencia.valida ? '✓ Metadados válidos' : '✕ Metadados inválidos'} · {conferencia.campos13Validos ? '13 campos conferidos' : 'campos divergentes'}</p>
    <p role="status">{hash}</p>
    <p>Afirmação declarada: <strong>{String(fase.afirmacao)}</strong></p>
    {conta && <p>Conta exata em ℤ[√2] ⊂ ℚ(√2): <code>{conta}</code></p>}
    <p class={assinatura?.verificado ? 'cosmos-assinatura-verificada' : 'cosmos-assinatura-pendente'} role="status">
      {assinatura ? assinatura.detalhe : fasesAssinadas.some((f) => f.id === fase.id) ? 'Verificando C1–C8 e assinaturas Ed25519…' : 'não verificado: faltam elos assinados'}
    </p>
    {assinatura?.cabeca && <details><summary>Resumo da cadeia assinada</summary><code>{assinatura.cabeca}</code></details>}
    <p class="suave">Assinaturas conferem autoria da chave e integridade dos elos; não provam consistência lógica.</p>
    {!conferencia.valida && <ul role="alert">{conferencia.erros.map((erro) => <li key={erro}>{erro}</li>)}</ul>}
  </section>
}
