import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { useEstado } from '../dados/estado'
import { aprovarLei, textoDaLei } from '../dados/lacunas'
import type { FormulaDeNota } from '../dados/premissas'
import { assinaturaLacuna, useVerificacao } from '../dados/verificacao'
import type { LeiSugerida } from '../motor/lacunas'
import type { Grupo } from '../motor/motor'
import type { Tarefa } from '../motor/tarefas'
import { ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { ArvorePassos, formulasDosGrupos } from './ResultadoVerificacao'

/**
 * Para um teorema que não segue: procura leis que o fariam seguir sem
 * contradizer as leis e fatos, explica cada uma e deixa aprovar.
 */
export function LeisQueFaltam({
  t,
  id,
  geral,
  inativas,
  pronto,
  onAprovada,
}: {
  t: FormulaDeNota
  id: string
  geral: Tarefa
  inativas: Grupo[]
  pronto: boolean
  onAprovada: () => void
}) {
  const est = useEstado()
  const ver = useVerificacao()
  const r = ver.lacunas.get(id)
  const rodando = ver.lacunaRodando === id
  const desatualizado = !!r && r.assinatura !== assinaturaLacuna(geral, est.dicionario, ver.limites, t.texto, inativas)
  const titulo = (nid: string) => est.notas.find((n) => n.id === nid)?.titulo || 'Sem título'
  const tituloTeorema = titulo(t.notaId)
  const links = (ids: string[]) =>
    ids.map((nid, k) => (
      <>
        {k > 0 && ', '}
        <a href={`#/nota/${encodeURIComponent(nid)}`}>{titulo(nid)}</a>
      </>
    ))

  const procurar = () => ver.procurarLeis(geral, id, t.texto, inativas, est.dicionario)

  const botao = rodando ? (
    <div class="barra-acoes">
      <span class="girando" aria-hidden="true" />
      <span class="suave" aria-live="polite">
        {ver.rodando?.msg ?? 'procurando'}…
      </span>
      <button type="button" class="mini" onClick={() => ver.cancelar()}>
        Cancelar
      </button>
    </div>
  ) : (
    <div class="barra-acoes">
      <button type="button" class="mini" disabled={!pronto || (!!ver.ocupado && !rodando)} onClick={procurar}>
        {r ? 'Procurar de novo' : '🔎 Procurar a lei que falta'}
      </button>
      {r && desatualizado && <span class="selo aviso">desatualizado — as notas mudaram</span>}
    </div>
  )

  const res = r?.resultado
  return (
    <div class="lacunas">
      {botao}
      {r && !rodando && r.erro && <p class="erro-texto">Falha no motor: {r.erro}</p>}
      {res && !rodando && (
        <>
          {res.tipo === 'ja-segue' && <p class="status-ok">✓ Com as notas atuais o teorema já segue. Clique em "Conferir" acima.</p>}
          {res.tipo === 'contradiz' && (
            <p class="erro-texto">
              As leis e fatos contradizem este teorema ({links(res.notas)}). Nenhuma lei nova resolve isso sem criar contradição: é preciso rever o
              teorema ou essas notas.
            </p>
          )}
          {res.tipo === 'premissas-contraditorias' && <p class="erro-texto">As leis e fatos já se contradizem: resolva isso primeiro.</p>}
          {res.tipo === 'grande-demais' && (
            <p class="aviso-texto">
              Grande demais para o motor finito: com {res.n} objetos o problema passa do limite deste aparelho. Desative as notas mais pesadas, ou ligue
              o Z3 (ele não tem esse limite).
            </p>
          )}
          {res.tipo === 'formula-invalida' && <p class="erro-texto">Fórmula inválida.</p>}
          {res.tipo === 'sugestoes' && (
            <>
              <p class="suave">
                {res.itens.length
                  ? `${res.itens.length === 1 ? 'Esta lei fecha' : 'Cada uma destas leis fecha'} o teorema sem contradizer as leis e fatos ativos (testei ${res.testadas} candidatas, em cenários até ${res.N} objetos). Aprove a que fizer sentido:`
                  : `Nenhuma lei simples fecha o teorema (testei ${res.testadas} candidatas). Se você tem certeza dele, pode transformá-lo em lei por decisão (grau D).`}
                {res.incertas > 0 && ` ${res.incertas} candidata${res.incertas > 1 ? 's ficaram' : ' ficou'} sem resposta (grande demais).`}
              </p>
              <ul class="lista-leis-sugeridas">
                {res.itens.map((s) => (
                  <CartaoLei
                    s={s}
                    teorema={tituloTeorema}
                    N={res.N}
                    K={res.K}
                    chave={geral.chave}
                    grupos={geral.grupos}
                    negar={t.texto}
                    desatualizado={desatualizado}
                    onAprovada={onAprovada}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Uma lei sugerida: o que diz, de onde o teorema passa a seguir, por que faltava, o texto da nota e o botão de aprovar. */
export function CartaoLei({
  s,
  teorema,
  N,
  K,
  chave,
  grupos,
  negar,
  desatualizado,
  onAprovada,
  extra,
}: {
  s: LeiSugerida
  /** título do(s) teorema(s) que ela fecha, para o texto da nota */
  teorema: string
  N: number
  K: number
  chave: string
  grupos: Grupo[]
  /** fórmula do teorema (para a segunda opinião do Z3) */
  negar: string
  desatualizado: boolean
  onAprovada: () => void
  /** linha extra (ex.: quais teoremas ela fecha) */
  extra?: ComponentChildren
}) {
  const est = useEstado()
  const [aprovada, setAprovada] = useState<string | null>(null)
  const titulo = (nid: string) => est.notas.find((n) => n.id === nid)?.titulo || 'Sem título'
  return (
    <li>
      <div>
        <strong>{s.nome}</strong> {s.notaId && <span class="selo">nota desativada do caderno</span>}{' '}
        {s.equivalente && <span class="selo aviso">equivale ao teorema</span>}
      </div>
      <div class="formula-inline">{s.formula}</div>
      {!s.notaId && <div>{s.leitura}</div>}
      {extra}
      <div class="suave">
        Com ela, o teorema segue{' '}
        {s.notas.length ? (
          <>
            de{' '}
            {s.notas.map((nid, k) => (
              <>
                {k > 0 && ', '}
                <a href={`#/nota/${encodeURIComponent(nid)}`}>{titulo(nid)}</a>
              </>
            ))}{' '}
            e desta lei
          </>
        ) : (
          'só desta lei'
        )}
        .
      </div>
      {s.equivalente && <div class="aviso-texto">Dadas as outras leis, esta lei equivale ao próprio teorema: aprová-la é assumir o teorema.</div>}
      <details class="explicacao">
        <summary>Por que faltava</summary>
        <p class="suave">Num cenário em que todas as leis e fatos valem e o teorema falha, esta lei é falsa — é exatamente isso que ela proíbe:</p>
        <ArvorePassos p={s.porque} />
      </details>
      <details class="explicacao">
        <summary>Texto que vai na nota</summary>
        <pre class="texto-lei">{textoDaLei(s, teorema, N, K)}</pre>
      </details>
      {!desatualizado && <ConfirmacaoZ3 tipo="segue" formulas={[...formulasDosGrupos(grupos, s.notas), s.formula]} negar={negar} />}
      {aprovada ? (
        <span class="status-ok">
          ✓ <a href={`#/nota/${encodeURIComponent(aprovada)}`}>Aprovada</a> — conferindo de novo
        </span>
      ) : (
        <button
          type="button"
          class="primario mini"
          disabled={desatualizado}
          onClick={async () => {
            const n = await aprovarLei(s, teorema, N, K, chave)
            setAprovada(n.id)
            onAprovada()
          }}
        >
          {s.notaId ? 'Aprovar: ativar esta nota' : chave.startsWith('visao:') ? 'Aprovar na visão' : 'Aprovar como Lei'}
        </button>
      )}
    </li>
  )
}
