import type { ResultadoTarefa } from '../dados/verificacao'
import type { Nota } from '../dados/tipos'
import { limiteTexto, nomeMundo, tamanhoTexto, type PassoExplicacao } from '../motor/avaliar'
import type { ExplicacaoConflito, Grupo, Modelo } from '../motor/motor'
import { ConfirmacaoZ3 } from './ConfirmacaoZ3'
import { paraSubscrito } from '../logica/impressao'
import { FormulaExibida } from './FormulaExibida'

const el = (d: number) => `d${paraSubscrito(String(d + 1)) ?? d + 1}`
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Fórmulas (como o motor as recebeu) dos grupos indicados; sem `ids`, de todos. */
export const formulasDosGrupos = (grupos: Grupo[], ids?: string[]) =>
  grupos.filter((g) => !ids || ids.includes(g.id)).flatMap((g) => g.formulas)

export function ResultadoVerificacao({
  r,
  notas,
  desatualizado,
  grupos,
}: {
  r: ResultadoTarefa
  notas: Nota[]
  desatualizado: boolean
  grupos: Grupo[]
}) {
  const meta = (
    <div class="suave res-meta">
      {hora(r.quando)} · N = {r.N}
      {r.ms > 0 && ` · ${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}`}
      {desatualizado && <span class="selo aviso"> desatualizado — as notas mudaram</span>}
    </div>
  )

  if (r.erro)
    return (
      <div class="resultado res-erro">
        <strong>Falha no motor</strong>
        <p>{r.erro}</p>
        {meta}
      </div>
    )

  const res = r.resultado!
  switch (res.tipo) {
    case 'vazio':
      return (
        <div class="resultado">
          <strong>Nada para verificar</strong>
          <p class="suave">Não há fórmulas válidas em notas ativas deste conjunto.</p>
          {meta}
        </div>
      )
    case 'consistente':
      return (
        <div class="resultado res-ok">
          <strong>✓ Consistente</strong>
          <p>
            Encontrei um cenário com {tamanhoTexto(res.n, res.modelo.mundos)} em que todas as fórmulas valem ao mesmo tempo.
          </p>
          {meta}
          <details>
            <summary>Ver o modelo</summary>
            <ModeloVisual m={res.modelo} />
          </details>
        </div>
      )
    case 'grande-demais':
      return (
        <div class="resultado res-aviso">
          <strong>Grande demais para a versão 1</strong>
          <p>
            {res.n > 1 ? `Não há modelo com até ${res.n - 1} objeto${res.n > 2 ? 's' : ''}. ` : ''}
            Com {res.n} objetos o problema aterrado passou do limite de tamanho, e a busca parou sem conclusão. Diminua N ou simplifique as
            fórmulas com muitos quantificadores aninhados.
          </p>
          {!desatualizado && <ConfirmacaoZ3 tipo="conjunto" formulas={formulasDosGrupos(grupos)} />}
          {meta}
        </div>
      )
    case 'sem-modelo': {
      const conflito = res.conflito.map((id) => notas.find((n) => n.id === id)).filter((n): n is Nota => !!n)
      return (
        <div class="resultado res-conflito">
          <strong>⚠ Sem modelo até {limiteTexto(res.N, res.K)} — provável contradição</strong>
          <p class="suave">
            Isto não é prova absoluta: nenhum cenário com até {limiteTexto(res.N, res.K)} satisfaz tudo, mas um cenário maior (ou infinito)
            ainda poderia. Aumentar N reforça a suspeita; o Z3 pode provar de vez.
          </p>
          <p>
            Menor conjunto de notas em conflito ({conflito.length}) — tirando qualquer uma delas, aparece um modelo:
          </p>
          <ul class="lista-conflito">
            {conflito.map((n) => (
              <li>
                <a href={`#/nota/${encodeURIComponent(n.id)}`}>{n.titulo || 'Sem título'}</a>
                {n.formulas
                  .filter((f) => f.trim())
                  .map((f) => (
                    <FormulaExibida texto={f} />
                  ))}
                {(res.explicacoes ?? [])
                  .filter((e) => e.grupoId === n.id)
                  .map((e) => (
                    <details class="explicacao">
                      <summary>{conflito.length > 1 ? 'Por que esta nota é necessária?' : 'Por que esta nota se contradiz?'}</summary>
                      <Explicacao e={e} />
                    </details>
                  ))}
              </li>
            ))}
          </ul>
          {!desatualizado && <ConfirmacaoZ3 tipo="conflito" formulas={formulasDosGrupos(grupos, res.conflito)} />}
          {meta}
        </div>
      )
    }
  }
}

