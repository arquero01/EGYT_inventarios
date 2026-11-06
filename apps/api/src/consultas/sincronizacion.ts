import { and, asc, desc, eq, getTableColumns, gt } from 'drizzle-orm';
import { errorNoEncontrado } from '@egt/domain';
import type { BaseDatos, Ejecutor, Transaccion } from '../db/cliente.ts';
import { comandos, compras, equipos, eventosEquipo, instalaciones, proyectos, usuariosFinales } from '../db/esquema.ts';

/**
 * Descarga incremental (RNF-01): todo lo que cambió después de la revisión
 * `desde`. El celular guarda `hasta` y lo envía como `desde` la próxima vez.
 * Si `hayMas` es true, debe volver a pedir de inmediato.
 */
export async function cambiosDesde(db: BaseDatos, desde: number, limite: number) {
  // Una sola instantánea de la base: si alguien escribe mientras se lee, ninguna
  // tabla ve filas que las demás no vieron.
  return db.transaction((tx) => leerCambios(tx, desde, limite), {
    isolationLevel: 'repeatable read',
    accessMode: 'read only',
  });
}

async function leerCambios(db: Transaccion, desde: number, limite: number) {
  const { compraId: _c, ...columnasEquipo } = getTableColumns(equipos);
  const p = await db.select().from(proyectos).where(gt(proyectos.rev, desde)).orderBy(asc(proyectos.rev)).limit(limite);
  const e = await db
      .select({
        ...columnasEquipo,
        compra: {
          proveedor: compras.proveedor,
          nit: compras.nit,
          numeroFactura: compras.numeroFactura,
          fechaCompra: compras.fechaCompra,
        },
      })
      .from(equipos)
      .innerJoin(compras, eq(compras.id, equipos.compraId))
      .where(gt(equipos.rev, desde))
      .orderBy(asc(equipos.rev))
      .limit(limite);
  const u = await db.select().from(usuariosFinales).where(gt(usuariosFinales.rev, desde)).orderBy(asc(usuariosFinales.rev)).limit(limite);
  const i = await db.select().from(instalaciones).where(gt(instalaciones.rev, desde)).orderBy(asc(instalaciones.rev)).limit(limite);
  const ev = await db.select().from(eventosEquipo).where(gt(eventosEquipo.rev, desde)).orderBy(asc(eventosEquipo.rev)).limit(limite);

  // Si alguna tabla llenó el límite, se corta en la menor de sus últimas
  // revisiones para no saltar filas de las otras tablas.
  const listas: { rev: number }[][] = [p, e, u, i, ev];
  const llenas = listas.filter((l) => l.length === limite);
  const hayMas = llenas.length > 0;
  const todas = listas.flat().map((f) => f.rev);
  const hasta = hayMas
    ? Math.min(...llenas.map((l) => l[l.length - 1]!.rev))
    : todas.length > 0
      ? Math.max(...todas)
      : desde;
  const recortar = <T extends { rev: number }>(l: T[]) => l.filter((f) => f.rev <= hasta);

  return {
    desde,
    hasta,
    hayMas,
    proyectos: recortar(p),
    equipos: recortar(e),
    usuariosFinales: recortar(u),
    instalaciones: recortar(i),
    eventos: recortar(ev),
  };
}

/** Operaciones sin conexión que el servidor rechazó y esperan revisión. */
export async function conflictosPendientes(db: Ejecutor) {
  const filas = await db
    .select()
    .from(comandos)
    .where(eq(comandos.revision, 'PENDIENTE'))
    .orderBy(desc(comandos.recibidoEn));
  return {
    datos: filas.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      payload: c.payload,
      ocurridoEn: c.ocurridoEn,
      recibidoEn: c.recibidoEn,
      dispositivoId: c.dispositivoId,
      autor: c.autor,
      error: c.error,
    })),
  };
}

export async function marcarConflictoResuelto(db: Ejecutor, id: string) {
  const [fila] = await db
    .update(comandos)
    .set({ revision: 'RESUELTO' })
    .where(and(eq(comandos.id, id), eq(comandos.revision, 'PENDIENTE')))
    .returning({ id: comandos.id });
  if (!fila) throw errorNoEncontrado('CONFLICTO-NO-ENCONTRADO');
  return { id: fila.id, revision: 'RESUELTO' as const };
}

