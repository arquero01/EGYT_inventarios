import { eq } from 'drizzle-orm';
import {
  ACCIONES_QUE_CIERRAN_INSTALACION,
  ErrorDominio,
  NOMBRE_ESTADO,
  PREFIJO_SERIAL,
  errorConflicto,
  fechaColombia,
  normalizarSerial,
  transicion,
  type Accion,
  type Comando,
  type TipoComando,
  type TipoEquipo,
  type TipoEvento,
} from '@egt/domain';
import type { Transaccion } from '../db/cliente.ts';
import { equipos, instalaciones, proyectos, usuariosFinales } from '../db/esquema.ts';
import {
  cargarEquipo,
  cerrarInstalacionVigente,
  exigirBodega,
  exigirProyecto,
  nombreEquipo,
  obtenerOCrearCompra,
  registrarEvento,
  siguienteConsecutivo,
  type FilaEquipo,
  type Manejador,
} from './comunes.ts';
import { MANEJADORES_LOGISTICA } from './logistica.ts';

/**
 * Aplica una acción de la máquina de estados: valida la transición, cierra la
 * instalación vigente si corresponde, cambia el estado y registra el evento.
 * La ubicación física no cambia: un equipo retirado de una vivienda sigue en
 * campo hasta que logística registre su devolución a bodega.
 */
async function aplicarAccion(
  tx: Transaccion,
  c: Comando,
  equipo: FilaEquipo,
  accion: Accion,
  evento: { tipo: TipoEvento; descripcion: string; motivo?: string; datos?: Record<string, unknown> },
) {
  const nuevo = transicion(equipo.estado, accion);
  let instalacionCerrada: string | null = null;
  if (equipo.estado === 'INSTALADO' && ACCIONES_QUE_CIERRAN_INSTALACION.includes(accion)) {
    instalacionCerrada = await cerrarInstalacionVigente(tx, equipo.id, new Date(c.ocurridoEn), evento.motivo ?? evento.descripcion);
  }
  await tx.update(equipos).set({ estado: nuevo }).where(eq(equipos.id, equipo.id));
  await registrarEvento(tx, c, {
    equipoId: equipo.id,
    tipo: evento.tipo,
    estadoAnterior: equipo.estado,
    estadoNuevo: nuevo,
    descripcion: evento.descripcion,
    datos: { ...evento.datos, ...(evento.motivo ? { motivo: evento.motivo } : {}), ...(instalacionCerrada ? { instalacionCerrada } : {}) },
  });
  return { equipoId: equipo.id, estadoAnterior: equipo.estado, estado: nuevo, instalacionCerrada };
}

/** Serial asignado por la empresa: EGT-PAN-000001. El contador es atómico. */
async function asignarSerialEmpresa(tx: Transaccion, tipo: TipoEquipo): Promise<string> {
  const prefijo = PREFIJO_SERIAL[tipo];
  const numero = await siguienteConsecutivo(tx, prefijo);
  return `EGT-${prefijo}-${String(numero).padStart(6, '0')}`;
}

// ── Manejadores ────────────────────────────────────────────────────────────

/** RF-01 */
const crearProyecto: Manejador<'CREAR_PROYECTO'> = async (tx, c) => {
  const p = c.payload;
  await tx.insert(proyectos).values({
    id: p.proyectoId,
    nombre: p.nombre,
    vereda: p.vereda,
    municipio: p.municipio,
    departamento: p.departamento,
    fechaInicio: p.fechaInicio,
    descripcion: p.descripcion ?? null,
  });
  return { proyectoId: p.proyectoId };
};

