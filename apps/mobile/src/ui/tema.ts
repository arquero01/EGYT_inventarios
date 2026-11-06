import type { EstadoEquipo } from '@egt/domain';

/** Colores de la app: verde de energía sostenible y ámbar solar. */
export const color = {
  primario: '#16794A',
  primarioOscuro: '#0E5634',
  primarioSuave: '#E6F3EC',
  acento: '#E8A317',
  fondo: '#F4F6F5',
  superficie: '#FFFFFF',
  borde: '#DCE3DF',
  texto: '#16221B',
  textoSuave: '#5C6B63',
  peligro: '#B3261E',
  peligroSuave: '#FCE8E6',
  aviso: '#8A5A00',
  avisoSuave: '#FFF4DC',
  info: '#1D5FA8',
  infoSuave: '#E7F0FB',
} as const;

export const espacio = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;
export const radio = 10;

/** Color de cada estado del equipo (RF-09). */
export const colorEstado: Record<EstadoEquipo, { fondo: string; texto: string }> = {
  EN_STOCK: { fondo: color.infoSuave, texto: color.info },
  INSTALADO: { fondo: color.primarioSuave, texto: color.primarioOscuro },
  EN_MANTENIMIENTO: { fondo: color.avisoSuave, texto: color.aviso },
  DADO_DE_BAJA: { fondo: '#ECEEED', texto: '#4A524E' },
};
