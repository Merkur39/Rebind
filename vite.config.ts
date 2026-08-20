import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  // Served from a project page on GitHub Pages, so assets resolve relatively.
  base: './',
  build: { outDir: '../dist-web', emptyOutDir: true },
});
