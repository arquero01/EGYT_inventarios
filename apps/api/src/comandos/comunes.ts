import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  ErrorDominio,
  NOMBRE_TIPO_EQUIPO,
  PREFIJO_SERIAL,
  UNIDADES_ENTERAS,
  errorConflicto,
  errorNoEncontrado,
  errorValidacion,
  normalizarNit,
  type Comando,
  type EstadoEquipo,
  type TipoComando,
  type TipoEquipo,
  type TipoEvento,
  type TipoMovimiento,
} from '@egt/domain';
import type { Transaccion } from '../db/cliente.ts';
import {
  articulos,
  bodegas,
  compras,
  contadoresSerial,
  equipos,
  eventosEquipo,
  existencias,
  instalaciones,
  movimientoItems,
  movimientos,
  proyectos,
} from '../db/esquema.ts';

export type ComandoDe<T extends TipoComando> = Extract<Comando, { tipo: T }>;
export type Manejador<T extends TipoComando> = (tx: Transaccion, c: ComandoDe<T>) => Promise<Record<string, unknown>>;
export type FilaEquipo = typeof equipos.$inferSelect;
export type FilaArticulo = typeof articulos.$inferSelect;

// ── Búsquedas con bloqueo ──────────────────────────────────────────────────

export async function cargarEquipo(tx: Transaccion, equipoId: string, campo = 'payload.equipoId'): Promise<FilaEquipo> {
  const [equipo] = await tx.select().from(equipos).where(eq(equipos.id, equipoId)).for('update');
  if (!equipo) throw errorNoEncontrado('RF-16', [{ campo, problema: `El equipo ${equipoId} no existe` }]);
  return equipo;
}

export async function exigirProyecto(tx: Transaccion, proyectoId: string, campo = 'payload.proyectoId') {
  const [p] = await tx.select({ id: proyectos.id, nombre: proyectos.nombre }).from(proyectos).where(eq(proyectos.id, proyectoId));
  if (!p) throw errorNoEncontrado('RF-02', [{ campo, problema: 'El proyecto no existe' }]);
  return p;
}

export async function exigirBodega(tx: Transaccion, bodegaId: string, campo: string) {
  const [b] = await tx.select({ id: bodegas.id, nombre: bodegas.nombre, activa: bodegas.activa }).from(bodegas).where(eq(bodegas.id, bodegaId));
  if (!b || !b.activa) throw errorNoEncontrado('RL-01-NO-EXISTE', [{ campo, problema: 'La bodega no existe o está inactiva' }]);
  return b;
}

/** Carga los artículos y verifica que existan y que la cantidad sea entera si su unidad lo exige. */
export async function exigirArticulos(
  tx: Transaccion,
  items: { articuloId: string; cantidad: number }[],
  campo: string,
): Promise<Map<string, FilaArticulo>> {
  if (items.length === 0) return new Map();
  const filas = await tx.select().from(articulos).where(inArray(articulos.id, items.map((i) => i.articuloId)));
  const mapa = new Map(filas.map((a) => [a.id, a]));
  items.forEach((it, i) => {
    const a = mapa.get(it.articuloId);
    if (!a || !a.activo) throw errorNoEncontrado('RL-03-NO-EXISTE', [{ campo: `${campo}.${i}.articuloId`, problema: 'El artículo no existe' }]);
    if (UNIDADES_ENTERAS.includes(a.unidad) && !Number.isInteger(it.cantidad)) {
      throw errorValidacion('RL-03-ENTERA', [{ campo: `${campo}.${i}.cantidad`, problema: `${a.codigo} se maneja en ${a.unidad}: use un número entero` }]);
    }
  });
  return mapa;
}

export const nombreEquipo = (e: Pick<FilaEquipo, 'tipo' | 'marca' | 'modelo' | 'serial'>) =>
  `${[NOMBRE_TIPO_EQUIPO[e.tipo], e.marca, e.modelo].filter(Boolean).join(' ')} (serial ${e.serial})`;

/** Serial asignado por el sistema: EGT-PAN-000001. */
export async function asignarSerialEmpresa(tx: Transaccion, tipo: TipoEquipo): Promise<string> {
  const prefijo = PREFIJO_SERIAL[tipo];
  const numero = await siguienteConsecutivo(tx, prefijo);
  return `EGT-${prefijo}-${String(numero).padStart(6, '0')}`;
}

