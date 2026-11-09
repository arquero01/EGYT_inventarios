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

const app = construirApp(conexion.db, { logger: { level: config.nivelLog } });

const cerrar = async () => {
  await app.close();
  await conexion.cerrar();
  process.exit(0);
};
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);

await app.listen({ port: config.puerto, host: config.host });
