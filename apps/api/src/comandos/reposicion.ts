import { and, eq } from 'drizzle-orm';
import { ErrorDominio, NOMBRE_TIPO_EQUIPO, errorConflicto, transicion, type TipoEquipo } from '@egt/domain';
import { equipos, instalaciones, usuariosFinales } from '../db/esquema.ts';
import { cargarEquipo, cerrarInstalacionVigente, registrarEvento, type Manejador } from './comunes.ts';

const esBateria = (t: TipoEquipo) => t === 'BATERIA_GEL' || t === 'BATERIA_LITIO';

/**
 * REPONER_EQUIPO: al usuario se le cambia el equipo que falló por otro de
 * stock. Todo en una transacción: se cierra la instalación del que falla (que
 * pasa a mantenimiento o de baja) y se abre la del nuevo, marcada como
 * reposición y enlazada al que reemplazó.
 */
export const reponerEquipo: Manejador<'REPONER_EQUIPO'> = async (tx, c) => {
  const p = c.payload;
  const retirado = await cargarEquipo(tx, p.equipoRetiradoId);
  const nuevo = await cargarEquipo(tx, p.equipoNuevoId);
  if (retirado.id === nuevo.id) throw errorConflicto('REP-05');

  const [anterior] = await tx
    .select()
    .from(instalaciones)
    .where(and(eq(instalaciones.equipoId, retirado.id), eq(instalaciones.vigente, true)));
  if (retirado.estado !== 'INSTALADO' || !anterior) throw errorConflicto('REP-02');
  if (nuevo.estado !== 'EN_STOCK') throw errorConflicto('REP-04');
  if (nuevo.tipo !== retirado.tipo && !(esBateria(nuevo.tipo) && esBateria(retirado.tipo))) {
    throw errorConflicto('REP-03', [
      { campo: 'payload.equipoNuevoId', problema: `Se retira un(a) ${NOMBRE_TIPO_EQUIPO[retirado.tipo].toLowerCase()} y el nuevo es ${NOMBRE_TIPO_EQUIPO[nuevo.tipo].toLowerCase()}` },
    ]);
  }
  const [usuario] = await tx.select().from(usuariosFinales).where(eq(usuariosFinales.id, anterior.usuarioFinalId));
  if (!usuario) throw new ErrorDominio('INTERNO', 'INTERNO');

  // 1. El que falla: se cierra su instalación y pasa a mantenimiento o de baja (sigue en campo hasta su devolución).
  const estadoRetirado = transicion(retirado.estado, p.destino === 'BAJA' ? 'DAR_DE_BAJA' : 'ENVIAR_A_MANTENIMIENTO');
  const cuando = new Date(c.ocurridoEn);
  await cerrarInstalacionVigente(tx, retirado.id, cuando, `Reposición por falla: ${p.motivo}. Reemplazado por ${nuevo.serial}`);
  await tx.update(equipos).set({ estado: estadoRetirado }).where(eq(equipos.id, retirado.id));

  // 2. El nuevo: sale de la bodega y queda instalado al mismo usuario, en el mismo lugar.
  const estadoNuevo = transicion(nuevo.estado, 'INSTALAR');
  await tx.insert(instalaciones).values({
    id: p.instalacionId,
    equipoId: nuevo.id,
    usuarioFinalId: usuario.id,
    proyectoId: nuevo.proyectoId ?? anterior.proyectoId,
    vereda: anterior.vereda,
    municipio: anterior.municipio,
    departamento: anterior.departamento,
    fechaInstalacion: p.fecha,
    tecnico: p.tecnico,
    tipoEntrega: 'REPOSICION',
    reemplazaEquipoId: retirado.id,
  });
  await tx
    .update(equipos)
    .set({
      estado: estadoNuevo,
      ubicacion: 'CAMPO',
      bodegaId: null,
      // Si el nuevo no tenía proyecto, toma el del equipo al que reemplaza.
      ...(nuevo.proyectoId === null && retirado.proyectoId !== null ? { proyectoId: retirado.proyectoId } : {}),
      ...(nuevo.zona === null && retirado.zona !== null ? { zona: retirado.zona } : {}),
    })
    .where(eq(equipos.id, nuevo.id));

  const quien = `${usuario.nombre} (C.C. ${usuario.cedula})`;
  await registrarEvento(tx, c, {
    equipoId: retirado.id,
    tipo: 'REPOSICION',
    estadoAnterior: retirado.estado,
    estadoNuevo: estadoRetirado,
    descripcion: `Retirado por falla y reemplazado por ${nuevo.serial} a ${quien}. ${p.destino === 'BAJA' ? 'Queda de baja' : 'Va a mantenimiento o garantía'}. Falla: ${p.motivo}. Técnico: ${p.tecnico}`,
    datos: { equipoNuevoId: nuevo.id, serialNuevo: nuevo.serial, instalacionCerrada: anterior.id, motivo: p.motivo, destino: p.destino },
  });
  await registrarEvento(tx, c, {
    equipoId: nuevo.id,
    tipo: 'REPOSICION',
    estadoAnterior: nuevo.estado,
    estadoNuevo,
    descripcion: `Entregado como reposición de ${retirado.serial} a ${quien}. Técnico: ${p.tecnico}`,
    datos: {
      equipoRetiradoId: retirado.id,
      serialRetirado: retirado.serial,
      instalacionId: p.instalacionId,
      usuarioFinalId: usuario.id,
      ...(nuevo.bodegaId ? { bodegaAnterior: nuevo.bodegaId } : {}),
    },
  });
  return {
    equipoRetiradoId: retirado.id,
    equipoNuevoId: nuevo.id,
    instalacionId: p.instalacionId,
    estadoRetirado,
    serialNuevo: nuevo.serial,
  };
};
