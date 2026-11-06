import { and, asc, count, eq, gt, ne, sql } from 'drizzle-orm';
import {
  ErrorDominio,
  errorConflicto,
  errorNoEncontrado,
  errorValidacion,
  type DatosIngreso,
  type DatosRegistro,
  type Rol,
  type Usuario,
} from '@egt/domain';
import type { BaseDatos, Ejecutor } from '../db/cliente.ts';
import { sesiones, usuarios } from '../db/esquema.ts';
import {
  cifrarContrasena,
  contrasenaTemporal,
  huellaToken,
  nuevoToken,
  obtenerHuellaRelleno,
  verificarContrasena,
} from './contrasenas.ts';

/** Misma llave de escritura que los comandos: evita dos "primeros administradores". */
const LLAVE_USUARIOS = 731_0002;

export const DIAS_SESION = 30;

export interface Sesion {
  token: string;
  expiraEn: string;
  usuario: Usuario;
}

type FilaUsuario = typeof usuarios.$inferSelect;

export const publico = (u: FilaUsuario): Usuario => ({
  id: u.id,
  nombre: u.nombre,
  correo: u.correo,
  rol: u.rol,
  activo: u.activo,
});

export const errorNoAutenticado = (codigo: 'AUTH-05' | 'AUTH-06' = 'AUTH-05') => new ErrorDominio(codigo, 'NO_AUTENTICADO');
export const errorProhibido = () => new ErrorDominio('AUTH-07', 'PROHIBIDO');

async function crearSesion(db: Ejecutor, u: FilaUsuario, dispositivo: string | undefined): Promise<Sesion> {
  const token = nuevoToken();
  const expiraEn = new Date(Date.now() + DIAS_SESION * 24 * 3600 * 1000);
  await db.insert(sesiones).values({
    tokenHash: huellaToken(token),
    usuarioId: u.id,
    expiraEn,
    dispositivo: dispositivo?.slice(0, 200) ?? null,
  });
  await db.update(usuarios).set({ ultimoIngreso: new Date() }).where(eq(usuarios.id, u.id));
  return { token, expiraEn: expiraEn.toISOString(), usuario: publico(u) };
}

/**
 * Crea una cuenta. La primera cuenta del sistema queda como administrador y
 * activa. Las demás quedan como usuario; si se exige aprobación, inactivas
 * hasta que un administrador las active.
 */
