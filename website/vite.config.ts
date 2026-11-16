import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so that the site works from any GitHub Pages subdirectory.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2024',
  },
});
