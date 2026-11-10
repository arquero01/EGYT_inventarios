import { and, desc, eq, sql } from 'drizzle-orm';
import { NOMBRE_TIPO_EQUIPO, errorConflicto, errorValidacion, normalizarNit, normalizarSerial } from '@egt/domain';
import { compras, equipos, eventosEquipo, instalaciones, usuariosFinales } from '../db/esquema.ts';
import { cargarEquipo, registrarEvento, type Manejador } from './comunes.ts';
import { compraHistorica } from './historico.ts';

/**
 * EDITAR_EQUIPO: corrige los datos de un equipo sin tocar su estado ni su
 * ubicación. Cada campo cambiado queda en el historial con el valor anterior
 * y el nuevo, y la lista "por completar" se limpia sola con lo que ya se llenó.
 */

/** Dato "por completar" → si ya quedó lleno. Los "Verificar: …" solo se quitan a mano. */
type Estado = {
  serial: string;
  origenSerial: string;
  marca: string | null;
  potencia: number | null;
  zona: string | null;
  garantiaHasta: string | null;
  valorPagado: number | null;
  proyectoId: string | null;
  compra: { proveedor: string; numeroFactura: string | null; fechaCompra: string | null; nit: string | null } | null;
  usuario: { nombre: string } | null;
  conInstalacion: boolean;
};
const LLENO: Record<string, (e: Estado) => boolean> = {
  'código interno': (e) => e.origenSerial !== 'EMPRESA',
  marca: (e) => Boolean(e.marca),
  potencia: (e) => e.potencia !== null,
  zona: (e) => Boolean(e.zona),
  'fin de garantía': (e) => Boolean(e.garantiaHasta),
  valor: (e) => e.valorPagado !== null,
  proyecto: (e) => e.proyectoId !== null,
  proveedor: (e) => Boolean(e.compra?.proveedor),
  factura: (e) => Boolean(e.compra?.numeroFactura),
  'fecha de compra': (e) => Boolean(e.compra?.fechaCompra),
  nit: (e) => Boolean(e.compra?.nit),
  usuario: (e) => e.usuario !== null,
  'nombre del usuario': (e) => Boolean(e.usuario && e.usuario.nombre !== 'Por completar'),
  'fecha de entrega': (e) => e.conInstalacion,
};
export function limpiarPendientes(pendientes: string[], estado: Estado): string[] {
  return [...new Set(pendientes)].filter((p) => !LLENO[p.trim().toLowerCase()]?.(estado));
}

