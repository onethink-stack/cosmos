import { useState } from 'preact/hooks'
import type { EntradaDicionario } from '../dados/tipos'
import { EditorFormulas } from './EditorFormulas'

// Etapa 2: tela de demonstração do editor. Notas e dicionário chegam na etapa 3.
const INICIAIS = [
  '∀i∈I (f(i) ⊆ A)',
  '∀i∈I (f(i) ≠ A)',
  '∃i∈I ∃j∈I (i ≠ j ∧ f(i) ≠ f(j))',
  'A ∉ A',
  '∀x (x ∈ A ⟺ ∃i∈I (x ∈ f(i)))',
  '∃x ∀i∈I (x ∈ f(i))',
  '∀i∈I ∀j∈I (f(i) ∉ f(j))',
]
const DICIONARIO: EntradaDicionario[] = []

export function App() {
  const [formulas, setFormulas] = useState(INICIAIS)
  return (
    <main>
      <h1>Caderno Lógico</h1>
      <p class="suave">
        Etapa 2 — editor de fórmulas. Use a barra de símbolos ou os atalhos: \A ∀ · \E ∃ · ~ ¬ · &amp; ∧ · | ∨ · -&gt; ⟹ ·
        &lt;-&gt; ⟺ · \in ∈ · \notin ∉ · \sub ⊆ · \cap ⋂ · \cup ⋃ · \empty ∅ · != ≠ · f_i fᵢ. Enter cria a próxima fórmula.
      </p>
      <EditorFormulas formulas={formulas} onChange={setFormulas} dicionario={DICIONARIO} />
    </main>
  )
}
