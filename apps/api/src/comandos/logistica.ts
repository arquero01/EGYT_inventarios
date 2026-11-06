import { eq } from 'drizzle-orm';
import {
  NOMBRE_MOVIMIENTO,
  evaluarMovimientoEquipo,
  type Comando,
  type MovimientoEquipo,
} from '@egt/domain';
import type { Transaccion } from '../db/cliente.ts';
import { articulos, bodegas, equipos } from '../db/esquema.ts';
import {
  cargarEquipo,
  crearMovimiento,
  exigirArticulos,
  exigirBodega,
  exigirProyecto,
  nombreEquipo,
  obtenerOCrearCompra,
  registrarEvento,
  restarExistencia,
  sumarExistencia,
  type ItemMovimiento,
  type Lugar,
  type Manejador,
} from './comunes.ts';

type ComandoLogistica = 'CREAR_BODEGA' | 'CREAR_ARTICULO' | 'INGRESAR_ARTICULOS' | 'REGISTRAR_DESPACHO' | 'REGISTRAR_TRASLADO' | 'REGISTRAR_DEVOLUCION';

/** RL-01 */
const crearBodega: Manejador<'CREAR_BODEGA'> = async (tx, c) => {
  const p = c.payload;
  await tx.insert(bodegas).values({
    id: p.bodegaId,
    nombre: p.nombre,
    municipio: p.municipio,
    departamento: p.departamento,
    direccion: p.direccion ?? null,
  });
  return { bodegaId: p.bodegaId };
};

/** RL-03 */
const crearArticulo: Manejador<'CREAR_ARTICULO'> = async (tx, c) => {
  const p = c.payload;
  await tx.insert(articulos).values({
    id: p.articuloId,
    codigo: p.codigo,
    nombre: p.nombre,
    unidad: p.unidad,
    descripcion: p.descripcion ?? null,
  });
  return { articuloId: p.articuloId, codigo: p.codigo };
};

/** RL-04: entrada de artículos por cantidad, con su factura. */
const ingresarArticulos: Manejador<'INGRESAR_ARTICULOS'> = async (tx, c) => {
  const p = c.payload;
  const bodega = await exigirBodega(tx, p.bodegaId, 'payload.bodegaId');
  await exigirArticulos(tx, p.items, 'payload.items');
  const compraId = await obtenerOCrearCompra(tx, p.compra);
  for (const it of p.items) {
    await sumarExistencia(tx, it.articuloId, { bodegaId: bodega.id }, it.cantidad);
  }
  const guia = await crearMovimiento(
    tx,
    c,
    { tipo: 'INGRESO', bodegaDestinoId: bodega.id, compraId, responsable: c.autor ?? null, observacion: p.observacion },
    p.items.map((it) => ({ articuloId: it.articuloId, cantidad: it.cantidad, valorUnitario: it.valorUnitario })),
  );
  return { ...guia, compraId, articulos: p.items.length };
};

// ── Movimientos de equipos y artículos ─────────────────────────────────────

interface Movimiento {
  tipo: MovimientoEquipo;
  equipos: string[];
  articulos: { articuloId: string; cantidad: number }[];
  responsable: string;
  observacion?: string | undefined;
  bodegaOrigenId?: string;
  bodegaDestinoId?: string;
  proyectoId?: string;
  /** Lugar de donde salen y a donde llegan los artículos por cantidad. */
  desde: Lugar;
  hacia: Lugar;
  /** Texto para el historial de cada equipo, p. ej. "Despachado de Bodega Cali al proyecto X". */
  descripcion: string;
}

/**
 * Mueve equipos y artículos en una sola transacción: si un solo equipo no está
 * donde debe o falta cantidad de un artículo, no se mueve nada (RL-02, RL-08).
 */
