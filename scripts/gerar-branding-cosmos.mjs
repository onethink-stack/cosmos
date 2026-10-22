import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const raiz = new URL('../', import.meta.url)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0a0a0f"/><circle cx="256" cy="256" r="180" fill="none" stroke="#7c3aed" stroke-width="6"/><text x="256" y="280" text-anchor="middle" fill="white" font-family="Arial,DejaVu Sans,sans-serif" font-size="70" font-weight="700">502426c</text></svg>`
// Renderiza o vetor diretamente em cada dimensão: sem reamostragem que produza halos escuros.
const imagem = (tamanho) => sharp(Buffer.from(svg.replace('width="512" height="512"', `width="${tamanho}" height="${tamanho}"`)))
await writeFile(new URL('src/assets/cosmos-502426c.svg', raiz), svg + '\n')
for (const [nome, tamanho] of [
  ['public/pwa-192x192.png', 192], ['public/pwa-512x512.png', 512],
  ['public/apple-touch-icon.png', 180], ['public/favicon-32x32.png', 32],
  ['public/icone-192.png', 192], ['public/icone-512.png', 512],
  ['public/icone-maskable-512.png', 512], ['public/cosmos-app.png', 512],
  ['src/assets/cosmos-app.png', 512],
]) await imagem(tamanho).png().toFile(fileURLToPath(new URL(nome, raiz)))

// ICO válido com uma imagem PNG 32×32 embutida (cabeçalho ICONDIR + ICONDIRENTRY).
const png = await imagem(32).png().toBuffer()
const cabecalho = Buffer.alloc(22)
cabecalho.writeUInt16LE(1, 2); cabecalho.writeUInt16LE(1, 4)
cabecalho[6] = 32; cabecalho[7] = 32
cabecalho.writeUInt16LE(1, 10); cabecalho.writeUInt16LE(32, 12)
cabecalho.writeUInt32LE(png.length, 14); cabecalho.writeUInt32LE(22, 18)
await writeFile(new URL('public/favicon.ico', raiz), Buffer.concat([cabecalho, png]))
console.log('Cosmos 502426c: ícones PWA 192/512, Apple 180 e favicon ICO 32 gerados.')
