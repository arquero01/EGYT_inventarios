import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { leerCola, leerSesion, refrescarCuenta, sincronizar } from './src/api/cliente.ts';
import { Navegacion } from './src/navegacion.tsx';
import { PuertaDeEntrada } from './src/pantallas/Cuenta.tsx';
import { useSesion } from './src/ui/ganchos.ts';
import { color } from './src/ui/tema.ts';

const CADA_MS = 30_000;

/** Envía la cola si hay algo pendiente y hay sesión; sin conexión, lo intenta después. */
async function sincronizarSiHayPendientes() {
  if (!(await leerSesion())) return;
  if ((await leerCola()).length > 0) await sincronizar().catch(() => {});
}

export default function App() {
  const sesion = useSesion();
  const conSesion = Boolean(sesion);

  useEffect(() => {
    if (!conSesion) return;
    refrescarCuenta();
    sincronizarSiHayPendientes();
    const intervalo = setInterval(sincronizarSiHayPendientes, CADA_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizarSiHayPendientes();
    });
    return () => {
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, [conSesion]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {sesion === undefined ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.noche }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : sesion === null ? (
        <PuertaDeEntrada />
      ) : (
        <Navegacion />
      )}
    </SafeAreaProvider>
  );
}
