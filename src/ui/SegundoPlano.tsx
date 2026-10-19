import { useAvisos } from '../dados/avisos'
import { descreverPerfil, detectarPerfil, MEMORIA_ABA, nucleosDisponiveis, PERFIS, usePerfil, type IdPerfil } from '../dados/perfil'
import { estimarEspecificacao, memoriaTexto, quantidadeTexto, type Especificacao as Espec } from '../dados/especificacao'
import { useEstado } from '../dados/estado'
import { useEffect, useState } from 'preact/hooks'
import { useVerificacao, verificacao, type Ocupacao } from '../dados/verificacao'
import { useAgenda } from '../dados/segundoPlano'
import { RECICLAR_Z3_A_CADA, useZ3 } from '../dados/z3'
import { useMotorFundo } from '../dados/motorFundo'

const NOME_TRABALHO: Record<Ocupacao, string> = {
  verificar: 'verificando',
  perguntar: 'respondendo',
  descobrir: 'descobrindo',
  teoremas: 'conferindo teoremas',
  lacunas: 'procurando a lei que falta',
  cadeia: 'reação em cadeia',
  modelo: 'segundo modelo',
}

/** No topo, em qualquer tela: o motor está trabalhando (toque para ver). */
export function MotorOcupado() {
  const ver = useVerificacao()
  if (!ver.ocupado) return null
  const rota = ver.ocupado === 'cadeia' ? '#/cadeia' : ver.ocupado === 'modelo' ? '#/modelo' : '#/contradicoes'
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

/** Opções: notificações do sistema, tela acesa enquanto calcula e o aviso E16. */
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
      <label class="alternar">
        <input type="checkbox" checked={av.avisoEscopo} onChange={(e) => av.definirAvisoEscopo((e.target as HTMLInputElement).checked)} />
        Avisar quando o escopo de um quantificador pode surpreender (E16): ∀x P(x) ⟹ Q é lido como ∀x (P(x) ⟹ Q)
      </label>
    </details>
  )
}

/** Capacidade do aparelho: limita até onde a reação em cadeia aprofunda sozinha. */
export function ConfigPerfil() {
  const pf = usePerfil()
  const detectado = PERFIS.find((p) => p.id === detectarPerfil())!
  const atual = pf.atual
  const opcoes: { id: IdPerfil; nome: string }[] = [{ id: 'automatico', nome: `Automático (${detectado.nome})` }, ...PERFIS]
  return (
    <details class="config-segundo-plano">
      <summary>⚙ Capacidade do aparelho: {atual.nome}</summary>
      <p class="suave">
        A reação em cadeia escolhe sozinha quantos objetos e mundos testar: começa pequena (resultados rápidos) e depois reconfere as
        conclusões em cenários cada vez maiores, um objeto por vez, até o limite deste aparelho. Se alguma conclusão cair num cenário maior,
        ela refaz a rodada nesse tamanho (no máximo 3 vezes seguidas).
      </p>
      <MotorDeFundo />
      <label class="campo-rotulo">
        Aparelho
        <select value={pf.escolhido} onChange={(e) => pf.escolher((e.target as HTMLSelectElement).value as IdPerfil)}>
          {opcoes.map((o) => (
            <option value={o.id}>{o.nome}</option>
          ))}
        </select>
      </label>
      <p class="suave">{descreverPerfil(atual)}.</p>
      <label class="campo-rotulo">
        Núcleos trabalhando ao mesmo tempo
        <select
          value={String(pf.nucleos)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value
            pf.definirNucleos(v === 'auto' ? 'auto' : Number(v))
          }}
        >
          <option value="auto">Automático ({nucleosDisponiveis()} neste aparelho)</option>
          {Array.from({ length: Math.max(1, navigator.hardwareConcurrency || 2) }, (_, i) => i + 1).map((n) => (
            <option value={String(n)}>{n === 1 ? '1 (leve: um de cada vez, o computador fica livre)' : String(n)}</option>
          ))}
        </select>
      </label>
      <p class="suave">
        Cada núcleo confere uma coisa (um teorema, uma lei, uma conclusão no aprofundamento) ao mesmo tempo que os outros. Mais núcleos:
        mais rápido, mas o aparelho esquenta e gasta mais bateria. O automático usa metade dos núcleos (o computador continua livre para o
        resto, mesmo em trabalhos de horas) e no máximo um a cada 1,5 GB de memória. Com o Z3 ligado, ele também prova as conclusões para qualquer número de objetos, e essas nem precisam ser
        aprofundadas.
      </p>
      <Memoria />
      <Especificacao />
      <label class="alternar">
        <input type="checkbox" checked={pf.aprimorar} onChange={(e) => pf.definirAprimorar((e.target as HTMLInputElement).checked)} />
        Aprimorar sozinho depois de cada rodada (aprofundar até o limite)
      </label>
      <label class="alternar">
        <input type="checkbox" checked={pf.automatico} onChange={(e) => pf.definirAutomatico((e.target as HTMLInputElement).checked)} />
        Reação automática: roda sozinha 20 s depois que as notas mudam (e ao abrir o app, se algo mudou)
      </label>
      <Banco />
    </details>
  )
}

