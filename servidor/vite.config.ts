// Monta o motor de fundo para o Node (servidor/dist): o programa principal e
// as threads (o motor, os auxiliares e o Z3), todos na mesma pasta, porque o
// principal acha as threads pelo nome. O z3-solver fica de fora (vem de
// node_modules na hora de rodar).
import { defineConfig } from 'vite'

export default defineConfig({
  define: { __MODO_ARQUIVO__: 'false' },
  publicDir: false,
  build: {
    ssr: true,
    outDir: 'servidor/dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rollupOptions: {
      input: {
        'motor-de-fundo': 'servidor/motor-de-fundo.ts',
        'motor-worker': 'servidor/motor-worker.ts',
        'sub-worker': 'servidor/sub-worker.ts',
        'z3-worker': 'servidor/z3-worker.ts',
        'gerador-worker': 'servidor/gerador-worker.ts',
      },
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
})
