import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  publicDir:false,
  build:{target:'node22',outDir:fileURLToPath(new URL('../../dist-v2',import.meta.url)),emptyOutDir:true,
    lib:{entry:fileURLToPath(new URL('./servidor.ts',import.meta.url)),formats:['es'],fileName:()=> 'api.mjs'},
    rolldownOptions:{external:[/^node:/]},minify:false},
})