/** Explicação de por que uma nota participa do conflito. */
function Explicacao({ e }: { e: ExplicacaoConflito }) {
  switch (e.tipo) {
    case 'mundo':
      return (
        <div>
          <p>
            Sem ela, as outras notas do conflito valem num cenário com {tamanhoTexto(e.n, e.modelo.mundos)}. Nesse cenário, esta fórmula
            falha:
          </p>
          <ArvorePassos p={e.passos} />
          <details>
            <summary>Ver esse cenário</summary>
            <ModeloVisual m={e.modelo} />
          </details>
        </div>
      )
    case 'sozinha':
      return (
        <div>
          <p>Esta nota não tem modelo nem sozinha. {e.formulas.length > 1 ? 'O conflito está entre estas fórmulas dela:' : 'A fórmula:'}</p>
          {e.formulas.map((f) => (
            <FormulaExibida texto={f} />
          ))}
          {e.explicacoes.map((sub) =>
            sub.tipo === 'mundo' ? (
              <div class="explicacao-sub">
                <p>
                  Sem <span class="formula-inline">{sub.formula}</span>, as outras valem num cenário com {tamanhoTexto(sub.n, sub.modelo.mundos)}, e nele ela
                  falha:
                </p>
                <ArvorePassos p={sub.passos} />
              </div>
            ) : null,
          )}
        </div>
      )
    case 'indisponivel':
      return <p class="suave">Não foi possível montar a explicação (o problema ficou grande demais).</p>
  }
}

/** Árvore de passos: fórmula, valor e motivo; os filhos mostram de onde vem o valor. */
export function ArvorePassos({ p }: { p: PassoExplicacao }) {
  return (
    <ul class="arvore">
      <li>
        <span class={`valor ${p.valor ? 'v' : 'f'}`}>{p.valor ? 'V' : 'F'}</span>
        <span class="formula-inline">{p.formula}</span>
        {(p.mundo ?? 0) > 0 && <span class="selo-mundo">em {nomeMundo(p.mundo)}</span>}
        <span class="motivo"> — {p.motivo}</span>
        {p.filhos.length > 0 && p.filhos.map((f) => <ArvorePassos p={f} />)}
      </li>
    </ul>
  )
}

export function ModeloVisual({ m }: { m: Modelo }) {
  const D = [...Array(m.n).keys()]
  const W = [...Array(m.mundos ?? 1).keys()]
  const varios = W.length > 1
  const nomes = new Map<number, string[]>()
  for (const c of m.constantes) nomes.set(c.valor, [...(nomes.get(c.valor) ?? []), c.nome])
  const membros = (b: number, w: number) => m.pertence.filter(([, y, z]) => y === b && (z ?? 0) === w).map(([a]) => a)

  const fatosDoMundo = (w: number) => (
    <>
      <h4>{varios ? `Elementos no mundo ${nomeMundo(w)}${w === 0 ? ' (real)' : ''}` : 'Objetos'}</h4>
      <ul>
        {D.map((d) => (
          <li>
            <b>{el(d)}</b>
            {nomes.has(d) && <> = {nomes.get(d)!.join(' = ')}</>}
            <span class="suave">
              {' '}
              · elementos: {membros(d, w).length ? `{${membros(d, w).map(el).join(', ')}}` : '{ }'}
            </span>
          </li>
        ))}
      </ul>
      {m.funcoes.map((f) => (
        <>
          <h4>
            Função {f.nome}
            {varios ? ` em ${nomeMundo(w)}` : ''}
          </h4>
          <ul class="em-linha">
            {f.tabela
              .filter((x) => (x.w ?? 0) === w)
              .map((x) => (
                <li>
                  {f.nome}({x.args.map(el).join(', ')}) = {el(x.valor)}
                </li>
              ))}
          </ul>
        </>
      ))}
      {m.predicados.map((p) => {
        const vs = p.verdadeiros.filter((a) => (a.w ?? 0) === w).map((a) => a.args)
        return (
          <>
            <h4>
              Predicado {p.nome}
              {p.aridade === 0 ? '' : `/${p.aridade}`}
              {varios ? ` em ${nomeMundo(w)}` : ''}
            </h4>
            <p>
              {p.aridade === 0
                ? vs.length
                  ? 'verdadeiro'
                  : 'falso'
                : vs.length
                  ? `vale para: ${vs.map((a) => (a.length === 1 ? el(a[0]) : `(${a.map(el).join(', ')})`)).join(', ')}`
                  : 'não vale para nenhum objeto'}
            </p>
          </>
        )
      })}
    </>
  )

  return (
    <div class="modelo">
      {varios && (
        <p class="suave">
          {W.length} mundos possíveis: {nomeMundo(0)} é o real. Os objetos e as constantes são os mesmos em todos; o que pertence a quem, os
          predicados e as funções podem mudar de um mundo para outro.
        </p>
      )}
      {W.map((w) => (
        <div class={varios ? 'mundo' : ''}>{fatosDoMundo(w)}</div>
      ))}
      {(m.acessos ?? []).map((r) => (
        <>
          <h4>Mundos que {r.agente} considera possíveis</h4>
          <ul class="em-linha">
            {W.map((w) => (
              <li>
                de {nomeMundo(w)}:{' '}
                {r.pares
                  .filter(([a]) => a === w)
                  .map(([, b]) => nomeMundo(b))
                  .join(', ') || '—'}
              </li>
            ))}
          </ul>
        </>
      ))}
      <p class="suave">
        Valores de função que não aparecem nas tabelas não afetam nenhuma fórmula. Predicados e ∈ valem só onde está indicado.
      </p>
    </div>
  )
}
