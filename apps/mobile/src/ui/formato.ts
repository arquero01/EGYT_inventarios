/**
 * Formatos de números y fechas hechos a mano: el soporte de Intl varía entre
 * celulares Android y así se ven igual en todos.
 */

const agrupar = (entero: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 1520000 → "$ 1.520.000" */
export function pesos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `$ ${agrupar(String(Math.round(valor)))}`;
}

/** 30.5 → "30,5"; 1200 → "1.200" */
export function cantidad(valor: number): string {
  const [entero, decimales] = String(Math.round(valor * 1000) / 1000).split('.');
  return decimales ? `${agrupar(entero!)},${decimales}` : agrupar(entero!);
}

const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-03-01" → "1 mar 2026" */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** Instante ISO → "1 mar 2026, 3:20 p. m." en hora de Colombia. */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const col = new Date(t - DESFASE_COLOMBIA_MS).toISOString();
  const h = Number(col.slice(11, 13));
  const min = col.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${fecha(col)}, ${h12}:${min} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Hoy en Colombia como AAAA-MM-DD (valor por defecto de los campos de fecha). */
export function hoy(): string {
  return new Date(Date.now() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
}

/** "30,5" o "30.5" → 30.5; texto vacío o inválido → NaN */
export function aNumero(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, '');
  if (!limpio) return Number.NaN;
  // "1.520.000" (miles con punto) o "30,5" (decimal con coma)
  const normal = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio) ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(',', '.');
  return Number(normal);
}
