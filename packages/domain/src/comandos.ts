import { z } from 'zod';
import {
  ORIGENES_SERIAL,
  TIPOS_EQUIPO,
  UNIDADES_CAPACIDAD,
  UNIDADES_MEDIDA,
} from './catalogos.ts';
import { errorValidacion, type DetalleError, type ErrorDominio } from './errores.ts';
import type { CodigoMensaje } from './mensajes.ts';
import { esFechaFutura, esFechaValida, normalizarNit, normalizarSerial } from './utilidades.ts';

/**
 * Toda escritura del sistema es un "comando": una operación con un id único
 * generado en el dispositivo. Así la misma operación se puede hacer en línea o
 * guardarse sin conexión y enviarse después, y si llega dos veces se aplica
 * una sola (idempotencia).
 */

// Mensajes por defecto de Zod en español (los propios se definen abajo).
z.config(z.locales.es());

// ── Piezas reutilizables ──────────────────────────────────────────────────

const OBLIGATORIO = 'Es obligatorio';

const texto = (max: number) =>
  z
    .string({ error: OBLIGATORIO })
    .trim()
    .min(1, OBLIGATORIO)
    .max(max, `Máximo ${max} caracteres`);

const id = z.uuid({ error: 'Debe ser un identificador UUID válido' });

const digitos = (min: number, max: number, nombre: string) =>
  z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/[\s.]/g, '') : v),
    z
      .string({ error: OBLIGATORIO })
      .regex(
        new RegExp(`^\\d{${min},${max}}$`),
        min === max ? `${nombre} debe tener ${min} dígitos` : `${nombre} debe tener entre ${min} y ${max} dígitos`,
      ),
  );

const fechaPasada = z
  .string({ error: OBLIGATORIO })
  .refine(esFechaValida, 'Debe ser una fecha válida con formato AAAA-MM-DD')
  .refine((f) => !esFechaFutura(f), 'No puede ser una fecha futura');

const ubicacion = z.object({
  vereda: texto(100),
  municipio: texto(100),
  departamento: texto(100),
});

// ── Payloads por comando ──────────────────────────────────────────────────

/** RF-01 */
export const crearProyecto = z.object({
  proyectoId: id,
  nombre: texto(100),
  ...ubicacion.shape,
  fechaInicio: fechaPasada,
  descripcion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});

/** RF-08: datos de la factura de compra. */
export const datosCompra = z.object({
  proveedor: texto(150),
  nit: z
    .string({ error: OBLIGATORIO })
    .refine((v) => normalizarNit(v) !== null, 'NIT inválido (solo dígitos; si incluye dígito de verificación, debe ser correcto)'),
  // Las facturas electrónicas de la DIAN llevan prefijo (p. ej. "FE-1234"),
  // por eso se acepta texto y no solo números.
  numeroFactura: z
    .string({ error: OBLIGATORIO })
    .trim()
    .regex(/^[A-Za-z0-9-]{1,30}$/, 'Número de factura inválido (letras, números y guiones; máximo 30)'),
  fechaCompra: fechaPasada,
});

/** RF-06, RF-07, RF-08 */
export const registrarIngreso = z
  .object({
    equipoId: id,
    tipo: z.enum(TIPOS_EQUIPO, { error: 'Tipo de equipo no permitido' }),
    marca: texto(80),
    modelo: texto(80),
    origenSerial: z.enum(ORIGENES_SERIAL, { error: 'Debe ser PROVEEDOR o EMPRESA' }),
    /** Obligatorio si el serial viene del proveedor; se omite si lo asigna la empresa. */
    serial: z.string().trim().max(60, 'Máximo 60 caracteres').optional(),
    potencia: z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a cero'),
    unidad: z.enum(UNIDADES_CAPACIDAD, { error: `Unidad no permitida (${UNIDADES_CAPACIDAD.join(', ')})` }),
    proyectoId: id,
    /** RL-02: bodega a la que llega el equipo. */
    bodegaId: id,
    compra: datosCompra,
    valorPagado: z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a cero'),
  })
  .superRefine((d, ctx) => {
    if (d.origenSerial === 'PROVEEDOR') {
      if (!d.serial) {
        ctx.addIssue({ code: 'custom', path: ['serial'], message: OBLIGATORIO });
      } else if (normalizarSerial(d.serial).startsWith('EGT-')) {
        ctx.addIssue({ code: 'custom', path: ['serial'], message: 'El prefijo EGT- está reservado para seriales asignados por la empresa' });
      }
    } else if (d.serial) {
      ctx.addIssue({ code: 'custom', path: ['serial'], message: 'El serial de la empresa lo asigna el sistema; no debe enviarse' });
    }
  });

/** RF-03 */
export const cambiarProyecto = z.object({
  equipoId: id,
  proyectoId: id,
});

/** RF-11, RF-12 */
export const instalarEquipo = z.object({
  equipoId: id,
  instalacionId: id,
  usuario: z.object({
    nombre: texto(150),
    cedula: digitos(6, 10, 'La cédula'),
    telefono: digitos(10, 10, 'El teléfono'),
  }),
  ubicacion,
  fechaInstalacion: fechaPasada,
  tecnico: texto(150),
});

