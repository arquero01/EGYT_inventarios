import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comando, crearEntorno, datosBodega, datosProyecto, uuid, type Entorno } from './entorno.ts';

/**
 * Importación del archivo histórico de la empresa (IMPORTAR_HISTORICO):
 * equipos que ya existen, con datos incompletos, identificados por el
 * código interno (EG&T-…) y repartidos por zonas.
 */

let e: Entorno;
let bodegaId = '';

const enviar = (payload: unknown) => e.app.inject({ method: 'POST', url: '/comandos', payload: payload as object });
const historico = (cambios: Record<string, unknown> = {}) => ({
  equipoId: uuid(),
  codigoInterno: `EG&T-BGEL-${Math.floor(Math.random() * 1e6)}`,
  tipo: 'BATERIA_GEL',
  marca: 'Ritar',
  descripcion: 'Batería gel 12V 150Ah',
  potencia: 150,
  unidad: 'Ah',
  zona: 'Zona Norte',
  estado: 'INSTALADO',
  usuario: { cedula: '1061700123', nombre: 'Ana Gómez', niu: '5012345' },
  fechaEntrega: '2024-05-10',
  compra: { proveedor: 'TB Plus', numeroFactura: 'FV-881', fechaCompra: '2024-04-02' },
  garantiaHasta: '2027-04-02',
  pendientes: ['proyecto'],
  ...cambios,
});

beforeAll(async () => {
  e = await crearEntorno();
  const bodega = datosBodega();
  bodegaId = bodega.bodegaId;
  expect((await enviar(comando('CREAR_BODEGA', bodega))).statusCode).toBe(201);
});
afterAll(() => e.cerrar());

