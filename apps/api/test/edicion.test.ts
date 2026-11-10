import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comando, crearEntorno, datosBodega, uuid, type Entorno } from './entorno.ts';

/** EDITAR_EQUIPO: corregir datos que vinieron mal o incompletos del Excel. */

let e: Entorno;
let bodegaId = '';
const enviar = (payload: unknown) => e.app.inject({ method: 'POST', url: '/comandos', payload: payload as object });
const hoja = async (id: string) => (await e.app.inject({ method: 'GET', url: `/equipos/${id}` })).json();

const importar = async (cambios: Record<string, unknown> = {}) => {
  const datos = {
    equipoId: uuid(),
    codigoInterno: `EG&T-INV-${Math.floor(Math.random() * 1e6)}`,
    tipo: 'INVERSOR',
    descripcion: 'INVERSOR PURE SINE WAVE',
    zona: 'Puerto Asís',
    estado: 'INSTALADO',
    usuario: { cedula: '27100200', nombre: 'Rosa Pérez' },
    fechaEntrega: '2025-01-15',
    compra: { proveedor: 'Solar Andes', numeroFactura: 'FE-10', fechaCompra: '2024-12-01' },
    pendientes: ['Proyecto', 'Marca', 'Potencia', 'Valor', 'Fin de garantía', 'Verificar: Serial'],
    ...cambios,
  };
  const r = await enviar(comando('IMPORTAR_HISTORICO', datos));
  expect(r.statusCode, r.body).toBe(201);
  return datos;
};

beforeAll(async () => {
  e = await crearEntorno();
  const bodega = datosBodega();
  bodegaId = bodega.bodegaId;
  await enviar(comando('CREAR_BODEGA', bodega));
});
afterAll(() => e.cerrar());

