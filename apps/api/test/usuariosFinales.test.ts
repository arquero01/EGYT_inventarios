import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comando, crearEntorno, uuid, type Entorno } from './entorno.ts';

/** Usuarios finales: tablero por zonas, lista escrita y ficha de cada persona. */

let e: Entorno;
const enviar = (tipo: string, payload: Record<string, unknown>) => e.app.inject({ method: 'POST', url: '/comandos', payload: comando(tipo, payload) });
const obtener = async (url: string) => (await e.app.inject({ method: 'GET', url })).json();
const importar = async (cedula: string, nombre: string, zona: string, cambios: Record<string, unknown> = {}) => {
  const equipoId = uuid();
  const r = await enviar('IMPORTAR_HISTORICO', {
    equipoId,
    codigoInterno: `EG&T-BGEL-${Math.floor(Math.random() * 1e7)}`,
    tipo: 'BATERIA_GEL',
    zona,
    estado: 'INSTALADO',
    usuario: { cedula, nombre, niu: `9${cedula.slice(-5)}` },
    fechaEntrega: '2025-05-10',
    ...cambios,
  });
  expect(r.statusCode, r.body).toBe(201);
  return equipoId;
};

beforeAll(async () => {
  e = await crearEntorno();
  await importar('1061700001', 'Rosa Díaz', 'San Miguel');
  await importar('1061700001', 'Rosa Díaz', 'San Miguel', { tipoEntrega: 'REPOSICION' });
  await importar('1061700002', 'Pedro Gómez', 'Puerto Asís');
  await importar('1061700003', 'Ana Ríos', 'Puerto Asís', { estado: 'EN_MANTENIMIENTO' });
});
afterAll(() => e.cerrar());

describe('Usuarios finales', () => {
  it('el tablero cuenta usuarios, entregas y reposiciones por zona', async () => {
    const r = await obtener('/usuarios-finales/resumen');
    expect(r).toMatchObject({ usuarios: 3, conEquipo: 2, entregas: 4, instalados: 3, reposiciones: 1 });
    const asis = r.zonas.find((z: { llave: string }) => z.llave === 'puerto asis');
    expect(asis).toMatchObject({ zona: 'Puerto Asís', usuarios: 2, conEquipo: 1, instalados: 1, municipioCodigo: null });
    expect(r.zonas.find((z: { llave: string }) => z.llave === 'san miguel')).toMatchObject({ usuarios: 1, instalados: 2, reposiciones: 1 });
  });

  it('la lista se filtra por una o varias zonas y por nombre, cédula o NIU', async () => {
    const todas = await obtener('/usuarios-finales');
    expect(todas.paginacion.total).toBe(3);
    expect(todas.datos.map((u: { nombre: string }) => u.nombre)).toEqual(['Ana Ríos', 'Pedro Gómez', 'Rosa Díaz']);
    const rosa = todas.datos.find((u: { nombre: string }) => u.nombre === 'Rosa Díaz');
    expect(rosa).toMatchObject({ zonas: ['San Miguel'], equiposActuales: 2, entregas: 2, reposiciones: 1, ultimaEntrega: '2025-05-10' });

    expect((await obtener('/usuarios-finales?zona=puerto%20asis')).paginacion.total).toBe(2);
    expect((await obtener('/usuarios-finales?zona=San%20Miguel&zona=Puerto%20As%C3%ADs')).paginacion.total).toBe(3);
    expect((await obtener('/usuarios-finales?q=rios')).datos[0].nombre).toBe('Ana Ríos');
    expect((await obtener('/usuarios-finales?q=700002')).datos[0].nombre).toBe('Pedro Gómez');
  });

  it('la ficha muestra cada equipo entregado, también los que ya no tiene', async () => {
    const ana = (await obtener('/usuarios-finales?q=ana')).datos[0];
    const ficha = await obtener(`/usuarios-finales/${ana.id}`);
    expect(ficha.usuario).toMatchObject({ nombre: 'Ana Ríos', cedula: '1061700003' });
    expect(ficha.entregas).toHaveLength(1);
    expect(ficha.entregas[0]).toMatchObject({ vigente: false, estado: 'EN_MANTENIMIENTO', zona: 'Puerto Asís', tipoNombre: 'Batería de gel' });
    expect((await e.app.inject({ method: 'GET', url: `/usuarios-finales/${uuid()}` })).statusCode).toBe(404);
  });

  it('el administrador fija dónde queda una zona en el mapa', async () => {
    const r = await e.app.inject({ method: 'PUT', url: '/zonas/ubicacion', payload: { zona: 'San Miguel', municipioCodigo: '86757' } });
    expect(r.statusCode, r.body).toBe(200);
    const z = (await obtener('/usuarios-finales/resumen')).zonas.find((x: { llave: string }) => x.llave === 'san miguel');
    expect(z.municipioCodigo).toBe('86757');
    const mal = await e.app.inject({ method: 'PUT', url: '/zonas/ubicacion', payload: { zona: 'San Miguel', municipioCodigo: 'abc' } });
    expect(mal.statusCode).toBe(422);
    await e.app.inject({ method: 'PUT', url: '/zonas/ubicacion', payload: { zona: 'San Miguel', municipioCodigo: null } });
    expect((await obtener('/usuarios-finales/resumen')).zonas.find((x: { llave: string }) => x.llave === 'san miguel').municipioCodigo).toBeNull();
  });
});
