import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/servidor.ts', 'src/db/migrar-cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // El paquete de dominio se publica como TypeScript fuente: se incluye en el bundle.
  noExternal: ['@egt/domain'],
});
