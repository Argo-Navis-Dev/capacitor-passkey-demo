import { defineConfig } from 'vite';

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    minify: false,
    emptyOutDir: true,
  },
  server: {
    host: 'localhost',
    port: 8080,              // or any other port
    open: true               // opens browser automatically
  }
});
