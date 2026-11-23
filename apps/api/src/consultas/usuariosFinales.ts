import { sql, type SQL } from 'drizzle-orm';
import { NOMBRE_ESTADO, NOMBRE_TIPO_EQUIPO, errorNoEncontrado, normalizarBusqueda, type EstadoEquipo, type TipoEntrega, type TipoEquipo } from '@egt/domain';
import type { Ejecutor } from '../db/cliente.ts';

/**
 * Usuarios finales: las personas a las que se les ha entregado al menos un
 * equipo. Su zona es la del equipo entregado (centro de costos) o, si el
 * equipo no tiene zona, el municipio de la instalación.
 */

/** Filas de una consulta SQL directa (PGlite las entrega en .rows; postgres-js, como arreglo). */
async function filas<T>(db: Ejecutor, consulta: SQL): Promise<T[]> {
  const r = (await db.execute(consulta)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/** La zona de cada entrega, ya normalizada para agrupar (minúsculas, sin tildes). */
const ZONA = sql.raw(`coalesce(nullif(btrim(e.zona), ''), nullif(btrim(i.municipio), ''), 'Sin zona')`);
const LLAVE = sql.raw(`translate(lower(coalesce(nullif(btrim(e.zona), ''), nullif(btrim(i.municipio), ''), 'Sin zona')), 'áéíóúüñ', 'aeiouun')`);
export const llaveZona = (zona: string) => normalizarBusqueda(zona).replace(/\s+/g, ' ');

export async function resumenUsuariosFinales(db: Ejecutor) {
  const [totales] = await filas<{
    usuarios: number;
    conEquipo: number;
    entregas: number;
    instalados: number;
    reposiciones: number;
  }>(
    db,
    sql`SELECT count(DISTINCT i.usuario_final_id)::int AS usuarios,
               count(DISTINCT i.usuario_final_id) FILTER (WHERE i.vigente)::int AS "conEquipo",
               count(*)::int AS entregas,
               count(*) FILTER (WHERE i.vigente)::int AS instalados,
               count(*) FILTER (WHERE i.tipo_entrega = 'REPOSICION')::int AS reposiciones
        FROM instalaciones i`,
  );
  const zonas = await filas<{ llave: string; zona: string; departamento: string | null; usuarios: number; conEquipo: number; instalados: number; reposiciones: number }>(
    db,
    sql`SELECT ${LLAVE} AS llave, min(${ZONA}) AS zona, max(i.departamento) AS departamento,
               count(DISTINCT i.usuario_final_id)::int AS usuarios,
               count(DISTINCT i.usuario_final_id) FILTER (WHERE i.vigente)::int AS "conEquipo",
               count(*) FILTER (WHERE i.vigente)::int AS instalados,
               count(*) FILTER (WHERE i.tipo_entrega = 'REPOSICION')::int AS reposiciones
        FROM instalaciones i JOIN equipos e ON e.id = i.equipo_id
        GROUP BY 1
        ORDER BY usuarios DESC, zona`,
  );
  const ubicaciones = await filas<{ zona: string; municipioCodigo: string }>(
    db,
    sql`SELECT zona, municipio_codigo AS "municipioCodigo" FROM zonas_ubicacion`,
  );
  const elegida = new Map(ubicaciones.map((u) => [u.zona, u.municipioCodigo]));
  return {
    ...(totales ?? { usuarios: 0, conEquipo: 0, entregas: 0, instalados: 0, reposiciones: 0 }),
    zonas: zonas.map((z) => ({ ...z, municipioCodigo: elegida.get(z.llave) ?? null })),
  };
}

export interface FiltrosUsuarios {
  q?: string | undefined;
  /** Llaves de zona (normalizadas). Vacío = todas. */
  zonas?: string[] | undefined;
  pagina: number;
  porPagina: number;
}

export async function listarUsuariosFinales(db: Ejecutor, f: FiltrosUsuarios) {
  const condiciones: SQL[] = [];
  if (f.zonas && f.zonas.length > 0) {
    const lista = sql.join(
      f.zonas.map((z) => sql`${llaveZona(z)}`),
      sql`, `,
    );
    condiciones.push(sql`u.id IN (SELECT i.usuario_final_id FROM instalaciones i JOIN equipos e ON e.id = i.equipo_id WHERE ${LLAVE} IN (${lista}))`);
  }
  if (f.q && f.q.trim()) {
    const texto = normalizarBusqueda(f.q).replace(/[\\%_]/g, (m) => `\\${m}`);
    const digitos = f.q.replace(/\D/g, '');
    condiciones.push(
      sql`(translate(lower(u.nombre), 'áéíóúüñ', 'aeiouun') LIKE ${`%${texto}%`}
           ${digitos.length >= 3 ? sql`OR u.cedula LIKE ${`%${digitos}%`} OR u.niu LIKE ${`%${digitos}%`}` : sql``})`,
    );
  }
  const donde = condiciones.length > 0 ? sql`WHERE ${sql.join(condiciones, sql` AND `)}` : sql``;
  const base = sql`FROM usuarios_finales u
      JOIN instalaciones i ON i.usuario_final_id = u.id
      JOIN equipos e ON e.id = i.equipo_id
      ${donde}`;

  const [{ total } = { total: 0 }] = await filas<{ total: number }>(db, sql`SELECT count(DISTINCT u.id)::int AS total ${base}`);
  const datos = await filas<{
    id: string;
    nombre: string;
    cedula: string;
    telefono: string | null;
    niu: string | null;
    zonas: string[];
    equiposActuales: number;
    entregas: number;
    reposiciones: number;
    ultimaEntrega: string | null;
  }>(
    db,
    sql`SELECT u.id, u.nombre, u.cedula, u.telefono, u.niu,
               array_agg(DISTINCT ${ZONA}) AS zonas,
               count(*) FILTER (WHERE i.vigente)::int AS "equiposActuales",
               count(*)::int AS entregas,
               count(*) FILTER (WHERE i.tipo_entrega = 'REPOSICION')::int AS reposiciones,
               -- Las del histórico sin fecha de entrega en el archivo no cuentan (su fecha es la de la importación).
               max(i.fecha_instalacion) FILTER (WHERE NOT ('Fecha de entrega' = ANY(e.pendientes)))::text AS "ultimaEntrega"
        ${base}
        GROUP BY u.id
        ORDER BY translate(lower(u.nombre), 'áéíóúüñ', 'aeiouun'), u.cedula
        LIMIT ${f.porPagina} OFFSET ${(f.pagina - 1) * f.porPagina}`,
  );
  return { datos, paginacion: { pagina: f.pagina, porPagina: f.porPagina, total, paginas: Math.max(1, Math.ceil(total / f.porPagina)) } };
}

export async function fichaUsuarioFinal(db: Ejecutor, id: string) {
  const [usuario] = await filas<{ id: string; nombre: string; cedula: string; telefono: string | null; niu: string | null }>(
    db,
    sql`SELECT id, nombre, cedula, telefono, niu FROM usuarios_finales WHERE id = ${id}`,
  );
  if (!usuario) throw errorNoEncontrado('USU-01');
  const entregas = await filas<{
    instalacionId: string;
    equipoId: string;
    serial: string;
    tipo: TipoEquipo;
    marca: string | null;
    modelo: string | null;
    estado: EstadoEquipo;
    vigente: boolean;
    tipoEntrega: TipoEntrega;
    fecha: string;
    finalizadaEn: string | null;
    motivoFin: string | null;
    zona: string;
    vereda: string | null;
    proyecto: string | null;
    reemplazaSerial: string | null;
    reemplazaId: string | null;
    sinFecha: boolean;
  }>(
    db,
    sql`SELECT i.id AS "instalacionId", e.id AS "equipoId", e.serial, e.tipo, e.marca, e.modelo, e.estado,
               i.vigente, i.tipo_entrega AS "tipoEntrega", i.fecha_instalacion::text AS fecha,
               i.finalizada_en::text AS "finalizadaEn", i.motivo_fin AS "motivoFin",
               ${ZONA} AS zona, i.vereda, p.nombre AS proyecto,
               r.serial AS "reemplazaSerial", r.id AS "reemplazaId",
               ('Fecha de entrega' = ANY(e.pendientes)) AS "sinFecha"
        FROM instalaciones i
        JOIN equipos e ON e.id = i.equipo_id
        LEFT JOIN proyectos p ON p.id = coalesce(i.proyecto_id, e.proyecto_id)
        LEFT JOIN equipos r ON r.id = i.reemplaza_equipo_id
        WHERE i.usuario_final_id = ${id}
        ORDER BY i.vigente DESC, i.fecha_instalacion DESC`,
  );
  return {
    usuario,
    entregas: entregas.map((x) => ({ ...x, tipoNombre: NOMBRE_TIPO_EQUIPO[x.tipo], estadoNombre: NOMBRE_ESTADO[x.estado] })),
  };
}

/** Guarda (o quita, con null) el municipio donde se dibuja una zona en el mapa. */
export async function ubicarZona(db: Ejecutor, zona: string, municipioCodigo: string | null) {
  const llave = llaveZona(zona);
  if (municipioCodigo === null) {
    await db.execute(sql`DELETE FROM zonas_ubicacion WHERE zona = ${llave}`);
  } else {
    await db.execute(
      sql`INSERT INTO zonas_ubicacion (zona, municipio_codigo) VALUES (${llave}, ${municipioCodigo})
          ON CONFLICT (zona) DO UPDATE SET municipio_codigo = EXCLUDED.municipio_codigo, actualizado_en = now()`,
    );
  }
  return { zona: llave, municipioCodigo };
}
