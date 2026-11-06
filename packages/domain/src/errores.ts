import { MENSAJES, type CodigoMensaje } from './mensajes.ts';

/**
 * VALIDACION   → los datos enviados están incompletos o mal formados (HTTP 422).
 * CONFLICTO    → los datos son válidos pero chocan con el estado actual
 *                (serial repetido, equipo que no está en stock…) (HTTP 409).
 * NO_ENCONTRADO→ el recurso referenciado no existe (HTTP 404).
 */
export type TipoError = 'VALIDACION' | 'CONFLICTO' | 'NO_ENCONTRADO' | 'INTERNO';

export interface DetalleError {
  campo: string;
  problema: string;
}

export class ErrorDominio extends Error {
  readonly codigo: CodigoMensaje;
  readonly tipo: TipoError;
  readonly detalles: DetalleError[];

  constructor(codigo: CodigoMensaje, tipo: TipoError, detalles: DetalleError[] = []) {
    super(MENSAJES[codigo]);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
    this.tipo = tipo;
    this.detalles = detalles;
  }

  toJSON() {
    return {
      codigo: this.codigo,
      tipo: this.tipo,
      mensaje: this.message,
      detalles: this.detalles,
    };
  }
}

export const errorValidacion = (codigo: CodigoMensaje, detalles: DetalleError[] = []) =>
  new ErrorDominio(codigo, 'VALIDACION', detalles);
export const errorConflicto = (codigo: CodigoMensaje, detalles: DetalleError[] = []) =>
  new ErrorDominio(codigo, 'CONFLICTO', detalles);
export const errorNoEncontrado = (codigo: CodigoMensaje, detalles: DetalleError[] = []) =>
  new ErrorDominio(codigo, 'NO_ENCONTRADO', detalles);
