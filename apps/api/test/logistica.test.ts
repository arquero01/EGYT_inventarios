import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Conexion } from '../src/db/cliente.ts';
import { comando, crearEntorno, datosBodega, datosIngreso, datosInstalacion, datosProyecto, fijarBodegaPorDefecto, uuid } from './entorno.ts';

let app: FastifyInstance;
let conexion: Conexion;
let cerrar: () => Promise<void>;

const enviar = (cuerpo: unknown) => app.inject({ method: 'POST', url: '/comandos', payload: cuerpo as object });
const obtener = (url: string) => app.inject({ method: 'GET', url });

async function ok(tipo: string, payload: Record<string, unknown>) {
  const r = await enviar(comando(tipo, payload));
  expect(r.statusCode, r.body).toBe(201);
  return r.json().respuesta;
}

async function crearBodega(nombre?: string) {
  const datos = datosBodega(nombre ? { nombre } : {});
  await ok('CREAR_BODEGA', datos);
  return datos.bodegaId as string;
}

async function crearProyecto(nombre = 'Proyecto logística') {
  const datos = { ...datosProyecto(), nombre };
  await ok('CREAR_PROYECTO', datos);
  return datos.proyectoId as string;
}

async function ingresarEquipo(proyectoId: string, bodegaId: string) {
  const datos = datosIngreso(proyectoId, { bodegaId });
  await ok('REGISTRAR_INGRESO', datos);
  return datos.equipoId as string;
}

const hoja = async (equipoId: string) => (await obtener(`/equipos/${equipoId}`)).json();

beforeAll(async () => {
  ({ app, conexion, cerrar } = await crearEntorno());
  fijarBodegaPorDefecto(await crearBodega('Bodega Popayán'));
});
afterAll(async () => cerrar());

describe('Bodegas (RL-01, RL-11)', () => {
  it('no repite nombres de bodega aunque cambien mayúsculas', async () => {
    await crearBodega('Bodega Cali');
    const r = await enviar(comando('CREAR_BODEGA', datosBodega({ nombre: 'bodega cali' })));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RL-01');
  });

  it('una bodega nueva avisa que no tiene existencias', async () => {
    const id = await crearBodega();
    const r = (await obtener(`/bodegas/${id}`)).json();
    expect(r.aviso.codigo).toBe('RL-11');
    expect((await obtener('/bodegas')).json().datos.some((b: { id: string }) => b.id === id)).toBe(true);
  });
});

