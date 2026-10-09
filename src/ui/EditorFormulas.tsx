import { useLayoutEffect, useRef } from 'preact/hooks'
import type { EntradaDicionario } from '../dados/tipos'
import { CampoFormula } from './CampoFormula'
import { inserirTexto } from './edicao'
import { TecladoSimbolos } from './TecladoSimbolos'

interface Props {
  formulas: string[]
  onChange: (formulas: string[]) => void
  dicionario: EntradaDicionario[]
}

/** Lista de fórmulas de uma nota, com a barra de símbolos fixa acima. */
export function EditorFormulas({ formulas, onChange, dicionario }: Props) {
  const campos = useRef<(HTMLTextAreaElement | null)[]>([])
  const alvo = useRef(0)
  const focarDepois = useRef<number | null>(null)
  campos.current.length = formulas.length

  useLayoutEffect(() => {
    if (focarDepois.current === null) return
    const el = campos.current[focarDepois.current]
    focarDepois.current = null
    el?.focus()
  })

  const mudar = (i: number, v: string) => onChange(formulas.map((f, j) => (j === i ? v : f)))

  const adicionar = (depoisDe = formulas.length - 1) => {
    const novas = [...formulas]
    novas.splice(depoisDe + 1, 0, '')
    focarDepois.current = depoisDe + 1
    alvo.current = depoisDe + 1
    onChange(novas)
  }

  const remover = (i: number) => {
    onChange(formulas.filter((_, j) => j !== i))
    if (alvo.current >= i) alvo.current = Math.max(0, alvo.current - 1)
  }

  const inserir = (ins: string) => {
    if (!formulas.length) {
      focarDepois.current = 0
      onChange([inserirTexto('', 0, 0, ins).texto])
      return
    }
    const i = Math.min(alvo.current, formulas.length - 1)
    const el = campos.current[i]
    if (!el) return
    const ed = inserirTexto(el.value, el.selectionStart, el.selectionEnd, ins)
    el.value = ed.texto
    el.focus()
    el.setSelectionRange(ed.cursor, ed.cursor)
    mudar(i, ed.texto)
  }

  return (
    <div class="editor-formulas">
      <TecladoSimbolos onTecla={inserir} />
      {formulas.map((f, i) => (
        <CampoFormula
          valor={f}
          onChange={(v) => mudar(i, v)}
          dicionario={dicionario}
          rotulo={`Fórmula ${i + 1}`}
          campoRef={(el) => (campos.current[i] = el)}
          onFoco={() => (alvo.current = i)}
          onEnter={() => adicionar(i)}
          onRemover={() => remover(i)}
        />
      ))}
      <button type="button" onClick={() => adicionar()}>
        + Fórmula
      </button>
    </div>
  )
}
