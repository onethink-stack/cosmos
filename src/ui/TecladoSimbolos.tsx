const TECLAS: [simbolo: string, insere: string, nome: string][] = [
  ['∀', '∀', 'para todo'],
  ['∃', '∃', 'existe'],
  ['¬', '¬', 'não'],
  ['∧', ' ∧ ', 'e'],
  ['∨', ' ∨ ', 'ou'],
  ['⟹', ' ⟹ ', 'implica'],
  ['⟺', ' ⟺ ', 'se e somente se'],
  ['∈', '∈', 'pertence'],
  ['∉', '∉', 'não pertence'],
  ['⊆', ' ⊆ ', 'está contido'],
  ['⋂', ' ⋂ ', 'interseção'],
  ['⋃', ' ⋃ ', 'união'],
  ['∅', '∅', 'vazio'],
  ['=', ' = ', 'igual'],
  ['≠', ' ≠ ', 'diferente'],
  ['(', '(', 'abre parêntese'],
  [')', ')', 'fecha parêntese'],
  [',', ', ', 'vírgula'],
  ['ᵢ', '_', 'subscrito: toque e depois digite a letra'],
]

/**
 * Barra de símbolos. Os botões não roubam o foco do campo (mousedown cancelado),
 * assim o teclado do celular continua aberto.
 */
export function TecladoSimbolos({ onTecla }: { onTecla: (texto: string) => void }) {
  return (
    <div class="teclado" role="toolbar" aria-label="Símbolos lógicos">
      {TECLAS.map(([s, ins, nome]) => (
        <button
          type="button"
          tabIndex={-1}
          title={nome}
          aria-label={nome}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onTecla(ins)}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
