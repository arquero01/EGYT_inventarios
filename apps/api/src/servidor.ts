import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construirApp } from './app.ts';
import { cargarConfiguracion } from './configuracion.ts';
import { conectar } from './db/cliente.ts';
import { migrar } from './db/migrar.ts';

const config = cargarConfiguracion();
const conexion = await conectar(config.databaseUrl);

// PGlite (desarrollo) siempre migra al arrancar; PostgreSQL solo si se pide.
if (config.migrarAlIniciar || config.databaseUrl.startsWith('pglite:')) {
  await migrar(conexion, (m) => console.log(m));
}

/** apps/web/dist, tanto desde src/ (desarrollo) como desde dist/ (producción). */
function carpetaPanel(): string {
  if (config.carpetaPanel) return resolve(config.carpetaPanel);
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
}
const panel = carpetaPanel();

const app = construirApp(conexion.db, {
  logger: { level: config.nivelLog },
  registroRequiereAprobacion: config.registroRequiereAprobacion,
  carpetaPanel: panel,
});
if (existsSync(join(panel, 'index.html'))) app.log.info(`Panel web servido desde ${panel}`);
else app.log.warn('El panel web no está compilado: ejecute "pnpm build:web" (no hace falta reiniciar el servidor).');

const cerrar = async () => {
  await app.close();
  await conexion.cerrar();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.puerto, host: config.host });