/** O motor de fundo do PC: ligado ou não, e o que ele tem para trabalhar. */
function MotorDeFundo() {
  const mf = useMotorFundo()
  const c = mf.info?.capacidade
  return (
    <div class="banco-provas">
      {mf.conectado && c ? (
        <p class="suave">
          <b>Motor de fundo do PC: ligado.</b> {mf.usar ? 'Os trabalhos do motor rodam lá' : 'Desligado aqui: os trabalhos rodam no navegador'} — fora do
          navegador, sem o teto de memória da aba, com o Z3 sempre ligado e prioridade baixa (o PC continua leve). Usa {c.paralelo} de {c.nucleos}{' '}
          núcleos e até {c.memoriaGB.toLocaleString('pt-BR')} GB; aprofunda até {c.N} objetos. Se o navegador fechar, o trabalho continua lá, e o
          app volta a acompanhá-lo ao abrir.
          {mf.info?.z3.checagens ? ` Z3 lá: ${mf.info.z3.checagens} checagens.` : ''}
        </p>
      ) : (
        <MotorNaoEncontrado />
      )}
      <label class="alternar">
        <input type="checkbox" checked={mf.usar} onChange={(e) => mf.definirUsar((e.target as HTMLInputElement).checked)} />
        Usar o motor de fundo quando ele estiver ligado
      </label>
    </div>
  )
}

/**
 * O Caderno não achou o motor de fundo: ou ele está desligado, ou o navegador
 * não deixa o site falar com este computador (permissão "Acesso à rede local").
 */
export function MotorNaoEncontrado() {
  const mf = useMotorFundo()
  const [procurando, setProcurando] = useState(false)
  const procurar = async () => {
    setProcurando(true)
    await mf.sondar()
    setProcurando(false)
  }
  return (
    <div class="aviso-texto">
      <p>
        <b>Motor de fundo do PC: não encontrado.</b>{' '}
        {mf.bloqueio === 'negado' ? (
          <>
            O navegador está <b>bloqueando</b> o Caderno de falar com este computador. Para liberar: clique no ícone à esquerda do endereço (o
            cadeado ou ⚙) → <b>Configurações do site</b> → <b>Acesso à rede local</b> (ou "Apps e serviços neste dispositivo") →{' '}
            <b>Permitir</b>. Depois recarregue a página.
          </>
        ) : (
          <>
            Se ele estiver ligado (o atalho "Caderno Lógico" da Área de Trabalho liga), clique abaixo: o navegador pode perguntar se o Caderno
            pode acessar apps e serviços deste dispositivo — clique em <b>Permitir</b>.
          </>
        )}
      </p>
      <p class="suave">
        Para ver se o motor está ligado, abra <a href="http://127.0.0.1:47390/" target="_blank" rel="noopener">http://127.0.0.1:47390</a>: se
        aparecer "✓ Ligado neste PC", ele está bem, e o bloqueio é do navegador.
      </p>
      <button type="button" class="botao" disabled={procurando} onClick={() => void procurar()}>
        {procurando ? 'Procurando…' : 'Procurar o motor de novo'}
      </button>
    </div>
  )
}

