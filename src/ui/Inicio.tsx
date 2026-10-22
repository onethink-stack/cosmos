import { MarcaCosmos } from './MarcaCosmos'
import cadeia from '../dados/cadeia-F0-F4.json'

export function CadeiaFases() {
  return (
    <section class="cadeia-fases" aria-labelledby="cadeia-titulo">
      <header class="cadeia-abertura">
        <div>
          <p class="cadeia-rubrica">COSMOS / CADEIA PESSOAL</p>
          <h1 id="cadeia-titulo">Uma pessoa.<br /><em>Uma cadeia.</em></h1>
          <p class="cadeia-intro">Da hipótese ao fechamento, cada fase conserva o seu lugar.</p>
        </div>
        <aside class="cadeia-assinatura" aria-label="Selo da cadeia">
          <MarcaCosmos className="cadeia-marca" />
          <span>SELO</span><code>{cadeia.selo}</code>
        </aside>
      </header>
      <nav class="cadeia-percurso" aria-label="Fases da cadeia">
        {cadeia.fases.map((fase) => (
          <a href={`#fase-${fase.id}`} onClick={(evento) => {
            evento.preventDefault()
            document.getElementById(`fase-${fase.id}`)?.scrollIntoView({ behavior: 'instant', block: 'start' })
          }} key={fase.id}>
            <strong>{fase.id}</strong><span>{fase.tipo}</span><span aria-hidden="true">↗</span>
          </a>
        ))}
      </nav>
      <ol class="cadeia-etapas">
        {cadeia.fases.map((fase) => (
          <li id={`fase-${fase.id}`} class="cadeia-etapa" key={fase.id}>
            <div class="cadeia-indice"><span>{fase.id}</span><small>{fase.situacao}</small></div>
            <article>
              <div class="cadeia-etapa-topo"><span>{fase.tipo}</span><span>{fase.estado}</span></div>
              <h2>{fase.pessoa ?? fase.dominio}</h2>
              <p class="cadeia-afirmacao">{fase.afirmacao}</p>
              {fase.testemunha && <p class="cadeia-testemunha"><span>Testemunha</span> <strong>{fase.testemunha}</strong> <span>em</span> <strong>{fase.campo}</strong></p>}
              {fase.id === 'F2' && <p class="cadeia-exata">Campo exato ℚ(√2) · sem aproximação decimal</p>}
              <details class="cadeia-campos">
                <summary>Ver os {Object.keys(fase).length} campos <span aria-hidden="true">＋</span></summary>
                <dl>{Object.entries(fase).map(([campo, valor]) => (
                  <div key={campo}><dt>{campo}</dt><dd>{valor ?? <span class="cadeia-nulo">Não informado</span>}</dd></div>
                ))}</dl>
              </details>
              <p class="cadeia-selo">selo <code>{fase.selo}</code></p>
            </article>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Inicio() {
  return (
    <section class="inicio" aria-label="COSMOS">
      <div class="inicio-composicao">
        <MarcaCosmos className="inicio-curva" />
        <div class="inicio-consulta">
          <p class="inicio-rubrica">PREMISSA / INFERÊNCIA</p>
          <h1><a href="#/perguntar">O que se segue<br />desta premissa?<span class="inicio-seta" aria-hidden="true">↗</span></a></h1>
          <a class="inicio-acao" href="#/perguntar">Formular uma pergunta</a>
        </div>
      </div>
      <div class="inicio-margem">
        <span class="inicio-notacao" aria-label="De P e de P implica Q, infere-se Q">P, P → Q ⊢ Q</span>
        <nav aria-label="Conceitos e ferramentas">
          <a href="#/notas">Premissas</a>
          <a href="#/cadeia">Inferência</a>
          <a href="#/contradicoes">Contradição</a>
        </nav>
      </div>
    </section>
  )
}
