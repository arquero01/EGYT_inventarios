/**
 * Tipado de las tablas para Drizzle. La definición real (restricciones,
 * triggers, índices) está en /migraciones/*.sql; si cambia una, cambia la otra.
 */
import { bigint, boolean, char, date, jsonb, numeric, pgTable, smallint, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import type { EstadoEquipo, OrigenSerial, Rol, TipoEntrega, TipoEquipo, TipoEvento, TipoMovimiento, Ubicacion, UnidadCapacidad, UnidadMedida } from '@egt/domain';

// rev lo asigna un trigger; el default solo evita que TypeScript lo exija.
const rev = () => bigint('rev', { mode: 'number' }).notNull().default(0);
const marcas = () => ({
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const proyectos = pgTable('proyectos', {
  id: uuid('id').primaryKey(),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  vereda: varchar('vereda', { length: 100 }).notNull(),
  municipio: varchar('municipio', { length: 100 }).notNull(),
  departamento: varchar('departamento', { length: 100 }).notNull(),
  fechaInicio: date('fecha_inicio').notNull(),
  descripcion: varchar('descripcion', { length: 500 }),
  ...marcas(),
  rev: rev(),
});

export const compras = pgTable('compras', {
  id: uuid('id').primaryKey().defaultRandom(),
  proveedor: varchar('proveedor', { length: 150 }).notNull(),
  nit: varchar('nit', { length: 10 }),
  nitDv: smallint('nit_dv'),
  numeroFactura: varchar('numero_factura', { length: 30 }),
  fechaCompra: date('fecha_compra'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const bodegas = pgTable('bodegas', {
  id: uuid('id').primaryKey(),
  nombre: varchar('nombre', { length: 100 }).notNull(),
  municipio: varchar('municipio', { length: 100 }).notNull(),
  departamento: varchar('departamento', { length: 100 }).notNull(),
  direccion: varchar('direccion', { length: 200 }),
  activa: boolean('activa').notNull().default(true),
  ...marcas(),
  rev: rev(),
});

export const equipos = pgTable('equipos', {
  id: uuid('id').primaryKey(),
  tipo: text('tipo').$type<TipoEquipo>().notNull(),
  // Opcionales solo para el histórico importado (el ingreso normal los exige).
  marca: varchar('marca', { length: 80 }),
  modelo: varchar('modelo', { length: 80 }),
  serial: varchar('serial', { length: 80 }).notNull(),
  serialNormalizado: varchar('serial_normalizado', { length: 80 }).notNull(),
  origenSerial: text('origen_serial').$type<OrigenSerial>().notNull(),
  potencia: numeric('potencia', { precision: 12, scale: 3, mode: 'number' }),
  unidad: text('unidad').$type<UnidadCapacidad>(),
  proyectoId: uuid('proyecto_id').references(() => proyectos.id),
  compraId: uuid('compra_id').references(() => compras.id),
  valorPagado: numeric('valor_pagado', { precision: 14, scale: 2, mode: 'number' }),
  serialFabricante: varchar('serial_fabricante', { length: 80 }),
  zona: varchar('zona', { length: 120 }),
  garantiaHasta: date('garantia_hasta'),
  descripcion: varchar('descripcion', { length: 300 }),
  pendientes: text('pendientes').array().notNull().default([]),
  estado: text('estado').$type<EstadoEquipo>().notNull(),
  ubicacion: text('ubicacion').$type<Ubicacion>().notNull(),
  bodegaId: uuid('bodega_id').references(() => bodegas.id),
  fechaIngreso: date('fecha_ingreso').notNull(),
  ...marcas(),
  rev: rev(),
});

export const contadoresSerial = pgTable('contadores_serial', {
  prefijo: varchar('prefijo', { length: 20 }).primaryKey(),
  ultimo: bigint('ultimo', { mode: 'number' }).notNull(),
});

export const usuariosFinales = pgTable('usuarios_finales', {
  id: uuid('id').primaryKey().defaultRandom(),
  cedula: varchar('cedula', { length: 12 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  telefono: varchar('telefono', { length: 10 }),
  niu: varchar('niu', { length: 30 }),
  ...marcas(),
  rev: rev(),
});

export const instalaciones = pgTable('instalaciones', {
  id: uuid('id').primaryKey(),
  equipoId: uuid('equipo_id').notNull().references(() => equipos.id),
  usuarioFinalId: uuid('usuario_final_id').notNull().references(() => usuariosFinales.id),
  proyectoId: uuid('proyecto_id').references(() => proyectos.id),
  vereda: varchar('vereda', { length: 100 }),
  municipio: varchar('municipio', { length: 100 }),
  departamento: varchar('departamento', { length: 100 }),
  fechaInstalacion: date('fecha_instalacion').notNull(),
  tecnico: varchar('tecnico', { length: 150 }),
  vigente: boolean('vigente').notNull().default(true),
  finalizadaEn: timestamp('finalizada_en', { withTimezone: true }),
  motivoFin: varchar('motivo_fin', { length: 500 }),
  /** ENTREGA, REPOSICION (reemplaza a uno con fallas) o PARTICULAR. */
  tipoEntrega: text('tipo_entrega').$type<TipoEntrega>().notNull().default('ENTREGA'),
  /** Equipo al que reemplazó, si la reposición se registró en el sistema. */
  reemplazaEquipoId: uuid('reemplaza_equipo_id'),
  ...marcas(),
  rev: rev(),
});

export const comandos = pgTable('comandos', {
  id: uuid('id').primaryKey(),
  tipo: text('tipo').notNull(),
  payload: jsonb('payload').notNull(),
  ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull(),
  recibidoEn: timestamp('recibido_en', { withTimezone: true }).notNull().defaultNow(),
  dispositivoId: varchar('dispositivo_id', { length: 100 }),
  autor: varchar('autor', { length: 150 }),
  origen: text('origen').$type<'EN_LINEA' | 'SINCRONIZACION'>().notNull(),
  resultado: text('resultado').$type<'APLICADO' | 'RECHAZADO'>().notNull(),
  respuesta: jsonb('respuesta'),
  error: jsonb('error'),
  revision: text('revision').$type<'PENDIENTE' | 'RESUELTO'>(),
  usuarioId: uuid('usuario_id'),
});

export const eventosEquipo = pgTable('eventos_equipo', {
  id: uuid('id').primaryKey().defaultRandom(),
  equipoId: uuid('equipo_id').notNull().references(() => equipos.id),
  comandoId: uuid('comando_id').notNull().references(() => comandos.id),
  tipo: text('tipo').$type<TipoEvento>().notNull(),
  estadoAnterior: text('estado_anterior').$type<EstadoEquipo>(),
  estadoNuevo: text('estado_nuevo').$type<EstadoEquipo>().notNull(),
  descripcion: varchar('descripcion', { length: 500 }).notNull(),
  datos: jsonb('datos').$type<Record<string, unknown>>().notNull().default({}),
  ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull(),
  registradoEn: timestamp('registrado_en', { withTimezone: true }).notNull().defaultNow(),
  autor: varchar('autor', { length: 150 }),
  rev: rev(),
});

export const articulos = pgTable('articulos', {
  id: uuid('id').primaryKey(),
  codigo: varchar('codigo', { length: 30 }).notNull(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  unidad: text('unidad').$type<UnidadMedida>().notNull(),
  descripcion: varchar('descripcion', { length: 500 }),
  activo: boolean('activo').notNull().default(true),
  ...marcas(),
  rev: rev(),
});

export const existencias = pgTable('existencias', {
  id: uuid('id').primaryKey().defaultRandom(),
  articuloId: uuid('articulo_id').notNull().references(() => articulos.id),
  bodegaId: uuid('bodega_id').references(() => bodegas.id),
  proyectoId: uuid('proyecto_id').references(() => proyectos.id),
  cantidad: numeric('cantidad', { precision: 14, scale: 3, mode: 'number' }).notNull(),
  ...marcas(),
  rev: rev(),
});

export const movimientos = pgTable('movimientos', {
  id: uuid('id').primaryKey().references(() => comandos.id),
  numero: varchar('numero', { length: 20 }).notNull(),
  tipo: text('tipo').$type<TipoMovimiento>().notNull(),
  bodegaOrigenId: uuid('bodega_origen_id').references(() => bodegas.id),
  bodegaDestinoId: uuid('bodega_destino_id').references(() => bodegas.id),
  proyectoId: uuid('proyecto_id').references(() => proyectos.id),
  compraId: uuid('compra_id').references(() => compras.id),
  responsable: varchar('responsable', { length: 150 }),
  observacion: varchar('observacion', { length: 500 }),
  ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull(),
  registradoEn: timestamp('registrado_en', { withTimezone: true }).notNull().defaultNow(),
  autor: varchar('autor', { length: 150 }),
  rev: rev(),
});

export const movimientoItems = pgTable('movimiento_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  movimientoId: uuid('movimiento_id').notNull().references(() => movimientos.id),
  equipoId: uuid('equipo_id').references(() => equipos.id),
  articuloId: uuid('articulo_id').references(() => articulos.id),
  cantidad: numeric('cantidad', { precision: 14, scale: 3, mode: 'number' }).notNull(),
  valorUnitario: numeric('valor_unitario', { precision: 14, scale: 2, mode: 'number' }),
  rev: rev(),
});

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: varchar('nombre', { length: 150 }).notNull(),
  correo: varchar('correo', { length: 150 }).notNull(),
  contrasenaHash: text('contrasena_hash').notNull(),
  rol: text('rol').$type<Rol>().notNull().default('USUARIO'),
  activo: boolean('activo').notNull().default(true),
  principal: boolean('principal').notNull().default(false),
  ...marcas(),
  ultimoIngreso: timestamp('ultimo_ingreso', { withTimezone: true }),
});

export const sesiones = pgTable('sesiones', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  usuarioId: uuid('usuario_id').notNull(),
  creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  dispositivo: varchar('dispositivo', { length: 200 }),
});

export const esquema = {
  usuarios,
  sesiones,
  bodegas,
  articulos,
  existencias,
  movimientos,
  movimientoItems,
  proyectos,
  compras,
  equipos,
  contadoresSerial,
  usuariosFinales,
  instalaciones,
  comandos,
  eventosEquipo,
};
