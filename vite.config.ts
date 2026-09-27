import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Variables Tauri injects at build/run time (see https://tauri.app).
const host = process.env.TAURI_DEV_HOST;
const debug = !!process.env.TAURI_ENV_DEBUG;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Tauri prints its own errors; don't let Vite clear the console.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/docs/.vitepress/**'] },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    // WebView2 (Windows) and WebKit (Linux/macOS) are the target engines.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // `minify: true` uses the minifier that ships with Vite 8 (Oxc).
    minify: !debug,
    sourcemap: debug,
    chunkSizeWarningLimit: 2000,
  },
});