const mostrar = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export const editarEquipo: Manejador<'EDITAR_EQUIPO'> = async (tx, c) => {
  const p = c.payload;
  const equipo = await cargarEquipo(tx, p.equipoId);

  // RF-15: los equipos de baja no se tocan, salvo para corregir lo que vino mal del histórico.
  if (equipo.estado === 'DADO_DE_BAJA') {
    const [importado] = await tx
      .select({ id: eventosEquipo.id })
      .from(eventosEquipo)
      .where(and(eq(eventosEquipo.equipoId, equipo.id), eq(eventosEquipo.tipo, 'IMPORTACION')))
      .limit(1);
    if (!importado) throw errorConflicto('EDIT-03');
    await tx.execute(sql`SELECT set_config('egt.correccion', 'si', true)`);
  }

  const cambios: { campo: string; antes: unknown; despues: unknown }[] = [];
  const nuevo: Partial<typeof equipos.$inferInsert> = {};
  const anotar = <K extends keyof typeof equipos.$inferInsert>(campo: string, clave: K, valor: (typeof equipos.$inferInsert)[K] | undefined) => {
    if (valor === undefined) return;
    const antes = equipo[clave as keyof typeof equipo];
    if ((antes ?? null) === (valor ?? null)) return;
    nuevo[clave] = valor;
    cambios.push({ campo, antes, despues: valor });
  };

  // Identificador
  if (p.serial !== undefined && normalizarSerial(p.serial) !== equipo.serialNormalizado) {
    const normalizado = normalizarSerial(p.serial);
    const [repetido] = await tx.select({ id: equipos.id }).from(equipos).where(eq(equipos.serialNormalizado, normalizado));
    if (repetido) throw errorConflicto('RF-07', [{ campo: 'payload.serial', problema: `Ya existe un equipo con el código ${p.serial}` }]);
    nuevo.serial = p.serial;
    nuevo.serialNormalizado = normalizado;
    // Un serial que puso el sistema (EGT-…) reemplazado a mano pasa a ser código interno.
    if (equipo.origenSerial === 'EMPRESA') nuevo.origenSerial = 'INTERNO';
    cambios.push({ campo: 'código', antes: equipo.serial, despues: p.serial });
  } else if (p.serial !== undefined && p.serial !== equipo.serial) {
    nuevo.serial = p.serial; // solo cambian mayúsculas o espacios
  }

  anotar('serial del fabricante', 'serialFabricante', p.serialFabricante);
  if (p.tipo !== undefined && p.tipo !== equipo.tipo) {
    nuevo.tipo = p.tipo;
    cambios.push({ campo: 'tipo', antes: NOMBRE_TIPO_EQUIPO[equipo.tipo], despues: NOMBRE_TIPO_EQUIPO[p.tipo] });
  }
  anotar('marca', 'marca', p.marca);
  anotar('modelo', 'modelo', p.modelo);
  anotar('descripción', 'descripcion', p.descripcion);
  anotar('potencia', 'potencia', p.potencia);
  anotar('unidad', 'unidad', p.unidad);
  anotar('zona', 'zona', p.zona);
  anotar('fin de garantía', 'garantiaHasta', p.garantiaHasta);
  anotar('valor pagado', 'valorPagado', p.valorPagado);

  const potencia = nuevo.potencia !== undefined ? nuevo.potencia : equipo.potencia;
  const unidad = nuevo.unidad !== undefined ? nuevo.unidad : equipo.unidad;
  if (potencia !== null && unidad === null) {
    throw errorValidacion('EDIT-01', [{ campo: 'payload.unidad', problema: 'Indique la unidad de la potencia' }]);
  }

  // Compra: la factura la comparten varios equipos, así que no se edita en sitio: se busca o se crea la correcta.
  const [compraActual] = equipo.compraId ? await tx.select().from(compras).where(eq(compras.id, equipo.compraId)) : [];
  const nitTexto = (n: string | null, dv: number | null) => (n === null ? null : dv === null ? n : `${n}-${dv}`);
  let compraFinal: Estado['compra'] = compraActual
    ? { proveedor: compraActual.proveedor, numeroFactura: compraActual.numeroFactura, fechaCompra: compraActual.fechaCompra, nit: nitTexto(compraActual.nit, compraActual.nitDv) }
    : null;
  if (p.compra !== undefined) {
    const compraId = p.compra
      ? await compraHistorica(tx, {
          proveedor: p.compra.proveedor,
          nit: p.compra.nit ?? undefined,
          numeroFactura: p.compra.numeroFactura ?? undefined,
          fechaCompra: p.compra.fechaCompra ?? undefined,
        })
      : null;
    if (compraId !== equipo.compraId) {
      nuevo.compraId = compraId;
      const nit = p.compra?.nit ? normalizarNit(p.compra.nit) : null;
      const despues = p.compra
        ? {
            proveedor: p.compra.proveedor,
            numeroFactura: p.compra.numeroFactura ? p.compra.numeroFactura.toUpperCase().replace(/\s+/g, ' ') : null,
            fechaCompra: p.compra.fechaCompra ?? null,
            nit: nit ? nitTexto(nit.numero, nit.dv) : null,
          }
        : null;
      for (const [campo, clave] of [
        ['proveedor', 'proveedor'],
        ['factura', 'numeroFactura'],
        ['fecha de compra', 'fechaCompra'],
        ['NIT', 'nit'],
      ] as const) {
        const antes = compraFinal?.[clave] ?? null;
        const ahora = despues?.[clave] ?? null;
        if (antes !== ahora) cambios.push({ campo, antes, despues: ahora });
      }
      compraFinal = despues;
    }
  }

  // Usuario final e instalación (la vigente o, si no hay, la última).
  const [instalacion] = await tx
    .select()
    .from(instalaciones)
    .where(eq(instalaciones.equipoId, equipo.id))
    .orderBy(desc(instalaciones.vigente), desc(instalaciones.fechaInstalacion), desc(instalaciones.creadoEn))
    .limit(1);
  let usuarioFinal: { id: string; nombre: string } | null = null;
  if (instalacion) {
    const [u] = await tx.select().from(usuariosFinales).where(eq(usuariosFinales.id, instalacion.usuarioFinalId));
    usuarioFinal = u ? { id: u.id, nombre: u.nombre } : null;
  }
  let conInstalacion = Boolean(instalacion);
  if (p.usuario) {
    if (!instalacion && equipo.estado === 'EN_STOCK') throw errorConflicto('EDIT-04');
    const [anterior] = usuarioFinal ? await tx.select().from(usuariosFinales).where(eq(usuariosFinales.id, usuarioFinal.id)) : [];
    await tx
      .insert(usuariosFinales)
      .values({ cedula: p.usuario.cedula, nombre: p.usuario.nombre ?? 'Por completar', niu: p.usuario.niu ?? null, telefono: p.usuario.telefono ?? null })
      .onConflictDoNothing({ target: usuariosFinales.cedula });
    const [u] = await tx.select().from(usuariosFinales).where(eq(usuariosFinales.cedula, p.usuario.cedula));
    const datosPersona: Partial<typeof usuariosFinales.$inferInsert> = {};
    if (p.usuario.nombre !== undefined && p.usuario.nombre !== u!.nombre) datosPersona.nombre = p.usuario.nombre;
    if (p.usuario.telefono !== undefined && (p.usuario.telefono ?? null) !== u!.telefono) datosPersona.telefono = p.usuario.telefono ?? null;
    if (p.usuario.niu !== undefined && (p.usuario.niu ?? null) !== u!.niu) datosPersona.niu = p.usuario.niu ?? null;
    if (Object.keys(datosPersona).length > 0) await tx.update(usuariosFinales).set(datosPersona).where(eq(usuariosFinales.id, u!.id));

    if (!anterior || anterior.cedula !== p.usuario.cedula) {
      cambios.push({ campo: 'usuario (cédula)', antes: anterior?.cedula ?? null, despues: p.usuario.cedula });
    }
    for (const [campo, clave] of [
      ['nombre del usuario', 'nombre'],
      ['teléfono', 'telefono'],
      ['NIU', 'niu'],
    ] as const) {
      const ahora = datosPersona[clave];
      if (ahora !== undefined) cambios.push({ campo, antes: u![clave], despues: ahora });
    }
    usuarioFinal = { id: u!.id, nombre: datosPersona.nombre ?? u!.nombre };

    if (instalacion) {
      if (instalacion.usuarioFinalId !== u!.id) await tx.update(instalaciones).set({ usuarioFinalId: u!.id }).where(eq(instalaciones.id, instalacion.id));
    } else {
      // Un equipo instalado (o en revisión) que venía sin usuario: se le registra la entrega.
      const vigente = equipo.estado === 'INSTALADO';
      await tx.insert(instalaciones).values({
        id: crypto.randomUUID(),
        equipoId: equipo.id,
        usuarioFinalId: u!.id,
        proyectoId: equipo.proyectoId,
        municipio: nuevo.zona ?? equipo.zona,
        fechaInstalacion: p.fechaEntrega ?? equipo.fechaIngreso,
        tecnico: null,
        vigente,
        finalizadaEn: vigente ? null : new Date(c.ocurridoEn),
        motivoFin: vigente ? null : 'Usuario agregado al corregir los datos',
      });
      conInstalacion = true;
      if (p.fechaEntrega) cambios.push({ campo: 'fecha de entrega', antes: null, despues: p.fechaEntrega });
    }
  }
  if (p.fechaEntrega && instalacion && p.fechaEntrega !== instalacion.fechaInstalacion) {
    await tx.update(instalaciones).set({ fechaInstalacion: p.fechaEntrega }).where(eq(instalaciones.id, instalacion.id));
    cambios.push({ campo: 'fecha de entrega', antes: instalacion.fechaInstalacion, despues: p.fechaEntrega });
  } else if (p.fechaEntrega && !instalacion && !p.usuario) {
    throw errorValidacion('EDIT-01', [{ campo: 'payload.fechaEntrega', problema: 'El equipo no tiene usuario: indique primero su cédula' }]);
  }

  // Lo que sigue por completar: la lista enviada (o la actual), sin lo que ya quedó lleno.
  const base = [...(p.pendientes ?? equipo.pendientes), ...(p.agregarPendientes ?? [])];
  const pendientes = limpiarPendientes(base, {
    serial: nuevo.serial ?? equipo.serial,
    origenSerial: nuevo.origenSerial ?? equipo.origenSerial,
    marca: nuevo.marca !== undefined ? nuevo.marca : equipo.marca,
    potencia,
    zona: nuevo.zona !== undefined ? nuevo.zona : equipo.zona,
    garantiaHasta: nuevo.garantiaHasta !== undefined ? nuevo.garantiaHasta : equipo.garantiaHasta,
    valorPagado: nuevo.valorPagado !== undefined ? nuevo.valorPagado : equipo.valorPagado,
    proyectoId: equipo.proyectoId,
    compra: compraFinal,
    usuario: usuarioFinal,
    conInstalacion,
  });
  const quitados = equipo.pendientes.filter((x) => !pendientes.includes(x));
  const agregados = pendientes.filter((x) => !equipo.pendientes.includes(x));
  if (quitados.length > 0 || agregados.length > 0) nuevo.pendientes = pendientes;

  if (cambios.length === 0 && quitados.length === 0 && agregados.length === 0) throw errorValidacion('EDIT-02');
  if (Object.keys(nuevo).length > 0) await tx.update(equipos).set(nuevo).where(eq(equipos.id, equipo.id));

  const partes = [
    ...cambios.map((x) => `${x.campo}: ${mostrar(x.antes)} → ${mostrar(x.despues)}`),
    quitados.length > 0 ? `completado: ${quitados.join(', ')}` : null,
    agregados.length > 0 ? `por revisar: ${agregados.join(', ')}` : null,
  ].filter(Boolean);
  await registrarEvento(tx, c, {
    equipoId: equipo.id,
    tipo: 'EDICION',
    estadoAnterior: equipo.estado,
    estadoNuevo: equipo.estado,
    descripcion: `Datos corregidos${p.motivo ? ` (${p.motivo})` : ''}: ${partes.join('; ')}.`,
    datos: { cambios, completados: quitados, agregados },
  });
  return { equipoId: equipo.id, serial: nuevo.serial ?? equipo.serial, cambios: cambios.length, pendientes };
};
