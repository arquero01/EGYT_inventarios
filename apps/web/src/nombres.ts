import type { Accion, TipoComando } from '@egt/domain';

export const NOMBRE_COMANDO_WEB: Record<TipoComando, string> = {
  CREAR_PROYECTO: 'Crear proyecto',
  REGISTRAR_INGRESO: 'Ingreso de equipo',
  IMPORTAR_HISTORICO: 'Importación del histórico',
  EDITAR_EQUIPO: 'Corrección de datos',
  CAMBIAR_PROYECTO: 'Cambio de proyecto',
  INSTALAR_EQUIPO: 'Instalación',
  RETIRAR_EQUIPO: 'Retiro',
  ENVIAR_A_MANTENIMIENTO: 'Envío a mantenimiento',
  FINALIZAR_MANTENIMIENTO: 'Fin de mantenimiento',
  DAR_DE_BAJA: 'Baja',
  CREAR_BODEGA: 'Crear bodega',
  CREAR_ARTICULO: 'Crear artículo',
  INGRESAR_ARTICULOS: 'Ingreso de artículos',
  REGISTRAR_DESPACHO: 'Despacho',
  REGISTRAR_TRASLADO: 'Traslado',
  REGISTRAR_DEVOLUCION: 'Devolución',
};

export const NOMBRE_ACCION: Record<Accion, string> = {
  INSTALAR: 'Instalar a usuario final',
  RETIRAR: 'Retirar de la vivienda',
  ENVIAR_A_MANTENIMIENTO: 'Enviar a mantenimiento',
  FINALIZAR_MANTENIMIENTO: 'Finalizar mantenimiento',
  CAMBIAR_PROYECTO: 'Cambiar de proyecto',
  DAR_DE_BAJA: 'Dar de baja',
};
