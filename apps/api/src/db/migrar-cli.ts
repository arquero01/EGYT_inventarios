// Uso: `pnpm migrate`. Aplica las migraciones pendientes y termina.
import { cargarConfiguracion } from '../configuracion.ts';
import { conectar } from './cliente.ts';
import { migrar } from './migrar.ts';

const config = cargarConfiguracion();
const conexion = await conectar(config.databaseUrl);
try {
  const nuevas = await migrar(conexion, console.log);
  if (nuevas.length === 0) console.log('La base de datos ya estaba al día.');
} finally {
  await conexion.cerrar();
}
