import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { MENSAJES, validarComando, type DetalleError, type TipoComando } from '@egt/domain';

/**
 * Cliente de la API.
 *
 * - Lecturas (GET): si no hay conexión, devuelve la última copia guardada.
 * - Escrituras (comandos): se validan aquí con las mismas reglas del servidor
 *   (RF-23). Si no hay conexión, quedan en una cola y se envían después por
 *   /sync/push (RNF-01). Cada comando lleva un id único, así que reenviarlo
 *   nunca lo aplica dos veces.
 */

const CLAVE_AJUSTES = 'egt:ajustes';
const CLAVE_COLA = 'egt:cola';
const CLAVE_RECHAZADOS = 'egt:rechazados';
const PREFIJO_CACHE = 'egt:cache:';
const TIEMPO_ESPERA_MS = 15_000;

export interface Ajustes {
  servidor: string;
  autor: string;
  dispositivoId: string;
}

export interface ErrorApi {
  codigo: string;
  tipo: 'VALIDACION' | 'CONFLICTO' | 'NO_ENCONTRADO' | 'INTERNO' | 'SIN_CONEXION';
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

export interface Sobre {
  id: string;
  tipo: TipoComando;
  ocurridoEn: string;
  dispositivoId: string;
  autor?: string;
  payload: unknown;
}

export interface Rechazado {
  sobre: Sobre;
  error: ErrorApi;
  rechazadoEn: string;
}

export type ResultadoEnvio =
  | { estado: 'APLICADO'; respuesta: Record<string, unknown> }
  | { estado: 'EN_COLA' };

// ── Ajustes ────────────────────────────────────────────────────────────────

let ajustesEnMemoria: Ajustes | null = null;

export async function leerAjustes(): Promise<Ajustes> {
  if (ajustesEnMemoria) return ajustesEnMemoria;
  const guardado = await AsyncStorage.getItem(CLAVE_AJUSTES);
  const base: Ajustes = { servidor: '', autor: '', dispositivoId: `celular-${randomUUID().slice(0, 8)}` };
  ajustesEnMemoria = guardado ? { ...base, ...(JSON.parse(guardado) as Partial<Ajustes>) } : base;
  if (!guardado) await AsyncStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustesEnMemoria));
  return ajustesEnMemoria;
}

export async function guardarAjustes(cambios: Partial<Ajustes>): Promise<Ajustes> {
  const actuales = await leerAjustes();
  const servidor = cambios.servidor !== undefined ? normalizarServidor(cambios.servidor) : actuales.servidor;
  ajustesEnMemoria = { ...actuales, ...cambios, servidor };
  await AsyncStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustesEnMemoria));
  return ajustesEnMemoria;
}

/** Quita espacios y la barra final; agrega https:// si falta. */
export function normalizarServidor(url: string): string {
  const limpio = url.trim().replace(/\/+$/, '');
  if (!limpio) return '';
  return /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
}

// ── HTTP ───────────────────────────────────────────────────────────────────

const sinConexion = (detalle: string): FalloApi =>
  new FalloApi({ codigo: 'SIN_CONEXION', tipo: 'SIN_CONEXION', mensaje: 'Sin conexión con el servidor.', detalles: [{ campo: 'servidor', problema: detalle }] });

async function pedir(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<unknown> {
  const { servidor } = await leerAjustes();
  if (!servidor) throw sinConexion('Configure la dirección del servidor en Ajustes.');

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_ESPERA_MS);
  let respuesta: Response;
  try {
    respuesta = await fetch(`${servidor}${ruta}`, {
      method: metodo,
      headers: { Accept: 'application/json', ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      signal: control.signal,
    });
  } catch (e) {
    throw sinConexion(control.signal.aborted ? 'El servidor no respondió a tiempo.' : String((e as Error).message ?? e));
  } finally {
    clearTimeout(temporizador);
  }

  const texto = await respuesta.text();
  let datos: unknown = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    // Una página HTML (p. ej. el inicio de sesión de GitHub en un puerto privado
    // de Codespaces) en lugar de JSON: la dirección no apunta a la API.
    throw sinConexion(`La dirección no responde como la API de eg&t (HTTP ${respuesta.status}). Revise que el puerto sea público.`);
  }
  if (!respuesta.ok) {
    const error = (datos as { error?: ErrorApi } | null)?.error;
    throw new FalloApi(
      error ?? { codigo: 'INTERNO', tipo: 'INTERNO', mensaje: MENSAJES.INTERNO, detalles: [{ campo: 'http', problema: `HTTP ${respuesta.status}` }] },
    );
  }
  return datos;
}

/** Comprueba que la dirección responda como la API (pantalla de Ajustes). */
export async function probarServidor(): Promise<boolean> {
  const r = (await pedir('GET', '/salud')) as { estado?: string };
  return r?.estado === 'ok';
}

export interface Lectura<T> {
  datos: T;
  /** true si vino de la copia guardada porque no hubo conexión. */
  desactualizado: boolean;
  guardadoEn?: string;
}

