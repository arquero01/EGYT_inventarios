import { z } from 'zod';

const esquemaConfig = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  /** Ver db/cliente.ts. Por defecto usa PostgreSQL embebido en ./.pglite para desarrollo. */
  DATABASE_URL: z.string().min(1).default('pglite:./.pglite'),
  /** Aplica migraciones pendientes al arrancar (útil en desarrollo). */
  MIGRAR_AL_INICIAR: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * false (por ahora) → quien se registra entra de una vez.
   * true → la cuenta queda pendiente hasta que un administrador la autorice.
   */
  REGISTRO_REQUIERE_APROBACION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Carpeta del panel web compilado. Por defecto apps/web/dist si existe. */
  CARPETA_PANEL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Configuracion {
  puerto: number;
  host: string;
  databaseUrl: string;
  migrarAlIniciar: boolean;
  nivelLog: string;
  registroRequiereAprobacion: boolean;
  carpetaPanel: string | undefined;
}

export function cargarConfiguracion(entorno: NodeJS.ProcessEnv = process.env): Configuracion {
  try {
    process.loadEnvFile?.();
  } catch {
    // No hay .env: se usan las variables del sistema.
  }
  const c = esquemaConfig.parse(entorno);
  return {
    puerto: c.PORT,
    host: c.HOST,
    databaseUrl: c.DATABASE_URL,
    migrarAlIniciar: c.MIGRAR_AL_INICIAR,
    nivelLog: c.LOG_LEVEL,
    registroRequiereAprobacion: c.REGISTRO_REQUIERE_APROBACION,
    carpetaPanel: c.CARPETA_PANEL,
  };
}
