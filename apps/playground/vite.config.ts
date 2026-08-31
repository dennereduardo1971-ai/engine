import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    // O plano da 15 MB de download para um jogo publicado; avisar cedo se o
    // esqueleto ja estiver comendo esse orcamento.
    chunkSizeWarningLimit: 900,
  },
});
