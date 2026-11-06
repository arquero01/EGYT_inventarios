import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Conexion } from '../src/db/cliente.ts';
import { comando, crearEntorno, datosBodega, datosIngreso, datosInstalacion, datosProyecto, fijarBodegaPorDefecto, uuid } from './entorno.ts';

let app: FastifyInstance;
let conexion: Conexion;
let cerrar: () => Promise<void>;

beforeAll(async () => {
  ({ app, conexion, cerrar } = await crearEntorno());
  const bodega = datosBodega({ nombre: 'Bodega principal de pruebas' });
  const r = await app.inject({ method: 'POST', url: '/comandos', payload: comando('CREAR_BODEGA', bodega) });
  expect(r.statusCode, r.body).toBe(201);
  fijarBodegaPorDefecto(bodega.bodegaId);
});
afterAll(async () => cerrar());

const enviar = (cuerpo: unknown) => app.inject({ method: 'POST', url: '/comandos', payload: cuerpo as object });
const obtener = (url: string) => app.inject({ method: 'GET', url });

async function crearProyecto(cambios: Record<string, unknown> = {}) {
  const datos = { ...datosProyecto(), ...cambios };
  const r = await enviar(comando('CREAR_PROYECTO', datos));
  expect(r.statusCode).toBe(201);
  return datos.proyectoId as string;
}

async function ingresar(proyectoId: string, cambios: Record<string, unknown> = {}) {
  const datos = datosIngreso(proyectoId, cambios);
  const r = await enviar(comando('REGISTRAR_INGRESO', datos));
  expect(r.statusCode, r.body).toBe(201);
  return { equipoId: datos.equipoId as string, respuesta: r.json().respuesta };
}

async function instalar(equipoId: string, cambios: Record<string, unknown> = {}) {
  const r = await enviar(comando('INSTALAR_EQUIPO', datosInstalacion(equipoId, cambios)));
  expect(r.statusCode, r.body).toBe(201);
  return r.json();
}

const estadoDe = async (equipoId: string) => (await obtener(`/equipos/${equipoId}`)).json().equipo.estado;

describe('Proyectos (RF-01, RF-02, RF-05)', () => {
  it('crea un proyecto y rechaza fecha futura y campos vacíos', async () => {
    await crearProyecto();
    const futura = await enviar(comando('CREAR_PROYECTO', { ...datosProyecto(), fechaInicio: '2999-01-01' }));
    expect(futura.statusCode).toBe(422);
    expect(futura.json().error.codigo).toBe('RF-01');

    const vacio = await enviar(comando('CREAR_PROYECTO', { ...datosProyecto(), vereda: '  ' }));
    expect(vacio.statusCode).toBe(422);
    expect(vacio.json().error.detalles[0].campo).toBe('payload.vereda');
  });

  it('la ficha muestra equipos, resumen y usuarios atendidos', async () => {
    const proyectoId = await crearProyecto();
    const a = await ingresar(proyectoId);
    await ingresar(proyectoId);
    const c = await ingresar(proyectoId);
    await instalar(a.equipoId, { usuario: { nombre: 'Ana Torres', cedula: '22334455', telefono: '3001112233' } });
    await instalar(c.equipoId, { usuario: { nombre: 'Ana Torres', cedula: '22334455', telefono: '3001112233' } });

    const r = await obtener(`/proyectos/${proyectoId}`);
    expect(r.statusCode).toBe(200);
    const ficha = r.json();
    expect(ficha.equipos).toHaveLength(3);
    expect(ficha.resumen).toMatchObject({ total: 3, instalados: 2, enStock: 1 });
    expect(ficha.usuariosAtendidos).toBe(1);

    const lista = (await obtener('/proyectos')).json();
    expect(lista.datos.find((p: { id: string }) => p.id === proyectoId).resumen.total).toBe(3);
  });

  it('proyecto inexistente → 404 RF-02', async () => {
    const r = await obtener(`/proyectos/${uuid()}`);
    expect(r.statusCode).toBe(404);
    expect(r.json().error.codigo).toBe('RF-02');
  });
});

