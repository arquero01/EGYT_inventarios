import { describe, expect, it } from 'vitest';
import { paginasVisibles } from '../src/ui/componentes.tsx';
import { escalaUsuarios } from '../src/mapa/MapaUsuarios.tsx';

describe('Barra de páginas', () => {
  it('muestra los extremos y los vecinos de la página actual', () => {
    expect(paginasVisibles(1, 39)).toEqual([1, 2, 3, 4, '…', 39]);
    expect(paginasVisibles(20, 39)).toEqual([1, '…', 19, 20, 21, '…', 39]);
    expect(paginasVisibles(39, 39)).toEqual([1, '…', 36, 37, 38, 39]);
    // Un salto de una sola página se muestra como número, no como «…».
    expect(paginasVisibles(4, 39)).toEqual([1, 2, 3, 4, 5, '…', 39]);
    expect(paginasVisibles(1, 1)).toEqual([1]);
    expect(paginasVisibles(2, 3)).toEqual([1, 2, 3]);
  });
});

describe('Colores del mapa', () => {
  it('reparte los usuarios en clases redondas, más oscuras con más usuarios', () => {
    const e = escalaUsuarios(302);
    expect(e.clases.map((c) => c.texto)).toEqual(['1–3', '4–10', '11–30', '31–100', 'Más de 100']);
    expect(e.tono(3)).toBe(e.clases[0]!.tono);
    expect(e.tono(49)).toBe(e.clases[3]!.tono);
    expect(e.tono(302)).toBe(e.clases[4]!.tono);
  });

  it('con pocos usuarios usa menos clases', () => {
    expect(escalaUsuarios(1).clases.map((c) => c.texto)).toEqual(['1 o más']);
    expect(escalaUsuarios(4).clases.length).toBeLessThan(5);
  });
});
