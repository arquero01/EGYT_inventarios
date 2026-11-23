/**
 * Ubica en el mapa las zonas (centros de costos) a partir del nombre del
 * municipio. Si el nombre se repite en varios departamentos (San Miguel está
 * en Putumayo y en Santander; Miraflores, en Boyacá y en Guaviare) se elige el
 * más cercano al centro de las demás zonas, pesado por sus usuarios (donde
 * está la mayoría), y se marca como "supuesta" para que el
 * administrador la confirme. La elección guardada siempre manda.
 */

export interface Municipio {
  /** Código DANE (5 dígitos). */
  c: string;
  /** Nombre. */
  n: string;
  /** Código del departamento. */
  dc: string;
  x: number;
  y: number;
}

export interface ZonaConDatos {
  llave: string;
  zona: string;
  departamento: string | null;
  municipioCodigo: string | null;
  /** Peso para resolver nombres repetidos (los usuarios de la zona). */
  usuarios?: number;
}

export type Metodo = 'ELEGIDA' | 'NOMBRE' | 'SUPUESTA';

export interface ZonaUbicada<Z extends ZonaConDatos> {
  zona: Z;
  municipio: Municipio | null;
  metodo: Metodo | null;
  /** Municipios con ese nombre (para confirmar o corregir). */
  candidatos: Municipio[];
}

export const normalizarNombre = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function ubicarZonas<Z extends ZonaConDatos>(zonas: Z[], municipios: Municipio[], nombreDepto: Record<string, string>): ZonaUbicada<Z>[] {
  const porCodigo = new Map(municipios.map((m) => [m.c, m]));
  const porNombre = new Map<string, Municipio[]>();
  for (const m of municipios) {
    const k = normalizarNombre(m.n);
    porNombre.set(k, [...(porNombre.get(k) ?? []), m]);
  }

  const primera = zonas.map((z): ZonaUbicada<Z> => {
    let candidatos = porNombre.get(normalizarNombre(z.zona)) ?? [];
    if (z.departamento && candidatos.length > 1) {
      const enDepto = candidatos.filter((m) => normalizarNombre(nombreDepto[m.dc] ?? '') === normalizarNombre(z.departamento!));
      if (enDepto.length > 0) candidatos = enDepto;
    }
    const elegido = z.municipioCodigo ? porCodigo.get(z.municipioCodigo) : undefined;
    if (elegido) return { zona: z, municipio: elegido, metodo: 'ELEGIDA', candidatos };
    if (candidatos.length === 1) return { zona: z, municipio: candidatos[0]!, metodo: 'NOMBRE', candidatos };
    return { zona: z, municipio: null, metodo: null, candidatos };
  });

  // Nombres repetidos: el candidato más cercano al centro (pesado por usuarios) de las zonas ya ubicadas.
  const seguras = primera.filter((u) => u.municipio);
  if (seguras.length === 0) return primera.map((u) => (u.candidatos.length > 1 ? { ...u, municipio: u.candidatos[0]!, metodo: 'SUPUESTA' } : u));
  const peso = (u: ZonaUbicada<Z>) => Math.max(1, u.zona.usuarios ?? 1);
  const total = seguras.reduce((a, u) => a + peso(u), 0);
  const cx = seguras.reduce((a, u) => a + u.municipio!.x * peso(u), 0) / total;
  const cy = seguras.reduce((a, u) => a + u.municipio!.y * peso(u), 0) / total;
  return primera.map((u) => {
    if (u.municipio || u.candidatos.length < 2) return u;
    const cercano = [...u.candidatos].sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2))[0]!;
    return { ...u, municipio: cercano, metodo: 'SUPUESTA' };
  });
}