describe('Ingreso de equipos (RF-06, RF-07, RF-08)', () => {
  it('registra el equipo en stock con su evento de ingreso', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    const hoja = (await obtener(`/equipos/${equipoId}`)).json();
    expect(hoja.equipo.estado).toBe('EN_STOCK');
    expect(hoja.equipo.potencia).toBe(450);
    expect(hoja.compra).toMatchObject({ proveedor: 'Solartex SAS', nit: '800197268-4', valorPagado: 520000 });
    expect(hoja.historial).toHaveLength(1);
    expect(hoja.historial[0].tipo).toBe('INGRESO');
  });

  it('impide seriales repetidos aunque cambien mayúsculas o espacios', async () => {
    const proyectoId = await crearProyecto();
    await ingresar(proyectoId, { serial: 'ABC 123' });
    const r = await enviar(comando('REGISTRAR_INGRESO', datosIngreso(proyectoId, { serial: 'abc123' })));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RF-07');
  });

  it('asigna seriales de empresa consecutivos por tipo', async () => {
    const proyectoId = await crearProyecto();
    const sinSerial = { origenSerial: 'EMPRESA', serial: undefined };
    const a = await ingresar(proyectoId, { ...sinSerial, tipo: 'MEDIDOR', unidad: 'A', potencia: 60 });
    const b = await ingresar(proyectoId, { ...sinSerial, tipo: 'MEDIDOR', unidad: 'A', potencia: 60 });
    const c = await ingresar(proyectoId, { ...sinSerial, tipo: 'BATERIA_GEL', unidad: 'Ah', potencia: 200 });
    expect(a.respuesta.serial).toBe('EGT-MED-000001');
    expect(b.respuesta.serial).toBe('EGT-MED-000002');
    expect(c.respuesta.serial).toBe('EGT-BGE-000001');
    expect((await obtener('/equipos/egt-med-000002')).json().equipo.id).toBe(b.equipoId);
  });

  it('reutiliza la factura y detecta datos de compra inconsistentes', async () => {
    const proyectoId = await crearProyecto();
    const compra = { proveedor: 'Baterías del Sur', nit: '900123456', numeroFactura: 'fe-77', fechaCompra: '2026-01-05' };
    const a = await ingresar(proyectoId, { compra });
    const b = await ingresar(proyectoId, { compra: { ...compra, numeroFactura: 'FE-77' } });
    expect(a.respuesta.compraId).toBe(b.respuesta.compraId);

    const r = await enviar(comando('REGISTRAR_INGRESO', datosIngreso(proyectoId, { compra: { ...compra, proveedor: 'Otro SAS' } })));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RF-08-FACTURA');
  });

  it('valida NIT, valor y proyecto', async () => {
    const proyectoId = await crearProyecto();
    const nit = await enviar(comando('REGISTRAR_INGRESO', datosIngreso(proyectoId, { valorPagado: 0 })));
    expect(nit.statusCode).toBe(422);
    expect(nit.json().error.codigo).toBe('RF-08');

    const proyecto = await enviar(comando('REGISTRAR_INGRESO', datosIngreso(uuid())));
    expect(proyecto.statusCode).toBe(404);
    expect(proyecto.json().error.codigo).toBe('RF-02');
  });
});