/** RF-06, RF-07, RF-08 + RL-02 (el equipo entra a una bodega). */
const registrarIngreso: Manejador<'REGISTRAR_INGRESO'> = async (tx, c) => {
  const p = c.payload;
  await exigirProyecto(tx, p.proyectoId);
  const bodega = await exigirBodega(tx, p.bodegaId, 'payload.bodegaId');

  let serial: string;
  if (p.origenSerial === 'PROVEEDOR') {
    serial = p.serial!.trim();
    const [repetido] = await tx
      .select({ id: equipos.id })
      .from(equipos)
      .where(eq(equipos.serialNormalizado, normalizarSerial(serial)));
    if (repetido) throw errorConflicto('RF-07', [{ campo: 'payload.serial', problema: `Serial ya registrado: ${serial}` }]);
  } else {
    serial = await asignarSerialEmpresa(tx, p.tipo);
  }

  const compraId = await obtenerOCrearCompra(tx, p.compra);
  const equipo = {
    id: p.equipoId,
    tipo: p.tipo,
    marca: p.marca,
    modelo: p.modelo,
    serial,
    serialNormalizado: normalizarSerial(serial),
    origenSerial: p.origenSerial,
    potencia: p.potencia,
    unidad: p.unidad,
    proyectoId: p.proyectoId,
    compraId,
    valorPagado: p.valorPagado,
    estado: 'EN_STOCK' as const,
    ubicacion: 'BODEGA' as const,
    bodegaId: bodega.id,
    fechaIngreso: fechaColombia(new Date(c.ocurridoEn)),
  };
  await tx.insert(equipos).values(equipo);
  await registrarEvento(tx, c, {
    equipoId: equipo.id,
    tipo: 'INGRESO',
    estadoAnterior: null,
    estadoNuevo: 'EN_STOCK',
    descripcion: `Ingreso a ${bodega.nombre}: ${nombreEquipo(equipo)}`,
    datos: { proyectoId: p.proyectoId, compraId, bodegaId: bodega.id, origenSerial: p.origenSerial },
  });
  return { equipoId: equipo.id, serial, origenSerial: p.origenSerial, compraId };
};

/** RF-03: solo un equipo en stock puede pasar a otro proyecto (supuesto de "liberación previa"). */
const cambiarProyecto: Manejador<'CAMBIAR_PROYECTO'> = async (tx, c) => {
  const equipo = await cargarEquipo(tx, c.payload.equipoId);
  await exigirProyecto(tx, c.payload.proyectoId);
  if (equipo.proyectoId === c.payload.proyectoId) throw errorConflicto('PROY-MISMO');
  transicion(equipo.estado, 'CAMBIAR_PROYECTO');
  await tx.update(equipos).set({ proyectoId: c.payload.proyectoId }).where(eq(equipos.id, equipo.id));
  await registrarEvento(tx, c, {
    equipoId: equipo.id,
    tipo: 'CAMBIO_PROYECTO',
    estadoAnterior: equipo.estado,
    estadoNuevo: equipo.estado,
    descripcion: 'Equipo reasignado a otro proyecto',
    datos: { proyectoAnterior: equipo.proyectoId, proyectoNuevo: c.payload.proyectoId },
  });
  return { equipoId: equipo.id, proyectoId: c.payload.proyectoId };
};

/** RF-11, RF-12. Si el equipo seguía en bodega, al instalarlo queda en campo. */
const instalarEquipo: Manejador<'INSTALAR_EQUIPO'> = async (tx, c) => {
  const p = c.payload;
  const equipo = await cargarEquipo(tx, p.equipoId);
  const nuevo = transicion(equipo.estado, 'INSTALAR');

  // El usuario final se identifica por cédula; si ya existe se actualizan nombre y teléfono.
  const [usuario] = await tx
    .insert(usuariosFinales)
    .values({ cedula: p.usuario.cedula, nombre: p.usuario.nombre, telefono: p.usuario.telefono })
    .onConflictDoUpdate({
      target: usuariosFinales.cedula,
      set: { nombre: p.usuario.nombre, telefono: p.usuario.telefono },
    })
    .returning({ id: usuariosFinales.id });

  await tx.insert(instalaciones).values({
    id: p.instalacionId,
    equipoId: equipo.id,
    usuarioFinalId: usuario!.id,
    proyectoId: equipo.proyectoId,
    vereda: p.ubicacion.vereda,
    municipio: p.ubicacion.municipio,
    departamento: p.ubicacion.departamento,
    fechaInstalacion: p.fechaInstalacion,
    tecnico: p.tecnico,
  });

  // RF-12: el cambio de estado es automático y va en la misma transacción.
  try {
    await tx.update(equipos).set({ estado: nuevo, ubicacion: 'CAMPO', bodegaId: null }).where(eq(equipos.id, equipo.id));
  } catch (causa) {
    throw new ErrorDominio('RF-12', 'INTERNO', [{ campo: 'estado', problema: String((causa as Error).message ?? causa) }]);
  }

  await registrarEvento(tx, c, {
    equipoId: equipo.id,
    tipo: 'INSTALACION',
    estadoAnterior: equipo.estado,
    estadoNuevo: nuevo,
    descripcion: `Instalado a ${p.usuario.nombre} (C.C. ${p.usuario.cedula}) en ${p.ubicacion.vereda}, ${p.ubicacion.municipio}. Técnico: ${p.tecnico}`,
    datos: {
      instalacionId: p.instalacionId,
      usuarioFinalId: usuario!.id,
      cedula: p.usuario.cedula,
      fechaInstalacion: p.fechaInstalacion,
      tecnico: p.tecnico,
      ...(equipo.bodegaId ? { bodegaAnterior: equipo.bodegaId } : {}),
    },
  });
  return { equipoId: equipo.id, instalacionId: p.instalacionId, usuarioFinalId: usuario!.id, estado: nuevo };
};

