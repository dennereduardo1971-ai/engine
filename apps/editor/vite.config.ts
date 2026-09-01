import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Caminhos relativos no HTML gerado. Com isto o mesmo build funciona na
  // raiz de um domínio e dentro de uma subpasta — que é como o GitHub Pages
  // serve um repositório (`/engine/editor/`). Sem isto, o navegador procura
  // os arquivos em `/assets/...` e não acha nada.
  base: './',
  plugins: [react()],
  server: { port: 5174, host: true },
  build: {
    target: 'es2022',
    // O editor pode ser mais gordo que o jogo: o teto de 15 MB da secao 3 do
    // plano e do jogo publicado, e o runtime e que vai dentro dele.
    chunkSizeWarningLimit: 1600,
  },
});