/** Como o app cuida da memória (para não fechar em trabalhos longos), e quanto usa agora. */
function Memoria() {
  const z = useZ3()
  const [medida, definirMedida] = useState<string | null>(null)
  const perf = (typeof performance !== 'undefined' ? performance : {}) as { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> }
  const podeMedir = !!perf.measureUserAgentSpecificMemory && typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
  const medir = async () => {
    definirMedida('medindo… (pode levar alguns segundos)')
    try {
      const r = await perf.measureUserAgentSpecificMemory!()
      definirMedida(`${(r.bytes / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`)
    } catch {
      definirMedida('não foi possível medir')
    }
  }
  return (
    <p class="suave">
      <b>Memória:</b> trabalhando ao mesmo tempo, cada núcleo fica com uma parte da memória (juntos, abaixo de uns 3 GB); o que não cabe nessa
      parte é refeito sozinho, com a memória toda. Cada núcleo é trocado por um novo depois de 200 checagens, e o Z3 roda à parte, reiniciado a
      cada {RECICLAR_Z3_A_CADA} checagens (cada uma deixa memória presa nele) ou na hora, se travar.
      {z.checagens > 0 && ` Nesta sessão: ${z.checagens} checagens do Z3, ${z.reinicios} reinício${z.reinicios === 1 ? '' : 's'}.`}
      {podeMedir && (
        <>
          {' '}
          <button type="button" class="botao" onClick={() => void medir()}>
            Medir a memória do app
          </button>
          {medida && ` ${medida}`}
        </>
      )}
    </p>
  )
}

/** O banco de provas: o que já foi conferido fica guardado e é reaproveitado. */
function Banco() {
  const ver = useVerificacao()
  const b = ver.banco
  return (
    <div class="banco-provas">
      <p class="suave">
        <b>Banco de provas:</b> cada conferência fica guardada neste aparelho. Ao conferir de novo, o que já foi provado vem do banco, e um
        aprofundamento só testa os tamanhos novos (se já se sabe "sem contraexemplo até 12 objetos", para ir a 14 testa só 13 e 14).
        {b && (
          <>
            {' '}
            Guardadas: {b.entradas.toLocaleString('pt-BR')}. Nesta sessão: {b.acertos} respostas vieram inteiras do banco, {b.parciais}{' '}
            aproveitaram parte, {b.faltas} foram calculadas do zero.
          </>
        )}
      </p>
      <button
        type="button"
        class="mini"
        onClick={() => {
          if (confirm('Apagar o banco de provas? Nada das notas é apagado; só o motor terá de conferir tudo de novo.')) void verificacao.limparBanco()
        }}
      >
        Apagar o banco de provas
      </button>
    </div>
  )
}

/**
 * Especificação: memória que o motor finito precisaria para conferir este
 * caderno com N objetos (medida no próprio caderno e projetada), e o que isso
 * quer dizer para 200, 500 e 1000 objetos.
 */
