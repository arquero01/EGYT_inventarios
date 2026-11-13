import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comando, crearEntorno, datosBodega, datosIngreso, datosInstalacion, datosProyecto, fijarBodegaPorDefecto, uuid, type Entorno } from './entorno.ts';

/** Reposición: al usuario se le cambia la batería que falló por otra de stock. */

let e: Entorno;
let proyectoId = '';
const enviar = (tipo: string, payload: Record<string, unknown>) => e.app.inject({ method: 'POST', url: '/comandos', payload: comando(tipo, payload) });
const hoja = async (id: string) => (await e.app.inject({ method: 'GET', url: `/equipos/${id}` })).json();
const bateria = async (tipo = 'BATERIA_GEL') => {
  const d = datosIngreso(proyectoId, { tipo, marca: 'Ritar', modelo: 'DG12-200', potencia: 200, unidad: 'Ah' });
  const r = await enviar('REGISTRAR_INGRESO', d);
  expect(r.statusCode, r.body).toBe(201);
  return d.equipoId as string;
};
const instalada = async () => {
  const id = await bateria();
  expect((await enviar('INSTALAR_EQUIPO', datosInstalacion(id))).statusCode).toBe(201);
  return id;
};
const reponer = (equipoRetiradoId: string, equipoNuevoId: string, cambios: Record<string, unknown> = {}) =>
  enviar('REPONER_EQUIPO', {
    equipoRetiradoId,
    equipoNuevoId,
    instalacionId: uuid(),
    destino: 'MANTENIMIENTO',
    motivo: 'No retiene carga',
    fecha: '2026-04-10',
    tecnico: 'Carlos Pérez',
    ...cambios,
  });

beforeAll(async () => {
  e = await crearEntorno();
  const bodega = datosBodega();
  await enviar('CREAR_BODEGA', bodega);
  fijarBodegaPorDefecto(bodega.bodegaId);
  const proyecto = datosProyecto();
  proyectoId = proyecto.proyectoId;
  await enviar('CREAR_PROYECTO', proyecto);
});
afterAll(() => e.cerrar());

describe('Reponer un equipo con fallas', () => {
  it('el que falla va a mantenimiento y el nuevo queda instalado al mismo usuario como reposición', async () => {
    const vieja = await instalada();
    const nueva = await bateria();
    const r = await reponer(vieja, nueva);
    expect(r.statusCode, r.body).toBe(201);

    const hv = await hoja(vieja);
    expect(hv.equipo.estado).toBe('EN_MANTENIMIENTO');
    expect(hv.instalacionActual).toBeNull();
    expect(hv.instalacionesAnteriores[0].motivoFin).toContain('Reposición por falla');
    expect(hv.reemplazadoPor[0].id).toBe(nueva);
    expect(hv.historial.at(-1).tipo).toBe('REPOSICION');

    const hn = await hoja(nueva);
    expect(hn.equipo).toMatchObject({ estado: 'INSTALADO', ubicacion: 'CAMPO' });
    expect(hn.instalacionActual).toMatchObject({ tipoEntrega: 'REPOSICION', reemplazaA: { id: vieja, serial: hv.equipo.serial } });
    expect(hn.instalacionActual.usuarioFinal.cedula).toBe('1234567890');
    expect(hn.instalacionActual.ubicacion).toEqual({ vereda: 'La Esperanza', municipio: 'Buenos Aires', departamento: 'Cauca' });
    expect(hn.otrosDelUsuario.map((o: { id: string }) => o.id)).toContain(vieja);

    const lista = (await e.app.inject({ method: 'GET', url: '/equipos?entrega=REPOSICION' })).json();
    expect(lista.datos.map((x: { id: string }) => x.id)).toEqual([nueva]);
    expect(lista.datos[0].tipoEntrega).toBe('REPOSICION');
  });

  it('puede quedar de baja, y una batería de gel se puede reponer con una de litio', async () => {
    const vieja = await instalada();
    const litio = await bateria('BATERIA_LITIO');
    expect((await reponer(vieja, litio, { destino: 'BAJA' })).statusCode).toBe(201);
    expect((await hoja(vieja)).equipo.estado).toBe('DADO_DE_BAJA');
  });

  it('valida: el retirado debe estar instalado, el nuevo en stock y del mismo tipo', async () => {
    const vieja = await instalada();
    const otraInstalada = await instalada();
    const enStock = await bateria();
    const panel = datosIngreso(proyectoId);
    await enviar('REGISTRAR_INGRESO', panel);

    const noInstalado = await reponer(enStock, await bateria());
    expect(noInstalado.json().error.codigo).toBe('REP-02');
    const nuevoNoEnStock = await reponer(vieja, otraInstalada);
    expect(nuevoNoEnStock.json().error.codigo).toBe('REP-04');
    const otroTipo = await reponer(vieja, panel.equipoId);
    expect(otroTipo.statusCode).toBe(409);
    expect(otroTipo.json().error.codigo).toBe('REP-03');
    const mismo = await reponer(vieja, vieja);
    expect(mismo.statusCode).toBe(422);
    // Nada cambió con los intentos fallidos.
    expect((await hoja(vieja)).equipo.estado).toBe('INSTALADO');
  });
});

describe('Reposición en el archivo de la empresa', () => {
  const importar = (cambios: Record<string, unknown>) =>
    enviar('IMPORTAR_HISTORICO', {
      equipoId: uuid(),
      codigoInterno: `EG&T-BGEL-${Math.floor(Math.random() * 1e6)}`,
      tipo: 'BATERIA_GEL',
      zona: 'San Miguel',
      estado: 'INSTALADO',
      usuario: { cedula: '55667788', nombre: 'Rosa Díaz' },
      ...cambios,
    });

  it('la fila con estado REPOSICIÓN queda como reposición', async () => {
    const id = uuid();
    expect((await importar({ equipoId: id, tipoEntrega: 'REPOSICION', motivo: 'Estado en el archivo: REPOSICIÓN' })).statusCode).toBe(201);
    expect((await hoja(id)).instalacionActual.tipoEntrega).toBe('REPOSICION');
  });

  it('los que ya se habían importado se marcan con la actualización (migración 0007)', async () => {
    const rep = uuid();
    const part = uuid();
    const normal = uuid();
    await importar({ equipoId: rep, motivo: 'Estado en el archivo: REPOSICIÓN · Nota: X' });
    await importar({ equipoId: part, motivo: 'Estado en el archivo: PARTICULAR' });
    await importar({ equipoId: normal, motivo: 'Estado en el archivo: REPARADO' });
    const sqlMarcado = readFileSync(new URL('../migraciones/0007_reposicion.sql', import.meta.url), 'utf8')
      .split(/;\s*\n/)
      .filter((s) => s.trim().split('\n').some((l) => l.startsWith('UPDATE')))
      .join(';\n');
    await e.conexion.ejecutarScript(sqlMarcado);
    expect((await hoja(rep)).instalacionActual.tipoEntrega).toBe('REPOSICION');
    expect((await hoja(part)).instalacionActual.tipoEntrega).toBe('PARTICULAR');
    expect((await hoja(normal)).instalacionActual.tipoEntrega).toBe('ENTREGA');
  });
});
