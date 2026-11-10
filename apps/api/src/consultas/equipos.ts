import { and, asc, count, desc, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
  MENSAJES,
  NOMBRE_ESTADO,
  NOMBRE_TIPO_EQUIPO,
  accionesPermitidas,
  errorNoEncontrado,
  errorValidacion,
  fechaColombia,
  normalizarBusqueda,
  normalizarSerial,
  type CodigoMensaje,
  type EstadoEquipo,
  type MovimientoEquipo,
  type TipoEquipo,
  type Ubicacion,
} from '@egt/domain';
import type { Ejecutor } from '../db/cliente.ts';
import { bodegas, compras, equipos, eventosEquipo, instalaciones, proyectos, usuariosFinales } from '../db/esquema.ts';

export interface FiltrosEquipos {
  estado?: EstadoEquipo | undefined;
  tipo?: TipoEquipo | undefined;
  proyectoId?: string | undefined;
  ubicacion?: Ubicacion | undefined;
  bodegaId?: string | undefined;
  zona?: string | undefined;
  garantia?: EstadoGarantia | undefined;
  /** true: solo equipos del histórico a los que les faltan datos. */
  pendientes?: boolean | undefined;
  /** true: solo equipos con celdas de color en el archivo ("Verificar …") sin revisar. */
  verificar?: boolean | undefined;
  /** true: solo equipos sin proyecto asignado. */
  sinProyecto?: boolean | undefined;
  q?: string | undefined;
  pagina: number;
  porPagina: number;
}

export const ESTADOS_GARANTIA = ['VIGENTE', 'POR_VENCER', 'VENCIDA', 'SIN_DATO'] as const;
export type EstadoGarantia = (typeof ESTADOS_GARANTIA)[number];
/** Días antes del vencimiento en que la garantía se marca "por vencer". */
const DIAS_AVISO_GARANTIA = 30;

const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/** Estado de la garantía a hoy (hora de Colombia). */
export function estadoGarantia(hasta: string | null, hoy = fechaColombia()): EstadoGarantia {
  if (!hasta) return 'SIN_DATO';
  if (hasta < hoy) return 'VENCIDA';
  return hasta <= sumarDias(hoy, DIAS_AVISO_GARANTIA) ? 'POR_VENCER' : 'VIGENTE';
}

/** minúsculas y sin tildes, igual que normalizarBusqueda() del dominio. */
const sinTildes = (col: SQL | unknown) => sql`translate(lower(${col}), 'áéíóúüñàèìòù', 'aeiouunaeiou')`;
const escaparLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Movimientos de logística posibles según el estado y la ubicación (RL-02). */
export function movimientosPosibles(estado: EstadoEquipo, ubicacion: Ubicacion): MovimientoEquipo[] {
  if (estado === 'DADO_DE_BAJA' || estado === 'INSTALADO') return [];
  if (ubicacion === 'CAMPO') return ['DEVOLUCION'];
  return estado === 'EN_STOCK' ? ['DESPACHO', 'TRASLADO'] : ['TRASLADO'];
}

const instalacionVigente = and(eq(instalaciones.equipoId, equipos.id), eq(instalaciones.vigente, true));

