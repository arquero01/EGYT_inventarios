import type { EstadoEquipo } from '@egt/domain';

/**
 * Colores de la app, tomados del logo de eg&t (#0093FF, #22A5FF, #39AFFF,
 * #5AC3FF). El azul del logo no alcanza contraste con texto blanco, así que
 * botones y enlaces usan el mismo tono más profundo. Verde y ámbar quedan
 * solo para estados.
 */
export const color = {
  logo: '#0093FF',
  primario: '#006FC8',
  primarioOscuro: '#005BA6',
  primarioSuave: '#E5F3FF',
  noche: '#0A2540',
  acento: '#5AC3FF',
  fondo: '#F2F7FC',
  superficie: '#FFFFFF',
  borde: '#D3DEE9',
  texto: '#0F2236',
  textoSuave: '#526477',
  peligro: '#B3261E',
  peligroSuave: '#FCE8E6',
  exito: '#0F7A4F',
  exitoSuave: '#E3F5EC',
  atencion: '#E8A33A',
  aviso: '#8A5300',
  avisoSuave: '#FFF3DC',
  info: '#005BA6',
  infoSuave: '#E5F3FF',
} as const;

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;
export const radio = 10;

/** Color de cada estado del equipo (RF-09). */
export const colorEstado: Record<EstadoEquipo, { fondo: string; texto: string }> = {
  EN_STOCK: { fondo: color.infoSuave, texto: color.info },
  INSTALADO: { fondo: color.exitoSuave, texto: color.exito },
  EN_MANTENIMIENTO: { fondo: color.avisoSuave, texto: color.aviso },
  DADO_DE_BAJA: { fondo: '#E9EEF3', texto: '#4F5D6B' },
};
