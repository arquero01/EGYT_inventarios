// Junta la aplicación de escritorio en dist/: un solo main.js (Electron +
// servidor + reglas) más los archivos que PGlite y el servidor leen del disco.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const dist = join(aqui, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(aqui, 'src/main.ts')],
  outfile: join(dist, 'main.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // electron lo pone el propio Electron; pg-native es opcional y no se usa.
  external: ['electron', 'pg-native'],
  // Algunas dependencias son CommonJS y usan require/__dirname.
  banner: {
    js: [
      "import { createRequire as __crearRequire } from 'node:module';",
      "import { fileURLToPath as __aRuta } from 'node:url';",
      "import { dirname as __carpeta } from 'node:path';",
      'const require = __crearRequire(import.meta.url);',
      'const __filename = __aRuta(import.meta.url);',
      'const __dirname = __carpeta(__filename);',
    ].join('\n'),
  },
  logLevel: 'warning',
  legalComments: 'none',
});

// PGlite busca estos archivos junto al módulo que lo carga (ahora main.js).
const requerir = createRequire(join(aqui, '../api/package.json'));
const carpetaPglite = dirname(requerir.resolve('@electric-sql/pglite'));
for (const archivo of ['pglite.wasm', 'pglite.data', 'initdb.wasm']) {
  cpSync(join(carpetaPglite, archivo), join(dist, archivo));
}
// migrar() busca la carpeta "migraciones" subiendo desde main.js.
cpSync(join(aqui, '../api/migraciones'), join(dist, 'migraciones'), { recursive: true });
cpSync(join(aqui, 'build/icon.png'), join(dist, 'icono.png'));

if (!existsSync(join(aqui, '../web/dist/index.html'))) {
  console.warn('Aviso: el panel web no está compilado. Ejecute "pnpm build:web" antes de crear el instalador.');
}
console.log('Aplicación de escritorio lista en apps/desktop/dist');
