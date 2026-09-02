import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos no HTML gerado. Com isto o mesmo build funciona na
  // raiz de um domínio e dentro de uma subpasta — que é como o GitHub Pages
  // serve um repositório (`/engine/editor/`). Sem isto, o navegador procura
  // os arquivos em `/assets/...` e não acha nada.
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    // O plano da 15 MB de download para um jogo publicado; avisar cedo se o
    // esqueleto ja estiver comendo esse orcamento.
    chunkSizeWarningLimit: 900,
  },
});
