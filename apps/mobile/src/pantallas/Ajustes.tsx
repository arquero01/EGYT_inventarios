import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { NOMBRE_ROL } from '@egt/domain';
import {
  NOMBRE_COMANDO,
  cambiarContrasena,
  cerrarSesionCuenta,
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
import { Aviso, Boton, Campo, FilaDato, Insignia, Pantalla, Seccion, Tarjeta, TextoSuave, Vacio } from '../ui/componentes.tsx';
import { useSesion } from '../ui/ganchos.ts';
import { fechaHora } from '../ui/formato.ts';
import { color, espacio } from '../ui/tema.ts';

/** Cambio de contraseña: pide la actual y la nueva dos veces. */
function CambioContrasena({ alTerminar }: { alTerminar: () => void }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async () => {
    setErrores({});
    setMensaje(null);
    if (nueva !== repetida) return setErrores({ repetida: 'Las contraseñas no coinciden' });
    setEnviando(true);
    try {
      await cambiarContrasena(actual, nueva);
      Alert.alert('Contraseña cambiada', 'Las demás sesiones abiertas con su cuenta se cerraron.');
      alTerminar();
    } catch (e) {
      if (e instanceof FalloApi) {
        const porCampo: Record<string, string> = {};
        for (const d of e.error.detalles) porCampo[d.campo] ??= d.problema;
        setErrores(porCampo);
        setMensaje(e.error.tipo === 'SIN_CONEXION' ? 'Necesita conexión para cambiar la contraseña.' : e.error.mensaje);
      } else setMensaje(String(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta>
      <Campo etiqueta="Contraseña actual" valor={actual} alCambiar={setActual} secreto mayusculas="none" autocompletar="current-password" error={errores.actual} />
      <Campo etiqueta="Contraseña nueva" valor={nueva} alCambiar={setNueva} secreto mayusculas="none" autocompletar="new-password" error={errores.nueva} ayuda="Mínimo 8 caracteres, con letras y números." />
      <Campo etiqueta="Repita la contraseña nueva" valor={repetida} alCambiar={setRepetida} secreto mayusculas="none" autocompletar="new-password" error={errores.repetida} />
      {mensaje ? <Aviso tipo="error">{mensaje}</Aviso> : null}
      <Boton texto="Guardar contraseña" cargando={enviando} alTocar={guardar} />
      <Boton texto="Cancelar" variante="secundario" alTocar={alTerminar} />
    </Tarjeta>
  );
}

/** Cuenta, servidor y operaciones pendientes (RNF-01). */
export function Ajustes() {
  const navegar = useNavigation<NativeStackNavigationProp<Pila>>();
  const sesion = useSesion();
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [servidor, setServidor] = useState('');
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
        setDispositivo(a.dispositivoId);
      });
      cargarCola();
      return suscribirCola(cargarCola);
    }, [cargarCola]),
  );

  const guardarYProbar = async () => {
    setProbando(true);
    setPrueba(null);
    const a = await guardarAjustes({ servidor });
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

  const salir = () => {
    const aviso =
      cola.length > 0
        ? `Hay ${cola.length} operación(es) sin enviar. Se conservan en el celular y se enviarán cuando alguien vuelva a entrar.`
        : '¿Desea cerrar la sesión en este celular?';
    Alert.alert('Cerrar sesión', aviso, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void cerrarSesionCuenta() },
    ]);
  };

  return (
    <Pantalla>
      {sesion ? (
        <Seccion titulo="Mi cuenta">
          <Tarjeta>
            <Text style={{ fontSize: 17, fontWeight: '700', color: color.texto }}>{sesion.usuario.nombre}</Text>
            <TextoSuave>{sesion.usuario.correo}</TextoSuave>
            <View style={{ flexDirection: 'row', marginTop: espacio.s }}>
              <Insignia texto={NOMBRE_ROL[sesion.usuario.rol]} />
            </View>
          </Tarjeta>
          {cambiandoClave ? (
            <CambioContrasena alTerminar={() => setCambiandoClave(false)} />
          ) : (
            <Boton texto="Cambiar contraseña" icono="key-outline" variante="secundario" alTocar={() => setCambiandoClave(true)} />
          )}
          <Boton texto="Cerrar sesión" icono="log-out-outline" variante="peligro" alTocar={salir} />
        </Seccion>
      ) : null}

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
