import { describe, expect, it } from 'vitest';
import mapa from '../src/mapa/colombia.json';
import { normalizarNombre, ubicarZonas } from '../src/mapa/ubicar.ts';

const zona = (z: string, extra: Partial<{ departamento: string; municipioCodigo: string; usuarios: number }> = {}) => ({
  llave: normalizarNombre(z),
  zona: z,
  departamento: extra.departamento ?? null,
  municipioCodigo: extra.municipioCodigo ?? null,
  usuarios: extra.usuarios ?? 1,
});
const ubicar = (zonas: ReturnType<typeof zona>[]) => ubicarZonas(zonas, mapa.municipios, mapa.nombreDepto as Record<string, string>);
const depto = (u: { municipio: { dc: string } | null }) => (u.municipio ? (mapa.nombreDepto as Record<string, string>)[u.municipio.dc] : null);

describe('Mapa de usuarios', () => {
  it('trae los departamentos y municipios de Colombia', () => {
    expect(mapa.departamentos.length).toBe(32);
    expect(mapa.municipios.length).toBeGreaterThan(1100);
    // Cada municipio trae su contorno para sombrearlo; los límites de departamento van en un solo trazo.
    expect(mapa.municipios.every((m) => m.d.startsWith('M'))).toBe(true);
    expect(mapa.bordesDeptos.startsWith('M')).toBe(true);
    expect(mapa.departamentos.every((d) => d.caja.length === 4 && d.caja[0]! < d.caja[2]!)).toBe(true);
  });

  it('ubica las zonas del archivo de la empresa por el nombre del municipio', () => {
    // Usuarios por zona como en el archivo de la empresa.
    const usuarios: Record<string, number> = { 'San Miguel': 617, 'Puerto Asís': 560, MAPIRIPAN: 450, Miraflores: 154, Orito: 141, 'Puerto Gaitán': 99, 'Valle del Guamuez': 23, Manaure: 20, 'Puerto Carreño': 16, 'Puerto Concordia': 8 };
    const r = ubicar(Object.keys(usuarios).map((z) => zona(z, { usuarios: usuarios[z] })));
    const por = Object.fromEntries(r.map((u) => [u.zona.zona, u]));
    expect(depto(por['Puerto Asís']!)).toBe('Putumayo');
    expect(por['Puerto Asís']!.metodo).toBe('NOMBRE');
    expect(depto(por['MAPIRIPAN']!)).toBe('Meta');
    expect(depto(por['Manaure']!)).toBe('La Guajira');
    expect(depto(por['Puerto Carreño']!)).toBe('Vichada');
    // Nombres repetidos: se elige el más cercano a las otras zonas y queda por confirmar.
    expect(por['San Miguel']!).toMatchObject({ metodo: 'SUPUESTA' });
    expect(depto(por['San Miguel']!)).toBe('Putumayo');
    expect(por['San Miguel']!.candidatos).toHaveLength(2);
    expect(depto(por['Miraflores']!)).toBe('Guaviare');
  });

  it('el departamento o la elección guardada mandan; una zona desconocida queda sin ubicar', () => {
    const [conDepto, elegida, rara] = ubicar([
      zona('San Miguel', { departamento: 'Santander' }),
      zona('Miraflores', { municipioCodigo: '15455' }),
      zona('Vereda Inventada'),
    ]);
    expect(depto(conDepto!)).toBe('Santander');
    expect(conDepto!.metodo).toBe('NOMBRE');
    expect(elegida!.metodo).toBe('ELEGIDA');
    expect(depto(elegida!)).toBe('Boyacá');
    expect(rara!).toMatchObject({ municipio: null, metodo: null, candidatos: [] });
  });
});
