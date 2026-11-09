import { eq, sql } from 'drizzle-orm';
import {
  ErrorDominio,
  errorConflicto,
  errorValidacion,
  puedeEjecutar,
  sobreComando,
  validarComando,
  type Comando,
  type TipoComando,
  type Usuario,
} from '@egt/domain';
import type { BaseDatos, Ejecutor } from '../db/cliente.ts';
import { comandos } from '../db/esquema.ts';
import { MANEJADORES } from './manejadores.ts';

export type Origen = 'EN_LINEA' | 'SINCRONIZACION';

export interface ResultadoComando {
  id: string | null;
  resultado: 'APLICADO' | 'RECHAZADO';
  /** true si el comando ya se había recibido antes (reintento del celular). */
  duplicado: boolean;
  respuesta?: unknown;
  error?: ReturnType<ErrorDominio['toJSON']>;
}

/**
 * Todas las escrituras pasan una por una. Así el orden de las revisiones
 * coincide con el orden en que se confirman, y la descarga incremental de
 * cambios (sync) nunca se salta una fila. Para el volumen de la empresa
 * (decenas de operaciones por minuto) esto no es un cuello de botella.
 */
const LLAVE_ESCRITURA = 731_0001;

type FilaComando = typeof comandos.$inferSelect;

const desdeFila = (f: FilaComando): ResultadoComando => ({
  id: f.id,
  resultado: f.resultado,
  duplicado: true,
  ...(f.respuesta != null ? { respuesta: f.respuesta } : {}),
  ...(f.error != null ? { error: f.error as ResultadoComando['error'] } : {}),
});

async function buscarComando(db: Ejecutor, id: string): Promise<FilaComando | undefined> {
  const [fila] = await db.select().from(comandos).where(eq(comandos.id, id));
  return fila;
}

/**
 * Ejecuta un comando de forma idempotente:
 *  1. Valida (mismas reglas que el celular, RF-23).
 *  2. Si el id ya se procesó, devuelve el resultado guardado.
 *  3. Aplica el cambio y el evento de historial en una sola transacción.
 *  4. Si una operación hecha sin conexión resulta inválida al llegar (p. ej. dos
 *     técnicos instalaron el mismo equipo), queda RECHAZADA y PENDIENTE de revisión.
 */
export async function ejecutarComando(
  db: BaseDatos,
  entrada: unknown,
  origen: Origen,
  usuario: Usuario | null = null,
): Promise<ResultadoComando> {
  const validacion = validarComando(entrada);
  // El autor lo pone el servidor a partir de la sesión: no se puede firmar a nombre de otro.
  const firma = usuario ? { autor: usuario.nombre, usuarioId: usuario.id } : { usuarioId: null };
  if (!validacion.valido) {
    const sobre = sobreComando.safeParse(entrada);
    if (origen === 'SINCRONIZACION' && sobre.success) {
      return guardarRechazo(db, { ...sobre.data, payload: sobre.data.payload ?? {}, ...firma }, validacion.error, origen);
    }
    return { id: sobre.success ? sobre.data.id : null, resultado: 'RECHAZADO', duplicado: false, error: validacion.error.toJSON() };
  }

  const comando: Comando = { ...validacion.comando, ...(usuario ? { autor: usuario.nombre } : {}) };
  if (usuario && !puedeEjecutar(usuario.rol, comando.tipo)) {
    const error = new ErrorDominio('AUTH-07', 'PROHIBIDO');
    if (origen === 'SINCRONIZACION') return guardarRechazo(db, { ...comando, ...firma }, error, origen);
    return { id: comando.id, resultado: 'RECHAZADO', duplicado: false, error: error.toJSON() };
  }
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${LLAVE_ESCRITURA})`);

      const previo = await buscarComando(tx, comando.id);
      if (previo) return desdeFila(previo);

      await tx.insert(comandos).values({
        id: comando.id,
        tipo: comando.tipo,
        payload: comando.payload,
        ocurridoEn: new Date(comando.ocurridoEn),
        dispositivoId: comando.dispositivoId ?? null,
        autor: comando.autor ?? null,
        usuarioId: firma.usuarioId,
        origen,
        resultado: 'APLICADO',
      });

      const manejador = MANEJADORES[comando.tipo] as (t: typeof tx, c: Comando) => Promise<Record<string, unknown>>;
      const respuesta = await manejador(tx, comando);
      await tx.update(comandos).set({ respuesta }).where(eq(comandos.id, comando.id));

      return { id: comando.id, resultado: 'APLICADO', duplicado: false, respuesta } satisfies ResultadoComando;
    });
  } catch (e) {
    const error = traducirError(e);
    // Los fallos técnicos no se guardan: el celular debe reintentar el mismo comando.
    if (!error || error.tipo === 'INTERNO') throw error ?? e;
    if (origen === 'SINCRONIZACION') return guardarRechazo(db, { ...comando, ...firma }, error, origen);
    return { id: comando.id, resultado: 'RECHAZADO', duplicado: false, error: error.toJSON() };
  }
}

interface SobreMinimo {
  id: string;
  tipo: TipoComando;
  ocurridoEn: string;
  dispositivoId?: string | undefined;
  autor?: string | undefined;
  usuarioId?: string | null;
  payload: unknown;
}

async function guardarRechazo(db: BaseDatos, c: SobreMinimo, error: ErrorDominio, origen: Origen): Promise<ResultadoComando> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LLAVE_ESCRITURA})`);
    const previo = await buscarComando(tx, c.id);
    if (previo) return desdeFila(previo);
    await tx.insert(comandos).values({
      id: c.id,
      tipo: c.tipo,
      payload: c.payload,
      ocurridoEn: new Date(c.ocurridoEn),
      dispositivoId: c.dispositivoId ?? null,
      autor: c.autor ?? null,
      usuarioId: c.usuarioId ?? null,
      origen,
      resultado: 'RECHAZADO',
      error: error.toJSON(),
      revision: 'PENDIENTE',
    });
    return { id: c.id, resultado: 'RECHAZADO', duplicado: false, error: error.toJSON() } satisfies ResultadoComando;
  });
}

