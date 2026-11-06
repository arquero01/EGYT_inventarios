import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Conexion } from './cliente.ts';

/** Busca la carpeta /migraciones subiendo desde este archivo (sirve en src/ y en dist/). */
function carpetaMigraciones(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidata = join(dir, 'migraciones');
    if (existsSync(candidata)) return candidata;
    dir = dirname(dir);
  }
  throw new Error('No se encontró la carpeta de migraciones');
}

const escapar = (s: string) => s.replace(/'/g, "''");

/**
 * Aplica, en orden y una sola vez, los archivos NNNN_nombre.sql pendientes.
 * Cada archivo corre dentro de su propia transacción.
 */
export async function migrar(conexion: Conexion, log: (m: string) => void = () => {}): Promise<string[]> {
  await conexion.ejecutarScript(`
    CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
      nombre      text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    );
  `);
  const filas: unknown = await conexion.db.execute(sql`SELECT nombre FROM migraciones_aplicadas`);
  const aplicadas = new Set(extraerFilas<{ nombre: string }>(filas).map((f) => f.nombre));

  const dir = carpetaMigraciones();
  const archivos = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const nuevas: string[] = [];
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const contenido = readFileSync(join(dir, archivo), 'utf8');
    await conexion.ejecutarScript(
      `BEGIN;\n${contenido}\nINSERT INTO migraciones_aplicadas (nombre) VALUES ('${escapar(archivo)}');\nCOMMIT;`,
    );
    log(`Migración aplicada: ${archivo}`);
    nuevas.push(archivo);
  }
  return nuevas;
}

/** node-postgres devuelve { rows }, PGlite también; esto unifica ambos. */
export function extraerFilas<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  return ((resultado as { rows?: T[] }).rows ?? []) as T[];
}