function condiciones(f: FiltrosEquipos): SQL | undefined {
  const lista: (SQL | undefined)[] = [];
  if (f.estado) lista.push(eq(equipos.estado, f.estado));
  if (f.tipo) lista.push(eq(equipos.tipo, f.tipo));
  if (f.proyectoId) lista.push(eq(equipos.proyectoId, f.proyectoId));
  if (f.ubicacion) lista.push(eq(equipos.ubicacion, f.ubicacion));
  if (f.bodegaId) lista.push(eq(equipos.bodegaId, f.bodegaId));
  if (f.zona) lista.push(sql`${sinTildes(equipos.zona)} = ${normalizarBusqueda(f.zona)}`);
  if (f.pendientes) lista.push(sql`cardinality(${equipos.pendientes}) > 0`);
  if (f.sinProyecto) lista.push(isNull(equipos.proyectoId));
  if (f.verificar) lista.push(sql`EXISTS (SELECT 1 FROM unnest(${equipos.pendientes}) AS p WHERE p LIKE 'Verificar%')`);
  if (f.garantia) {
    const hoy = fechaColombia();
    const limite = sumarDias(hoy, DIAS_AVISO_GARANTIA);
    lista.push(
      f.garantia === 'SIN_DATO'
        ? isNull(equipos.garantiaHasta)
        : f.garantia === 'VENCIDA'
          ? sql`${equipos.garantiaHasta} < ${hoy}`
          : f.garantia === 'POR_VENCER'
            ? and(sql`${equipos.garantiaHasta} >= ${hoy}`, sql`${equipos.garantiaHasta} <= ${limite}`)
            : and(isNotNull(equipos.garantiaHasta), sql`${equipos.garantiaHasta} > ${limite}`),
    );
  }
  if (f.q !== undefined) {
    const termino = normalizarBusqueda(f.q);
    if (termino.length < 2) throw errorValidacion('RF-22-MINIMO', [{ campo: 'q', problema: 'Mínimo 2 caracteres' }]);
    const patron = `%${escaparLike(termino)}%`;
    const patronSerial = `%${escaparLike(normalizarSerial(f.q))}%`;
    // La cédula se compara solo con dígitos ("1.234.567" encuentra 1234567), útil al atender una PQR.
    const digitos = f.q.replace(/\D/g, '');
    // RF-22: serial (o código interno), serial del fabricante, marca, modelo, descripción,
    // proveedor, proyecto, zona, usuario final, su cédula o su NIU.
    lista.push(
      or(
        ...(digitos.length >= 4
          ? [sql`${usuariosFinales.cedula} LIKE ${`%${digitos}%`}`, sql`${usuariosFinales.niu} LIKE ${`%${digitos}%`}`]
          : []),
        sql`${equipos.serialNormalizado} LIKE ${patronSerial}`,
        sql`upper(replace(${equipos.serialFabricante}, ' ', '')) LIKE ${patronSerial}`,
        sql`${sinTildes(equipos.descripcion)} LIKE ${patron}`,
        sql`${sinTildes(equipos.zona)} LIKE ${patron}`,
        sql`${sinTildes(equipos.marca)} LIKE ${patron}`,
        sql`${sinTildes(equipos.modelo)} LIKE ${patron}`,
        sql`${sinTildes(compras.proveedor)} LIKE ${patron}`,
        sql`${sinTildes(proyectos.nombre)} LIKE ${patron}`,
        sql`${sinTildes(usuariosFinales.nombre)} LIKE ${patron}`,
      ),
    );
  }
  return and(...lista);
}

/** Aviso a mostrar cuando la lista sale vacía, según el filtro más específico. */
function avisoVacio(f: FiltrosEquipos): { codigo: CodigoMensaje; mensaje: string } {
  const codigo: CodigoMensaje = f.q ? 'RF-22' : f.proyectoId ? 'RF-04' : f.estado ? 'RF-20' : f.tipo ? 'RF-21' : 'RF-19';
  return { codigo, mensaje: MENSAJES[codigo] };
}

