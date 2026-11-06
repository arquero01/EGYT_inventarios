import { asc, countDistinct, desc, eq, sql } from 'drizzle-orm';
import { ErrorDominio, NOMBRE_ESTADO, NOMBRE_TIPO_EQUIPO, errorNoEncontrado } from '@egt/domain';
import type { Ejecutor } from '../db/cliente.ts';
import { equipos, instalaciones, proyectos } from '../db/esquema.ts';

/** RF-05: conteos por estado de los equipos de un proyecto. */
const columnasResumen = {
  total: sql<number>`count(${equipos.id})::int`,
  instalados: sql<number>`count(${equipos.id}) FILTER (WHERE ${equipos.estado} = 'INSTALADO')::int`,
  enStock: sql<number>`count(${equipos.id}) FILTER (WHERE ${equipos.estado} = 'EN_STOCK')::int`,
  enMantenimiento: sql<number>`count(${equipos.id}) FILTER (WHERE ${equipos.estado} = 'EN_MANTENIMIENTO')::int`,
  dadosDeBaja: sql<number>`count(${equipos.id}) FILTER (WHERE ${equipos.estado} = 'DADO_DE_BAJA')::int`,
};

/** Lista de proyectos con su resumen (RF-05 "para cada proyecto"). */
export async function listarProyectos(db: Ejecutor) {
  try {
    const filas = await db
      .select({ proyecto: proyectos, ...columnasResumen })
      .from(proyectos)
      .leftJoin(equipos, eq(equipos.proyectoId, proyectos.id))
      .groupBy(proyectos.id)
      .orderBy(desc(proyectos.fechaInicio), asc(proyectos.nombre));
    return {
      datos: filas.map(({ proyecto: p, ...resumen }) => ({
        id: p.id,
        nombre: p.nombre,
        vereda: p.vereda,
        municipio: p.municipio,
        departamento: p.departamento,
        fechaInicio: p.fechaInicio,
        resumen,
      })),
    };
  } catch (causa) {
    throw new ErrorDominio('RF-05', 'INTERNO', [{ campo: 'resumen', problema: String((causa as Error).message) }]);
  }
}

/** RF-02 (ficha) + RF-05 (resumen). */
export async function fichaProyecto(db: Ejecutor, proyectoId: string) {
  const [proyecto] = await db.select().from(proyectos).where(eq(proyectos.id, proyectoId));
  if (!proyecto) throw errorNoEncontrado('RF-02');

  let resumen;
  try {
    [resumen] = await db.select(columnasResumen).from(equipos).where(eq(equipos.proyectoId, proyectoId));
  } catch (causa) {
    throw new ErrorDominio('RF-05', 'INTERNO', [{ campo: 'resumen', problema: String((causa as Error).message) }]);
  }

  // Usuarios finales distintos que han recibido al menos una instalación del proyecto.
  const [{ usuariosAtendidos } = { usuariosAtendidos: 0 }] = await db
    .select({ usuariosAtendidos: countDistinct(instalaciones.usuarioFinalId) })
    .from(instalaciones)
    .where(eq(instalaciones.proyectoId, proyectoId));

  const lista = await db
    .select({
      id: equipos.id,
      tipo: equipos.tipo,
      marca: equipos.marca,
      modelo: equipos.modelo,
      serial: equipos.serial,
      estado: equipos.estado,
    })
    .from(equipos)
    .where(eq(equipos.proyectoId, proyectoId))
    .orderBy(asc(equipos.tipo), asc(equipos.serial));

  return {
    proyecto: {
      id: proyecto.id,
      nombre: proyecto.nombre,
      vereda: proyecto.vereda,
      municipio: proyecto.municipio,
      departamento: proyecto.departamento,
      fechaInicio: proyecto.fechaInicio,
      descripcion: proyecto.descripcion,
    },
    resumen,
    usuariosAtendidos,
    equipos: lista.map((e) => ({
      ...e,
      tipoNombre: NOMBRE_TIPO_EQUIPO[e.tipo],
      estadoNombre: NOMBRE_ESTADO[e.estado],
    })),
  };
}
