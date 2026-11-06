import { eq, sql } from 'drizzle-orm';
import { ErrorDominio, MENSAJES, NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO, type TipoEquipo } from '@egt/domain';
import type { Ejecutor } from '../db/cliente.ts';
import { equipos } from '../db/esquema.ts';

/** RF-18: resumen general para la pantalla principal. */
export async function resumenInventario(db: Ejecutor) {
  try {
    const [r] = await db
      .select({
        total: sql<number>`count(*)::int`,
        enStock: sql<number>`count(*) FILTER (WHERE ${equipos.estado} = 'EN_STOCK')::int`,
        instalados: sql<number>`count(*) FILTER (WHERE ${equipos.estado} = 'INSTALADO')::int`,
        enMantenimiento: sql<number>`count(*) FILTER (WHERE ${equipos.estado} = 'EN_MANTENIMIENTO')::int`,
        dadosDeBaja: sql<number>`count(*) FILTER (WHERE ${equipos.estado} = 'DADO_DE_BAJA')::int`,
        enBodega: sql<number>`count(*) FILTER (WHERE ${equipos.ubicacion} = 'BODEGA')::int`,
        enCampo: sql<number>`count(*) FILTER (WHERE ${equipos.ubicacion} = 'CAMPO')::int`,
      })
      .from(equipos);
    return r!;
  } catch (causa) {
    throw new ErrorDominio('RF-18', 'INTERNO', [{ campo: 'resumen', problema: String((causa as Error).message) }]);
  }
}

/** RF-10: unidades en stock por tipo; los tipos sin stock salen con 0 y un aviso. */
export async function stockPorTipo(db: Ejecutor) {
  const filas = await db
    .select({ tipo: equipos.tipo, cantidad: sql<number>`count(*)::int` })
    .from(equipos)
    .where(eq(equipos.estado, 'EN_STOCK'))
    .groupBy(equipos.tipo);
  const conteo = new Map<TipoEquipo, number>(filas.map((f) => [f.tipo, f.cantidad]));
  return {
    datos: TIPOS_EQUIPO.map((tipo) => {
      const cantidad = conteo.get(tipo) ?? 0;
      return {
        tipo,
        tipoNombre: NOMBRE_TIPO_EQUIPO[tipo],
        cantidad,
        ...(cantidad === 0 ? { aviso: { codigo: 'RF-10', mensaje: MENSAJES['RF-10'] } } : {}),
      };
    }),
  };
}
