import { and, asc, count, desc, eq, gt, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  MENSAJES,
  NOMBRE_ESTADO,
  NOMBRE_MOVIMIENTO,
  NOMBRE_TIPO_EQUIPO,
  errorNoEncontrado,
  type TipoMovimiento,
} from '@egt/domain';
import type { Ejecutor } from '../db/cliente.ts';
import { articulos, bodegas, compras, equipos, existencias, movimientoItems, movimientos, proyectos } from '../db/esquema.ts';

const aviso = (codigo: 'RL-09' | 'RL-10' | 'RL-11') => ({ aviso: { codigo, mensaje: MENSAJES[codigo] } });

// ── Bodegas (RL-01, RL-11) ─────────────────────────────────────────────────

// Ojo: en el SELECT drizzle escribe las columnas sin el nombre de la tabla ("id"). Dentro de
// una subconsulta ese "id" se confunde con el de la tabla interna y la cuenta daba 0, por eso
// las subconsultas nombran la tabla completa ("bodegas"."id", "movimientos"."id").
export async function listarBodegas(db: Ejecutor) {
  const filas = await db
    .select({
      bodega: bodegas,
      equipos: sql<number>`(SELECT count(*)::int FROM equipos e WHERE e.bodega_id = "bodegas"."id")`,
      articulos: sql<number>`(SELECT count(*)::int FROM existencias x WHERE x.bodega_id = "bodegas"."id" AND x.cantidad > 0)`,
    })
    .from(bodegas)
    .where(eq(bodegas.activa, true))
    .orderBy(asc(bodegas.nombre));
  return {
    datos: filas.map(({ bodega: b, equipos: e, articulos: a }) => ({
      id: b.id,
      nombre: b.nombre,
      municipio: b.municipio,
      departamento: b.departamento,
      direccion: b.direccion,
      equipos: e,
      articulos: a,
    })),
  };
}

/** Lo que hay hoy en una bodega: equipos por tipo y estado, y artículos con su cantidad. */
export async function detalleBodega(db: Ejecutor, bodegaId: string) {
  const [bodega] = await db.select().from(bodegas).where(eq(bodegas.id, bodegaId));
  if (!bodega) throw errorNoEncontrado('RL-01-NO-EXISTE');

  const porTipo = await db
    .select({ tipo: equipos.tipo, estado: equipos.estado, cantidad: sql<number>`count(*)::int` })
    .from(equipos)
    .where(eq(equipos.bodegaId, bodegaId))
    .groupBy(equipos.tipo, equipos.estado)
    .orderBy(asc(equipos.tipo), asc(equipos.estado));

  const stock = await db
    .select({ id: articulos.id, codigo: articulos.codigo, nombre: articulos.nombre, unidad: articulos.unidad, cantidad: existencias.cantidad })
    .from(existencias)
    .innerJoin(articulos, eq(articulos.id, existencias.articuloId))
    .where(and(eq(existencias.bodegaId, bodegaId), gt(existencias.cantidad, 0)))
    .orderBy(asc(articulos.codigo));

  const vacia = porTipo.length === 0 && stock.length === 0;
  return {
    bodega: { id: bodega.id, nombre: bodega.nombre, municipio: bodega.municipio, departamento: bodega.departamento, direccion: bodega.direccion },
    equipos: porTipo.map((f) => ({ ...f, tipoNombre: NOMBRE_TIPO_EQUIPO[f.tipo], estadoNombre: NOMBRE_ESTADO[f.estado] })),
    articulos: stock,
    ...(vacia ? aviso('RL-11') : {}),
  };
}

// ── Artículos por cantidad (RL-03, RL-09) ──────────────────────────────────

export async function listarArticulos(db: Ejecutor) {
  const filas = await db
    .select({
      articulo: articulos,
      enBodegas: sql<number>`coalesce(sum(${existencias.cantidad}) FILTER (WHERE ${existencias.bodegaId} IS NOT NULL), 0)::float`,
      enCampo: sql<number>`coalesce(sum(${existencias.cantidad}) FILTER (WHERE ${existencias.proyectoId} IS NOT NULL), 0)::float`,
    })
    .from(articulos)
    .leftJoin(existencias, eq(existencias.articuloId, articulos.id))
    .where(eq(articulos.activo, true))
    .groupBy(articulos.id)
    .orderBy(asc(articulos.codigo));
  return {
    datos: filas.map(({ articulo: a, enBodegas, enCampo }) => ({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      unidad: a.unidad,
      descripcion: a.descripcion,
      enBodegas,
      enCampo,
    })),
  };
}

