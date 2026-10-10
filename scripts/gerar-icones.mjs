// Gera os ícones do PWA (PNG) sem dependências: um "∀" branco sobre azul.
// Uso: node scripts/gerar-icones.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const AZUL = [47, 93, 138]
const BRANCO = [255, 255, 255]

// Traços do ∀ em coordenadas 0..1 (antes da escala para a área segura)
const TRACOS = [
  [0.27, 0.24, 0.5, 0.78],
  [0.73, 0.24, 0.5, 0.78],
  [0.405, 0.49, 0.595, 0.49],
]
const ESPESSURA = 0.075

function distSegmento(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** cobertura (0..1) da forma no ponto: fundo arredondado e glifo */
function amostra(x, y, { maskable }) {
  // fundo: quadrado arredondado (ícone comum) ou tela cheia (maskable)
  let fundo = 1
  if (!maskable) {
    const r = 0.18
    const cx = Math.min(Math.max(x, r), 1 - r)
    const cy = Math.min(Math.max(y, r), 1 - r)
    fundo = Math.hypot(x - cx, y - cy) <= r ? 1 : 0
  }
  // glifo: no maskable fica dentro da área segura (80% central)
  const esc = maskable ? 0.72 : 1
  const gx = (x - 0.5) / esc + 0.5
  const gy = (y - 0.5) / esc + 0.5
  const glifo = TRACOS.some((s) => distSegmento(gx, gy, s) <= ESPESSURA / 2) ? 1 : 0
  return { fundo, glifo }
}

function desenhar(tam, opcoes) {
  const SS = 4 // superamostragem para suavizar bordas
  const px = Buffer.alloc(tam * tam * 4)
  for (let j = 0; j < tam; j++) {
    for (let i = 0; i < tam; i++) {
      let f = 0
      let g = 0
      for (let a = 0; a < SS; a++)
        for (let b = 0; b < SS; b++) {
          const s = amostra((i + (a + 0.5) / SS) / tam, (j + (b + 0.5) / SS) / tam, opcoes)
          f += s.fundo
          g += s.fundo && s.glifo
        }
      f /= SS * SS
      g /= SS * SS
      const k = (j * tam + i) * 4
      const mistura = f > 0 ? g / f : 0
      for (let c = 0; c < 3; c++) px[k + c] = Math.round(AZUL[c] * (1 - mistura) + BRANCO[c] * mistura)
      px[k + 3] = Math.round(f * 255)
    }
  }
  return png(tam, tam, px)
}

// ---------- PNG mínimo ----------
const TABELA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii')
  const tam = Buffer.alloc(4)
  tam.writeUInt32BE(dados.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])))
  return Buffer.concat([tam, t, dados, crc])
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  const linhas = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) rgba.copy(linhas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icone-192.png', desenhar(192, { maskable: false }))
writeFileSync('public/icone-512.png', desenhar(512, { maskable: false }))
writeFileSync('public/icone-maskable-512.png', desenhar(512, { maskable: true }))
console.log('ícones gerados em public/')