describe('Corregir los datos de un equipo', () => {
  it('cambia los datos, deja el antes y el después en el historial y limpia lo que ya se completó', async () => {
    const d = await importar();
    const r = await enviar(
      comando('EDITAR_EQUIPO', { equipoId: d.equipoId, marca: 'Must', potencia: 1, unidad: 'kW', valorPagado: 2500000, garantiaHasta: '2027-12-01', motivo: 'Factura revisada' }),
    );
    expect(r.statusCode, r.body).toBe(201);
    const h = await hoja(d.equipoId);
    expect(h.equipo).toMatchObject({ marca: 'Must', potencia: 1, unidad: 'kW', garantiaHasta: '2027-12-01' });
    expect(h.valorPagado).toBe(2500000);
    // Quedan los que no se llenaron y los de verificar (esos se quitan a mano).
    expect(h.equipo.pendientes).toEqual(['Proyecto', 'Verificar: Serial']);
    const ev = h.historial.find((x: { tipo: string }) => x.tipo === 'EDICION');
    expect(ev.descripcion).toContain('Factura revisada');
    expect(ev.descripcion).toContain('marca: — → Must');
    expect(ev.estadoNuevo).toBe('INSTALADO');
  });

  it('marca como verificado quitando el pendiente, y sin cambios avisa', async () => {
    const d = await importar();
    const r = await enviar(comando('EDITAR_EQUIPO', { equipoId: d.equipoId, pendientes: ['Proyecto', 'Marca', 'Potencia', 'Valor', 'Fin de garantía'] }));
    expect(r.statusCode, r.body).toBe(201);
    expect((await hoja(d.equipoId)).equipo.pendientes).not.toContain('Verificar: Serial');
    const igual = await enviar(comando('EDITAR_EQUIPO', { equipoId: d.equipoId, marca: null }));
    expect(igual.statusCode).toBe(422);
    expect(igual.json().error.codigo).toBe('EDIT-02');
  });

  it('corrige el código (sin repetir otro) y la factura sin cambiar la de los demás equipos', async () => {
    const a = await importar();
    const b = await importar();
    const repetido = await enviar(comando('EDITAR_EQUIPO', { equipoId: a.equipoId, serial: b.codigoInterno }));
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().error.codigo).toBe('RF-07');

    const r = await enviar(
      comando('EDITAR_EQUIPO', { equipoId: a.equipoId, serial: 'EG&T-INV-9999', compra: { proveedor: 'Solar Andes', numeroFactura: 'FE-11', nit: '900123456' } }),
    );
    expect(r.statusCode, r.body).toBe(201);
    const ha = await hoja(a.equipoId);
    expect(ha.equipo.serial).toBe('EG&T-INV-9999');
    expect(ha.compra).toMatchObject({ numeroFactura: 'FE-11', nit: '900123456' });
    expect((await hoja(b.equipoId)).compra.numeroFactura).toBe('FE-10');
    expect((await e.app.inject({ method: 'GET', url: '/equipos/EG%26T-INV-9999' })).statusCode).toBe(200);
  });

  it('corrige la cédula y los datos del usuario, o le pone usuario al que venía sin él', async () => {
    const d = await importar();
    const r = await enviar(
      comando('EDITAR_EQUIPO', { equipoId: d.equipoId, usuario: { cedula: '27100201', nombre: 'Rosa Pérez Mora', telefono: '3101234567', niu: '88001' }, fechaEntrega: '2025-02-01' }),
    );
    expect(r.statusCode, r.body).toBe(201);
    const h = await hoja(d.equipoId);
    expect(h.instalacionActual.usuarioFinal).toMatchObject({ cedula: '27100201', nombre: 'Rosa Pérez Mora', telefono: '3101234567', niu: '88001' });
    expect(h.instalacionActual.fechaInstalacion).toBe('2025-02-01');

    const sinUsuario = await importar({ usuario: undefined, fechaEntrega: undefined, pendientes: ['Usuario'] });
    const r2 = await enviar(comando('EDITAR_EQUIPO', { equipoId: sinUsuario.equipoId, usuario: { cedula: '1122334455', nombre: 'Luis Ortiz' }, fechaEntrega: '2025-03-03' }));
    expect(r2.statusCode, r2.body).toBe(201);
    const h2 = await hoja(sinUsuario.equipoId);
    expect(h2.instalacionActual.usuarioFinal.cedula).toBe('1122334455');
    expect(h2.equipo.pendientes).toEqual([]);
  });

  it('a un equipo en stock no se le pone usuario', async () => {
    const d = await importar({ estado: 'EN_STOCK', bodegaId, usuario: undefined, fechaEntrega: undefined });
    const r = await enviar(comando('EDITAR_EQUIPO', { equipoId: d.equipoId, usuario: { cedula: '27100299' } }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('EDIT-04');
  });

  it('un equipo de baja importado se puede corregir; uno dado de baja en el sistema, no', async () => {
    const d = await importar({ estado: 'DADO_DE_BAJA', motivo: 'Perdido' });
    const r = await enviar(comando('EDITAR_EQUIPO', { equipoId: d.equipoId, marca: 'Growatt' }));
    expect(r.statusCode, r.body).toBe(201);
    expect((await hoja(d.equipoId)).equipo).toMatchObject({ marca: 'Growatt', estado: 'DADO_DE_BAJA' });

    const otro = await importar({ estado: 'EN_MANTENIMIENTO' });
    expect((await enviar(comando('DAR_DE_BAJA', { equipoId: otro.equipoId, motivo: 'Quemado sin reparación' }))).statusCode).toBe(201);
    // También vino del histórico, así que se puede corregir.
    expect((await enviar(comando('EDITAR_EQUIPO', { equipoId: otro.equipoId, marca: 'Epever' }))).statusCode).toBe(201);
  });

  it('un equipo registrado normalmente y dado de baja sigue congelado (RF-15)', async () => {
    const proyecto = { proyectoId: uuid(), nombre: 'Proyecto Prueba', vereda: 'La Paz', municipio: 'Orito', departamento: 'Putumayo', fechaInicio: '2025-01-01' };
    expect((await enviar(comando('CREAR_PROYECTO', proyecto))).statusCode).toBe(201);
    const equipoId = uuid();
    const ingreso = await enviar(
      comando('REGISTRAR_INGRESO', {
        equipoId,
        tipo: 'PANEL_SOLAR',
        marca: 'Jinko',
        modelo: 'Tiger',
        potencia: 550,
        unidad: 'W',
        origenSerial: 'EMPRESA',
        proyectoId: proyecto.proyectoId,
        bodegaId,
        compra: { proveedor: 'Solar Andes', nit: '900123456', numeroFactura: 'FE-77', fechaCompra: '2025-01-02' },
        valorPagado: 600000,
      }),
    );
    expect(ingreso.statusCode, ingreso.body).toBe(201);
    expect((await enviar(comando('DAR_DE_BAJA', { equipoId, motivo: 'Panel roto en transporte' }))).statusCode).toBe(201);
    const r = await enviar(comando('EDITAR_EQUIPO', { equipoId, marca: 'Otra' }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('EDIT-03');
  });
});

describe('Agregar datos por verificar', () => {
  it('suma a la lista sin quitar lo que ya tenía, y repetir no cambia nada', async () => {
    const d = await importar({ pendientes: ['Proyecto', 'Marca'] });
    const r = await enviar(comando('EDITAR_EQUIPO', { equipoId: d.equipoId, agregarPendientes: ['Verificar (amarillo): toda la fila'] }));
    expect(r.statusCode, r.body).toBe(201);
    expect((await hoja(d.equipoId)).equipo.pendientes).toEqual(['Proyecto', 'Marca', 'Verificar (amarillo): toda la fila']);
    const otra = await enviar(comando('EDITAR_EQUIPO', { equipoId: d.equipoId, agregarPendientes: ['Verificar (amarillo): toda la fila'] }));
    expect(otra.json().error.codigo).toBe('EDIT-02');
  });
});

describe('Filtro de celdas por verificar', () => {
  it('lista solo los equipos con algo por verificar', async () => {
    const d = await importar({ pendientes: ['Verificar (rojo): Nombre'] });
    const r = (await e.app.inject({ method: 'GET', url: '/equipos?verificar=si&porPagina=100' })).json();
    const ids = r.datos.map((x: { id: string }) => x.id);
    expect(ids).toContain(d.equipoId);
    expect(r.datos.every((x: { pendientes: string[] }) => x.pendientes.some((p) => p.startsWith('Verificar')))).toBe(true);
  });
});
