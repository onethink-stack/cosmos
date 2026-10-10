// Copia o build de arquivo único para public/, para o PWA oferecer o download.
import { copyFileSync } from 'node:fs'

copyFileSync('dist-arquivo/index.html', 'public/caderno-logico.html')
console.log('arquivo único em public/caderno-logico.html')