describe('Ciclo de vida del equipo (RF-11 a RF-15, RF-17)', () => {
  it('instala, impide doble instalación y retira con motivo', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    await instalar(equipoId);
    expect(await estadoDe(equipoId)).toBe('INSTALADO');

    const doble = await enviar(comando('INSTALAR_EQUIPO', datosInstalacion(equipoId)));
    expect(doble.statusCode).toBe(409);
    expect(doble.json().error.codigo).toBe('RF-11');

    const corto = await enviar(comando('RETIRAR_EQUIPO', { equipoId, motivo: 'falla' }));
    expect(corto.statusCode).toBe(422);
    expect(corto.json().error.codigo).toBe('RF-13');

    const retiro = await enviar(comando('RETIRAR_EQUIPO', { equipoId, motivo: 'El usuario se mudó de vereda' }));
    expect(retiro.statusCode).toBe(201);

    const hoja = (await obtener(`/equipos/${equipoId}`)).json();
    expect(hoja.equipo.estado).toBe('EN_STOCK');
    expect(hoja.instalacionActual).toBeNull();
    expect(hoja.instalacionesAnteriores).toHaveLength(1);
    expect(hoja.instalacionesAnteriores[0].motivoFin).toBe('El usuario se mudó de vereda');
    expect(hoja.historial.map((e: { tipo: string }) => e.tipo)).toEqual(['INGRESO', 'INSTALACION', 'RETORNO_A_STOCK']);
  });

  it('enviar a mantenimiento desde instalado cierra la instalación; finalizar vuelve a stock', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    await instalar(equipoId);
    const m = await enviar(comando('ENVIAR_A_MANTENIMIENTO', { equipoId, motivo: 'Inversor no enciende (PQR)' }));
    expect(m.statusCode).toBe(201);
    expect(m.json().respuesta.instalacionCerrada).toBeTruthy();

    const otraVez = await enviar(comando('ENVIAR_A_MANTENIMIENTO', { equipoId, motivo: 'otra vez' }));
    expect(otraVez.json().error.codigo).toBe('MANT-YA');

    await enviar(comando('FINALIZAR_MANTENIMIENTO', { equipoId, observacion: 'Se cambió el fusible' }));
    expect(await estadoDe(equipoId)).toBe('EN_STOCK');
  });

  it('un equipo dado de baja queda congelado', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    const sinMotivo = await enviar(comando('DAR_DE_BAJA', { equipoId, motivo: '' }));
    expect(sinMotivo.json().error.codigo).toBe('RF-15');

    expect((await enviar(comando('DAR_DE_BAJA', { equipoId, motivo: 'Panel quebrado sin garantía' }))).statusCode).toBe(201);
    expect((await enviar(comando('INSTALAR_EQUIPO', datosInstalacion(equipoId)))).json().error.codigo).toBe('RF-15');
    expect((await enviar(comando('ENVIAR_A_MANTENIMIENTO', { equipoId, motivo: 'revisar' }))).json().error.codigo).toBe('RF-14');
    expect((await obtener(`/equipos/${equipoId}`)).json().equipo.accionesPermitidas).toEqual([]);

    // La base de datos también lo impide, aunque alguien salte la API.
    await expect(
      conexion.db.execute(sql`UPDATE equipos SET estado = 'EN_STOCK' WHERE id = ${equipoId}`),
    ).rejects.toThrow();
  });

  it('el historial no se puede modificar ni borrar', async () => {
    await expect(conexion.db.execute(sql`UPDATE eventos_equipo SET descripcion = 'x'`)).rejects.toThrow();
    await expect(conexion.db.execute(sql`DELETE FROM eventos_equipo`)).rejects.toThrow();
  });

  it('cambia de proyecto solo si está en stock (RF-03)', async () => {
    const p1 = await crearProyecto();
    const p2 = await crearProyecto();
    const { equipoId } = await ingresar(p1);
    expect((await enviar(comando('CAMBIAR_PROYECTO', { equipoId, proyectoId: p2 }))).statusCode).toBe(201);
    await instalar(equipoId);
    const r = await enviar(comando('CAMBIAR_PROYECTO', { equipoId, proyectoId: p1 }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RF-03');
  });

  it('un comando repetido se aplica una sola vez', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    const c = comando('ENVIAR_A_MANTENIMIENTO', { equipoId, motivo: 'Revisión preventiva' });
    expect((await enviar(c)).statusCode).toBe(201);
    const segunda = await enviar(c);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().duplicado).toBe(true);
    expect((await obtener(`/equipos/${equipoId}`)).json().historial).toHaveLength(2);
  });
});