async function mover(tx: Transaccion, c: Comando, m: Movimiento) {
  const items: ItemMovimiento[] = [];

  for (const [i, equipoId] of m.equipos.entries()) {
    const equipo = await cargarEquipo(tx, equipoId, `payload.equipos.${i}`);
    const r = evaluarMovimientoEquipo(equipo, {
      tipo: m.tipo,
      ...(m.bodegaOrigenId ? { bodegaOrigenId: m.bodegaOrigenId } : {}),
      ...(m.bodegaDestinoId ? { bodegaDestinoId: m.bodegaDestinoId } : {}),
      ...(m.proyectoId ? { proyectoId: m.proyectoId } : {}),
    });
    if (!r.ok) {
      r.error.detalles.splice(0, r.error.detalles.length, {
        campo: `payload.equipos.${i}`,
        problema: `${nombreEquipo(equipo)}: ${r.error.detalles[0]?.problema ?? r.error.message}`,
      });
      throw r.error;
    }
    // Al despachar, el equipo pasa al proyecto que lo recibe.
    const cambiaProyecto = m.tipo === 'DESPACHO' && m.proyectoId && m.proyectoId !== equipo.proyectoId;
    await tx
      .update(equipos)
      .set({ ubicacion: r.ubicacion, bodegaId: r.bodegaId, ...(cambiaProyecto ? { proyectoId: m.proyectoId } : {}) })
      .where(eq(equipos.id, equipo.id));
    await registrarEvento(tx, c, {
      equipoId: equipo.id,
      tipo: m.tipo,
      estadoAnterior: equipo.estado,
      estadoNuevo: equipo.estado,
      descripcion: m.descripcion,
      datos: {
        movimientoId: c.id,
        responsable: m.responsable,
        bodegaAnterior: equipo.bodegaId,
        bodegaNueva: r.bodegaId,
        ...(cambiaProyecto ? { proyectoAnterior: equipo.proyectoId, proyectoNuevo: m.proyectoId } : {}),
      },
    });
    items.push({ equipoId: equipo.id, cantidad: 1 });
  }

  const catalogo = await exigirArticulos(tx, m.articulos, 'payload.articulos');
  for (const [i, it] of m.articulos.entries()) {
    await restarExistencia(tx, catalogo.get(it.articuloId)!, m.desde, it.cantidad, `payload.articulos.${i}.cantidad`);
    await sumarExistencia(tx, it.articuloId, m.hacia, it.cantidad);
    items.push({ articuloId: it.articuloId, cantidad: it.cantidad });
  }

  const guia = await crearMovimiento(
    tx,
    c,
    {
      tipo: m.tipo,
      bodegaOrigenId: m.bodegaOrigenId ?? null,
      bodegaDestinoId: m.bodegaDestinoId ?? null,
      proyectoId: m.proyectoId ?? null,
      responsable: m.responsable,
      observacion: m.observacion,
    },
    items,
  );
  return { ...guia, equipos: m.equipos.length, articulos: m.articulos.length };
}

/** RL-05: de una bodega a un proyecto. */
const registrarDespacho: Manejador<'REGISTRAR_DESPACHO'> = async (tx, c) => {
  const p = c.payload;
  const bodega = await exigirBodega(tx, p.bodegaOrigenId, 'payload.bodegaOrigenId');
  const proyecto = await exigirProyecto(tx, p.proyectoId);
  return mover(tx, c, {
    tipo: 'DESPACHO',
    ...p,
    desde: { bodegaId: bodega.id },
    hacia: { proyectoId: proyecto.id },
    descripcion: `${NOMBRE_MOVIMIENTO.DESPACHO}: de ${bodega.nombre} al proyecto ${proyecto.nombre}. Responsable: ${p.responsable}`,
  });
};

/** RL-06: de una bodega a otra. */
const registrarTraslado: Manejador<'REGISTRAR_TRASLADO'> = async (tx, c) => {
  const p = c.payload;
  const origen = await exigirBodega(tx, p.bodegaOrigenId, 'payload.bodegaOrigenId');
  const destino = await exigirBodega(tx, p.bodegaDestinoId, 'payload.bodegaDestinoId');
  return mover(tx, c, {
    tipo: 'TRASLADO',
    ...p,
    desde: { bodegaId: origen.id },
    hacia: { bodegaId: destino.id },
    descripcion: `${NOMBRE_MOVIMIENTO.TRASLADO}: de ${origen.nombre} a ${destino.nombre}. Responsable: ${p.responsable}`,
  });
};

/** RL-07: de un proyecto (campo) de vuelta a una bodega. */
const registrarDevolucion: Manejador<'REGISTRAR_DEVOLUCION'> = async (tx, c) => {
  const p = c.payload;
  const proyecto = await exigirProyecto(tx, p.proyectoId);
  const destino = await exigirBodega(tx, p.bodegaDestinoId, 'payload.bodegaDestinoId');
  return mover(tx, c, {
    tipo: 'DEVOLUCION',
    ...p,
    desde: { proyectoId: proyecto.id },
    hacia: { bodegaId: destino.id },
    descripcion: `${NOMBRE_MOVIMIENTO.DEVOLUCION}: del proyecto ${proyecto.nombre} a ${destino.nombre}. Responsable: ${p.responsable}`,
  });
};

export const MANEJADORES_LOGISTICA: { [T in ComandoLogistica]: Manejador<T> } = {
  CREAR_BODEGA: crearBodega,
  CREAR_ARTICULO: crearArticulo,
  INGRESAR_ARTICULOS: ingresarArticulos,
  REGISTRAR_DESPACHO: registrarDespacho,
  REGISTRAR_TRASLADO: registrarTraslado,
  REGISTRAR_DEVOLUCION: registrarDevolucion,
};