export async function registrar(
  db: BaseDatos,
  datos: DatosRegistro,
  opciones: { requiereAprobacion: boolean; dispositivo?: string | undefined },
): Promise<{ pendiente: true; usuario: Usuario } | ({ pendiente: false } & Sesion)> {
  const huella = await cifrarContrasena(datos.contrasena);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LLAVE_USUARIOS})`);
    const [existente] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.correo, datos.correo));
    if (existente) throw errorConflicto('AUTH-02', [{ campo: 'correo', problema: 'Ya existe una cuenta con ese correo' }]);

    const [{ total } = { total: 0 }] = await tx.select({ total: count() }).from(usuarios);
    const esPrimero = total === 0;
    const activo = esPrimero || !opciones.requiereAprobacion;
    const [u] = await tx
      .insert(usuarios)
      .values({ nombre: datos.nombre, correo: datos.correo, contrasenaHash: huella, rol: esPrimero ? 'ADMIN' : 'USUARIO', activo })
      .returning();
    if (!u) throw new ErrorDominio('INTERNO', 'INTERNO');
    if (!activo) return { pendiente: true as const, usuario: publico(u) };
    return { pendiente: false as const, ...(await crearSesion(tx, u, opciones.dispositivo)) };
  });
}

export async function ingresar(db: BaseDatos, datos: DatosIngreso, dispositivo?: string): Promise<Sesion> {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.correo, datos.correo));
  const valida = await verificarContrasena(datos.contrasena, u?.contrasenaHash ?? (await obtenerHuellaRelleno()));
  if (!u || !valida) throw new ErrorDominio('AUTH-01', 'NO_AUTENTICADO');
  if (!u.activo) {
    // Si nunca ha entrado, la cuenta está esperando autorización.
    throw new ErrorDominio(u.ultimoIngreso ? 'AUTH-04' : 'AUTH-03', 'PROHIBIDO');
  }
  return crearSesion(db, u, dispositivo);
}

/** Usuario dueño de un token vigente, o null. */
export async function usuarioDeToken(db: BaseDatos, token: string): Promise<Usuario | null> {
  const [fila] = await db
    .select({ usuario: usuarios })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuarioId))
    .where(and(eq(sesiones.tokenHash, huellaToken(token)), gt(sesiones.expiraEn, new Date()), eq(usuarios.activo, true)));
  return fila ? publico(fila.usuario) : null;
}

export async function cerrarSesion(db: BaseDatos, token: string): Promise<void> {
  await db.delete(sesiones).where(eq(sesiones.tokenHash, huellaToken(token)));
}

/** Cambia la contraseña y cierra las demás sesiones (deja abierta la actual). */
export async function cambiarContrasena(db: BaseDatos, usuarioId: string, tokenActual: string, actual: string, nueva: string) {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!u) throw errorNoAutenticado();
  if (!(await verificarContrasena(actual, u.contrasenaHash))) {
    throw errorValidacion('AUTH-09', [{ campo: 'actual', problema: 'La contraseña actual no es correcta' }]);
  }
  const huella = await cifrarContrasena(nueva);
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ contrasenaHash: huella, actualizadoEn: new Date() }).where(eq(usuarios.id, usuarioId));
    await tx.delete(sesiones).where(and(eq(sesiones.usuarioId, usuarioId), ne(sesiones.tokenHash, huellaToken(tokenActual))));
  });
  return { ok: true };
}

// ── Administración de cuentas ──────────────────────────────────────────────

export async function listarUsuarios(db: BaseDatos) {
  const filas = await db.select().from(usuarios).orderBy(asc(usuarios.activo), asc(usuarios.nombre));
  return filas.map((u) => ({
    ...publico(u),
    creadoEn: u.creadoEn.toISOString(),
    ultimoIngreso: u.ultimoIngreso?.toISOString() ?? null,
    pendiente: !u.activo && u.ultimoIngreso === null,
  }));
}

/**
 * Cambia el rol o activa/desactiva una cuenta. Nunca deja el sistema sin un
 * administrador activo (eso dejaría a la empresa sin forma de aprobar cuentas).
 */
export async function cambiarUsuario(db: BaseDatos, id: string, cambios: { rol?: Rol | undefined; activo?: boolean | undefined }) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LLAVE_USUARIOS})`);
    const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, id));
    if (!u) throw errorNoEncontrado('AUTH-12');

    const quedaAdminActivo = (cambios.rol ?? u.rol) === 'ADMIN' && (cambios.activo ?? u.activo);
    if (u.rol === 'ADMIN' && u.activo && !quedaAdminActivo) {
      const [{ total } = { total: 0 }] = await tx
        .select({ total: count() })
        .from(usuarios)
        .where(and(eq(usuarios.rol, 'ADMIN'), eq(usuarios.activo, true), ne(usuarios.id, id)));
      if (total === 0) throw errorConflicto('AUTH-10');
    }

    const [actualizado] = await tx
      .update(usuarios)
      .set({
        ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
        ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
        actualizadoEn: new Date(),
      })
      .where(eq(usuarios.id, id))
      .returning();
    // Una cuenta desactivada pierde sus sesiones de inmediato.
    if (cambios.activo === false) await tx.delete(sesiones).where(eq(sesiones.usuarioId, id));
    if (!actualizado) throw errorNoEncontrado('AUTH-12');
    return publico(actualizado);
  });
}

/**
 * Para quien olvidó su contraseña: el administrador genera una temporal y se
 * la entrega a la persona (no hay envío de correos). Cierra todas sus sesiones.
 */
export async function restablecerContrasena(db: BaseDatos, id: string) {
  const temporal = contrasenaTemporal();
  const huella = await cifrarContrasena(temporal);
  return db.transaction(async (tx) => {
    const [u] = await tx
      .update(usuarios)
      .set({ contrasenaHash: huella, actualizadoEn: new Date() })
      .where(eq(usuarios.id, id))
      .returning();
    if (!u) throw errorNoEncontrado('AUTH-12');
    await tx.delete(sesiones).where(eq(sesiones.usuarioId, id));
    return { usuario: publico(u), contrasenaTemporal: temporal };
  });
}

/** Borra sesiones vencidas (se llama de vez en cuando al iniciar sesión). */
export async function limpiarSesionesVencidas(db: BaseDatos) {
  await db.delete(sesiones).where(sql`${sesiones.expiraEn} < now()`);
}
