import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../../api/src/app.ts';
import { conectar, type Conexion } from '../../api/src/db/cliente.ts';
import { migrar } from '../../api/src/db/migrar.ts';
import {
  FalloApi,
  cerrarSesionCuenta,
  enviarComando,
  guardarAjustes,
  ingresarCuenta,
  leer,
  leerCola,
  leerRechazados,
  leerSesion,
  normalizarServidor,
  probarServidor,
  registrarCuenta,
  sincronizar,
  suscribirSesion,
} from '../src/api/cliente.ts';

/**
 * Prueba el cliente de la app contra el servidor real: en línea, sin conexión
 * (servidor apagado) y al volver la conexión (RNF-01).
 */

let conexion: Conexion;
let servidor: FastifyInstance | null = null;

async function encender() {
  servidor = construirApp(conexion.db);
  const url = await servidor.listen({ port: 0, host: '127.0.0.1' });
  await guardarAjustes({ servidor: url });
}

async function apagar() {
  await servidor?.close();
  servidor = null;
}

const proyecto = () => ({
  proyectoId: randomUUID(),
  nombre: `Proyecto ${randomUUID().slice(0, 6)}`,
  vereda: 'La Esperanza',
  municipio: 'Buenos Aires',
  departamento: 'Cauca',
  fechaInicio: '2026-02-01',
});

beforeAll(async () => {
  conexion = await conectar('pglite:memoria');
  await migrar(conexion);
  await encender();
});

const CUENTA = { nombre: 'Técnico de Prueba', correo: 'tecnico@egt.co', contrasena: 'campo2026' };

