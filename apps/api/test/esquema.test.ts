import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Lee el archivo SQL y lo ejecuta en un PostgreSQL de prueba que vive en memoria.
const esquema = readFileSync(new URL('../migraciones/0001_inicial.sql', import.meta.url), 'utf8');

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(esquema);
});

afterAll(async () => {
  await db.close();
});

// ── Ayudas para crear datos de prueba ───────────────────────────────────────

async function crearProyecto(): Promise<string> {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO proyectos (id, nombre, vereda, municipio, departamento, fecha_inicio)
     VALUES ($1, 'Electrificación La Esperanza', 'La Esperanza', 'Buenos Aires', 'Cauca', '2026-02-01')`,
    [id],
  );
  return id;
}

async function crearCompra(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO compras (proveedor, nit, numero_factura, fecha_compra)
     VALUES ('Solartex SAS', '800197268', $1, '2026-01-10') RETURNING id`,
    [`FE-${Math.floor(Math.random() * 1e6)}`],
  );
  return rows[0]!.id;
}

async function crearEquipo(serial: string, cambios: { estado?: string; origen?: string; potencia?: number } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO equipos (id, tipo, marca, modelo, serial, serial_normalizado, origen_serial,
                          potencia, unidad, proyecto_id, compra_id, valor_pagado, estado, fecha_ingreso)
     VALUES ($1, 'PANEL_SOLAR', 'Jinko', 'Tiger Neo', $2, $3, $4, $5, 'W', $6, $7, 520000, $8, '2026-01-12')`,
    [
      id,
      serial,
      serial.replace(/\s+/g, '').toUpperCase(),
      cambios.origen ?? 'PROVEEDOR',
      cambios.potencia ?? 450,
      await crearProyecto(),
      await crearCompra(),
      cambios.estado ?? 'EN_STOCK',
    ],
  );
  return id;
}

// ── Pruebas ─────────────────────────────────────────────────────────────────

describe('esquema de la base de datos (0001_inicial.sql)', () => {
  it('crea todas las tablas', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'comandos',
      'compras',
      'contadores_serial',
      'equipos',
      'eventos_equipo',
      'instalaciones',
      'proyectos',
      'usuarios_finales',
    ]);
  });

  it('asigna la revisión (rev) sola y siempre creciente', async () => {
    const a = await crearProyecto();
    const b = await crearProyecto();
    const { rows } = await db.query<{ id: string; rev: number }>(`SELECT id, rev FROM proyectos WHERE id IN ($1, $2)`, [a, b]);
    const revA = Number(rows.find((r) => r.id === a)!.rev);
    const revB = Number(rows.find((r) => r.id === b)!.rev);
    expect(revB).toBeGreaterThan(revA);
  });

  it('no permite seriales repetidos, aunque cambien mayúsculas o espacios (RF-07)', async () => {
    await crearEquipo('ABC 123');
    await expect(crearEquipo('abc123')).rejects.toThrow(/equipos_serial_unico/);
  });

  it('no permite potencia cero ni estados fuera del catálogo (RF-06, RF-09)', async () => {
    await expect(crearEquipo('POT-0', { potencia: 0 })).rejects.toThrow(/check/i);
    await expect(crearEquipo('EST-X', { estado: 'PERDIDO' })).rejects.toThrow(/check/i);
  });

  it('reserva el prefijo EGT- para los seriales de la empresa', async () => {
    await expect(crearEquipo('EGT-PAN-999999', { origen: 'PROVEEDOR' })).rejects.toThrow(/equipos_prefijo_reservado/);
    await expect(crearEquipo('JK-777', { origen: 'EMPRESA' })).rejects.toThrow(/equipos_prefijo_reservado/);
    await expect(crearEquipo('EGT-PAN-000777', { origen: 'EMPRESA' })).resolves.toBeTruthy();
  });

  it('un equipo dado de baja no se puede modificar (RF-15)', async () => {
    const id = await crearEquipo('BAJA-1', { estado: 'DADO_DE_BAJA' });
    await expect(db.query(`UPDATE equipos SET estado = 'EN_STOCK' WHERE id = $1`, [id])).rejects.toThrow(/dado de baja/);
  });

  it('el historial no se puede modificar ni borrar (RF-17)', async () => {
    const equipo = await crearEquipo('HIST-1');
    const comando = crypto.randomUUID();
    await db.query(
      `INSERT INTO comandos (id, tipo, payload, ocurrido_en, origen, resultado)
       VALUES ($1, 'REGISTRAR_INGRESO', '{}', now(), 'EN_LINEA', 'APLICADO')`,
      [comando],
    );
    await db.query(
      `INSERT INTO eventos_equipo (equipo_id, comando_id, tipo, estado_nuevo, descripcion, ocurrido_en)
       VALUES ($1, $2, 'INGRESO', 'EN_STOCK', 'Ingreso a bodega', now())`,
      [equipo, comando],
    );

    await expect(db.query(`UPDATE eventos_equipo SET descripcion = 'cambiado'`)).rejects.toThrow(/inmutable/);
    await expect(db.query(`DELETE FROM eventos_equipo`)).rejects.toThrow(/inmutable/);
    await expect(db.query(`TRUNCATE eventos_equipo`)).rejects.toThrow(/inmutable/);
  });

  it('un equipo tiene como máximo una instalación vigente (RF-11)', async () => {
    const equipo = await crearEquipo('INST-1', { estado: 'INSTALADO' });
    const { rows } = await db.query<{ proyecto_id: string }>(`SELECT proyecto_id FROM equipos WHERE id = $1`, [equipo]);
    const proyecto = rows[0]!.proyecto_id;
    const usuario = await db.query<{ id: string }>(
      `INSERT INTO usuarios_finales (cedula, nombre, telefono) VALUES ('1234567890', 'María López', '3105551234') RETURNING id`,
    );
    const instalar = () =>
      db.query(
        `INSERT INTO instalaciones (id, equipo_id, usuario_final_id, proyecto_id, vereda, municipio, departamento, fecha_instalacion, tecnico)
         VALUES ($1, $2, $3, $4, 'La Esperanza', 'Buenos Aires', 'Cauca', '2026-03-01', 'Carlos Pérez')`,
        [crypto.randomUUID(), equipo, usuario.rows[0]!.id, proyecto],
      );

    await instalar();
    await expect(instalar()).rejects.toThrow(/instalaciones_una_vigente/);
  });
});