interface ErrorPostgres {
  code?: string;
  constraint?: string;
  message?: string;
}

/** Busca el error original de Postgres (Drizzle lo envuelve en `cause`). */
function errorPostgres(e: unknown): ErrorPostgres | null {
  let actual: unknown = e;
  for (let i = 0; i < 4 && actual; i++) {
    const posible = actual as ErrorPostgres & { cause?: unknown };
    if (typeof posible.code === 'string' && /^[0-9A-Z]{5}$/.test(posible.code)) return posible;
    actual = posible.cause;
  }
  return null;
}

/**
 * Convierte errores de base de datos en errores de negocio. Las restricciones
 * de la base son la última línea de defensa (p. ej. dos ingresos simultáneos
 * del mismo serial); normalmente el código las detecta antes.
 */
export function traducirError(e: unknown): ErrorDominio | null {
  if (e instanceof ErrorDominio) return e;
  const pg = errorPostgres(e);
  if (!pg) return null;
  const restriccion = pg.constraint ?? '';
  switch (pg.code) {
    case '23505': // unique_violation
      if (restriccion === 'equipos_serial_unico') return errorConflicto('RF-07');
      if (restriccion === 'compras_nit_numero_factura_key') return errorConflicto('RF-08-FACTURA');
      if (restriccion === 'instalaciones_una_vigente') return errorConflicto('RF-11');
      if (restriccion === 'usuarios_finales_cedula_key') return errorConflicto('RF-11');
      if (restriccion === 'usuarios_correo_unico') return errorConflicto('AUTH-02', [{ campo: 'correo', problema: 'Ya existe una cuenta con ese correo' }]);
      if (restriccion === 'bodegas_nombre_unico') return errorConflicto('RL-01', [{ campo: 'payload.nombre', problema: 'Ya existe una bodega con ese nombre' }]);
      if (restriccion === 'articulos_codigo_unico') return errorConflicto('RL-03', [{ campo: 'payload.codigo', problema: 'Ya existe un artículo con ese código' }]);
      if (restriccion.endsWith('_pkey')) return errorConflicto('ID-DUPLICADO', [{ campo: restriccion, problema: 'Identificador repetido' }]);
      return errorConflicto('RF-23', [{ campo: restriccion, problema: 'Valor repetido' }]);
    case '23514': // check_violation
      if (restriccion === 'existencias_cantidad_check') return errorConflicto('RL-08');
    case '23502': // not_null_violation
    case '22001': // string_data_right_truncation
      return errorValidacion('RF-23', [{ campo: restriccion || 'datos', problema: pg.message ?? 'Restricción de datos' }]);
    case '23503': // foreign_key_violation
      return errorValidacion('RF-23', [{ campo: restriccion, problema: 'Referencia a un registro inexistente' }]);
    case 'EGT15':
      return errorConflicto('RF-15');
    case 'EGT17':
      return new ErrorDominio('RF-17', 'INTERNO');
    default:
      return null;
  }
}
