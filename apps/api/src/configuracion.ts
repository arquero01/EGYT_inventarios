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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Configuracion {
  puerto: number;
  host: string;
  databaseUrl: string;
  migrarAlIniciar: boolean;
  nivelLog: string;
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
  };
}