describe('Consultas (RF-10, RF-18 a RF-22)', () => {
  let proyectoId: string;
  beforeAll(async () => {
    proyectoId = await crearProyecto({ nombre: 'Proyecto Búsqueda' });
    const bat = await ingresar(proyectoId, { tipo: 'BATERIA_LITIO', marca: 'Pylontech', unidad: 'kWh', potencia: 2.4 });
    await instalar(bat.equipoId, { usuario: { nombre: 'Josefina Ramírez', cedula: '55667788', telefono: '3209998877' } });
    await ingresar(proyectoId, { tipo: 'INVERSOR', marca: 'Victron', unidad: 'kW', potencia: 1.5 });
  });

  it('filtra por proyecto, estado y tipo', async () => {
    const porProyecto = (await obtener(`/equipos?proyectoId=${proyectoId}`)).json();
    expect(porProyecto.paginacion.total).toBe(2);

    const instalados = (await obtener(`/equipos?proyectoId=${proyectoId}&estado=INSTALADO`)).json();
    expect(instalados.datos).toHaveLength(1);
    expect(instalados.datos[0].usuarioFinal.nombre).toBe('Josefina Ramírez');

    const malEstado = await obtener('/equipos?estado=PERDIDO');
    expect(malEstado.statusCode).toBe(422);
    expect(malEstado.json().error.codigo).toBe('RF-09');

    const vacio = (await obtener(`/equipos?proyectoId=${proyectoId}&estado=DADO_DE_BAJA`)).json();
    expect(vacio.aviso.codigo).toBe('RF-04');
  });

  it('busca sin importar tildes en usuario, proveedor, proyecto y marca', async () => {
    expect((await obtener('/equipos?q=josefina ramirez')).json().paginacion.total).toBe(1);
    expect((await obtener('/equipos?q=busqueda')).json().paginacion.total).toBe(2);
    expect((await obtener('/equipos?q=VICTRON')).json().paginacion.total).toBe(1);
    // Por cédula del usuario final, con o sin puntos (para atender una PQR).
    expect((await obtener('/equipos?q=55667788')).json().datos[0].usuarioFinal.cedula).toBe('55667788');
    expect((await obtener('/equipos?q=55.667.788')).json().paginacion.total).toBe(1);
    expect((await obtener('/equipos?q=zzzz-no-existe')).json().aviso.codigo).toBe('RF-22');
    const corto = await obtener('/equipos?q=a');
    expect(corto.statusCode).toBe(422);
    expect(corto.json().error.codigo).toBe('RF-22-MINIMO');
  });

  it('pagina el listado', async () => {
    const r = (await obtener('/equipos?porPagina=2&pagina=1')).json();
    expect(r.datos).toHaveLength(2);
    expect(r.paginacion.totalPaginas).toBeGreaterThan(1);
  });

  it('resumen general y stock por tipo', async () => {
    const resumen = (await obtener('/inventario/resumen')).json();
    expect(resumen.total).toBe(resumen.enStock + resumen.instalados + resumen.enMantenimiento + resumen.dadosDeBaja);

    const stock = (await obtener('/inventario/stock-por-tipo')).json().datos;
    expect(stock).toHaveLength(5);
    const inversor = stock.find((s: { tipo: string }) => s.tipo === 'INVERSOR');
    expect(inversor.cantidad).toBeGreaterThanOrEqual(1);
  });

  it('equipo inexistente → 404 RF-16', async () => {
    const r = await obtener('/equipos/NO-EXISTE-999');
    expect(r.statusCode).toBe(404);
    expect(r.json().error.codigo).toBe('RF-16');
  });
});

