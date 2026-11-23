import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Rutas de la API: en desarrollo Vite las reenvía al servidor (puerto 3000). */
const RUTAS_API = ['salud', 'auth', 'comandos', 'sync', 'inventario', 'equipos', 'proyectos', 'bodegas', 'articulos', 'existencias', 'movimientos', 'usuarios', 'zonas'];
const API = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: el panel funciona servido por la API en cualquier dirección.
  base: './',
  server: {
    port: 5173,
    host: true,
    proxy: Object.fromEntries(RUTAS_API.map((r) => [`/${r}`, { target: API, changeOrigin: true }])),
  },
  // El mapa de Colombia (~560 kB, ~190 kB comprimido) va en su propio archivo y se carga solo en Usuarios.
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
});
