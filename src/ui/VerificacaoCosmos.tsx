import { useEffect, useState } from 'preact/hooks'
import { conferirFaseCosmos, verificarHashTeoria } from '../motor/cadeiaCosmos'
import { add, mul, qsqrt2, toString } from '../motor/qsqrt2'

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
  useEffect(() => {
    let ativo = true
    void verificarHashTeoria(fase).then((valido) => { if (ativo) setHash(valido ? '✓ hash_teoria confere' : '✕ hash_teoria divergente') }).catch(() => { if (ativo) setHash('Hash não verificado: SHA-256 indisponível') })
    return () => { ativo = false }
  }, [fase])
  const raiz = qsqrt2(0, 1)
  const conta = fase.id === 'F2' ? `${toString(raiz)} × ${toString(raiz)} = ${toString(mul(raiz, raiz))}`
    : fase.id === 'F3' ? `1 + (0 + 1√2) = ${toString(add(qsqrt2(1, 0), raiz))}`
    : fase.id === 'F4' ? `1 + (1 + 1√2) = ${toString(add(qsqrt2(1, 0), qsqrt2(1, 1)))}` : null
  return <section class="cosmos-motor" aria-label={`Verificação da fase ${fase.id}`}>
    <h3>Motor Cosmos</h3>
    <p>{conferencia.valida ? '✓ Metadados válidos' : '✕ Metadados inválidos'} · {conferencia.campos13Validos ? '13 campos conferidos' : 'campos divergentes'}</p>
    <p role="status">{hash}</p>
    <p>Afirmação declarada: <strong>{String(fase.afirmacao)}</strong></p>
    {conta && <p>Conta exata em ℚ(√2): <code>{conta}</code></p>}
    <p class="cosmos-assinatura-pendente"><strong>C1–C8 cadeia-v1:</strong> não verificado: faltam elos assinados</p>
    <p class="suave">Hash e vocabulário não comprovam consistência lógica nem assinatura.</p>
    {!conferencia.valida && <ul role="alert">{conferencia.erros.map((erro) => <li key={erro}>{erro}</li>)}</ul>}
  </section>
}
