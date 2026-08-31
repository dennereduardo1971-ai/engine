import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // O orcamento de performance mede tempo real: sem paralelismo, sem ruido.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