/** RF-04, RF-19, RF-20, RF-21, RF-22 */
export async function listarEquipos(db: Ejecutor, f: FiltrosEquipos) {
  if (f.proyectoId) {
    const [p] = await db.select({ id: proyectos.id }).from(proyectos).where(eq(proyectos.id, f.proyectoId));
    if (!p) throw errorNoEncontrado('RF-02', [{ campo: 'proyectoId', problema: 'El proyecto no existe' }]);
  }
  const donde = condiciones(f);

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(equipos)
    .leftJoin(proyectos, eq(proyectos.id, equipos.proyectoId))
    .leftJoin(compras, eq(compras.id, equipos.compraId))
    .leftJoin(instalaciones, instalacionVigente)
    .leftJoin(usuariosFinales, eq(usuariosFinales.id, instalaciones.usuarioFinalId))
    .leftJoin(bodegas, eq(bodegas.id, equipos.bodegaId))
    .where(donde);

  const filas = await db
    .select({
      id: equipos.id,
      tipo: equipos.tipo,
      marca: equipos.marca,
      modelo: equipos.modelo,
      serial: equipos.serial,
      serialFabricante: equipos.serialFabricante,
      descripcion: equipos.descripcion,
      zona: equipos.zona,
      garantiaHasta: equipos.garantiaHasta,
      pendientes: equipos.pendientes,
      estado: equipos.estado,
      ubicacion: equipos.ubicacion,
      bodegaId: bodegas.id,
      bodegaNombre: bodegas.nombre,
      proyectoId: proyectos.id,
      proyectoNombre: proyectos.nombre,
      usuarioId: usuariosFinales.id,
      usuarioNombre: usuariosFinales.nombre,
      usuarioCedula: usuariosFinales.cedula,
    })
    .from(equipos)
    .leftJoin(proyectos, eq(proyectos.id, equipos.proyectoId))
    .leftJoin(compras, eq(compras.id, equipos.compraId))
    .leftJoin(instalaciones, instalacionVigente)
    .leftJoin(usuariosFinales, eq(usuariosFinales.id, instalaciones.usuarioFinalId))
    .leftJoin(bodegas, eq(bodegas.id, equipos.bodegaId))
    .where(donde)
    .orderBy(desc(equipos.creadoEn), asc(equipos.id))
    .limit(f.porPagina)
    .offset((f.pagina - 1) * f.porPagina);

  return {
    datos: filas.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      tipoNombre: NOMBRE_TIPO_EQUIPO[e.tipo],
      marca: e.marca,
      modelo: e.modelo,
      serial: e.serial,
      serialFabricante: e.serialFabricante,
      descripcion: e.descripcion,
      zona: e.zona,
      garantiaHasta: e.garantiaHasta,
      garantia: estadoGarantia(e.garantiaHasta),
      pendientes: e.pendientes,
      estado: e.estado,
      estadoNombre: NOMBRE_ESTADO[e.estado],
      ubicacion: e.ubicacion,
      bodega: e.bodegaId ? { id: e.bodegaId, nombre: e.bodegaNombre } : null,
      proyecto: e.proyectoId ? { id: e.proyectoId, nombre: e.proyectoNombre } : null,
      usuarioFinal: e.usuarioId ? { id: e.usuarioId, nombre: e.usuarioNombre, cedula: e.usuarioCedula } : null,
    })),
    paginacion: {
      pagina: f.pagina,
      porPagina: f.porPagina,
      total,
      totalPaginas: Math.ceil(total / f.porPagina),
    },
    ...(total === 0 ? { aviso: avisoVacio(f) } : {}),
  };
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RF-16: hoja de vida por id o por serial. */
export async function hojaDeVida(db: Ejecutor, idOSerial: string) {
  const filtro = ES_UUID.test(idOSerial)
    ? eq(equipos.id, idOSerial)
    : eq(equipos.serialNormalizado, normalizarSerial(idOSerial));

  const [fila] = await db
    .select({ equipo: equipos, proyecto: proyectos, compra: compras, bodega: bodegas })
    .from(equipos)
    .leftJoin(proyectos, eq(proyectos.id, equipos.proyectoId))
    .leftJoin(compras, eq(compras.id, equipos.compraId))
    .leftJoin(bodegas, eq(bodegas.id, equipos.bodegaId))
    .where(filtro);
  if (!fila) throw errorNoEncontrado('RF-16');
  const { equipo, proyecto, compra, bodega } = fila;

  const historialInstalaciones = await db
    .select({ instalacion: instalaciones, usuario: usuariosFinales })
    .from(instalaciones)
    .innerJoin(usuariosFinales, eq(usuariosFinales.id, instalaciones.usuarioFinalId))
    .where(eq(instalaciones.equipoId, equipo.id))
    .orderBy(desc(instalaciones.creadoEn));

  const historial = await db
    .select()
    .from(eventosEquipo)
    .where(eq(eventosEquipo.equipoId, equipo.id))
    .orderBy(asc(eventosEquipo.rev));

  const aInstalacion = ({ instalacion: i, usuario: u }: (typeof historialInstalaciones)[number]) => ({
    id: i.id,
    usuarioFinal: { id: u.id, nombre: u.nombre, cedula: u.cedula, telefono: u.telefono, niu: u.niu },
    ubicacion: { vereda: i.vereda, municipio: i.municipio, departamento: i.departamento },
    fechaInstalacion: i.fechaInstalacion,
    tecnico: i.tecnico,
    vigente: i.vigente,
    finalizadaEn: i.finalizadaEn,
    motivoFin: i.motivoFin,
  });
  const vigente = historialInstalaciones.find((h) => h.instalacion.vigente);

  return {
    equipo: {
      id: equipo.id,
      tipo: equipo.tipo,
      tipoNombre: NOMBRE_TIPO_EQUIPO[equipo.tipo],
      marca: equipo.marca,
      modelo: equipo.modelo,
      serial: equipo.serial,
      origenSerial: equipo.origenSerial,
      serialFabricante: equipo.serialFabricante,
      descripcion: equipo.descripcion,
      zona: equipo.zona,
      garantiaHasta: equipo.garantiaHasta,
      garantia: estadoGarantia(equipo.garantiaHasta),
      pendientes: equipo.pendientes,
      potencia: equipo.potencia,
      unidad: equipo.unidad,
      estado: equipo.estado,
      estadoNombre: NOMBRE_ESTADO[equipo.estado],
      fechaIngreso: equipo.fechaIngreso,
      ubicacion: equipo.ubicacion,
      bodega: bodega ? { id: bodega.id, nombre: bodega.nombre, municipio: bodega.municipio } : null,
      // Un equipo del histórico sin proyecto puede recibir uno en cualquier estado (menos de baja).
      accionesPermitidas:
        equipo.proyectoId === null && equipo.estado !== 'DADO_DE_BAJA' && !accionesPermitidas(equipo.estado).includes('CAMBIAR_PROYECTO')
          ? [...accionesPermitidas(equipo.estado), 'CAMBIAR_PROYECTO' as const]
          : accionesPermitidas(equipo.estado),
      movimientosPosibles: movimientosPosibles(equipo.estado, equipo.ubicacion),
    },
    // null en equipos del histórico que todavía no tienen proyecto o compra.
    proyecto: proyecto
      ? {
          id: proyecto.id,
          nombre: proyecto.nombre,
          vereda: proyecto.vereda,
          municipio: proyecto.municipio,
          departamento: proyecto.departamento,
        }
      : null,
    compra: compra
      ? {
          proveedor: compra.proveedor,
          nit: compra.nit === null ? null : compra.nitDv === null ? compra.nit : `${compra.nit}-${compra.nitDv}`,
          numeroFactura: compra.numeroFactura,
          fechaCompra: compra.fechaCompra,
          valorPagado: equipo.valorPagado,
        }
      : null,
    valorPagado: equipo.valorPagado,
    instalacionActual: vigente ? aInstalacion(vigente) : null,
    instalacionesAnteriores: historialInstalaciones.filter((h) => !h.instalacion.vigente).map(aInstalacion),
    historial: historial.map((ev) => ({
      id: ev.id,
      tipo: ev.tipo,
      descripcion: ev.descripcion,
      estadoAnterior: ev.estadoAnterior,
      estadoNuevo: ev.estadoNuevo,
      ocurridoEn: ev.ocurridoEn,
      registradoEn: ev.registradoEn,
      autor: ev.autor,
      datos: ev.datos,
    })),
  };
}

/** Zonas (centros de costos) con cuántos equipos tiene cada una. */
export async function listarZonas(db: Ejecutor) {
  const filas = await db
    .select({ zona: equipos.zona, equipos: count() })
    .from(equipos)
    .where(isNotNull(equipos.zona))
    .groupBy(equipos.zona)
    .orderBy(asc(equipos.zona));
  return { datos: filas.map((f) => ({ zona: f.zona!, equipos: f.equipos })) };
}
