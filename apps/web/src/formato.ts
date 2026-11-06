/** Formatos colombianos para mostrar datos. */

const pesosFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const numeroFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const fechaFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
const fechaHoraFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });

export const pesos = (v: number | null | undefined) => (v == null ? '—' : pesosFmt.format(v));
export const cantidad = (v: number | null | undefined) => (v == null ? '—' : numeroFmt.format(v));

/** "2026-03-01" → "1 mar 2026" (sin correr el día por la zona horaria). */
export function fecha(v: string | null | undefined) {
  if (!v) return '—';
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(v);
  return fechaFmt.format(new Date(soloFecha ? `${v}T12:00:00-05:00` : v));
}

export const fechaHora = (v: string | null | undefined) => (v ? fechaHoraFmt.format(new Date(v)) : '—');

/** Fecha de hoy en Colombia, AAAA-MM-DD. */
export const hoy = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/** Texto del formulario → número (acepta coma decimal). Vacío → NaN para que el dominio lo marque. */
export function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '');
  if (!limpio) return Number.NaN;
  // "1.250.000" (miles con punto) o "12,5" (coma decimal).
  const normal = /^\d{1,3}(\.\d{3})+$/.test(limpio) ? limpio.replace(/\./g, '') : limpio.replace(',', '.');
  return Number(normal);
}
