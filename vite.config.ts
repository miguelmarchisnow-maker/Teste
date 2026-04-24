import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import wgsl from '@weydra/vite-plugin-wgsl';

export default defineConfig({
  base: '/orbital-fork/',
  server: {
    allowedHosts: true,
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    wgsl(),
  ],
});