/** RF-13 */
export const retirarEquipo = z.object({
  equipoId: id,
  motivo: z.string({ error: OBLIGATORIO }).trim().min(10, 'Debe tener al menos 10 caracteres').max(500, 'Máximo 500 caracteres'),
});

/** RF-14 */
export const enviarAMantenimiento = z.object({
  equipoId: id,
  motivo: texto(500),
});

/** Supuesto: salida de mantenimiento de vuelta a stock (no definida en el documento). */
export const finalizarMantenimiento = z.object({
  equipoId: id,
  observacion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});

/** RF-15 */
export const darDeBaja = z.object({
  equipoId: id,
  motivo: texto(500),
});

// ── Logística (RL-01 a RL-08) ─────────────────────────────────────────────

/** RL-01 */
export const crearBodega = z.object({
  bodegaId: id,
  nombre: texto(100),
  municipio: texto(100),
  departamento: texto(100),
  direccion: z.string().trim().max(200, 'Máximo 200 caracteres').optional(),
});

/** RL-03: artículos que se controlan por cantidad (cables, conectores, estructuras…). */
export const crearArticulo = z.object({
  articuloId: id,
  codigo: z
    .string({ error: OBLIGATORIO })
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,30}$/, 'Código inválido (letras, números, punto, guion; máximo 30)')
    .transform((c) => c.toUpperCase()),
  nombre: texto(150),
  unidad: z.enum(UNIDADES_MEDIDA, { error: `Unidad no permitida (${UNIDADES_MEDIDA.join(', ')})` }),
  descripcion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
});

const cantidad = z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a cero').max(1_000_000, 'Cantidad demasiado grande');

/** RL-04: ingreso de artículos por cantidad, con su factura. */
export const ingresarArticulos = z
  .object({
    bodegaId: id,
    compra: datosCompra,
    items: z
      .array(
        z.object({
          articuloId: id,
          cantidad,
          valorUnitario: z.number({ error: 'Debe ser un número' }).positive('Debe ser mayor a cero'),
        }),
      )
      .min(1, 'Debe incluir al menos un artículo')
      .max(200, 'Máximo 200 artículos por ingreso'),
    observacion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
  })
  .superRefine((d, ctx) => {
    const vistos = new Set<string>();
    d.items.forEach((it, i) => {
      if (vistos.has(it.articuloId)) ctx.addIssue({ code: 'custom', path: ['items', i, 'articuloId'], message: 'Artículo repetido en el ingreso' });
      vistos.add(it.articuloId);
    });
  });

/** Ítems de un movimiento: equipos con serial y/o artículos por cantidad. */
const itemsMovimiento = {
  equipos: z.array(id).max(500, 'Máximo 500 equipos por movimiento').default([]),
  articulos: z.array(z.object({ articuloId: id, cantidad })).max(200, 'Máximo 200 artículos por movimiento').default([]),
  responsable: texto(150),
  observacion: z.string().trim().max(500, 'Máximo 500 caracteres').optional(),
};

function validarItems(d: { equipos: string[]; articulos: { articuloId: string }[] }, ctx: z.RefinementCtx) {
  if (d.equipos.length === 0 && d.articulos.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['equipos'], message: 'Debe incluir al menos un equipo o artículo' });
  }
  const equipos = new Set<string>();
  d.equipos.forEach((e, i) => {
    if (equipos.has(e)) ctx.addIssue({ code: 'custom', path: ['equipos', i], message: 'Equipo repetido en el movimiento' });
    equipos.add(e);
  });
  const articulos = new Set<string>();
  d.articulos.forEach((a, i) => {
    if (articulos.has(a.articuloId)) ctx.addIssue({ code: 'custom', path: ['articulos', i, 'articuloId'], message: 'Artículo repetido en el movimiento' });
    articulos.add(a.articuloId);
  });
}

/** RL-05: de una bodega a un proyecto (sale a campo). */
export const registrarDespacho = z
  .object({ bodegaOrigenId: id, proyectoId: id, ...itemsMovimiento })
  .superRefine(validarItems);

/** RL-06: de una bodega a otra. */
export const registrarTraslado = z
  .object({ bodegaOrigenId: id, bodegaDestinoId: id, ...itemsMovimiento })
  .superRefine((d, ctx) => {
    if (d.bodegaOrigenId === d.bodegaDestinoId) {
      ctx.addIssue({ code: 'custom', path: ['bodegaDestinoId'], message: 'Debe ser distinta de la bodega de origen' });
    }
    validarItems(d, ctx);
  });

/** RL-07: de un proyecto (campo) de vuelta a una bodega. */
export const registrarDevolucion = z
  .object({ proyectoId: id, bodegaDestinoId: id, ...itemsMovimiento })
  .superRefine(validarItems);

// ── Catálogo de comandos ─────────────────────────────────────────────────