describe('Importación del histórico', () => {
  it('un equipo instalado queda con su usuario, su zona y lo que le falta', async () => {
    const datos = historico();
    const r = await enviar(comando('IMPORTAR_HISTORICO', datos));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().respuesta).toMatchObject({ serial: datos.codigoInterno, origenSerial: 'INTERNO', pendientes: ['proyecto'] });

    const hoja = (await e.app.inject({ method: 'GET', url: `/equipos/${datos.equipoId}` })).json();
    expect(hoja.equipo).toMatchObject({ estado: 'INSTALADO', zona: 'Zona Norte', garantiaHasta: '2027-04-02', pendientes: ['proyecto'] });
    expect(hoja.proyecto).toBeNull();
    expect(hoja.compra).toMatchObject({ proveedor: 'TB Plus', numeroFactura: 'FV-881', nit: null });
    expect(hoja.instalacionActual?.usuarioFinal).toMatchObject({ cedula: '1061700123', nombre: 'Ana Gómez', niu: '5012345' });
  });

  it('el mismo usuario (por cédula) se reutiliza y se encuentra por cédula, NIU, zona o serial del fabricante', async () => {
    const otro = historico({ tipo: 'PANEL_SOLAR', potencia: 450, unidad: 'W', serialFabricante: 'JKM450-ABC-77', usuario: { cedula: '1061700123' } });
    expect((await enviar(comando('IMPORTAR_HISTORICO', otro))).statusCode).toBe(201);

    const porCedula = (await e.app.inject({ method: 'GET', url: '/equipos?q=1061700123' })).json();
    expect(porCedula.paginacion.total).toBe(2);
    const porNiu = (await e.app.inject({ method: 'GET', url: '/equipos?q=5012345' })).json();
    expect(porNiu.paginacion.total).toBe(2);
    const porFabricante = (await e.app.inject({ method: 'GET', url: '/equipos?q=jkm450-abc' })).json();
    expect(porFabricante.datos.map((d: { id: string }) => d.id)).toEqual([otro.equipoId]);
    const porZona = (await e.app.inject({ method: 'GET', url: `/equipos?zona=${encodeURIComponent('zona norte')}` })).json();
    expect(porZona.paginacion.total).toBe(2);
    const pendientes = (await e.app.inject({ method: 'GET', url: '/equipos?pendientes=si&sinProyecto=si' })).json();
    expect(pendientes.paginacion.total).toBe(2);
    expect(pendientes.datos[0].proyecto).toBeNull();

    const zonas = (await e.app.inject({ method: 'GET', url: '/zonas' })).json();
    expect(zonas.datos).toEqual([{ zona: 'Zona Norte', equipos: 2 }]);
  });

  it('no deja repetir un código interno', async () => {
    const datos = historico({ codigoInterno: 'EG&T-INV-0001', tipo: 'INVERSOR', potencia: 3, unidad: 'kW' });
    expect((await enviar(comando('IMPORTAR_HISTORICO', datos))).statusCode).toBe(201);
    const doble = await enviar(comando('IMPORTAR_HISTORICO', { ...datos, equipoId: uuid() }));
    expect(doble.statusCode).toBe(409);
    expect(doble.json().error.codigo).toBe('RF-07');
  });

  it('un equipo disponible necesita bodega y queda en ella', async () => {
    const sinBodega = await enviar(comando('IMPORTAR_HISTORICO', historico({ estado: 'EN_STOCK', usuario: undefined })));
    expect(sinBodega.statusCode).toBe(422);
    expect(sinBodega.json().error.codigo).toBe('IMP-01');

    const datos = historico({ estado: 'EN_STOCK', usuario: undefined, fechaEntrega: undefined, bodegaId });
    expect((await enviar(comando('IMPORTAR_HISTORICO', datos))).statusCode).toBe(201);
    const hoja = (await e.app.inject({ method: 'GET', url: `/equipos/${datos.equipoId}` })).json();
    expect(hoja.equipo).toMatchObject({ estado: 'EN_STOCK', ubicacion: 'BODEGA' });
    expect(hoja.instalacionActual).toBeNull();
  });

  it('un equipo de baja guarda su instalación ya cerrada y su historia', async () => {
    const datos = historico({ estado: 'DADO_DE_BAJA', motivo: 'Disposición final', usuario: { cedula: '76300111', nombre: 'Luis Mina' } });
    expect((await enviar(comando('IMPORTAR_HISTORICO', datos))).statusCode).toBe(201);
    const hoja = (await e.app.inject({ method: 'GET', url: `/equipos/${datos.equipoId}` })).json();
    expect(hoja.equipo.estado).toBe('DADO_DE_BAJA');
    expect(hoja.instalacionActual).toBeNull();
    expect(hoja.instalacionesAnteriores.length).toBe(1);
    expect(hoja.historial.map((ev: { tipo: string }) => ev.tipo)).toContain('IMPORTACION');
  });

  it('sin código interno usa el serial del fabricante, y sin ninguno asigna uno de la empresa', async () => {
    const fabricante = historico({ codigoInterno: undefined, serialFabricante: 'RT-998877' });
    const r1 = (await enviar(comando('IMPORTAR_HISTORICO', fabricante))).json();
    expect(r1.respuesta).toMatchObject({ serial: 'RT-998877', origenSerial: 'PROVEEDOR' });

    const ninguno = historico({ codigoInterno: undefined, tipo: 'CONTROLADOR', potencia: 30, unidad: 'A' });
    const r2 = (await enviar(comando('IMPORTAR_HISTORICO', ninguno))).json();
    expect(r2.respuesta.origenSerial).toBe('EMPRESA');
    expect(r2.respuesta.serial).toMatch(/^EGT-CTR-/);
  });

  it('un equipo del histórico se puede asignar luego a un proyecto', async () => {
    const proyecto = datosProyecto();
    expect((await enviar(comando('CREAR_PROYECTO', proyecto))).statusCode).toBe(201);
    const datos = historico();
    await enviar(comando('IMPORTAR_HISTORICO', datos));
    const r = await enviar(comando('CAMBIAR_PROYECTO', { equipoId: datos.equipoId, proyectoId: proyecto.proyectoId }));
    expect(r.statusCode, r.body).toBe(201);
    const hoja = (await e.app.inject({ method: 'GET', url: `/equipos/${datos.equipoId}` })).json();
    expect(hoja.proyecto.id).toBe(proyecto.proyectoId);
    expect(hoja.equipo.pendientes).toEqual([]);
    const filas = await e.conexion.db.execute(sql`SELECT proyecto_id FROM instalaciones WHERE equipo_id = ${datos.equipoId} AND vigente`);
    const fila = ((filas as { rows?: unknown[] }).rows ?? filas) as { proyecto_id: string }[];
    expect(fila[0]?.proyecto_id).toBe(proyecto.proyectoId);
  });

  it('solo el administrador puede importar', async () => {
    const r = await e.sinSesion({
      method: 'POST',
      url: '/auth/registro',
      payload: { nombre: 'Técnico Campo', correo: 'tecnico@egt.co', contrasena: 'clave-tecnico-1' },
    });
    const token = r.json().token as string;
    const prohibida = await e.sinSesion({
      method: 'POST',
      url: '/comandos',
      headers: { authorization: `Bearer ${token}` },
      payload: comando('IMPORTAR_HISTORICO', historico()),
    });
    expect(prohibida.statusCode).toBe(403);
    expect(prohibida.json().error.codigo).toBe('AUTH-07');
  });
});
