import { and, eq, isNull, sql } from 'drizzle-orm';
import { NOMBRE_ESTADO, errorConflicto, fechaColombia, normalizarNit, normalizarSerial } from '@egt/domain';
import type { Transaccion } from '../db/cliente.ts';
import { compras, equipos, instalaciones, usuariosFinales } from '../db/esquema.ts';
import { asignarSerialEmpresa, exigirBodega, exigirProyecto, nombreEquipo, registrarEvento, type ComandoDe, type Manejador } from './comunes.ts';

/**
 * Importa un equipo del histórico de la empresa en el estado en que está hoy.
 * Lo que el archivo no traía queda en `pendientes` para completarlo después.
 */

type DatosCompraHistorica = NonNullable<ComandoDe<'IMPORTAR_HISTORICO'>['payload']['compra']>;

/**
 * La factura del histórico se identifica por proveedor + número (no hay NIT).
 * Si no hay proveedor, el equipo queda sin compra (y "Proveedor" pendiente).
 */
export async function compraHistorica(tx: Transaccion, datos: DatosCompraHistorica | undefined): Promise<string | null> {
  if (!datos?.proveedor) return null;
  const nit = datos.nit ? normalizarNit(datos.nit) : null;
  const factura = datos.numeroFactura?.toUpperCase().replace(/\s+/g, ' ') ?? null;
  const [existente] = await tx
    .select({ id: compras.id })
    .from(compras)
    .where(
      and(
        sql`lower(btrim(${compras.proveedor})) = ${datos.proveedor.trim().toLowerCase()}`,
        factura ? eq(compras.numeroFactura, factura) : isNull(compras.numeroFactura),
        nit ? eq(compras.nit, nit.numero) : isNull(compras.nit),
      ),
    );
  if (existente) return existente.id;
  const [nueva] = await tx
    .insert(compras)
    .values({
      proveedor: datos.proveedor,
      nit: nit?.numero ?? null,
      nitDv: nit?.dv ?? null,
      numeroFactura: factura,
      fechaCompra: datos.fechaCompra ?? null,
    })
    .returning({ id: compras.id });
  return nueva!.id;
}

export const importarHistorico: Manejador<'IMPORTAR_HISTORICO'> = async (tx, c) => {
  const p = c.payload;
  if (p.proyectoId) await exigirProyecto(tx, p.proyectoId);
  const bodega = p.bodegaId ? await exigirBodega(tx, p.bodegaId, 'payload.bodegaId') : null;

  // Identificador: el código interno; si no hay, el serial del fabricante; si tampoco, uno del sistema.
  let serial: string;
  let origenSerial: 'INTERNO' | 'PROVEEDOR' | 'EMPRESA';
  if (p.codigoInterno || p.serialFabricante) {
    serial = (p.codigoInterno ?? p.serialFabricante)!;
    origenSerial = p.codigoInterno ? 'INTERNO' : 'PROVEEDOR';
    const [repetido] = await tx.select({ id: equipos.id }).from(equipos).where(eq(equipos.serialNormalizado, normalizarSerial(serial)));
    if (repetido) {
      throw errorConflicto('RF-07', [{ campo: p.codigoInterno ? 'payload.codigoInterno' : 'payload.serialFabricante', problema: `Ya existe un equipo con el código ${serial}` }]);
    }
  } else {
    serial = await asignarSerialEmpresa(tx, p.tipo);
    origenSerial = 'EMPRESA';
  }

  // Sin bodega, lo que no está en stock queda "en campo" (con el usuario o donde se reportó).
  const enBodega = bodega !== null && p.estado !== 'INSTALADO';
  const compraId = await compraHistorica(tx, p.compra);
  const equipo = {
    id: p.equipoId,
    tipo: p.tipo,
    marca: p.marca ?? null,
    modelo: p.modelo ?? null,
    serial,
    serialNormalizado: normalizarSerial(serial),
    origenSerial,
    serialFabricante: p.serialFabricante && p.serialFabricante !== serial ? p.serialFabricante : null,
    descripcion: p.descripcion ?? null,
    potencia: p.potencia ?? null,
    unidad: p.unidad ?? null,
    zona: p.zona ?? null,
    proyectoId: p.proyectoId ?? null,
    compraId,
    valorPagado: p.valorPagado ?? null,
    garantiaHasta: p.garantiaHasta ?? null,
    estado: p.estado,
    ubicacion: enBodega ? ('BODEGA' as const) : ('CAMPO' as const),
    bodegaId: enBodega ? bodega!.id : null,
    fechaIngreso: p.compra?.fechaCompra ?? p.fechaEntrega ?? fechaColombia(new Date(c.ocurridoEn)),
    pendientes: [...new Set(p.pendientes)],
  };
  await tx.insert(equipos).values(equipo);

  // El usuario final: si ya existe esa cédula (tiene otros equipos), se reutiliza.
  let usuarioFinalId: string | null = null;
  if (p.usuario) {
    await tx
      .insert(usuariosFinales)
      .values({ cedula: p.usuario.cedula, nombre: p.usuario.nombre ?? 'Por completar', niu: p.usuario.niu ?? null })
      .onConflictDoNothing({ target: usuariosFinales.cedula });
    const [u] = await tx.select({ id: usuariosFinales.id }).from(usuariosFinales).where(eq(usuariosFinales.cedula, p.usuario.cedula));
    usuarioFinalId = u!.id;
    // Instalado: queda vigente. En mantenimiento o de baja: queda en el historial ya cerrada.
    const vigente = p.estado === 'INSTALADO';
    await tx.insert(instalaciones).values({
      id: crypto.randomUUID(),
      equipoId: equipo.id,
      usuarioFinalId,
      proyectoId: equipo.proyectoId,
      municipio: equipo.zona,
      fechaInstalacion: p.fechaEntrega ?? equipo.fechaIngreso,
      tecnico: null,
      vigente,
      finalizadaEn: vigente ? null : new Date(c.ocurridoEn),
      motivoFin: vigente ? null : (p.motivo ?? `Estado al importar: ${NOMBRE_ESTADO[p.estado]}`),
    });
  }

  const detalles = [
    `Importado del histórico como "${NOMBRE_ESTADO[p.estado]}"`,
    equipo.zona ? `zona ${equipo.zona}` : null,
    p.usuario ? `usuario C.C. ${p.usuario.cedula}${p.fechaEntrega ? `, entregado el ${p.fechaEntrega}` : ''}` : null,
    p.motivo ?? null,
  ].filter(Boolean);
  await registrarEvento(tx, c, {
    equipoId: equipo.id,
    tipo: 'IMPORTACION',
    estadoAnterior: null,
    estadoNuevo: p.estado,
    descripcion: `${detalles.join('; ')}. ${nombreEquipo(equipo)}`,
    datos: { origenSerial, compraId, usuarioFinalId, pendientes: equipo.pendientes },
  });
  return { equipoId: equipo.id, serial, origenSerial, pendientes: equipo.pendientes };
};