/** Kardex: dónde está cada unidad del artículo y todos sus movimientos (RL-09). */
export async function kardexArticulo(db: Ejecutor, articuloId: string) {
  const [articulo] = await db.select().from(articulos).where(eq(articulos.id, articuloId));
  if (!articulo) throw errorNoEncontrado('RL-03-NO-EXISTE');

  const lugares = await db
    .select({ cantidad: existencias.cantidad, bodegaId: bodegas.id, bodega: bodegas.nombre, proyectoId: proyectos.id, proyecto: proyectos.nombre })
    .from(existencias)
    .leftJoin(bodegas, eq(bodegas.id, existencias.bodegaId))
    .leftJoin(proyectos, eq(proyectos.id, existencias.proyectoId))
    .where(and(eq(existencias.articuloId, articuloId), gt(existencias.cantidad, 0)));

  const origen = alias(bodegas, 'origen');
  const destino = alias(bodegas, 'destino');
  const historial = await db
    .select({
      movimientoId: movimientos.id,
      numero: movimientos.numero,
      tipo: movimientos.tipo,
      cantidad: movimientoItems.cantidad,
      valorUnitario: movimientoItems.valorUnitario,
      origen: origen.nombre,
      destino: destino.nombre,
      proyecto: proyectos.nombre,
      responsable: movimientos.responsable,
      ocurridoEn: movimientos.ocurridoEn,
    })
    .from(movimientoItems)
    .innerJoin(movimientos, eq(movimientos.id, movimientoItems.movimientoId))
    .leftJoin(origen, eq(origen.id, movimientos.bodegaOrigenId))
    .leftJoin(destino, eq(destino.id, movimientos.bodegaDestinoId))
    .leftJoin(proyectos, eq(proyectos.id, movimientos.proyectoId))
    .where(eq(movimientoItems.articuloId, articuloId))
    .orderBy(desc(movimientos.rev));

  return {
    articulo: { id: articulo.id, codigo: articulo.codigo, nombre: articulo.nombre, unidad: articulo.unidad, descripcion: articulo.descripcion },
    existencias: lugares.map((l) => ({
      cantidad: l.cantidad,
      lugar: l.bodegaId ? { tipo: 'BODEGA' as const, id: l.bodegaId, nombre: l.bodega } : { tipo: 'PROYECTO' as const, id: l.proyectoId, nombre: l.proyecto },
    })),
    movimientos: historial.map((h) => ({ ...h, tipoNombre: NOMBRE_MOVIMIENTO[h.tipo] })),
    ...(historial.length === 0 ? aviso('RL-09') : {}),
  };
}

// ── Guías de movimiento (RL-10) ────────────────────────────────────────────

export interface FiltrosMovimientos {
  tipo?: TipoMovimiento | undefined;
  bodegaId?: string | undefined;
  proyectoId?: string | undefined;
  pagina: number;
  porPagina: number;
}

