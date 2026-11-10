import { strFromU8, unzipSync } from 'fflate';

/**
 * Colores de relleno de las celdas de un .xlsx. En la empresa una celda
 * pintada (amarilla, roja, verde…) significa "este dato hay que revisarlo",
 * así que al importar se marca como "por verificar". Ninguna librería de
 * lectura de Excel liviana entrega los colores, por eso se leen directamente
 * del archivo (que es un .zip con XML adentro).
 */

/** hoja → fila (como en Excel, desde 1) → columna (desde 0) → nombre del color. */
export type ColoresLibro = Map<string, Map<number, Map<number, string>>>;

const entidades = (t: string) =>
  t.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!);

const atributo = (etiqueta: string, nombre: string) => new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta)?.[1];

/** "AB" → 27 (desde 0: A=0). */
function indiceColumna(letras: string): number {
  let n = 0;
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Nombre aproximado de un color RGB; null si es blanco o casi blanco (sin marca). */
export function nombreColor(argb: string): string | null {
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Math.min(r, g, b) >= 230) return null; // blanco o un tinte casi blanco del formato de la hoja
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 25) return 'gris';
  let h = 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 340) return max > 200 && min > 150 ? 'rosado' : 'rojo';
  if (h < 40) return 'naranja';
  if (h < 70) return 'amarillo';
  if (h < 165) return 'verde';
  if (h < 200) return 'celeste';
  if (h < 255) return 'azul';
  if (h < 300) return 'morado';
  return 'rosado';
}

// Colores de tema de Office (los de la paleta de arriba en Excel). 0 y 2 son fondos claros.
const TEMA = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
// Colores indexados antiguos más comunes (64 y 65 = automático).
const INDEXADOS: Record<number, string> = { 2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00', 6: 'FF00FF', 7: '00FFFF', 10: 'FF0000', 11: '00FF00', 13: 'FFFF00', 22: 'C0C0C0', 43: 'FFFF99', 51: 'FFCC00', 52: 'FF9900', 53: 'FF6600' };

function colorDeRelleno(xmlRelleno: string): string | null {
  const patron = /<patternFill\b([^>]*)\/?>(.*?)(<\/patternFill>|$)/s.exec(xmlRelleno);
  if (!patron) return xmlRelleno.includes('<gradientFill') ? 'degradado' : null;
  const tipo = atributo(patron[1]!, 'patternType');
  if (!tipo || tipo === 'none') return null;
  const fg = /<fgColor\b([^>]*)\/?>/.exec(patron[2] ?? '')?.[1] ?? '';
  const rgb = atributo(fg, 'rgb');
  if (rgb) return nombreColor(rgb);
  const tema = atributo(fg, 'theme');
  if (tema !== undefined) {
    const base = TEMA[Number(tema)];
    const tinte = Number(atributo(fg, 'tint') ?? 0);
    if (!base) return null;
    // Un tinte positivo aclara el color hacia el blanco.
    const aclarar = (c: number) => Math.round(tinte > 0 ? c + (255 - c) * tinte : c * (1 + tinte));
    const hex = [0, 2, 4].map((i) => aclarar(parseInt(base.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('');
    return nombreColor(hex);
  }
  const indexado = atributo(fg, 'indexed');
  if (indexado !== undefined) {
    const c = INDEXADOS[Number(indexado)];
    return c ? nombreColor(c) : null;
  }
  return null;
}

/** Lee los colores de relleno de todas las hojas. Si algo falla, devuelve un mapa vacío (el color es una ayuda, no un requisito). */
export function leerColores(datos: Uint8Array): ColoresLibro {
  const libro: ColoresLibro = new Map();
  try {
    const archivos = unzipSync(datos, {
      filter: (f) => f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/styles.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name),
    });
    const leer = (n: string) => (archivos[n] ? strFromU8(archivos[n]!) : '');
    const estilos = leer('xl/styles.xml');

    // Rellenos (fills) y estilo de celda (cellXfs) → relleno.
    const bloqueRellenos = /<fills\b[^>]*>(.*?)<\/fills>/s.exec(estilos)?.[1] ?? '';
    const rellenos = [...bloqueRellenos.matchAll(/<fill>(.*?)<\/fill>|<fill\/>/gs)].map((m) => colorDeRelleno(m[1] ?? ''));
    const bloqueXf = /<cellXfs\b[^>]*>(.*?)<\/cellXfs>/s.exec(estilos)?.[1] ?? '';
    const colorPorEstilo = [...bloqueXf.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
      const relleno = Number(atributo(m[1]!, 'fillId') ?? 0);
      return rellenos[relleno] ?? null;
    });
    if (!colorPorEstilo.some(Boolean)) return libro;

    // Nombre de cada hoja → su archivo.
    const destinos = new Map<string, string>();
    for (const m of leer('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const id = atributo(m[1]!, 'Id');
      const destino = atributo(m[1]!, 'Target');
      if (id && destino) destinos.set(id, destino.replace(/^\/?(xl\/)?/, 'xl/'));
    }
    for (const m of leer('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const nombre = atributo(m[1]!, 'name');
      const id = atributo(m[1]!, 'r:id');
      const archivo = id ? destinos.get(id) : undefined;
      if (!nombre || !archivo) continue;
      const xml = leer(archivo);
      const filas = new Map<number, Map<number, string>>();
      for (const c of xml.matchAll(/<c\b([^>]*?)\/?>/g)) {
        const s = atributo(c[1]!, 's');
        if (!s) continue;
        const color = colorPorEstilo[Number(s)];
        if (!color) continue;
        const ref = /^([A-Z]+)(\d+)$/.exec(atributo(c[1]!, 'r') ?? '');
        if (!ref) continue;
        const fila = Number(ref[2]);
        const columnas = filas.get(fila) ?? new Map<number, string>();
        columnas.set(indiceColumna(ref[1]!), color);
        filas.set(fila, columnas);
      }
      if (filas.size > 0) libro.set(entidades(nombre), filas);
    }
  } catch {
    return new Map();
  }
  return libro;
}