describe('Equipos con serial: ingreso, despacho, traslado y devolución', () => {
  it('el ingreso deja el equipo en la bodega indicada', async () => {
    const bodega = await crearBodega();
    const equipoId = await ingresarEquipo(await crearProyecto(), bodega);
    const h = await hoja(equipoId);
    expect(h.equipo.ubicacion).toBe('BODEGA');
    expect(h.equipo.bodega.id).toBe(bodega);
    expect(h.equipo.movimientosPosibles).toEqual(['DESPACHO', 'TRASLADO']);
  });

  it('el despacho lleva el equipo a campo, lo asigna al proyecto y numera la guía', async () => {
    const bodega = await crearBodega();
    const proyectoOrigen = await crearProyecto();
    const proyectoDestino = await crearProyecto('Vereda El Diviso');
    const equipoId = await ingresarEquipo(proyectoOrigen, bodega);

    const guia = await ok('REGISTRAR_DESPACHO', { bodegaOrigenId: bodega, proyectoId: proyectoDestino, responsable: 'Luis Gómez', equipos: [equipoId] });
    expect(guia.numero).toMatch(/^DES-\d{6}$/);

    const h = await hoja(equipoId);
    expect(h.equipo.ubicacion).toBe('CAMPO');
    expect(h.equipo.bodega).toBeNull();
    expect(h.equipo.estado).toBe('EN_STOCK');
    expect(h.proyecto.id).toBe(proyectoDestino);
    expect(h.historial.at(-1).tipo).toBe('DESPACHO');
    expect(h.equipo.movimientosPosibles).toEqual(['DEVOLUCION']);

    const detalle = (await obtener(`/movimientos/${guia.numero.toLowerCase()}`)).json();
    expect(detalle.equipos[0].id).toBe(equipoId);
    expect(detalle.destino).toBeNull();
    expect(detalle.proyecto).toBe('Vereda El Diviso');
  });

  it('si un equipo no está en la bodega de origen, no se mueve ninguno (RL-02)', async () => {
    const bodegaA = await crearBodega();
    const bodegaB = await crearBodega();
    const proyecto = await crearProyecto();
    const bien = await ingresarEquipo(proyecto, bodegaA);
    const mal = await ingresarEquipo(proyecto, bodegaB);

    const r = await enviar(comando('REGISTRAR_DESPACHO', { bodegaOrigenId: bodegaA, proyectoId: proyecto, responsable: 'Luis', equipos: [bien, mal] }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RL-02');
    expect(r.json().error.detalles[0].campo).toBe('payload.equipos.1');
    expect((await hoja(bien)).equipo.ubicacion).toBe('BODEGA');
  });

  it('instalar, retirar y devolver: el equipo vuelve a bodega', async () => {
    const bodega = await crearBodega();
    const proyecto = await crearProyecto();
    const equipoId = await ingresarEquipo(proyecto, bodega);
    await ok('REGISTRAR_DESPACHO', { bodegaOrigenId: bodega, proyectoId: proyecto, responsable: 'Luis', equipos: [equipoId] });
    await ok('INSTALAR_EQUIPO', datosInstalacion(equipoId));

    const instalado = await enviar(comando('REGISTRAR_DEVOLUCION', { proyectoId: proyecto, bodegaDestinoId: bodega, responsable: 'Ana', equipos: [equipoId] }));
    expect(instalado.statusCode).toBe(409);
    expect(instalado.json().error.detalles[0].problema).toContain('primero debe retirarse');

    await ok('RETIRAR_EQUIPO', { equipoId, motivo: 'El usuario se mudó de vereda' });
    expect((await hoja(equipoId)).equipo.ubicacion).toBe('CAMPO');

    await ok('REGISTRAR_DEVOLUCION', { proyectoId: proyecto, bodegaDestinoId: bodega, responsable: 'Ana', equipos: [equipoId] });
    const h = await hoja(equipoId);
    expect(h.equipo.ubicacion).toBe('BODEGA');
    expect(h.equipo.bodega.id).toBe(bodega);
    expect(h.historial.map((e: { tipo: string }) => e.tipo)).toEqual(['INGRESO', 'DESPACHO', 'INSTALACION', 'RETORNO_A_STOCK', 'DEVOLUCION']);
  });

  it('instalar directamente desde bodega deja el equipo en campo', async () => {
    const equipoId = await ingresarEquipo(await crearProyecto(), await crearBodega());
    await ok('INSTALAR_EQUIPO', datosInstalacion(equipoId));
    const h = await hoja(equipoId);
    expect(h.equipo.ubicacion).toBe('CAMPO');
    expect(h.equipo.bodega).toBeNull();
  });

  it('traslada entre bodegas un equipo en mantenimiento', async () => {
    const origen = await crearBodega();
    const destino = await crearBodega();
    const equipoId = await ingresarEquipo(await crearProyecto(), origen);
    await ok('ENVIAR_A_MANTENIMIENTO', { equipoId, motivo: 'Revisión del inversor' });
    await ok('REGISTRAR_TRASLADO', { bodegaOrigenId: origen, bodegaDestinoId: destino, responsable: 'Ana', equipos: [equipoId] });
    expect((await hoja(equipoId)).equipo.bodega.id).toBe(destino);

    const filtrados = (await obtener(`/equipos?bodegaId=${destino}`)).json();
    expect(filtrados.datos.map((e: { id: string }) => e.id)).toEqual([equipoId]);
  });
});

describe('Artículos por cantidad (RL-03, RL-04, RL-08, RL-09)', () => {
  let bodega: string;
  let proyecto: string;
  const cable = uuid();
  const conectores = uuid();

  beforeAll(async () => {
    bodega = await crearBodega();
    proyecto = await crearProyecto();
    await ok('CREAR_ARTICULO', { articuloId: cable, codigo: 'cab-6mm', nombre: 'Cable solar 6 mm²', unidad: 'M' });
    await ok('CREAR_ARTICULO', { articuloId: conectores, codigo: 'MC4', nombre: 'Conector MC4', unidad: 'PAR' });
  });

  const existenciasEn = async (query: string) =>
    Object.fromEntries((await obtener(`/existencias?${query}`)).json().datos.map((a: { codigo: string; cantidad: number }) => [a.codigo, a.cantidad]));

  it('no repite códigos de artículo', async () => {
    const r = await enviar(comando('CREAR_ARTICULO', { articuloId: uuid(), codigo: 'CAB-6MM', nombre: 'Otro', unidad: 'M' }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RL-03');
  });

  it('el ingreso suma existencias y guarda la factura', async () => {
    const guia = await ok('INGRESAR_ARTICULOS', {
      bodegaId: bodega,
      compra: { proveedor: 'Ferretería El Sol', nit: '900123456', numeroFactura: 'FE-77', fechaCompra: '2026-01-05' },
      items: [
        { articuloId: cable, cantidad: 100, valorUnitario: 4500 },
        { articuloId: conectores, cantidad: 20, valorUnitario: 8000 },
      ],
    });
    expect(guia.numero).toMatch(/^ING-/);
    expect(await existenciasEn(`bodegaId=${bodega}`)).toEqual({ 'CAB-6MM': 100, MC4: 20 });
    expect((await obtener(`/movimientos/${guia.numero}`)).json().compra.numeroFactura).toBe('FE-77');
  });

  it('despacha equipos y artículos en una misma guía', async () => {
    const equipoId = await ingresarEquipo(proyecto, bodega);
    const guia = await ok('REGISTRAR_DESPACHO', {
      bodegaOrigenId: bodega,
      proyectoId: proyecto,
      responsable: 'Luis',
      equipos: [equipoId],
      articulos: [{ articuloId: cable, cantidad: 30.5 }, { articuloId: conectores, cantidad: 4 }],
    });
    expect(guia).toMatchObject({ equipos: 1, articulos: 2 });
    expect(await existenciasEn(`bodegaId=${bodega}`)).toEqual({ 'CAB-6MM': 69.5, MC4: 16 });
    expect(await existenciasEn(`proyectoId=${proyecto}`)).toEqual({ 'CAB-6MM': 30.5, MC4: 4 });
  });

  it('sin existencias suficientes no se mueve nada (RL-08)', async () => {
    const r = await enviar(comando('REGISTRAR_DESPACHO', {
      bodegaOrigenId: bodega,
      proyectoId: proyecto,
      responsable: 'Luis',
      articulos: [{ articuloId: conectores, cantidad: 1 }, { articuloId: cable, cantidad: 500 }],
    }));
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('RL-08');
    expect(r.json().error.detalles[0].problema).toContain('disponible 69.5');
    expect(await existenciasEn(`bodegaId=${bodega}`)).toEqual({ 'CAB-6MM': 69.5, MC4: 16 });
  });

  it('las unidades enteras no aceptan decimales', async () => {
    const r = await enviar(comando('REGISTRAR_DESPACHO', { bodegaOrigenId: bodega, proyectoId: proyecto, responsable: 'Luis', articulos: [{ articuloId: conectores, cantidad: 1.5 }] }));
    expect(r.statusCode).toBe(422);
    expect(r.json().error.codigo).toBe('RL-03-ENTERA');
  });

  it('la devolución regresa artículos del proyecto a la bodega y el kardex lo muestra', async () => {
    await ok('REGISTRAR_DEVOLUCION', { proyectoId: proyecto, bodegaDestinoId: bodega, responsable: 'Ana', articulos: [{ articuloId: cable, cantidad: 10.5 }] });
    expect(await existenciasEn(`proyectoId=${proyecto}`)).toEqual({ 'CAB-6MM': 20, MC4: 4 });

    const kardex = (await obtener(`/articulos/${cable}`)).json();
    expect(kardex.movimientos.map((m: { tipo: string }) => m.tipo)).toEqual(['DEVOLUCION', 'DESPACHO', 'INGRESO']);
    expect(kardex.existencias).toHaveLength(2);

    const lista = (await obtener('/articulos')).json().datos.find((a: { id: string }) => a.id === cable);
    expect(lista).toMatchObject({ enBodegas: 80, enCampo: 20 });
  });

  it('un artículo sin movimientos avisa RL-09', async () => {
    const id = uuid();
    await ok('CREAR_ARTICULO', { articuloId: id, codigo: 'EST-01', nombre: 'Estructura de techo', unidad: 'JUEGO' });
    expect((await obtener(`/articulos/${id}`)).json().aviso.codigo).toBe('RL-09');
  });
});

describe('Guías y sincronización', () => {
  it('lista movimientos por tipo y avisa cuando no hay (RL-10)', async () => {
    const despachos = (await obtener('/movimientos?tipo=DESPACHO')).json();
    expect(despachos.datos.length).toBeGreaterThan(0);
    expect(despachos.datos.every((m: { tipo: string }) => m.tipo === 'DESPACHO')).toBe(true);

    const vacio = (await obtener(`/movimientos?bodegaId=${uuid()}`)).json();
    expect(vacio.aviso.codigo).toBe('RL-10');
  });

  it('un despacho hecho sin conexión llega por /sync/push una sola vez', async () => {
    const bodega = await crearBodega();
    const proyecto = await crearProyecto();
    const equipoId = await ingresarEquipo(proyecto, bodega);
    const despacho = comando('REGISTRAR_DESPACHO', { bodegaOrigenId: bodega, proyectoId: proyecto, responsable: 'Luis', equipos: [equipoId] });

    const primero = (await app.inject({ method: 'POST', url: '/sync/push', payload: { comandos: [despacho] } })).json();
    const segundo = (await app.inject({ method: 'POST', url: '/sync/push', payload: { comandos: [despacho] } })).json();
    expect(primero.resultados[0].resultado).toBe('APLICADO');
    expect(segundo.resultados[0].duplicado).toBe(true);
    expect((await hoja(equipoId)).historial.filter((e: { tipo: string }) => e.tipo === 'DESPACHO')).toHaveLength(1);
  });

  it('las guías no se pueden modificar ni borrar', async () => {
    await expect(conexion.db.execute(sql`UPDATE movimientos SET responsable = 'otro'`)).rejects.toThrow();
    await expect(conexion.db.execute(sql`DELETE FROM movimiento_items`)).rejects.toThrow();
  });
});
