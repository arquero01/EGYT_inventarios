import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { TipoComando } from '@egt/domain';
import {
  FalloApi,
  enviarComando,
  leer,
  leerCola,
  leerRechazados,
  leerSesion,
  suscribirCola,
  suscribirSesion,
  type Lectura,
  type ResultadoEnvio,
  type Sesion,
} from '../api/cliente.ts';

/**
 * Carga una ruta GET y la vuelve a cargar cada vez que la pantalla aparece.
 * `ruta = null` no carga nada (p. ej. mientras falta elegir un filtro).
 */
export function useLectura<T>(ruta: string | null) {
  const [estado, setEstado] = useState<{ lectura: Lectura<T> | null; error: FalloApi | null; cargando: boolean }>({
    lectura: null,
    error: null,
    cargando: ruta !== null,
  });
  const rutaActual = useRef(ruta);
  rutaActual.current = ruta;

  const cargar = useCallback(async () => {
    if (!ruta) return;
    setEstado((e) => ({ ...e, cargando: true }));
    try {
      const lectura = await leer<T>(ruta);
      if (rutaActual.current === ruta) setEstado({ lectura, error: null, cargando: false });
    } catch (e) {
      if (rutaActual.current === ruta) {
        setEstado({ lectura: null, error: e instanceof FalloApi ? e : new FalloApi({ codigo: 'INTERNO', tipo: 'INTERNO', mensaje: String(e), detalles: [] }), cargando: false });
      }
    }
  }, [ruta]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  return {
    datos: estado.lectura?.datos ?? null,
    desactualizado: estado.lectura?.desactualizado ?? false,
    guardadoEn: estado.lectura?.guardadoEn,
    error: estado.error,
    cargando: estado.cargando,
    recargar: cargar,
  };
}

/** Quita el prefijo "payload." para ubicar el error en el campo del formulario. */
const claveCampo = (campo: string) => campo.replace(/^payload\./, '');

/**
 * Estado de un formulario que termina en un comando: muestra los errores de
 * cada campo (RF-23) y avisa si quedó guardado para enviar después.
 */
export function useFormulario() {
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = useCallback(async (tipo: TipoComando, payload: unknown): Promise<ResultadoEnvio | null> => {
    setEnviando(true);
    setErrores({});
    setMensaje(null);
    try {
      const r = await enviarComando(tipo, payload);
      if (r.estado === 'EN_COLA') {
        Alert.alert('Guardado sin conexión', 'La operación quedó guardada en el celular y se enviará cuando haya señal.');
      }
      return r;
    } catch (e) {
      if (e instanceof FalloApi) {
        const porCampo: Record<string, string> = {};
        for (const d of e.error.detalles) {
          const clave = claveCampo(d.campo);
          porCampo[clave] ??= d.problema;
        }
        setErrores(porCampo);
        setMensaje(e.error.mensaje);
      } else {
        setMensaje(String(e));
      }
      return null;
    } finally {
      setEnviando(false);
    }
  }, []);

  /** Error del campo `ruta` (p. ej. "usuario.cedula") o de cualquiera de sus hijos. */
  const errorDe = useCallback(
    (ruta: string) => errores[ruta] ?? Object.entries(errores).find(([k]) => k.startsWith(`${ruta}.`))?.[1],
    [errores],
  );

  /** Errores que no corresponden a ningún campo visible (se muestran juntos). */
  const otrosErrores = (visibles: string[]) =>
    Object.entries(errores)
      .filter(([k]) => !visibles.some((v) => k === v || k.startsWith(`${v}.`)))
      .map(([k, v]) => `${k}: ${v}`);

  return { enviar, enviando, errores, errorDe, mensaje, otrosErrores };
}

/** Cuenta con la que se entró (undefined mientras se lee del almacenamiento). */
export function useSesion() {
  const [sesion, setSesion] = useState<Sesion | null | undefined>(undefined);
  useEffect(() => {
    leerSesion().then(setSesion);
    return suscribirSesion(setSesion);
  }, []);
  return sesion;
}

/** Cantidad de operaciones en cola y rechazadas, siempre al día. */
export function useCola() {
  const [estado, setEstado] = useState({ pendientes: 0, rechazados: 0 });
  useEffect(() => {
    const actualizar = async () => setEstado({ pendientes: (await leerCola()).length, rechazados: (await leerRechazados()).length });
    actualizar();
    return suscribirCola(actualizar);
  }, []);
  return estado;
}
