import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import wgsl from '@weydra/vite-plugin-wgsl';

// Vite 8+ suporta top-level await nativamente quando target é esnext.
// Plugin vite-plugin-top-level-await removido (incompat com Vite 8 +
// pulled vulnerable uuid transitively).
export default defineConfig({
  base: '/orbital-fork/',
  server: {
    allowedHosts: true,
  },
  build: {
    target: 'esnext',
  },
  plugins: [
    wasm(),
    wgsl(),
  ],
});
