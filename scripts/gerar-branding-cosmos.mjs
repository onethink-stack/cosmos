import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../', import.meta.url)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="#0a0a0f"/><circle cx="256" cy="256" r="180" fill="none" stroke="#7c3aed" stroke-width="3"/><text x="256" y="280" text-anchor="middle" fill="white" font-family="Arial,DejaVu Sans,sans-serif" font-size="66" font-weight="700">COSMOS</text></svg>`
// Renderiza o vetor diretamente em cada dimensão: sem reamostragem que produza halos escuros.
const imagem = (tamanho) => sharp(Buffer.from(svg.replace('width="512" height="512"', `width="${tamanho}" height="${tamanho}"`)))
const pngCosmos = async (tamanho) => {
  const { data, info } = await imagem(tamanho).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // Mantém a cor do fundo também na suavização dos cantos transparentes.
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 255) { data[i] = 10; data[i + 1] = 10; data[i + 2] = 15 }
  }
  return sharp(data, { raw: info }).png().toBuffer()
}
await writeFile(new URL('src/assets/cosmos-502426c.svg', raiz), svg + '\n')
for (const [nome, tamanho] of [
  ['public/pwa-192x192.png', 192], ['public/pwa-512x512.png', 512],
  ['public/apple-touch-icon.png', 180], ['public/favicon-32x32.png', 32],
  ['public/icone-192.png', 192], ['public/icone-512.png', 512],
  ['public/icone-maskable-512.png', 512], ['public/cosmos-app.png', 512],
  ['src/assets/cosmos-app.png', 512],
]) await writeFile(fileURLToPath(new URL(nome, raiz)), await pngCosmos(tamanho))

// ICO válido com uma imagem PNG 32×32 embutida (cabeçalho ICONDIR + ICONDIRENTRY).
const png = await pngCosmos(32)
const cabecalho = Buffer.alloc(22)
cabecalho.writeUInt16LE(1, 2); cabecalho.writeUInt16LE(1, 4)
cabecalho[6] = 32; cabecalho[7] = 32
cabecalho.writeUInt16LE(1, 10); cabecalho.writeUInt16LE(32, 12)
cabecalho.writeUInt32LE(png.length, 14); cabecalho.writeUInt32LE(22, 18)
await writeFile(new URL('public/favicon.ico', raiz), Buffer.concat([cabecalho, png]))
console.log('Cosmos: ícones PWA 192/512, Apple 180 e favicon ICO 32 gerados.')