/** GET con copia local: sin conexión devuelve la última respuesta guardada. */
export async function leer<T>(ruta: string): Promise<Lectura<T>> {
  try {
    const datos = (await pedir('GET', ruta)) as T;
    // Las búsquedas por texto no se guardan: serían miles de copias distintas.
    if (!ruta.includes('q=')) AsyncStorage.setItem(PREFIJO_CACHE + ruta, JSON.stringify({ datos, guardadoEn: new Date().toISOString() })).catch(() => {});
    return { datos, desactualizado: false };
  } catch (e) {
    if (e instanceof FalloApi && e.error.tipo === 'SIN_CONEXION') {
      const copia = await AsyncStorage.getItem(PREFIJO_CACHE + ruta);
      if (copia) {
        const { datos, guardadoEn } = JSON.parse(copia) as { datos: T; guardadoEn: string };
        return { datos, desactualizado: true, guardadoEn };
      }
    }
    throw e;
  }
}

// ── Comandos y cola sin conexión ───────────────────────────────────────────

type Oyente = () => void;
const oyentes = new Set<Oyente>();
const avisar = () => oyentes.forEach((o) => o());

/** Se llama cada vez que cambia la cola o la lista de rechazados. */
export function suscribirCola(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export async function leerCola(): Promise<Sobre[]> {
  const t = await AsyncStorage.getItem(CLAVE_COLA);
  return t ? (JSON.parse(t) as Sobre[]) : [];
}

async function escribirCola(cola: Sobre[]) {
  await AsyncStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  avisar();
}

export async function leerRechazados(): Promise<Rechazado[]> {
  const t = await AsyncStorage.getItem(CLAVE_RECHAZADOS);
  return t ? (JSON.parse(t) as Rechazado[]) : [];
}

export async function descartarRechazado(id: string) {
  const lista = (await leerRechazados()).filter((r) => r.sobre.id !== id);
  await AsyncStorage.setItem(CLAVE_RECHAZADOS, JSON.stringify(lista));
  avisar();
}

/** Arma el sobre del comando y lo valida con las reglas del dominio (RF-23). */
export async function prepararComando(tipo: TipoComando, payload: unknown): Promise<Sobre> {
  const { autor, dispositivoId } = await leerAjustes();
  const sobre: Sobre = { id: randomUUID(), tipo, ocurridoEn: new Date().toISOString(), dispositivoId, ...(autor ? { autor } : {}), payload };
  const r = validarComando(sobre);
  if (!r.valido) throw new FalloApi(r.error.toJSON());
  // Se envían los datos ya limpios (cédula sin espacios, códigos en mayúsculas…).
  return { ...sobre, payload: r.comando.payload };
}

/**
 * Envía un comando. Sin conexión lo deja en la cola y responde EN_COLA.
 * Un error de negocio (409, 422, 404) se lanza para mostrarlo en el formulario.
 */
export async function enviarComando(tipo: TipoComando, payload: unknown): Promise<ResultadoEnvio> {
  const sobre = await prepararComando(tipo, payload);
  try {
    const r = (await pedir('POST', '/comandos', sobre)) as { respuesta: Record<string, unknown> };
    // Si quedaban comandos en cola, aprovecha la conexión para enviarlos.
    sincronizar().catch(() => {});
    return { estado: 'APLICADO', respuesta: r.respuesta ?? {} };
  } catch (e) {
    if (e instanceof FalloApi && e.error.tipo === 'SIN_CONEXION') {
      await escribirCola([...(await leerCola()), sobre]);
      return { estado: 'EN_COLA' };
    }
    throw e;
  }
}

let sincronizando: Promise<{ enviados: number; rechazados: number }> | null = null;

/**
 * Envía la cola en el orden en que se hicieron las operaciones (de a 200).
 * Lo rechazado por el servidor (p. ej. otro técnico instaló el mismo equipo)
 * pasa a la lista de rechazados para que el usuario lo revise.
 */
export function sincronizar(): Promise<{ enviados: number; rechazados: number }> {
  sincronizando ??= (async () => {
    let enviados = 0;
    let rechazados = 0;
    try {
      for (;;) {
        const cola = await leerCola();
        if (cola.length === 0) break;
        const lote = cola.slice(0, 200);
        const r = (await pedir('POST', '/sync/push', { comandos: lote })) as {
          resultados: { id: string | null; resultado: 'APLICADO' | 'RECHAZADO'; error?: ErrorApi }[];
        };
        const nuevosRechazados: Rechazado[] = [];
        r.resultados.forEach((res, i) => {
          if (res.resultado === 'RECHAZADO' && res.error) {
            nuevosRechazados.push({ sobre: lote[i]!, error: res.error, rechazadoEn: new Date().toISOString() });
          }
        });
        if (nuevosRechazados.length > 0) {
          await AsyncStorage.setItem(CLAVE_RECHAZADOS, JSON.stringify([...(await leerRechazados()), ...nuevosRechazados]));
        }
        const procesados = new Set(lote.map((s) => s.id));
        await escribirCola((await leerCola()).filter((s) => !procesados.has(s.id)));
        enviados += lote.length - nuevosRechazados.length;
        rechazados += nuevosRechazados.length;
      }
      return { enviados, rechazados };
    } finally {
      sincronizando = null;
    }
  })();
  return sincronizando;
}

/** Nombre legible de cada operación, para la cola y los rechazados. */
export const NOMBRE_COMANDO: Record<TipoComando, string> = {
  CREAR_PROYECTO: 'Crear proyecto',
  REGISTRAR_INGRESO: 'Ingreso de equipo',
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

export const nuevoId = () => randomUUID();
