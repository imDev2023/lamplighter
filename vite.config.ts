import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Three.js with GLTFLoader, meshopt, SkeletonUtils, bloom and the reflector is about
    // 740 KB (190 KB gzipped), and its core is one module that cannot be split; anything else
    // that large should still warn.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: { check: 'check.html', sample: 'sample.html' },
      output: {
        // Three.js changes rarely, so it gets its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
