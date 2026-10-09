// Página provisória da etapa 1: só para experimentar o validador.
import { render } from 'preact'
import { useState } from 'preact/hooks'
import { expandir } from './logica/acucar'
import { converterNoCursor, converterTudo } from './logica/atalhos'
import { imprimir } from './logica/impressao'
import { validar } from './logica/validador'
import './provisorio.css'

function App() {
  const [texto, setTexto] = useState('∀i∈I (f(i) ⊆ A)')
  const r = validar(texto)

  const onInput = (e: Event) => {
    const el = e.target as HTMLTextAreaElement
    const ie = e as InputEvent
    let novo = el.value
    let cursor = el.selectionStart
    if (ie.inputType === 'insertText' && ie.data?.length === 1) {
      const c = converterNoCursor(novo, cursor)
      if (c) ({ texto: novo, cursor } = c)
    } else {
      novo = converterTudo(novo)
      cursor = novo.length - (el.value.length - cursor)
    }
    setTexto(novo)
    if (novo !== el.value) {
      el.value = novo
      el.setSelectionRange(cursor, cursor)
    }
  }

  const marcado = (() => {
    const d = r.diags[0]
    if (!d) return null
    return (
      <>
        {texto.slice(0, d.pos)}
        <mark class={d.nivel}>{texto.slice(d.pos, d.end) || ' '}</mark>
        {texto.slice(d.end)}
      </>
    )
  })()

  return (
    <main>
      <h1>Caderno Lógico — etapa 1</h1>
      <p class="dica">
        Atalhos: \A ∀ · \E ∃ · ~ ¬ · &amp; ∧ · | ∨ · -&gt; ⟹ · &lt;-&gt; ⟺ · \in ∈ · \notin ∉ · \sub ⊆ · \cap ⋂ · \cup ⋃ ·
        \empty ∅ · != ≠ · f_i fᵢ
      </p>
      <textarea value={texto} onInput={onInput} rows={3} spellcheck={false} autocapitalize="off" autocorrect="off" />
      {marcado && <pre class="marcado">{marcado}</pre>}
      {r.diags.length === 0 && r.ast && <p class="ok">✓ Fórmula válida</p>}
      <ul>
        {r.diags.map((d) => (
          <li class={d.nivel}>
            <b>{d.codigo}</b> {d.nivel === 'aviso' ? '(aviso) ' : ''}
            {d.msg}
          </li>
        ))}
      </ul>
      {r.ast && r.ok && (
        <>
          <h2>Leitura</h2>
          <pre>{imprimir(r.ast)}</pre>
          <h2>Sem açúcar (o que o motor verá)</h2>
          <pre>{imprimir(expandir(r.ast))}</pre>
        </>
      )}
    </main>
  )
}

render(<App />, document.getElementById('app')!)