describe('Sincronización sin conexión (RNF-01)', () => {
  it('dos técnicos instalan el mismo equipo sin señal: uno se aplica, el otro queda en conflicto', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    const tecnicoA = comando('INSTALAR_EQUIPO', datosInstalacion(equipoId), { dispositivoId: 'celular-A' });
    const tecnicoB = comando(
      'INSTALAR_EQUIPO',
      datosInstalacion(equipoId, { usuario: { nombre: 'Pedro Gómez', cedula: '99887766', telefono: '3111234567' } }),
      { dispositivoId: 'celular-B' },
    );

    const a = (await app.inject({ method: 'POST', url: '/sync/push', payload: { comandos: [tecnicoA] } })).json();
    expect(a.resultados[0].resultado).toBe('APLICADO');

    const b = (await app.inject({ method: 'POST', url: '/sync/push', payload: { comandos: [tecnicoB] } })).json();
    expect(b.resultados[0].resultado).toBe('RECHAZADO');
    expect(b.aviso.codigo).toBe('RNF-01');

    // Reenviar el mismo lote (p. ej. se cayó la señal antes de recibir la respuesta) no duplica nada.
    const otraVez = (await app.inject({ method: 'POST', url: '/sync/push', payload: { comandos: [tecnicoA, tecnicoB] } })).json();
    expect(otraVez.resultados.map((r: { duplicado: boolean }) => r.duplicado)).toEqual([true, true]);

    const conflictos = (await obtener('/sync/conflictos')).json().datos;
    expect(conflictos.map((c: { id: string }) => c.id)).toContain(tecnicoB.id);

    const resolver = await app.inject({ method: 'POST', url: `/sync/conflictos/${tecnicoB.id}/resolver` });
    expect(resolver.statusCode).toBe(200);
    expect((await obtener('/sync/conflictos')).json().datos.map((c: { id: string }) => c.id)).not.toContain(tecnicoB.id);
  });

  it('descarga incremental: por páginas no se pierde ni se repite nada', async () => {
    const completo = (await obtener('/sync/cambios?desde=0&limite=1000')).json();
    expect(completo.hayMas).toBe(false);
    const totalEquipos = completo.equipos.length;
    expect(totalEquipos).toBeGreaterThan(5);
    expect(completo.equipos[0].compra.proveedor).toBeTruthy();

    // Mismo resultado pidiendo de a 3 filas.
    const vistos = new Map<string, number>();
    let desde = 0;
    for (let vuelta = 0; vuelta < 500; vuelta++) {
      const pagina = (await obtener(`/sync/cambios?desde=${desde}&limite=3`)).json();
      for (const e of pagina.equipos) vistos.set(e.id, e.rev);
      desde = pagina.hasta;
      if (!pagina.hayMas) break;
    }
    expect(vistos.size).toBe(totalEquipos);
    for (const e of completo.equipos) expect(vistos.get(e.id)).toBe(e.rev);

    const nada = (await obtener(`/sync/cambios?desde=${completo.hasta}`)).json();
    expect(nada.equipos).toHaveLength(0);
    expect(nada.hasta).toBe(completo.hasta);
  });

  it('operaciones simultáneas sobre el mismo equipo: solo una gana', async () => {
    const proyectoId = await crearProyecto();
    const { equipoId } = await ingresar(proyectoId);
    const intentos = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        enviar(comando('INSTALAR_EQUIPO', datosInstalacion(equipoId, { usuario: { nombre: `Usuario ${i}`, cedula: `7000000${i}`, telefono: '3000000000' } }))),
      ),
    );
    expect(intentos.filter((r) => r.statusCode === 201)).toHaveLength(1);
    expect(intentos.filter((r) => r.statusCode === 409)).toHaveLength(4);

    const serial = `SIM-${uuid().slice(0, 8)}`;
    const ingresos = await Promise.all(
      Array.from({ length: 4 }, () => enviar(comando('REGISTRAR_INGRESO', datosIngreso(proyectoId, { serial })))),
    );
    expect(ingresos.map((r) => r.statusCode).sort()).toEqual([201, 409, 409, 409]);
  });

  it('valida sin guardar (RF-23)', async () => {
    const r = (await app.inject({ method: 'POST', url: '/comandos/validar', payload: comando('DAR_DE_BAJA', { equipoId: uuid() }) })).json();
    expect(r.valido).toBe(false);
    expect(r.error.detalles[0].campo).toBe('payload.motivo');
  });
});
