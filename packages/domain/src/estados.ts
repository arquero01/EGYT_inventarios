import type { EstadoEquipo } from './catalogos.ts';
import { errorConflicto, type ErrorDominio } from './errores.ts';
import type { CodigoMensaje } from './mensajes.ts';

/**
 * Máquina de estados del equipo (RF-09, RF-12 a RF-15).
 *
 *   EN_STOCK ──instalar──▶ INSTALADO ──retirar──▶ EN_STOCK
 *   (cualquiera salvo DADO_DE_BAJA) ──mantenimiento──▶ EN_MANTENIMIENTO
 *   EN_MANTENIMIENTO ──finalizar──▶ EN_STOCK        (supuesto, ver README)
 *   (cualquiera) ──baja──▶ DADO_DE_BAJA             (definitivo)
 *   EN_STOCK ──cambiar proyecto──▶ EN_STOCK         (RF-03, supuesto)
 */
export const ACCIONES = [
  'INSTALAR',
  'RETIRAR',
  'ENVIAR_A_MANTENIMIENTO',
  'FINALIZAR_MANTENIMIENTO',
  'DAR_DE_BAJA',
  'CAMBIAR_PROYECTO',
] as const;
export type Accion = (typeof ACCIONES)[number];

interface Regla {
  desde: readonly EstadoEquipo[];
  hacia: (actual: EstadoEquipo) => EstadoEquipo;
  error: (actual: EstadoEquipo) => CodigoMensaje;
}

const REGLAS: Record<Accion, Regla> = {
  INSTALAR: {
    desde: ['EN_STOCK'],
    hacia: () => 'INSTALADO',
    error: () => 'RF-11',
  },
  RETIRAR: {
    desde: ['INSTALADO'],
    hacia: () => 'EN_STOCK',
    error: () => 'RF-13',
  },
  ENVIAR_A_MANTENIMIENTO: {
    desde: ['EN_STOCK', 'INSTALADO'],
    hacia: () => 'EN_MANTENIMIENTO',
    error: (actual) => (actual === 'EN_MANTENIMIENTO' ? 'MANT-YA' : 'RF-14'),
  },
  FINALIZAR_MANTENIMIENTO: {
    desde: ['EN_MANTENIMIENTO'],
    hacia: () => 'EN_STOCK',
    error: () => 'MANT-FIN',
  },
  DAR_DE_BAJA: {
    desde: ['EN_STOCK', 'INSTALADO', 'EN_MANTENIMIENTO'],
    hacia: () => 'DADO_DE_BAJA',
    error: () => 'RF-15',
  },
  CAMBIAR_PROYECTO: {
    desde: ['EN_STOCK'],
    hacia: (actual) => actual,
    error: () => 'RF-03',
  },
};

/** Resultado de intentar una acción: el nuevo estado o el error de negocio. */
export type ResultadoTransicion =
  | { ok: true; estado: EstadoEquipo }
  | { ok: false; error: ErrorDominio };

export function evaluarTransicion(actual: EstadoEquipo, accion: Accion): ResultadoTransicion {
  const regla = REGLAS[accion];
  if (regla.desde.includes(actual)) {
    return { ok: true, estado: regla.hacia(actual) };
  }
  // Un equipo dado de baja no admite ninguna operación (RF-15), salvo que la
  // acción tenga su propio mensaje para ese caso (RF-14).
  const codigo = actual === 'DADO_DE_BAJA' && accion !== 'ENVIAR_A_MANTENIMIENTO' ? 'RF-15' : regla.error(actual);
  return { ok: false, error: errorConflicto(codigo, [{ campo: 'estado', problema: `Estado actual: ${actual}` }]) };
}

/** Igual que evaluarTransicion, pero lanza el error. */
export function transicion(actual: EstadoEquipo, accion: Accion): EstadoEquipo {
  const r = evaluarTransicion(actual, accion);
  if (!r.ok) throw r.error;
  return r.estado;
}

/** Acciones disponibles en un estado, para que la app muestre solo botones válidos. */
export function accionesPermitidas(actual: EstadoEquipo): Accion[] {
  return ACCIONES.filter((a) => REGLAS[a].desde.includes(actual));
}

/** Acciones que, si el equipo estaba instalado, cierran la instalación vigente. */
export const ACCIONES_QUE_CIERRAN_INSTALACION: readonly Accion[] = [
  'RETIRAR',
  'ENVIAR_A_MANTENIMIENTO',
  'DAR_DE_BAJA',
];