// ── Historial ──────────────────────────────────────────────────────────────

export interface DatosEvento {
  equipoId: string;
  tipo: TipoEvento;
  estadoAnterior: EstadoEquipo | null;
  estadoNuevo: EstadoEquipo;
  descripcion: string;
  datos?: Record<string, unknown>;
}

/** RF-17: agrega un evento al historial. Corre en la misma transacción que el cambio. */
export async function registrarEvento(tx: Transaccion, c: Comando, e: DatosEvento): Promise<void> {
  try {
    await tx.insert(eventosEquipo).values({
      equipoId: e.equipoId,
      comandoId: c.id,
      tipo: e.tipo,
      estadoAnterior: e.estadoAnterior,
      estadoNuevo: e.estadoNuevo,
      descripcion: e.descripcion.slice(0, 500),
      datos: e.datos ?? {},
      ocurridoEn: new Date(c.ocurridoEn),
      autor: c.autor ?? null,
    });
  } catch (causa) {
    throw new ErrorDominio('RF-17', 'INTERNO', [{ campo: 'historial', problema: String((causa as Error).message ?? causa) }]);
  }
}

/** Cierra la instalación vigente del equipo, si la tiene. Devuelve su id. */
export async function cerrarInstalacionVigente(tx: Transaccion, equipoId: string, cuando: Date, motivo: string) {
  const [cerrada] = await tx
    .update(instalaciones)
    .set({ vigente: false, finalizadaEn: cuando, motivoFin: motivo.slice(0, 500) })
    .where(and(eq(instalaciones.equipoId, equipoId), eq(instalaciones.vigente, true)))
    .returning({ id: instalaciones.id });
  return cerrada?.id ?? null;
}

// ── Consecutivos y compras ─────────────────────────────────────────────────

/** Siguiente número de un contador (atómico dentro de la transacción). */
export async function siguienteConsecutivo(tx: Transaccion, prefijo: string): Promise<number> {
  const [fila] = await tx
    .insert(contadoresSerial)
    .values({ prefijo, ultimo: 1 })
    .onConflictDoUpdate({ target: contadoresSerial.prefijo, set: { ultimo: sql`${contadoresSerial.ultimo} + 1` } })
    .returning({ ultimo: contadoresSerial.ultimo });
  return fila!.ultimo;
}

type DatosCompra = ComandoDe<'REGISTRAR_INGRESO'>['payload']['compra'];

/** RF-08: reutiliza la factura si ya existe; si no, la crea. */
export async function obtenerOCrearCompra(tx: Transaccion, datos: DatosCompra): Promise<string> {
  const nit = normalizarNit(datos.nit)!; // ya validado por el dominio
  const numeroFactura = datos.numeroFactura.toUpperCase();
  const [existente] = await tx
    .select()
    .from(compras)
    .where(and(eq(compras.nit, nit.numero), eq(compras.numeroFactura, numeroFactura)));
  if (existente) {
    const mismoProveedor = existente.proveedor.trim().toLowerCase() === datos.proveedor.trim().toLowerCase();
    if (!mismoProveedor || existente.fechaCompra !== datos.fechaCompra) {
      throw errorConflicto('RF-08-FACTURA', [
        { campo: 'payload.compra', problema: `La factura ya está registrada a nombre de "${existente.proveedor}" con fecha ${existente.fechaCompra}` },
      ]);
    }
    return existente.id;
  }
  const [nueva] = await tx
    .insert(compras)
    .values({ proveedor: datos.proveedor, nit: nit.numero, nitDv: nit.dv, numeroFactura, fechaCompra: datos.fechaCompra })
    .returning({ id: compras.id });
  return nueva!.id;
}

// ── Movimientos y existencias (logística) ──────────────────────────────────

const PREFIJO_GUIA: Record<TipoMovimiento, string> = {
  INGRESO: 'ING',
  DESPACHO: 'DES',
  TRASLADO: 'TRA',
  DEVOLUCION: 'DEV',
};

