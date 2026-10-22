import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'

// Fonte oficial fornecida pelo usuário. A limpeza fica restrita à margem externa;
// os pixels do C no centro não são redesenhados.
const source = new URL('../src/assets/logo-cosmos-original.png', import.meta.url)
const root = new URL('../', import.meta.url)
const { data, info } = await sharp(await readFile(source)).removeAlpha().raw().toBuffer({ resolveWithObject: true })
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    if (x < info.width * .2 || x >= info.width * .8 || y < info.height * .2 || y >= info.height * .8) {
      const i = (y * info.width + x) * info.channels
      data[i] = data[i + 1] = data[i + 2] = 255
    }
  }
}
const clean = await sharp(data, { raw: info }).png().toBuffer()
await writeFile(new URL('src/assets/logo-cosmos-branco.png', root), clean)
const render = (size) => sharp(clean).resize(size, size).flatten({ background: '#ffffff' }).png().toBuffer()
for (const [file, size] of [
  ['public/pwa-512x512.png', 512], ['public/pwa-192x192.png', 192],
  ['public/apple-touch-icon.png', 180], ['public/favicon-32x32.png', 32],
  ['public/icone-192.png', 192], ['public/icone-512.png', 512],
  ['public/icone-maskable-512.png', 512], ['public/cosmos-app.png', 512],
  ['src/assets/cosmos-app.png', 512],
]) await writeFile(new URL(file, root), await render(size))
const png = await render(32)
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
header[6] = 32; header[7] = 32
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18)
await writeFile(new URL('public/favicon.ico', root), Buffer.concat([header, png]))
console.log('Logo oficial: C preservado, margem branca e ícones 512/192/180/32 gerados.')