function Especificacao() {
  const est = useEstado()
  const pf = usePerfil()
  const [e, setE] = useState<Espec | null | 'calculando'>(null)
  const calcular = () => {
    setE('calculando')
    setTimeout(() => setE(estimarEspecificacao(est.notas, est.dicionario, [10, 20, 30, 50, 100, 200, 500, 1000])), 30)
  }
  return (
    <details class="especificacao">
      <summary>Especificação: memória e tempo por número de objetos</summary>
      {e === null && (
        <button type="button" class="mini" onClick={calcular}>
          Calcular para o meu caderno
        </button>
      )}
      {e === 'calculando' && (
        <p class="suave">
          <span class="girando" aria-hidden="true" /> medindo o caderno…
        </p>
      )}
      {e && e !== 'calculando' && (
        <>
          <p class="suave">
            Medido no seu caderno: o problema que o motor monta cresce como N<sup>{e.expoente.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</sup>{' '}
            (cada quantificador aninhado multiplica por N). Uma aba do navegador tem perto de {memoriaTexto(MEMORIA_ABA)} de memória, então o
            motor finito chega a uns <b>{e.maiorN} objetos</b> neste caderno, em qualquer aparelho.
          </p>
          <table class="tabela-espec">
            <thead>
              <tr>
                <th>Objetos</th>
                <th>Cláusulas</th>
                <th>Memória</th>
                <th>Cabe?</th>
              </tr>
            </thead>
            <tbody>
              {e.linhas.map((l) => (
                <tr class={l.cabe ? '' : 'nao-cabe'}>
                  <td>{l.N.toLocaleString('pt-BR')}</td>
                  <td>{quantidadeTexto(l.clausulas)}</td>
                  <td>{memoriaTexto(l.memoria)}</td>
                  <td>{l.cabe ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="suave">
            <b>Tempo:</b> provar que não há contraexemplo cresce ainda mais rápido que a memória. Exemplo medido num PC (uma prova com 3
            quantificadores aninhados): 4 s com 8 objetos, 24 s com 12, 160 s com 17, mais de 2 min por tamanho a partir de 18. Achar um
            contraexemplo, quando existe, costuma ser rápido.
          </p>
          <p class="suave">
            <b>Os perfis experimentais (200, 500, 1000)</b> deixam o aprimoramento tentar por horas; ele para sozinho quando o próximo tamanho
            não cabe ou passa do tempo, e o banco de provas guarda até onde chegou (a próxima vez continua dali).
            {pf.atual.limites.N > e.maiorN && ` Neste caderno, isso deve acontecer perto de ${e.maiorN} objetos.`} Para valer em{' '}
            <b>todos os tamanhos de uma vez</b> — 200, 1000 ou infinitos objetos — o caminho é o Z3, que prova sem limite: ligue-o em
            Contradições.
          </p>
          <button type="button" class="mini" onClick={calcular}>
            Medir de novo
          </button>
        </>
      )}
    </details>
  )
}

/**
 * O que o modo automático vai fazer: rodar daqui a pouco, esperar o motor,
 * ou nada (está em dia). `ligado`: a opção automática deste lado está ligada;
 * `emDia`: o último resultado ainda vale para as notas como estão.
 */
export function StatusAutomatico({ ligado, emDia, rodandoAgora }: { ligado: boolean; emDia: boolean; rodandoAgora: boolean }) {
  const ag = useAgenda()
  const [, tique] = useState(0)
  useEffect(() => {
    if (!ag.proximoEm) return
    const id = setInterval(() => tique((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [ag.proximoEm])
  const ver = useVerificacao()
  if (!ligado) return null
  const texto = rodandoAgora
    ? ver.noMotorDeFundo
      ? 'rodando agora, no motor de fundo do PC (continua mesmo com o navegador fechado).'
      : 'rodando agora.'
    : ag.esperando
      ? `esperando ${ag.esperando} terminar.`
      : ag.proximoEm && !emDia
        ? `começa em ${Math.max(1, Math.ceil((ag.proximoEm - Date.now()) / 1000))} s (espera as notas pararem de mudar).`
        : emDia
          ? 'em dia — as notas não mudaram desde o último resultado; roda de novo quando mudarem.'
          : 'vai rodar assim que o motor ficar livre.'
  return (
    <p class="suave status-automatico" aria-live="polite">
      <b>Automático:</b> {texto}
    </p>
  )
}
