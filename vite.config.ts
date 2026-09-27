import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Variables que Tauri inyecta al compilar/ejecutar (ver https://tauri.app).
const host = process.env.TAURI_DEV_HOST;
const debug = !!process.env.TAURI_ENV_DEBUG;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Tauri muestra sus propios errores, no queremos que Vite limpie la consola.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    // WebView2 (Windows) y WebKit (Linux/macOS) son los motores objetivo.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // `minify: true` usa el minificador que trae Vite 8 (Oxc).
    minify: !debug,
    sourcemap: debug,
    chunkSizeWarningLimit: 2000,
  },
});
