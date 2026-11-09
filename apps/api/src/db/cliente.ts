import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';
import { esquema } from './esquema.ts';

export type BaseDatos = PgDatabase<PgQueryResultHKT, typeof esquema>;
export type Transaccion = Parameters<Parameters<BaseDatos['transaction']>[0]>[0];
/** Cualquier cosa sobre la que se pueden hacer consultas: la base o una transacción. */
export type Ejecutor = BaseDatos | Transaccion;

export interface Conexion {
  db: BaseDatos;
  /** Ejecuta un script SQL con varias sentencias (para migraciones). */
  ejecutarScript(sql: string): Promise<void>;
  cerrar(): Promise<void>;
  /** Solo con PGlite: copia completa de la base en un archivo .tar.gz. */
  respaldar?: () => Promise<Blob>;
}

export interface OpcionesConexion {
  /** Solo con PGlite y una carpeta vacía: arranca desde una copia de seguridad. */
  restaurarDesde?: Blob;
}

/**
 * DATABASE_URL puede ser:
 *  - postgres://usuario:clave@host:5432/egt  → PostgreSQL real (producción)
 *  - pglite:memoria                           → PostgreSQL embebido en memoria (pruebas)
 *  - pglite:./.pglite                         → PostgreSQL embebido en una carpeta (desarrollo sin instalar nada)
 */
export async function conectar(url: string, opciones: OpcionesConexion = {}): Promise<Conexion> {
  if (url.startsWith('pglite:')) {
    const ruta = url.slice('pglite:'.length);
    const extra = opciones.restaurarDesde ? { loadDataDir: opciones.restaurarDesde } : {};
    const cliente = ruta === 'memoria' ? new PGlite(extra) : new PGlite(ruta, extra);
    await cliente.waitReady;
    const db = drizzlePglite({ client: cliente, schema: esquema }) as unknown as BaseDatos;
    return {
      db,
      ejecutarScript: async (sql) => {
        await cliente.exec(sql);
      },
      cerrar: () => cliente.close(),
      respaldar: async () => {
        const copia = await cliente.dumpDataDir('gzip');
        return copia instanceof Blob ? copia : new Blob([copia]);
      },
    };
  }

  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzlePg({ client: pool, schema: esquema }) as unknown as BaseDatos;
  return {
    db,
    ejecutarScript: async (sql) => {
      // Sin parámetros, pg usa el protocolo simple, que admite varias sentencias.
      await pool.query(sql);
    },
    cerrar: () => pool.end(),
  };
}
