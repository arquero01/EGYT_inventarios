import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.ts';
import { conectar, type Conexion } from '../src/db/cliente.ts';
import { migrar } from '../src/db/migrar.ts';

let conexion: Conexion;
let app: FastifyInstance;

beforeAll(async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'panel-'));
  writeFileSync(join(carpeta, 'index.html'), '<!doctype html><title>eg&t</title>');
  mkdirSync(join(carpeta, 'assets'));
  writeFileSync(join(carpeta, 'assets', 'app.js'), 'console.log(1)');
  conexion = await conectar('pglite:memoria');
  await migrar(conexion);
  app = construirApp(conexion.db, { carpetaPanel: carpeta });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await conexion.cerrar();
});

it('sin compilar, "/" explica qué hacer; al compilar aparece sin reiniciar', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'panel-vacio-'));
  const otra = construirApp(conexion.db, { carpetaPanel: carpeta });
  await otra.ready();
  const antes = await otra.inject({ method: 'GET', url: '/' });
  expect(antes.statusCode).toBe(200);
  expect(antes.body).toContain('pnpm build:web');
  writeFileSync(join(carpeta, 'index.html'), '<!doctype html><title>panel listo</title>');
  expect((await otra.inject({ method: 'GET', url: '/' })).body).toContain('panel listo');
  await otra.close();
});

it('sirve el panel web sin sesión y la API sigue protegida', async () => {
  const inicio = await app.inject({ method: 'GET', url: '/' });
  expect(inicio.statusCode).toBe(200);
  expect(inicio.headers['content-type']).toContain('text/html');
  expect((await app.inject({ method: 'GET', url: '/assets/app.js' })).statusCode).toBe(200);
  expect((await app.inject({ method: 'GET', url: '/equipos' })).statusCode).toBe(401);
  expect((await app.inject({ method: 'GET', url: '/salud' })).json()).toEqual({ estado: 'ok' });
});
