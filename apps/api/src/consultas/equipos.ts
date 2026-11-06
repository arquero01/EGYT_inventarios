import { and, asc, count, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import {
  MENSAJES,
  NOMBRE_ESTADO,
  NOMBRE_TIPO_EQUIPO,
  accionesPermitidas,
  errorNoEncontrado,
  errorValidacion,
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
  q?: string | undefined;
  pagina: number;
  porPagina: number;
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
  if (f.q !== undefined) {
    const termino = normalizarBusqueda(f.q);
    if (termino.length < 2) throw errorValidacion('RF-22-MINIMO', [{ campo: 'q', problema: 'Mínimo 2 caracteres' }]);
    const patron = `%${escaparLike(termino)}%`;
    const patronSerial = `%${escaparLike(normalizarSerial(f.q))}%`;
    // La cédula se compara solo con dígitos ("1.234.567" encuentra 1234567), útil al atender una PQR.
    const digitos = f.q.replace(/\D/g, '');
    // RF-22: serial, marca, modelo, proveedor, proyecto, usuario final o su cédula.
    lista.push(
      or(
        ...(digitos.length >= 4 ? [sql`${usuariosFinales.cedula} LIKE ${`%${digitos}%`}`] : []),
        sql`${equipos.serialNormalizado} LIKE ${patronSerial}`,
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
    .innerJoin(proyectos, eq(proyectos.id, equipos.proyectoId))
    .innerJoin(compras, eq(compras.id, equipos.compraId))
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
    .innerJoin(proyectos, eq(proyectos.id, equipos.proyectoId))
    .innerJoin(compras, eq(compras.id, equipos.compraId))
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
      estado: e.estado,
      estadoNombre: NOMBRE_ESTADO[e.estado],
      ubicacion: e.ubicacion,
      bodega: e.bodegaId ? { id: e.bodegaId, nombre: e.bodegaNombre } : null,
      proyecto: { id: e.proyectoId, nombre: e.proyectoNombre },
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
    .innerJoin(proyectos, eq(proyectos.id, equipos.proyectoId))
    .innerJoin(compras, eq(compras.id, equipos.compraId))
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
    usuarioFinal: { id: u.id, nombre: u.nombre, cedula: u.cedula, telefono: u.telefono },
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
      potencia: equipo.potencia,
      unidad: equipo.unidad,
      estado: equipo.estado,
      estadoNombre: NOMBRE_ESTADO[equipo.estado],
      fechaIngreso: equipo.fechaIngreso,
      ubicacion: equipo.ubicacion,
      bodega: bodega ? { id: bodega.id, nombre: bodega.nombre, municipio: bodega.municipio } : null,
      accionesPermitidas: accionesPermitidas(equipo.estado),
      movimientosPosibles: movimientosPosibles(equipo.estado, equipo.ubicacion),
    },
    proyecto: {
      id: proyecto.id,
      nombre: proyecto.nombre,
      vereda: proyecto.vereda,
      municipio: proyecto.municipio,
      departamento: proyecto.departamento,
    },
    compra: {
      proveedor: compra.proveedor,
      nit: compra.nitDv === null ? compra.nit : `${compra.nit}-${compra.nitDv}`,
      numeroFactura: compra.numeroFactura,
      fechaCompra: compra.fechaCompra,
      valorPagado: equipo.valorPagado,
    },
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