export const DEFINICION_COMANDOS = {
  CREAR_PROYECTO: { schema: crearProyecto, codigo: 'RF-01' },
  REGISTRAR_INGRESO: { schema: registrarIngreso, codigo: 'RF-06' },
  CAMBIAR_PROYECTO: { schema: cambiarProyecto, codigo: 'RF-03' },
  INSTALAR_EQUIPO: { schema: instalarEquipo, codigo: 'RF-11' },
  RETIRAR_EQUIPO: { schema: retirarEquipo, codigo: 'RF-13' },
  ENVIAR_A_MANTENIMIENTO: { schema: enviarAMantenimiento, codigo: 'RF-14' },
  FINALIZAR_MANTENIMIENTO: { schema: finalizarMantenimiento, codigo: 'RF-23' },
  DAR_DE_BAJA: { schema: darDeBaja, codigo: 'RF-15' },
  CREAR_BODEGA: { schema: crearBodega, codigo: 'RL-01' },
  CREAR_ARTICULO: { schema: crearArticulo, codigo: 'RL-03' },
  INGRESAR_ARTICULOS: { schema: ingresarArticulos, codigo: 'RL-04' },
  REGISTRAR_DESPACHO: { schema: registrarDespacho, codigo: 'RL-05' },
  REGISTRAR_TRASLADO: { schema: registrarTraslado, codigo: 'RL-06' },
  REGISTRAR_DEVOLUCION: { schema: registrarDevolucion, codigo: 'RL-07' },
} as const satisfies Record<string, { schema: z.ZodType; codigo: CodigoMensaje }>;

export type TipoComando = keyof typeof DEFINICION_COMANDOS;
export const TIPOS_COMANDO = Object.keys(DEFINICION_COMANDOS) as TipoComando[];

export type PayloadDe<T extends TipoComando> = z.output<(typeof DEFINICION_COMANDOS)[T]['schema']>;

/** Sobre común de todo comando. */
export const sobreComando = z.object({
  id,
  tipo: z.enum(TIPOS_COMANDO as [TipoComando, ...TipoComando[]], { error: 'Tipo de operación desconocido' }),
  /** Momento en que ocurrió en el dispositivo (puede ser días antes del envío). */
  ocurridoEn: z.iso.datetime({ offset: true, error: 'Debe ser fecha y hora ISO 8601 con zona horaria' }),
  dispositivoId: z.string().trim().max(100).optional(),
  autor: z.string().trim().max(150).optional(),
  payload: z.custom<unknown>((v) => v !== undefined && v !== null, { error: OBLIGATORIO }),
});

export type Comando = {
  [T in TipoComando]: {
    id: string;
    tipo: T;
    ocurridoEn: string;
    dispositivoId?: string | undefined;
    autor?: string | undefined;
    payload: PayloadDe<T>;
  };
}[TipoComando];

// ── Validación (RF-23) ───────────────────────────────────────────────────

export type ResultadoValidacion =
  | { valido: true; comando: Comando }
  | { valido: false; error: ErrorDominio };

const aDetalles = (issues: z.core.$ZodIssue[], prefijo = ''): DetalleError[] =>
  issues.map((i) => {
    const ruta = i.path.map(String).join('.');
    return { campo: ruta ? prefijo + ruta : prefijo.replace(/\.$/, '') || '(raíz)', problema: i.message };
  });

const CAMPOS_COMPRA = new Set(['compra', 'valorPagado']);
/** Comandos con datos de compra: si solo falla la compra, el código es RF-08. */
const CON_COMPRA = new Set<TipoComando>(['REGISTRAR_INGRESO', 'INGRESAR_ARTICULOS']);

/**
 * RF-23: valida un comando completo antes de guardarlo. Devuelve `valido`
 * (boolean) y, si no lo es, el error con el código y los campos pendientes.
 * La app móvil la usa antes de guardar localmente; la API la vuelve a usar.
 */
export function validarComando(entrada: unknown): ResultadoValidacion {
  const sobre = sobreComando.safeParse(entrada);
  if (!sobre.success) {
    return { valido: false, error: errorValidacion('RF-23', aDetalles(sobre.error.issues)) };
  }
  const def = DEFINICION_COMANDOS[sobre.data.tipo];
  const payload = def.schema.safeParse(sobre.data.payload);
  if (!payload.success) {
    let codigo: CodigoMensaje = def.codigo;
    if (CON_COMPRA.has(sobre.data.tipo)) {
      const soloCompra = payload.error.issues.every((i) => CAMPOS_COMPRA.has(String(i.path[0])));
      if (soloCompra) codigo = 'RF-08';
    }
    return { valido: false, error: errorValidacion(codigo, aDetalles(payload.error.issues, 'payload.')) };
  }
  return { valido: true, comando: { ...sobre.data, payload: payload.data } as Comando };
}

/** Igual que validarComando, pero lanza el ErrorDominio. */
export function parsearComando(entrada: unknown): Comando {
  const r = validarComando(entrada);
  if (!r.valido) throw r.error;
  return r.comando;
}