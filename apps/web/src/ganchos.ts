import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { TipoComando } from '@egt/domain';
import { FalloApi, enviarComando, pedir, sesionActual, suscribirSesion } from './api.ts';

/** Sesión actual; se actualiza sola al entrar o salir. */
export function useSesion() {
  return useSyncExternalStore(suscribirSesion, sesionActual);
}

export const useEsAdmin = () => useSesion()?.usuario.rol === 'ADMIN';

/** Carga una ruta GET. `ruta = null` no carga nada. */
export function useLectura<T>(ruta: string | null) {
  const [estado, setEstado] = useState<{ datos: T | null; error: FalloApi | null; cargando: boolean }>({ datos: null, error: null, cargando: ruta !== null });
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (ruta === null) {
      setEstado({ datos: null, error: null, cargando: false });
      return;
    }
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    pedir<T>('GET', ruta)
      .then((datos) => vigente && setEstado({ datos, error: null, cargando: false }))
      .catch((e: unknown) => {
        if (!vigente) return;
        const error = e instanceof FalloApi ? e : new FalloApi({ codigo: 'INTERNO', tipo: 'INTERNO', mensaje: String(e), detalles: [] });
        setEstado((x) => ({ ...x, error, cargando: false }));
      });
    return () => {
      vigente = false;
    };
  }, [ruta, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recargar };
}

const claveCampo = (campo: string) => campo.replace(/^payload\./, '');

/** Errores por campo y mensaje general de un FalloApi. */
export function erroresDe(e: unknown) {
  if (e instanceof FalloApi) {
    const porCampo: Record<string, string> = {};
    for (const d of e.error.detalles) porCampo[claveCampo(d.campo)] ??= d.problema;
    return { porCampo, mensaje: e.error.mensaje };
  }
  return { porCampo: {} as Record<string, string>, mensaje: String(e) };
}

/** Estado de un formulario que termina en una operación (comando o petición). */
export function useFormulario() {
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ejecutar = useCallback(async <T,>(accion: () => Promise<T>): Promise<T | null> => {
    setEnviando(true);
    setErrores({});
    setMensaje(null);
    try {
      return await accion();
    } catch (e) {
      const r = erroresDe(e);
      setErrores(r.porCampo);
      setMensaje(r.mensaje);
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  const enviar = useCallback((tipo: TipoComando, payload: unknown) => ejecutar(() => enviarComando(tipo, payload)), [ejecutar]);

  /** Error del campo `ruta` o de cualquiera de sus hijos ("usuario" → "usuario.cedula"). */
  const errorDe = useCallback(
    (ruta: string) => errores[ruta] ?? Object.entries(errores).find(([k]) => k.startsWith(`${ruta}.`))?.[1],
    [errores],
  );

  const fijarError = useCallback((campo: string, problema: string) => setErrores((e) => ({ ...e, [campo]: problema })), []);

  return { enviar, ejecutar, enviando, errores, errorDe, mensaje, fijarError, limpiar: () => (setErrores({}), setMensaje(null)) };
}
