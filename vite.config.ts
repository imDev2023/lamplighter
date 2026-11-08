import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: { check: 'check.html' },
      output: {
        // Three.js changes rarely, so it gets its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