describe('dirección del servidor', () => {
  it('usa https para Codespaces y http para la aplicación de escritorio en la red local', () => {
    expect(normalizarServidor(' mi-codespace-3000.app.github.dev/ ')).toBe('https://mi-codespace-3000.app.github.dev');
    expect(normalizarServidor('192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
    expect(normalizarServidor('oficina.local:3000')).toBe('http://oficina.local:3000');
    expect(normalizarServidor('http://10.0.0.5:3000/')).toBe('http://10.0.0.5:3000');
  });
});

describe('cuenta en la app', () => {
  it('sin sesión el servidor no responde datos', async () => {
    await expect(leer('/bodegas')).rejects.toMatchObject({ error: { tipo: 'NO_AUTENTICADO', codigo: 'AUTH-05' } });
  });

  it('valida el registro en el celular antes de enviarlo', async () => {
    await expect(registrarCuenta({ nombre: 'Te', correo: 'x', contrasena: '123' })).rejects.toMatchObject({
      error: { codigo: 'AUTH-11', tipo: 'VALIDACION' },
    });
  });

  it('se registra, queda con sesión y la conserva al cerrar y abrir la app', async () => {
    const cambios: unknown[] = [];
    const quitar = suscribirSesion((s) => cambios.push(s?.usuario.correo ?? null));
    expect(await registrarCuenta(CUENTA)).toEqual({ pendiente: false });
    quitar();
    expect(cambios).toEqual(['tecnico@egt.co']);
    const sesion = await leerSesion();
    expect(sesion?.usuario).toMatchObject({ nombre: 'Técnico de Prueba', rol: 'ADMIN' });
  });

  it('cierra sesión y vuelve a entrar con correo y contraseña', async () => {
    await cerrarSesionCuenta();
    expect(await leerSesion()).toBeNull();
    await expect(ingresarCuenta({ correo: CUENTA.correo, contrasena: 'otra-clave1' })).rejects.toMatchObject({ error: { codigo: 'AUTH-01' } });
    const s = await ingresarCuenta({ correo: 'TECNICO@egt.co', contrasena: CUENTA.contrasena });
    expect(s.usuario.correo).toBe('tecnico@egt.co');
  });
});

afterAll(async () => {
  await apagar();
  await conexion.cerrar();
});

describe('cliente de la app', () => {
  let bodegaId: string;

  it('prueba la conexión y envía un comando en línea', async () => {
    expect(await probarServidor()).toBe(true);
    bodegaId = randomUUID();
    const r = await enviarComando('CREAR_BODEGA', { bodegaId, nombre: 'Bodega Popayán', municipio: 'Popayán', departamento: 'Cauca' });
    expect(r.estado).toBe('APLICADO');

    const bodegas = await leer<{ datos: { id: string }[] }>('/bodegas');
    expect(bodegas.desactualizado).toBe(false);
    expect(bodegas.datos.datos.map((b) => b.id)).toContain(bodegaId);
  });

  it('valida en el celular antes de enviar (RF-23)', async () => {
    await expect(enviarComando('CREAR_BODEGA', { bodegaId: randomUUID(), nombre: '', municipio: 'X', departamento: 'Y' })).rejects.toMatchObject({
      error: { codigo: 'RL-01', tipo: 'VALIDACION', detalles: [{ campo: 'payload.nombre' }] },
    });
  });

  it('muestra los errores de negocio del servidor', async () => {
    const e = await enviarComando('CREAR_BODEGA', { bodegaId: randomUUID(), nombre: 'bodega popayán', municipio: 'Popayán', departamento: 'Cauca' }).catch((x) => x);
    expect(e).toBeInstanceOf(FalloApi);
    expect(e.error).toMatchObject({ codigo: 'RL-01', tipo: 'CONFLICTO' });
  });

  it('sin conexión: guarda el comando en la cola y lee la copia guardada', async () => {
    await apagar();
    const p = proyecto();
    const r = await enviarComando('CREAR_PROYECTO', p);
    expect(r.estado).toBe('EN_COLA');
    expect((await leerCola()).map((s) => s.tipo)).toEqual(['CREAR_PROYECTO']);

    const copia = await leer<{ datos: { id: string }[] }>('/bodegas');
    expect(copia.desactualizado).toBe(true);
    expect(copia.datos.datos.map((b) => b.id)).toContain(bodegaId);

    // Sin copia guardada no hay nada que mostrar.
    await expect(leer('/articulos')).rejects.toMatchObject({ error: { tipo: 'SIN_CONEXION' } });
  });

  it('al volver la conexión, sincroniza la cola en orden', async () => {
    await encender();
    const r = await sincronizar();
    expect(r).toEqual({ enviados: 1, rechazados: 0 });
    expect(await leerCola()).toEqual([]);

    const proyectos = await leer<{ datos: { nombre: string }[] }>('/proyectos');
    expect(proyectos.datos.datos).toHaveLength(1);
  });

  it('dos instalaciones del mismo equipo sin señal: una se aplica y la otra queda rechazada', async () => {
    const p = proyecto();
    await enviarComando('CREAR_PROYECTO', p);
    const equipoId = randomUUID();
    await enviarComando('REGISTRAR_INGRESO', {
      equipoId,
      tipo: 'PANEL_SOLAR',
      marca: 'Jinko',
      modelo: 'Tiger Neo',
      origenSerial: 'EMPRESA',
      potencia: 450,
      unidad: 'W',
      proyectoId: p.proyectoId,
      bodegaId,
      compra: { proveedor: 'Solartex SAS', nit: '800197268-4', numeroFactura: 'FE-1', fechaCompra: '2026-01-10' },
      valorPagado: 520000,
    });

    await apagar();
    const instalar = (cedula: string) => ({
      equipoId,
      instalacionId: randomUUID(),
      usuario: { nombre: 'Usuario', cedula, telefono: '3105551234' },
      ubicacion: { vereda: 'V', municipio: 'M', departamento: 'D' },
      fechaInstalacion: '2026-03-01',
      tecnico: 'Carlos',
    });
    expect((await enviarComando('INSTALAR_EQUIPO', instalar('1111111111'))).estado).toBe('EN_COLA');
    expect((await enviarComando('INSTALAR_EQUIPO', instalar('2222222222'))).estado).toBe('EN_COLA');

    await encender();
    expect(await sincronizar()).toEqual({ enviados: 1, rechazados: 1 });
    const rechazados = await leerRechazados();
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0]!.error.codigo).toBe('RF-11');

    const hoja = await leer<{ equipo: { estado: string } }>(`/equipos/${equipoId}`);
    expect(hoja.datos.equipo.estado).toBe('INSTALADO');
  });

  it('sincronizar con la cola vacía no hace nada', async () => {
    expect(await sincronizar()).toEqual({ enviados: 0, rechazados: 0 });
  });

  it('si la sesión vence, vuelve al ingreso y conserva la cola para después', async () => {
    await apagar();
    expect((await enviarComando('CREAR_PROYECTO', proyecto())).estado).toBe('EN_COLA');
    await encender();
    // El servidor ya no reconoce el token (p. ej. un administrador cerró las sesiones).
    await conexion.ejecutarScript('DELETE FROM sesiones');
    await expect(sincronizar()).rejects.toMatchObject({ error: { tipo: 'NO_AUTENTICADO' } });
    expect(await leerSesion()).toBeNull();
    expect(await leerCola()).toHaveLength(1);

    await ingresarCuenta({ correo: CUENTA.correo, contrasena: CUENTA.contrasena });
    expect(await sincronizar()).toEqual({ enviados: 1, rechazados: 0 });
  });
});
