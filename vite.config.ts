import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH || './',
  build: {
    target: 'es2022',
    rolldownOptions: { output: { manualChunks(id) {
      if (id.includes('@dimforge')) return 'physics';
      if (id.includes('/three/')) return 'graphics';
    } } },
  },
});
