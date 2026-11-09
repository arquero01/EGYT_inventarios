import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { construirApp, type OpcionesApp } from '../src/app.ts';
import { conectar, type Conexion } from '../src/db/cliente.ts';
import { migrar } from '../src/db/migrar.ts';

/**
 * Base de datos de prueba. Por defecto PostgreSQL embebido en memoria (PGlite).
 * Con TEST_DATABASE_URL=postgres://… corre contra un PostgreSQL real; en ese
 * caso BORRA el esquema public, así que use una base exclusiva para pruebas.
 */
export interface Entorno {
  app: FastifyInstance;
  conexion: Conexion;
  /** Token del administrador creado al iniciar (vacío si sesion: false). */
  token: string;
  /** inject sin el encabezado de sesión automático. */
  sinSesion: (opciones: InjectOptions) => ReturnType<FastifyInstance['inject']>;
  cerrar: () => Promise<void>;
}

export const ADMIN_PRUEBAS = { nombre: 'Administradora Pruebas', correo: 'admin@egt.co', contrasena: 'clave-segura-1' };

/**
 * Por defecto registra una cuenta de administrador y hace que todas las
 * llamadas a app.inject lleven su token, así las pruebas de inventario no
 * tienen que preocuparse por la sesión.
 */
export async function crearEntorno(
  opciones: Pick<OpcionesApp, 'registroRequiereAprobacion'> & { sesion?: boolean } = {},
): Promise<Entorno> {
  const url = process.env.TEST_DATABASE_URL ?? 'pglite:memoria';
  const conexion = await conectar(url);
  if (!url.startsWith('pglite:')) {
    await conexion.ejecutarScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await migrar(conexion);
  const app = construirApp(conexion.db, { registroRequiereAprobacion: opciones.registroRequiereAprobacion ?? false });
  await app.ready();
  const original = app.inject.bind(app) as (o: InjectOptions) => ReturnType<FastifyInstance['inject']>;
  let token = '';
  if (opciones.sesion !== false) {
    const r = await original({ method: 'POST', url: '/auth/registro', payload: ADMIN_PRUEBAS });
    if (r.statusCode !== 201) throw new Error(`No se pudo crear el administrador de pruebas: ${r.body}`);
    token = r.json().token;
    const conToken = (o: InjectOptions) => original({ ...o, headers: { authorization: `Bearer ${token}`, ...o.headers } });
    (app as unknown as { inject: typeof conToken }).inject = conToken;
  }
  return {
    app,
    conexion,
    token,
    sinSesion: original,
    cerrar: async () => {
      await app.close();
      await conexion.cerrar();
    },
  };
}

export const uuid = () => randomUUID();

export const comando = (tipo: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: uuid(),
  tipo,
  ocurridoEn: new Date().toISOString(),
  dispositivoId: 'prueba',
  autor: 'Prueba',
  payload,
  ...extra,
});

export const datosProyecto = (proyectoId = uuid()) => ({
  proyectoId,
  nombre: 'Electrificación La Esperanza',
  vereda: 'La Esperanza',
  municipio: 'Buenos Aires',
  departamento: 'Cauca',
  fechaInicio: '2026-02-01',
  descripcion: 'Sistemas solares para 40 viviendas',
});

/** Bodega que usan por defecto los ingresos de prueba (se fija al crear el entorno). */
let bodegaPorDefecto = '';
export const fijarBodegaPorDefecto = (id: string) => {
  bodegaPorDefecto = id;
};

export const datosBodega = (cambios: Record<string, unknown> = {}) => ({
  bodegaId: uuid(),
  nombre: `Bodega ${Math.random().toString(36).slice(2, 8)}`,
  municipio: 'Popayán',
  departamento: 'Cauca',
  ...cambios,
});

export const datosIngreso = (proyectoId: string, cambios: Record<string, unknown> = {}) => ({
  equipoId: uuid(),
  tipo: 'PANEL_SOLAR',
  marca: 'Jinko',
  modelo: 'Tiger Neo 450',
  origenSerial: 'PROVEEDOR',
  serial: `JK-${Math.random().toString(36).slice(2, 10)}`,
  potencia: 450,
  unidad: 'W',
  proyectoId,
  bodegaId: bodegaPorDefecto,
  compra: { proveedor: 'Solartex SAS', nit: '800197268-4', numeroFactura: 'FE-1001', fechaCompra: '2026-01-10' },
  valorPagado: 520000,
  ...cambios,
});

export const datosInstalacion = (equipoId: string, cambios: Record<string, unknown> = {}) => ({
  equipoId,
  instalacionId: uuid(),
  usuario: { nombre: 'María López', cedula: '1234567890', telefono: '3105551234' },
  ubicacion: { vereda: 'La Esperanza', municipio: 'Buenos Aires', departamento: 'Cauca' },
  fechaInstalacion: '2026-03-01',
  tecnico: 'Carlos Pérez',
  ...cambios,
});
