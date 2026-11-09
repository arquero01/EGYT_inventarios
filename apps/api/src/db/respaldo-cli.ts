// Uso: `pnpm respaldo` (con el servidor apagado). Guarda una copia completa de
// la base embebida (PGlite) en egt-copia-AAAA-MM-DD-HHMM.tar.gz, en la raíz
// del proyecto. Esa copia se puede restaurar en la aplicación de escritorio:
// Archivo → Restaurar copia de seguridad.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cargarConfiguracion } from '../configuracion.ts';
import { conectar } from './cliente.ts';

const config = cargarConfiguracion();
if (!config.databaseUrl.startsWith('pglite:') || config.databaseUrl === 'pglite:memoria') {
  console.error('Este comando solo sirve con la base embebida en una carpeta (DATABASE_URL=pglite:./.pglite).');
  process.exit(1);
}
const conexion = await conectar(config.databaseUrl);
try {
  const copia = await conexion.respaldar!();
  const fecha = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const destino = join(resolve(process.cwd(), '..', '..'), `egt-copia-${fecha}.tar.gz`);
  writeFileSync(destino, Buffer.from(await copia.arrayBuffer()));
  console.log(`Copia guardada en ${destino}`);
} finally {
  await conexion.cerrar();
}