export interface DatosMovimiento {
  tipo: TipoMovimiento;
  bodegaOrigenId?: string | null;
  bodegaDestinoId?: string | null;
  proyectoId?: string | null;
  compraId?: string | null;
  responsable?: string | null;
  observacion?: string | null | undefined;
}

export interface ItemMovimiento {
  equipoId?: string;
  articuloId?: string;
  cantidad: number;
  valorUnitario?: number | null;
}

/**
 * Crea la guía del movimiento con su número consecutivo (DES-000001). El id
 * de la guía es el del comando: así el celular la conoce aun sin conexión.
 */
export async function crearMovimiento(tx: Transaccion, c: Comando, m: DatosMovimiento, items: ItemMovimiento[]) {
  const prefijo = PREFIJO_GUIA[m.tipo];
  const numero = `${prefijo}-${String(await siguienteConsecutivo(tx, `MOV-${prefijo}`)).padStart(6, '0')}`;
  await tx.insert(movimientos).values({
    id: c.id,
    numero,
    tipo: m.tipo,
    bodegaOrigenId: m.bodegaOrigenId ?? null,
    bodegaDestinoId: m.bodegaDestinoId ?? null,
    proyectoId: m.proyectoId ?? null,
    compraId: m.compraId ?? null,
    responsable: m.responsable ?? null,
    observacion: m.observacion ?? null,
    ocurridoEn: new Date(c.ocurridoEn),
    autor: c.autor ?? null,
  });
  if (items.length > 0) {
    await tx.insert(movimientoItems).values(
      items.map((it) => ({
        movimientoId: c.id,
        equipoId: it.equipoId ?? null,
        articuloId: it.articuloId ?? null,
        cantidad: it.cantidad,
        valorUnitario: it.valorUnitario ?? null,
      })),
    );
  }
  return { movimientoId: c.id, numero };
}

export type Lugar = { bodegaId: string } | { proyectoId: string };

const condicionLugar = (articuloId: string, lugar: Lugar) =>
  'bodegaId' in lugar
    ? and(eq(existencias.articuloId, articuloId), eq(existencias.bodegaId, lugar.bodegaId))
    : and(eq(existencias.articuloId, articuloId), eq(existencias.proyectoId, lugar.proyectoId));

/** Suma unidades de un artículo en una bodega o proyecto. */
export async function sumarExistencia(tx: Transaccion, articuloId: string, lugar: Lugar, cantidad: number) {
  if ('bodegaId' in lugar) {
    await tx.execute(sql`
      INSERT INTO existencias (articulo_id, bodega_id, cantidad) VALUES (${articuloId}, ${lugar.bodegaId}, ${cantidad})
      ON CONFLICT (articulo_id, bodega_id) WHERE bodega_id IS NOT NULL
      DO UPDATE SET cantidad = existencias.cantidad + EXCLUDED.cantidad`);
  } else {
    await tx.execute(sql`
      INSERT INTO existencias (articulo_id, proyecto_id, cantidad) VALUES (${articuloId}, ${lugar.proyectoId}, ${cantidad})
      ON CONFLICT (articulo_id, proyecto_id) WHERE proyecto_id IS NOT NULL
      DO UPDATE SET cantidad = existencias.cantidad + EXCLUDED.cantidad`);
  }
}

/** RL-08: resta unidades; falla si no alcanzan (nunca queda negativo). */
export async function restarExistencia(tx: Transaccion, articulo: FilaArticulo, lugar: Lugar, cantidad: number, campo: string) {
  const [ok] = await tx
    .update(existencias)
    .set({ cantidad: sql`${existencias.cantidad} - ${cantidad}` })
    .where(and(condicionLugar(articulo.id, lugar), gte(existencias.cantidad, cantidad)))
    .returning({ id: existencias.id });
  if (ok) return;
  const [actual] = await tx.select({ cantidad: existencias.cantidad }).from(existencias).where(condicionLugar(articulo.id, lugar));
  throw errorConflicto('RL-08', [
    { campo, problema: `${articulo.codigo} (${articulo.nombre}): disponible ${actual?.cantidad ?? 0} ${articulo.unidad}, solicitado ${cantidad}` },
  ]);
}
