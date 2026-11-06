/** Colombia está en UTC−5 todo el año (no usa horario de verano desde 1993). */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

/**
 * Fecha calendario (AAAA-MM-DD) en hora de Colombia. El servidor corre en UTC,
 * así que "hoy" a las 8 p. m. en Bogotá ya es "mañana" en UTC; sin esto, una
 * instalación registrada de noche podría rechazarse como "fecha futura".
 * Se calcula con una resta fija y no con Intl, porque el soporte de zonas
 * horarias de Intl varía entre celulares Android.
 */
export function fechaColombia(instante: Date = new Date()): string {
  return new Date(instante.getTime() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
}

/** true si `fecha` (AAAA-MM-DD) es una fecha calendario real. */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** true si `fecha` (AAAA-MM-DD) es posterior a hoy en Colombia. */
export function esFechaFutura(fecha: string, ahora: Date = new Date()): boolean {
  return fecha > fechaColombia(ahora);
}

/**
 * Serial normalizado para comparar unicidad (RF-07): sin espacios y en
 * mayúsculas, para que "ab 123" y "AB123" se detecten como el mismo equipo.
 */
export function normalizarSerial(serial: string): string {
  return serial.replace(/\s+/g, '').toUpperCase();
}

const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación de un NIT según el algoritmo de la DIAN. */
export function digitoVerificacionNit(nit: string): number {
  const digitos = nit.split('').reverse();
  const suma = digitos.reduce((acc, d, i) => acc + Number(d) * (PESOS_NIT[i] ?? 0), 0);
  const residuo = suma % 11;
  return residuo > 1 ? 11 - residuo : residuo;
}

export interface NitNormalizado {
  numero: string;
  dv: number | null;
}

/**
 * Acepta "900123456", "900123456-7" o "900.123.456-7". Si trae dígito de
 * verificación, lo comprueba. Devuelve null si el NIT no es válido.
 */
export function normalizarNit(entrada: string): NitNormalizado | null {
  const limpio = entrada.replace(/[\s.]/g, '');
  const coincide = /^(\d{5,10})(?:-(\d))?$/.exec(limpio);
  if (!coincide) return null;
  const numero = coincide[1]!;
  const dv = coincide[2] === undefined ? null : Number(coincide[2]);
  if (dv !== null && dv !== digitoVerificacionNit(numero)) return null;
  return { numero, dv };
}

/** Texto en minúsculas y sin tildes, para búsquedas (RF-22). */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
