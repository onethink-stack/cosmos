/** Fórmula em modo leitura. Numa visão de mundo, aparece como B_titular(φ). */
export function FormulaExibida({ texto, titular }: { texto: string; titular?: string }) {
  if (titular === undefined) return <div class="formula-exibida">{texto}</div>
  return (
    <div class="formula-exibida">
      B<sub>{titular || '?'}</sub>({texto})
    </div>
  )
}
