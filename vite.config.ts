import { defineConfig } from 'vite';

export default defineConfig({
  base: '/xoi4/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
