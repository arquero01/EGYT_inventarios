/**
 * Catálogos cerrados del sistema. Son la única fuente de valores válidos
 * para tipos de equipo (sección 2 del documento) y estados (RF-09).
 */

export const TIPOS_EQUIPO = [
  'PANEL_SOLAR',
  'BATERIA_GEL',
  'BATERIA_LITIO',
  'INVERSOR',
  'MEDIDOR',
  'CONTROLADOR',
] as const;
export type TipoEquipo = (typeof TIPOS_EQUIPO)[number];

export const NOMBRE_TIPO_EQUIPO: Record<TipoEquipo, string> = {
  PANEL_SOLAR: 'Panel solar',
  BATERIA_GEL: 'Batería de gel',
  BATERIA_LITIO: 'Batería de litio',
  INVERSOR: 'Inversor',
  MEDIDOR: 'Medidor',
  CONTROLADOR: 'Controlador de carga',
};

/** Prefijo usado en los seriales que asigna la empresa (EGT-PAN-000001). */
export const PREFIJO_SERIAL: Record<TipoEquipo, string> = {
  PANEL_SOLAR: 'PAN',
  BATERIA_GEL: 'BGE',
  BATERIA_LITIO: 'BLI',
  INVERSOR: 'INV',
  MEDIDOR: 'MED',
  CONTROLADOR: 'CTR',
};

/** RF-09: un equipo está en uno y solo uno de estos cuatro estados. */
export const ESTADOS_EQUIPO = [
  'EN_STOCK',
  'INSTALADO',
  'EN_MANTENIMIENTO',
  'DADO_DE_BAJA',
] as const;
export type EstadoEquipo = (typeof ESTADOS_EQUIPO)[number];

export const NOMBRE_ESTADO: Record<EstadoEquipo, string> = {
  EN_STOCK: 'En stock',
  INSTALADO: 'Instalado',
  EN_MANTENIMIENTO: 'En mantenimiento',
  DADO_DE_BAJA: 'Dado de baja',
};

/** Unidades aceptadas para "potencia o capacidad" (RF-06). */
export const UNIDADES_CAPACIDAD = ['W', 'kW', 'Wh', 'kWh', 'Ah', 'A', 'V'] as const;
export type UnidadCapacidad = (typeof UNIDADES_CAPACIDAD)[number];

/**
 * Origen del serial: lo trae el fabricante/proveedor, lo asigna el sistema
 * porque el equipo llegó sin serial (EGT-…), o es el código interno que la
 * empresa ya usaba en sus hojas de cálculo (EG&T-BGEL-0051), importado.
 */
export const ORIGENES_SERIAL = ['PROVEEDOR', 'EMPRESA', 'INTERNO'] as const;
export type OrigenSerial = (typeof ORIGENES_SERIAL)[number];

/**
 * Cómo se le entregó el equipo al usuario. REPOSICION: reemplaza a otro que
 * presentó fallas (casi siempre una batería). PARTICULAR: entrega a un
 * cliente particular (columna "ESTADO (REP, PART…)" del archivo de la empresa).
 */
export const TIPOS_ENTREGA = ['ENTREGA', 'REPOSICION', 'PARTICULAR'] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];
export const NOMBRE_TIPO_ENTREGA: Record<TipoEntrega, string> = {
  ENTREGA: 'Primera entrega',
  REPOSICION: 'Reposición',
  PARTICULAR: 'Particular',
};

/** RF-17: tipos de evento del historial. */
export const TIPOS_EVENTO = [
  'INGRESO',
  'INSTALACION',
  'RETORNO_A_STOCK',
  'MANTENIMIENTO',
  'FIN_MANTENIMIENTO',
  'BAJA',
  'CAMBIO_PROYECTO',
  'DESPACHO',
  'TRASLADO',
  'DEVOLUCION',
  'IMPORTACION',
  'EDICION',
  'REPOSICION',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const ZONA_HORARIA = 'America/Bogota';

// ── Logística ───────────────────────────────────────────────────────────────

/**
 * Dónde está físicamente un equipo. Es independiente del estado (RF-09):
 * un equipo "En stock" puede estar en una bodega o ya despachado a campo.
 *  BODEGA → en una bodega concreta (bodegaId).
 *  CAMPO  → fuera de bodega, en el proyecto al que pertenece (despachado,
 *           instalado o retirado de una vivienda y aún sin devolver).
 */
export const UBICACIONES = ['BODEGA', 'CAMPO'] as const;
export type Ubicacion = (typeof UBICACIONES)[number];

/** Movimientos de logística (RL-04 a RL-07). */
export const TIPOS_MOVIMIENTO = ['INGRESO', 'DESPACHO', 'TRASLADO', 'DEVOLUCION'] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  INGRESO: 'Ingreso de proveedor',
  DESPACHO: 'Despacho a proyecto',
  TRASLADO: 'Traslado entre bodegas',
  DEVOLUCION: 'Devolución a bodega',
};

/** Unidades de medida de los artículos que se controlan por cantidad (RL-03). */
export const UNIDADES_MEDIDA = ['UND', 'PAR', 'JUEGO', 'CAJA', 'ROLLO', 'M', 'KG', 'L'] as const;
export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number];

/** Unidades que solo admiten cantidades enteras (no se despacha media caja). */
export const UNIDADES_ENTERAS: readonly UnidadMedida[] = ['UND', 'PAR', 'JUEGO', 'CAJA', 'ROLLO'];
