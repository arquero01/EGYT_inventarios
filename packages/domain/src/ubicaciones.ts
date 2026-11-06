import type { EstadoEquipo, Ubicacion } from './catalogos.ts';
import { errorConflicto, type ErrorDominio } from './errores.ts';

/**
 * Reglas de ubicación física de los equipos serializados (RL-02, RL-05 a RL-07).
 * Van aparte de la máquina de estados: mover un equipo no cambia su estado.
 *
 *   DESPACHO   En stock, en la bodega de origen          → CAMPO (proyecto)
 *   TRASLADO   En stock o mantenimiento, bodega origen   → otra BODEGA
 *   DEVOLUCION En stock o mantenimiento, en CAMPO del
 *              proyecto indicado                         → BODEGA destino
 */
export type MovimientoEquipo = 'DESPACHO' | 'TRASLADO' | 'DEVOLUCION';

export interface PosicionEquipo {
  estado: EstadoEquipo;
  ubicacion: Ubicacion;
  bodegaId: string | null;
  proyectoId: string;
}

export interface DatosMovimiento {
  tipo: MovimientoEquipo;
  bodegaOrigenId?: string;
  bodegaDestinoId?: string;
  proyectoId?: string;
}

export type ResultadoMovimiento =
  | { ok: true; ubicacion: Ubicacion; bodegaId: string | null }
  | { ok: false; error: ErrorDominio };

const fallo = (problema: string): ResultadoMovimiento => ({
  ok: false,
  error: errorConflicto('RL-02', [{ campo: 'ubicacion', problema }]),
});

export function evaluarMovimientoEquipo(e: PosicionEquipo, m: DatosMovimiento): ResultadoMovimiento {
  if (e.estado === 'DADO_DE_BAJA') {
    return { ok: false, error: errorConflicto('RF-15') };
  }

  switch (m.tipo) {
    case 'DESPACHO':
      if (e.estado !== 'EN_STOCK') return fallo(`Solo se despachan equipos en stock (estado actual: ${e.estado})`);
      if (e.ubicacion !== 'BODEGA' || e.bodegaId !== m.bodegaOrigenId) return fallo('El equipo no está en la bodega de origen');
      return { ok: true, ubicacion: 'CAMPO', bodegaId: null };

    case 'TRASLADO':
      if (e.estado === 'INSTALADO') return fallo('Un equipo instalado no se puede trasladar');
      if (e.ubicacion !== 'BODEGA' || e.bodegaId !== m.bodegaOrigenId) return fallo('El equipo no está en la bodega de origen');
      return { ok: true, ubicacion: 'BODEGA', bodegaId: m.bodegaDestinoId ?? null };

    case 'DEVOLUCION':
      if (e.estado === 'INSTALADO') return fallo('El equipo está instalado: primero debe retirarse de la vivienda (RF-13)');
      if (e.ubicacion !== 'CAMPO') return fallo('El equipo ya está en una bodega');
      if (e.proyectoId !== m.proyectoId) return fallo('El equipo pertenece a otro proyecto');
      return { ok: true, ubicacion: 'BODEGA', bodegaId: m.bodegaDestinoId ?? null };
  }
}
