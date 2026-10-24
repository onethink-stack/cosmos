/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react'
import { candlesDemo } from './dados'

/** Canvas de dados de exemplo, sem ilustração vetorial ou feed de mercado. */
export function GraficoMercado({ intervalo }: { intervalo: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [leitura, setLeitura] = useState('Passe o cursor para inspecionar os candles de demonstração')
  useEffect(() => {
    const canvas = ref.current!
    const draw = () => {
      const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      const c = canvas.getContext('2d')!; c.scale(dpr, dpr)
      const w = r.width, h = r.height, data = candlesDemo(intervalo), min = Math.min(...data.map(v => v.low)) - .12, max = Math.max(...data.map(v => v.high)) + .12
      const x = (i: number) => 15 + i * (w - 82) / data.length, y = (v: number) => 15 + (max - v) / (max - min) * (h - 86)
      c.clearRect(0, 0, w, h); c.font = '12px "JetBrains Mono", monospace'
      for (let i = 0; i < 6; i++) {
        const yy = 16 + i * (h - 86) / 5
        c.strokeStyle = '#ffffff0d'; c.lineWidth = .7; c.beginPath(); c.moveTo(0, yy); c.lineTo(w - 55, yy); c.stroke()
        c.fillStyle = '#a6afbd'; c.fillText((max - i * (max - min) / 5).toFixed(3), w - 48, yy + 3)
      }
      for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * (w - 55) / 8, 0); c.lineTo(i * (w - 55) / 8, h - 22); c.stroke() }
      const step = (w - 82) / data.length
      data.forEach((v, i) => {
        c.strokeStyle = v.close >= v.open ? '#8aaeff' : '#d1d9e6'; c.fillStyle = c.strokeStyle; c.lineWidth = 1.2
        const centro = Math.round(x(i)) + .5
        c.beginPath(); c.moveTo(centro, Math.round(y(v.high))); c.lineTo(centro, Math.round(y(v.low))); c.stroke()
        c.fillRect(Math.round(x(i) - step * .28), Math.round(Math.min(y(v.open), y(v.close))), Math.max(2, Math.round(step * .56)), Math.max(2, Math.round(Math.abs(y(v.open) - y(v.close)))))
        c.fillStyle = v.close >= v.open ? '#8aaeff38' : '#a6afbd26'; c.fillRect(x(i) - step * .28, h - 27 - v.volume * .55, Math.max(2, step * .56), v.volume * .55)
      })
      const last = data.at(-1)!; c.setLineDash([4, 4]); c.strokeStyle = '#8aaeffb3'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, y(last.close)); c.lineTo(w - 55, y(last.close)); c.stroke(); c.setLineDash([])
      c.fillStyle = '#8aaeff'; c.fillRect(w - 55, y(last.close) - 10, 55, 21); c.fillStyle = '#111318'; c.fillText(last.close.toFixed(3), w - 48, y(last.close) + 4)
      c.fillStyle = '#a6afbd'; ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].forEach((t, i) => c.fillText(t, 12 + i * (w - 100) / 5, h - 5))
    }
    let ativo = true
    const observer = new ResizeObserver(draw); observer.observe(canvas); draw()
    void document.fonts.load('12px "JetBrains Mono"').then(() => { if (ativo) draw() }).catch(() => { /* Mantém o fallback monospace se a fonte local falhar. */ })
    return () => { ativo = false; observer.disconnect() }
  }, [intervalo])
  return <div className="market-canvas-wrap"><canvas ref={ref} aria-label={`Candlesticks COSMOS/USD ${intervalo}, dados de demonstração`} onMouseMove={e => {
    const r = e.currentTarget.getBoundingClientRect(), data = candlesDemo(intervalo), i = Math.max(0, Math.min(63, Math.floor((e.clientX - r.left - 15) / (r.width - 82) * 64))), v = data[i]
    setLeitura(`DEMO #${i + 1}   O ${v.open.toFixed(3)}   H ${v.high.toFixed(3)}   L ${v.low.toFixed(3)}   C ${v.close.toFixed(3)}`)
  }} /><p className="chart-readout">{leitura}</p></div>
}

export function GraficoConvergencia() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const draw = () => {
      const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1
      canvas.width = r.width * d; canvas.height = r.height * d
      const c = canvas.getContext('2d')!; c.scale(d, d); const w = r.width, h = r.height
      c.strokeStyle = '#ffffff12'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, 10 + i * (h - 26) / 3); c.lineTo(w, 10 + i * (h - 26) / 3); c.stroke() }
      c.beginPath(); for (let i = 0; i < 90; i++) { const x = i / 89 * w, y = h - 16 - (Math.exp(-i / 19) * .85 + .06 + Math.sin(i * 1.7) * .017) * (h - 20); if (!i) c.moveTo(x, y); else c.lineTo(x, y) }
      c.strokeStyle = '#8aaeff'; c.lineWidth = 2; c.stroke(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = '#8aaeff0d'; c.fill()
    }
    const o = new ResizeObserver(draw); o.observe(canvas); draw(); return () => o.disconnect()
  }, [])
  return <canvas ref={ref} className="loss-canvas" aria-label="Curva de loss ilustrativa, não uma execução do motor" />
}
