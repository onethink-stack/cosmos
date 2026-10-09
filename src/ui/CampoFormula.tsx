import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import type { EntradaDicionario } from '../dados/tipos'
import { expandir } from '../logica/acucar'
import type { Diag } from '../logica/ast'
import { converterNoCursor } from '../logica/atalhos'
import { imprimir } from '../logica/impressao'
import { validar } from '../logica/validador'
import { processarEntrada } from './edicao'

interface Props {
  valor: string
  onChange: (valor: string) => void
  dicionario: EntradaDicionario[]
  onFoco?: () => void
  onEnter?: () => void
  onRemover?: () => void
  campoRef?: (el: HTMLTextAreaElement | null) => void
  rotulo?: string
}

/** Recorta o texto em trechos, marcando os diagnósticos (sem sobreposição). */
function realcar(texto: string, diags: Diag[]) {
  const partes = []
  let i = 0
  for (const d of diags) {
    if (d.pos < i) continue
    const fim = Math.max(d.end, d.pos)
    partes.push(texto.slice(i, d.pos))
    // trecho vazio (ex.: erro no fim da fórmula) vira um espaço marcado
    partes.push(<mark class={d.nivel}>{texto.slice(d.pos, fim) || ' '}</mark>)
    i = fim
  }
  partes.push(texto.slice(i))
  return partes
}

export function CampoFormula(p: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const r = useMemo(() => validar(p.valor, p.dicionario), [p.valor, p.dicionario])

  const ajustarAltura = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(ajustarAltura, [p.valor])
  useEffect(() => {
    window.addEventListener('resize', ajustarAltura)
    return () => window.removeEventListener('resize', ajustarAltura)
  }, [])

  const aplicar = (el: HTMLTextAreaElement, texto: string, cursor: number) => {
    el.value = texto
    el.setSelectionRange(cursor, cursor)
    p.onChange(texto)
  }

  const onInput = (e: Event) => {
    const el = e.currentTarget as HTMLTextAreaElement
    const ie = e as InputEvent
    const ed = processarEntrada(el.value, el.selectionStart, ie.inputType ?? 'insertText', ie.isComposing)
    if (ed) aplicar(el, ed.texto, ed.cursor)
    else p.onChange(el.value)
  }

  const onCompositionEnd = (e: Event) => {
    const el = e.currentTarget as HTMLTextAreaElement
    const ed = converterNoCursor(el.value, el.selectionStart)
    if (ed) aplicar(el, ed.texto, ed.cursor)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      p.onEnter?.()
    }
  }

  const temErro = r.diags.some((d) => d.nivel === 'erro')
  const vazio = !p.valor.trim()

  return (
    <div class="formula">
      <div class="formula-linha">
        <div class={`campo${temErro ? ' com-erro' : ''}`}>
          <div class="campo-fundo" aria-hidden="true">
            {realcar(p.valor, r.diags)}
            {'​'}
          </div>
          <textarea
            ref={(el) => {
              ref.current = el
              p.campoRef?.(el)
            }}
            class="campo-texto"
            rows={1}
            value={p.valor}
            aria-label={p.rotulo ?? 'Fórmula'}
            placeholder="Fórmula, ex.: ∀x (x ∈ A ⟹ P(x))"
            spellcheck={false}
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            inputMode="text"
            enterkeyhint="next"
            onInput={onInput}
            onCompositionEnd={onCompositionEnd}
            onKeyDown={onKeyDown}
            onFocus={p.onFoco}
          />
        </div>
        {p.onRemover && (
          <button type="button" class="discreto" title="Remover fórmula" aria-label="Remover fórmula" onClick={p.onRemover}>
            ✕
          </button>
        )}
      </div>
      {!vazio && r.diags.length > 0 && (
        <ul class="diags" aria-live="polite">
          {r.diags.map((d) => (
            <li class={d.nivel}>
              <b>{d.codigo}</b>
              {d.nivel === 'aviso' ? 'Aviso: ' : ''}
              {d.msg}
            </li>
          ))}
        </ul>
      )}
      {!vazio && r.ast && r.ok && (
        <>
          {r.diags.length === 0 && <div class="status-ok">✓ Fórmula válida</div>}
          <details class="leitura">
            <summary>Ver leitura e forma expandida</summary>
            <pre>{imprimir(r.ast)}</pre>
            <pre>{imprimir(expandir(r.ast))}</pre>
          </details>
        </>
      )}
    </div>
  )
}
