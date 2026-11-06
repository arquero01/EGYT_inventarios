import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  NOMBRE_COMANDO,
  descartarRechazado,
  guardarAjustes,
  leerAjustes,
  leerCola,
  leerRechazados,
  probarServidor,
  sincronizar,
  suscribirCola,
  FalloApi,
  type Rechazado,
  type Sobre,
} from '../api/cliente.ts';
import type { Pila } from '../navegacion.tsx';
import { Aviso, Boton, Campo, FilaDato, Pantalla, Seccion, Tarjeta, TextoSuave, Vacio } from '../ui/componentes.tsx';
import { fechaHora } from '../ui/formato.ts';
import { color, espacio } from '../ui/tema.ts';

/** Servidor, nombre de quien usa la app y operaciones pendientes (RNF-01). */
export function Ajustes() {
  const navegar = useNavigation<NativeStackNavigationProp<Pila>>();
  const [servidor, setServidor] = useState('');
  const [autor, setAutor] = useState('');
  const [dispositivo, setDispositivo] = useState('');
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);
  const [probando, setProbando] = useState(false);
  const [cola, setCola] = useState<Sobre[]>([]);
  const [rechazados, setRechazados] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);

  const cargarCola = useCallback(async () => {
    setCola(await leerCola());
    setRechazados((await leerRechazados()).length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      leerAjustes().then((a) => {
        setServidor(a.servidor);
        setAutor(a.autor);
        setDispositivo(a.dispositivoId);
      });
      cargarCola();
      return suscribirCola(cargarCola);
    }, [cargarCola]),
  );

  const guardarYProbar = async () => {
    setProbando(true);
    setPrueba(null);
    const a = await guardarAjustes({ servidor, autor: autor.trim() });
    setServidor(a.servidor);
    try {
      await probarServidor();
      setPrueba({ ok: true, texto: 'Conectado con el servidor.' });
    } catch (e) {
      const detalle = e instanceof FalloApi ? e.error.detalles[0]?.problema ?? e.message : String(e);
      setPrueba({ ok: false, texto: `No se pudo conectar: ${detalle}` });
    } finally {
      setProbando(false);
    }
  };

  const sincronizarAhora = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      Alert.alert('Sincronización', `Enviadas: ${r.enviados}. Rechazadas: ${r.rechazados}.`);
    } catch {
      Alert.alert('Sin conexión', 'No se pudo contactar el servidor.');
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <Pantalla>
      <Seccion titulo="Servidor">
        <Campo
          etiqueta="Dirección del servidor"
          valor={servidor}
          alCambiar={setServidor}
          mayusculas="none"
          teclado="url"
          marcador="https://mi-codespace-3000.app.github.dev"
          ayuda="La dirección pública de la API (en Codespaces, el puerto 3000 marcado como público)."
        />
        <Campo etiqueta="Su nombre" valor={autor} alCambiar={setAutor} mayusculas="words" ayuda="Queda registrado en cada operación y se sugiere como técnico o responsable." />
        {prueba ? <Aviso tipo={prueba.ok ? 'exito' : 'error'}>{prueba.texto}</Aviso> : null}
        <Boton texto="Guardar y probar conexión" icono="wifi-outline" cargando={probando} alTocar={guardarYProbar} />
      </Seccion>

      <Seccion titulo="Operaciones sin conexión">
        <Tarjeta>
          <FilaDato etiqueta="Pendientes de enviar" valor={cola.length} />
          <FilaDato etiqueta="Rechazadas por el servidor" valor={rechazados} />
        </Tarjeta>
        {cola.slice(0, 10).map((s) => (
          <Text key={s.id} style={{ fontSize: 13, color: color.textoSuave, marginBottom: espacio.xs }}>
            • {NOMBRE_COMANDO[s.tipo]} · {fechaHora(s.ocurridoEn)}
          </Text>
        ))}
        {cola.length > 10 ? <TextoSuave>… y {cola.length - 10} más.</TextoSuave> : null}
        <Boton texto="Sincronizar ahora" icono="sync-outline" variante="secundario" cargando={sincronizando} deshabilitado={cola.length === 0} alTocar={sincronizarAhora} />
        {rechazados > 0 ? <Boton texto="Ver operaciones rechazadas" icono="alert-circle-outline" variante="secundario" alTocar={() => navegar.navigate('Rechazados')} /> : null}
      </Seccion>

      <Seccion titulo="Acerca de">
        <Tarjeta>
          <FilaDato etiqueta="Versión" valor={Constants.expoConfig?.version ?? '—'} />
          <FilaDato etiqueta="Dispositivo" valor={dispositivo} />
        </Tarjeta>
      </Seccion>
    </Pantalla>
  );
}

/** Operaciones hechas sin conexión que el servidor rechazó al sincronizar (RNF-01). */
export function Rechazados() {
  const [lista, setLista] = useState<Rechazado[]>([]);
  const cargar = useCallback(async () => setLista(await leerRechazados()), []);
  useFocusEffect(
    useCallback(() => {
      cargar();
      return suscribirCola(cargar);
    }, [cargar]),
  );

  const descartar = (r: Rechazado) =>
    Alert.alert('Descartar', '¿Quitar esta operación de la lista? El servidor conserva el registro del conflicto.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => descartarRechazado(r.sobre.id) },
    ]);

  return (
    <Pantalla>
      <Aviso tipo="aviso">
        Estas operaciones se hicieron sin conexión y al llegar al servidor ya no eran válidas (por ejemplo, otro técnico había instalado el mismo equipo). Revíselas y, si hace falta, vuelva a hacerlas.
      </Aviso>
      {lista.length === 0 ? <Vacio texto="No hay operaciones rechazadas." icono="checkmark-circle-outline" /> : null}
      {lista.map((r) => (
        <Tarjeta key={r.sobre.id}>
          <Text style={{ fontWeight: '700', color: color.texto }}>{NOMBRE_COMANDO[r.sobre.tipo]}</Text>
          <TextoSuave>Hecha el {fechaHora(r.sobre.ocurridoEn)}</TextoSuave>
          <View style={{ marginTop: espacio.s }}>
            <Aviso tipo="error">
              {r.error.mensaje}
              {r.error.detalles[0] ? ` ${r.error.detalles[0].problema}` : ''}
            </Aviso>
          </View>
          <Boton texto="Descartar" variante="secundario" alTocar={() => descartar(r)} />
        </Tarjeta>
      ))}
    </Pantalla>
  );
}
