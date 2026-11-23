import { and, asc, count, countDistinct, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { ErrorDominio, NOMBRE_ESTADO, NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO, errorNoEncontrado } from '@egt/domain';
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

/** Equipos que se listan en la ficha; el resto se ve en Equipos con el filtro del proyecto. */
const EQUIPOS_EN_FICHA = 20;

/** RF-02 (ficha) + RF-05 (resumen). */
export async function fichaProyecto(db: Ejecutor, proyectoId: string) {
  const [proyecto] = await db.select().from(proyectos).where(eq(proyectos.id, proyectoId));
  if (!proyecto) throw errorNoEncontrado('RF-02');

  let resumen;
  try {
    [resumen] = await db
      .select({
        ...columnasResumen,
        enBodega: sql<number>`count(${equipos.id}) FILTER (WHERE ${equipos.ubicacion} = 'BODEGA')::int`,
        enCampo: sql<number>`count(${equipos.id}) FILTER (WHERE ${equipos.ubicacion} = 'CAMPO')::int`,
      })
      .from(equipos)
      .where(eq(equipos.proyectoId, proyectoId));
  } catch (causa) {
    throw new ErrorDominio('RF-05', 'INTERNO', [{ campo: 'resumen', problema: String((causa as Error).message) }]);
  }

  // Usuarios finales distintos que han recibido al menos una instalación del proyecto.
  const [{ usuariosAtendidos } = { usuariosAtendidos: 0 }] = await db
    .select({ usuariosAtendidos: countDistinct(instalaciones.usuarioFinalId) })
    .from(instalaciones)
    .where(eq(instalaciones.proyectoId, proyectoId));

  // Tablero del proyecto, como el de Inicio: equipos por tipo y estado, y por zona.
  const filasTipo = await db
    .select({ tipo: equipos.tipo, ...columnasResumen })
    .from(equipos)
    .where(eq(equipos.proyectoId, proyectoId))
    .groupBy(equipos.tipo);
  const porTipo = TIPOS_EQUIPO.map((tipo) => {
    const f = filasTipo.find((x) => x.tipo === tipo);
    return {
      tipo,
      tipoNombre: NOMBRE_TIPO_EQUIPO[tipo],
      cantidad: f?.enStock ?? 0,
      instalados: f?.instalados ?? 0,
      enMantenimiento: f?.enMantenimiento ?? 0,
      dadosDeBaja: f?.dadosDeBaja ?? 0,
      total: f?.total ?? 0,
    };
  });
  const porZona = await db
    .select({ zona: equipos.zona, equipos: count() })
    .from(equipos)
    .where(and(eq(equipos.proyectoId, proyectoId), isNotNull(equipos.zona)))
    .groupBy(equipos.zona)
    .orderBy(desc(count()));
  // Equipos entregados como reposición (reemplazaron a uno con fallas) dentro del proyecto.
  const [{ reposiciones } = { reposiciones: 0 }] = await db
    .select({ reposiciones: countDistinct(instalaciones.equipoId) })
    .from(instalaciones)
    .where(and(eq(instalaciones.proyectoId, proyectoId), eq(instalaciones.tipoEntrega, 'REPOSICION')));

  // La lista completa está en Equipos (filtrada por el proyecto): aquí solo los primeros.
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
    .orderBy(asc(equipos.tipo), asc(equipos.serial))
    .limit(EQUIPOS_EN_FICHA);

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
    reposiciones,
    porTipo,
    porZona: porZona.map((z) => ({ zona: z.zona!, equipos: z.equipos })),
    equipos: lista.map((e) => ({
      ...e,
      tipoNombre: NOMBRE_TIPO_EQUIPO[e.tipo],
      estadoNombre: NOMBRE_ESTADO[e.estado],
    })),
  };
}