/** RF-13 */
const retirarEquipo: Manejador<'RETIRAR_EQUIPO'> = async (tx, c) => {
  const equipo = await cargarEquipo(tx, c.payload.equipoId);
  return aplicarAccion(tx, c, equipo, 'RETIRAR', {
    tipo: 'RETORNO_A_STOCK',
    descripcion: `Retirado de la vivienda; queda en stock en campo hasta su devolución a bodega. Motivo: ${c.payload.motivo}`,
    motivo: c.payload.motivo,
  });
};

/** RF-14 */
const enviarAMantenimiento: Manejador<'ENVIAR_A_MANTENIMIENTO'> = async (tx, c) => {
  const equipo = await cargarEquipo(tx, c.payload.equipoId);
  return aplicarAccion(tx, c, equipo, 'ENVIAR_A_MANTENIMIENTO', {
    tipo: 'MANTENIMIENTO',
    descripcion: `Enviado a mantenimiento desde "${NOMBRE_ESTADO[equipo.estado]}". Motivo: ${c.payload.motivo}`,
    motivo: c.payload.motivo,
  });
};

/** Supuesto: el equipo vuelve de mantenimiento a stock. */
const finalizarMantenimiento: Manejador<'FINALIZAR_MANTENIMIENTO'> = async (tx, c) => {
  const equipo = await cargarEquipo(tx, c.payload.equipoId);
  const obs = c.payload.observacion;
  return aplicarAccion(tx, c, equipo, 'FINALIZAR_MANTENIMIENTO', {
    tipo: 'FIN_MANTENIMIENTO',
    descripcion: `Sale de mantenimiento y vuelve a stock${obs ? `. ${obs}` : ''}`,
    datos: obs ? { observacion: obs } : {},
  });
};

/** RF-15 */
const darDeBaja: Manejador<'DAR_DE_BAJA'> = async (tx, c) => {
  const equipo = await cargarEquipo(tx, c.payload.equipoId);
  return aplicarAccion(tx, c, equipo, 'DAR_DE_BAJA', {
    tipo: 'BAJA',
    descripcion: `Dado de baja. Motivo: ${c.payload.motivo}`,
    motivo: c.payload.motivo,
  });
};

export const MANEJADORES: { [T in TipoComando]: Manejador<T> } = {
  CREAR_PROYECTO: crearProyecto,
  REGISTRAR_INGRESO: registrarIngreso,
  CAMBIAR_PROYECTO: cambiarProyecto,
  INSTALAR_EQUIPO: instalarEquipo,
  RETIRAR_EQUIPO: retirarEquipo,
  ENVIAR_A_MANTENIMIENTO: enviarAMantenimiento,
  FINALIZAR_MANTENIMIENTO: finalizarMantenimiento,
  DAR_DE_BAJA: darDeBaja,
  ...MANEJADORES_LOGISTICA,
};