export async function listarMovimientos(db: Ejecutor, f: FiltrosMovimientos) {
  const lista: (SQL | undefined)[] = [];
  if (f.tipo) lista.push(eq(movimientos.tipo, f.tipo));
  if (f.bodegaId) lista.push(or(eq(movimientos.bodegaOrigenId, f.bodegaId), eq(movimientos.bodegaDestinoId, f.bodegaId)));
  if (f.proyectoId) lista.push(eq(movimientos.proyectoId, f.proyectoId));
  const donde = and(...lista);

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(movimientos).where(donde);

  const origen = alias(bodegas, 'origen');
  const destino = alias(bodegas, 'destino');
  const filas = await db
    .select({
      id: movimientos.id,
      numero: movimientos.numero,
      tipo: movimientos.tipo,
      origen: origen.nombre,
      destino: destino.nombre,
      proyecto: proyectos.nombre,
      responsable: movimientos.responsable,
      ocurridoEn: movimientos.ocurridoEn,
      equipos: sql<number>`(SELECT count(*)::int FROM movimiento_items i WHERE i.movimiento_id = "movimientos"."id" AND i.equipo_id IS NOT NULL)`,
      articulos: sql<number>`(SELECT count(*)::int FROM movimiento_items i WHERE i.movimiento_id = "movimientos"."id" AND i.articulo_id IS NOT NULL)`,
    })
    .from(movimientos)
    .leftJoin(origen, eq(origen.id, movimientos.bodegaOrigenId))
    .leftJoin(destino, eq(destino.id, movimientos.bodegaDestinoId))
    .leftJoin(proyectos, eq(proyectos.id, movimientos.proyectoId))
    .where(donde)
    .orderBy(desc(movimientos.rev))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);

  return {
    datos: filas.map((m) => ({ ...m, tipoNombre: NOMBRE_MOVIMIENTO[m.tipo] })),
    paginacion: { pagina: f.pagina, porPagina: f.porPagina, total, totalPaginas: Math.ceil(total / f.porPagina) },
    ...(total === 0 ? aviso('RL-10') : {}),
  };
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guía completa de un movimiento, por id o por número (DES-000001). */
export async function detalleMovimiento(db: Ejecutor, idONumero: string) {
  const origen = alias(bodegas, 'origen');
  const destino = alias(bodegas, 'destino');
  const [m] = await db
    .select({
      movimiento: movimientos,
      origen: origen.nombre,
      destino: destino.nombre,
      proyecto: proyectos.nombre,
      compra: compras,
    })
    .from(movimientos)
    .leftJoin(origen, eq(origen.id, movimientos.bodegaOrigenId))
    .leftJoin(destino, eq(destino.id, movimientos.bodegaDestinoId))
    .leftJoin(proyectos, eq(proyectos.id, movimientos.proyectoId))
    .leftJoin(compras, eq(compras.id, movimientos.compraId))
    .where(ES_UUID.test(idONumero) ? eq(movimientos.id, idONumero) : eq(movimientos.numero, idONumero.toUpperCase()));
  if (!m) throw errorNoEncontrado('RL-10-NO-EXISTE');

  const items = await db
    .select({ item: movimientoItems, equipo: equipos, articulo: articulos })
    .from(movimientoItems)
    .leftJoin(equipos, eq(equipos.id, movimientoItems.equipoId))
    .leftJoin(articulos, eq(articulos.id, movimientoItems.articuloId))
    .where(eq(movimientoItems.movimientoId, m.movimiento.id))
    .orderBy(asc(movimientoItems.rev));

  const mov = m.movimiento;
  return {
    id: mov.id,
    numero: mov.numero,
    tipo: mov.tipo,
    tipoNombre: NOMBRE_MOVIMIENTO[mov.tipo],
    origen: m.origen,
    destino: m.destino,
    proyecto: m.proyecto,
    responsable: mov.responsable,
    observacion: mov.observacion,
    ocurridoEn: mov.ocurridoEn,
    registradoEn: mov.registradoEn,
    autor: mov.autor,
    compra: m.compra ? { proveedor: m.compra.proveedor, nit: m.compra.nit, numeroFactura: m.compra.numeroFactura, fechaCompra: m.compra.fechaCompra } : null,
    equipos: items
      .filter((i) => i.equipo)
      .map(({ equipo: e }) => ({ id: e!.id, serial: e!.serial, tipo: e!.tipo, tipoNombre: NOMBRE_TIPO_EQUIPO[e!.tipo], marca: e!.marca, modelo: e!.modelo })),
    articulos: items
      .filter((i) => i.articulo)
      .map(({ item, articulo: a }) => ({ id: a!.id, codigo: a!.codigo, nombre: a!.nombre, unidad: a!.unidad, cantidad: item.cantidad, valorUnitario: item.valorUnitario })),
  };
}

/** Artículos disponibles en un lugar, para armar un despacho, traslado o devolución. */
export async function existenciasEn(db: Ejecutor, lugar: { bodegaId?: string | undefined; proyectoId?: string | undefined }) {
  const condicion = lugar.bodegaId ? eq(existencias.bodegaId, lugar.bodegaId) : lugar.proyectoId ? eq(existencias.proyectoId, lugar.proyectoId) : isNotNull(existencias.bodegaId);
  const filas = await db
    .select({ id: articulos.id, codigo: articulos.codigo, nombre: articulos.nombre, unidad: articulos.unidad, cantidad: existencias.cantidad })
    .from(existencias)
    .innerJoin(articulos, eq(articulos.id, existencias.articuloId))
    .where(and(condicion, gt(existencias.cantidad, 0)))
    .orderBy(asc(articulos.codigo));
  return { datos: filas };
}

