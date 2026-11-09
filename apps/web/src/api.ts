import { MENSAJES, validarComando, type DetalleError, type TipoComando, type Usuario } from '@egt/domain';

/**
 * Cliente de la API para el panel. El panel trabaja siempre en línea: las
 * operaciones se validan aquí con las mismas reglas del servidor (RF-23) y se
 * envían de inmediato. El token de la sesión se guarda en el navegador.
 */

export interface ErrorApi {
  codigo: string;
  tipo: 'VALIDACION' | 'CONFLICTO' | 'NO_ENCONTRADO' | 'NO_AUTENTICADO' | 'PROHIBIDO' | 'LIMITE' | 'INTERNO' | 'SIN_CONEXION';
  mensaje: string;
  detalles: DetalleError[];
}

export class FalloApi extends Error {
  readonly error: ErrorApi;
  constructor(error: ErrorApi) {
    super(error.mensaje);
    this.error = error;
  }
}

export interface Sesion {
  token: string;
  usuario: Usuario;
}

const CLAVE_SESION = 'egt-panel:sesion';

// El almacenamiento del navegador puede fallar (modo privado, bloqueos): se protege.
function leerGuardada(): Sesion | null {
  try {
    const t = localStorage.getItem(CLAVE_SESION);
    return t ? (JSON.parse(t) as Sesion) : null;
  } catch {
    return null;
  }
}

let sesion: Sesion | null = leerGuardada();
const oyentes = new Set<(s: Sesion | null) => void>();

export const sesionActual = () => sesion;

export function fijarSesion(nueva: Sesion | null) {
  sesion = nueva;
  try {
    if (nueva) localStorage.setItem(CLAVE_SESION, JSON.stringify(nueva));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // Sin almacenamiento la sesión dura mientras la pestaña esté abierta.
  }
  oyentes.forEach((o) => o(nueva));
}

export function suscribirSesion(oyente: (s: Sesion | null) => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

type Metodo = 'GET' | 'POST' | 'PATCH';

export async function pedir<T = unknown>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}),
      },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
  } catch {
    throw new FalloApi({
      codigo: 'SIN_CONEXION',
      tipo: 'SIN_CONEXION',
      mensaje: 'No hay conexión con el servidor. Revise su internet e intente de nuevo.',
      detalles: [],
    });
  }
  const texto = await respuesta.text();
  let datos: unknown = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    throw new FalloApi({ codigo: 'INTERNO', tipo: 'INTERNO', mensaje: MENSAJES.INTERNO, detalles: [{ campo: 'http', problema: `HTTP ${respuesta.status}` }] });
  }
  if (!respuesta.ok) {
    const error = (datos as { error?: ErrorApi } | null)?.error;
    // Sesión vencida o cuenta desactivada: vuelve a la pantalla de ingreso.
    if (respuesta.status === 401 && sesion && !ruta.startsWith('/auth/ingresar')) fijarSesion(null);
    throw new FalloApi(error ?? { codigo: 'INTERNO', tipo: 'INTERNO', mensaje: MENSAJES.INTERNO, detalles: [{ campo: 'http', problema: `HTTP ${respuesta.status}` }] });
  }
  return datos as T;
}

/**
 * crypto.randomUUID solo existe en páginas seguras (https o localhost). Si el
 * panel se abre por la red local (http://192.168…), se arma el UUID a mano.
 */
export const nuevoId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/**
 * Valida y envía una operación. Lanza FalloApi con los errores por campo
 * (los campos llegan como "payload.compra.nit").
 */
export async function enviarComando(tipo: TipoComando, payload: unknown, id: string = nuevoId()): Promise<Record<string, unknown>> {
  return (await enviarComandoConResultado(tipo, payload, id)).respuesta;
}

/** Igual que enviarComando, pero dice además si el servidor ya la tenía (mismo id: no se aplicó dos veces). */
export async function enviarComandoConResultado(
  tipo: TipoComando,
  payload: unknown,
  id: string = nuevoId(),
): Promise<{ respuesta: Record<string, unknown>; duplicado: boolean }> {
  const sobre = {
    id,
    tipo,
    ocurridoEn: new Date().toISOString(),
    dispositivoId: 'panel-web',
    ...(sesion ? { autor: sesion.usuario.nombre } : {}),
    payload,
  };
  const v = validarComando(sobre);
  if (!v.valido) throw new FalloApi(v.error.toJSON());
  const r = await pedir<{ respuesta?: Record<string, unknown>; duplicado?: boolean }>('POST', '/comandos', { ...sobre, payload: v.comando.payload });
  return { respuesta: r.respuesta ?? {}, duplicado: r.duplicado === true };
}

// ── Cuentas ────────────────────────────────────────────────────────────────

export async function ingresar(correo: string, contrasena: string) {
  const s = await pedir<Sesion>('POST', '/auth/ingresar', { correo, contrasena });
  fijarSesion({ token: s.token, usuario: s.usuario });
}

export async function registrarse(datos: { nombre: string; correo: string; contrasena: string }) {
  const r = await pedir<{ pendiente: boolean; token?: string; usuario: Usuario; aviso?: { mensaje: string } }>('POST', '/auth/registro', datos);
  if (r.pendiente || !r.token) return { pendiente: true, mensaje: r.aviso?.mensaje ?? MENSAJES['AUTH-03'] };
  fijarSesion({ token: r.token, usuario: r.usuario });
  return { pendiente: false };
}

export async function salir() {
  await pedir('POST', '/auth/salir', {}).catch(() => {});
  fijarSesion(null);
}

export async function refrescarCuenta() {
  if (!sesion) return;
  const actual = sesion;
  const r = await pedir<{ usuario: Usuario }>('GET', '/auth/yo').catch(() => null);
  if (r && sesion === actual) fijarSesion({ ...actual, usuario: r.usuario });
}
