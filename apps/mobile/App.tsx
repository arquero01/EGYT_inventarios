import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { leerCola, sincronizar } from './src/api/cliente.ts';
import { Navegacion } from './src/navegacion.tsx';

const CADA_MS = 30_000;

/** Envía la cola si hay algo pendiente; sin conexión, simplemente lo intenta después. */
async function sincronizarSiHayPendientes() {
  if ((await leerCola()).length > 0) await sincronizar().catch(() => {});
}

export default function App() {
  useEffect(() => {
    sincronizarSiHayPendientes();
    const intervalo = setInterval(sincronizarSiHayPendientes, CADA_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizarSiHayPendientes();
    });
    return () => {
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Navegacion />
    </SafeAreaProvider>
  );
}
