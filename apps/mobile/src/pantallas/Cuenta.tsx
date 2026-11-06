import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LARGO_MINIMO_CONTRASENA } from '@egt/domain';
import {
  FalloApi,
  guardarAjustes,
  ingresarCuenta,
  leerAjustes,
  opcionesRegistro,
  probarServidor,
  registrarCuenta,
} from '../api/cliente.ts';
import { Aviso, Boton, Campo } from '../ui/componentes.tsx';
import { color, espacio, radio } from '../ui/tema.ts';

const LOGO = require('../../assets/logo-egt.png');

/** Errores por campo a partir de un FalloApi (los detalles traen "correo", "contrasena"…). */
function erroresDe(e: unknown): { porCampo: Record<string, string>; mensaje: string } {
  if (e instanceof FalloApi) {
    const porCampo: Record<string, string> = {};
    for (const d of e.error.detalles) porCampo[d.campo] ??= d.problema;
    const mensaje = e.error.tipo === 'SIN_CONEXION' ? `${e.error.mensaje} ${e.error.detalles[0]?.problema ?? ''}` : e.error.mensaje;
    return { porCampo: e.error.tipo === 'SIN_CONEXION' ? {} : porCampo, mensaje };
  }
  return { porCampo: {}, mensaje: String(e) };
}

/** Marco común: franja verde con la marca y tarjeta blanca con el formulario. */
function MarcoCuenta({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  const margen = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.fondo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ backgroundColor: color.noche, paddingTop: margen.top + espacio.xl * 1.5, paddingBottom: espacio.xl * 2.5, paddingHorizontal: espacio.xl }}>
          {/* El logo sobre una placa blanca, como en el panel web. */}
          <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: espacio.m, paddingHorizontal: espacio.l }}>
            <Image source={LOGO} style={{ width: 120, height: 55 }} resizeMode="contain" accessibilityLabel="eg&t" />
          </View>
          <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', marginTop: espacio.xl }}>{titulo}</Text>
          <Text style={{ color: '#C4DAEF', fontSize: 15, marginTop: espacio.xs }}>{subtitulo}</Text>
        </View>
        <View
          style={{
            marginTop: -espacio.xl * 1.5,
            marginHorizontal: espacio.l,
            backgroundColor: color.superficie,
            borderRadius: radio * 1.4,
            padding: espacio.l,
            borderWidth: 1,
            borderColor: color.borde,
            marginBottom: margen.bottom + espacio.xl,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Enlace({ texto, alTocar }: { texto: string; alTocar: () => void }) {
  return (
    <Pressable onPress={alTocar} accessibilityRole="link" style={{ paddingVertical: espacio.m, alignItems: 'center' }}>
      <Text style={{ color: color.primario, fontWeight: '600', fontSize: 15 }}>{texto}</Text>
    </Pressable>
  );
}

/** Dirección del servidor, plegable: se necesita antes de poder entrar. */
function ServidorPlegable() {
  const [abierto, setAbierto] = useState(false);
  const [servidor, setServidor] = useState('');
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    leerAjustes().then((a) => {
      setServidor(a.servidor);
      if (!a.servidor) setAbierto(true);
    });
  }, []);

  const guardar = async () => {
    setProbando(true);
    setPrueba(null);
    const a = await guardarAjustes({ servidor });
    setServidor(a.servidor);
    try {
      await probarServidor();
      setPrueba({ ok: true, texto: 'Conectado con el servidor.' });
      setAbierto(false);
    } catch (e) {
      setPrueba({ ok: false, texto: erroresDe(e).mensaje });
    } finally {
      setProbando(false);
    }
  };

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: color.borde, marginTop: espacio.m, paddingTop: espacio.m }}>
      <Pressable onPress={() => setAbierto((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s }} accessibilityRole="button">
        <Ionicons name="server-outline" size={16} color={color.textoSuave} />
        <Text style={{ flex: 1, color: color.textoSuave, fontSize: 13 }} numberOfLines={1}>
          {servidor ? `Servidor: ${servidor.replace(/^https?:\/\//, '')}` : 'Configure la dirección del servidor'}
        </Text>
        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={16} color={color.textoSuave} />
      </Pressable>
      {prueba && !abierto ? <Text style={{ color: prueba.ok ? color.primario : color.peligro, fontSize: 13, marginTop: espacio.xs }}>{prueba.texto}</Text> : null}
      {abierto ? (
        <View style={{ marginTop: espacio.m }}>
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
          <Boton texto="Guardar y probar" icono="wifi-outline" variante="secundario" cargando={probando} alTocar={guardar} />
        </View>
      ) : null}
    </View>
  );
}

export function Ingreso({ alRegistrarse }: { alRegistrarse: () => void }) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async () => {
    setEnviando(true);
    setErrores({});
    setMensaje(null);
    try {
      await ingresarCuenta({ correo, contrasena });
      // La app cambia sola a las pantallas de trabajo al guardar la sesión.
    } catch (e) {
      const r = erroresDe(e);
      setErrores(r.porCampo);
      setMensaje(r.mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <MarcoCuenta titulo="Iniciar sesión" subtitulo="Entre con el correo y la contraseña de su cuenta.">
      <Campo etiqueta="Correo electrónico" valor={correo} alCambiar={setCorreo} teclado="email-address" mayusculas="none" autocompletar="email" error={errores.correo} marcador="nombre@empresa.co" />
      <Campo etiqueta="Contraseña" valor={contrasena} alCambiar={setContrasena} secreto mayusculas="none" autocompletar="current-password" error={errores.contrasena} />
      {mensaje ? <Aviso tipo="error">{mensaje}</Aviso> : null}
      <Boton texto="Entrar" icono="log-in-outline" cargando={enviando} alTocar={entrar} />
      <Enlace texto="¿No tiene cuenta? Regístrese" alTocar={alRegistrarse} />
      <Text style={{ color: color.textoSuave, fontSize: 13, textAlign: 'center' }}>¿Olvidó su contraseña? Pídale a un administrador que la restablezca.</Text>
      <ServidorPlegable />
    </MarcoCuenta>
  );
}

export function Registro({ alVolver }: { alVolver: () => void }) {
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [requiereAprobacion, setRequiereAprobacion] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    opcionesRegistro()
      .then((o) => setRequiereAprobacion(o.registroRequiereAprobacion))
      .catch(() => {});
  }, []);

  const crear = async () => {
    setErrores({});
    setMensaje(null);
    if (contrasena !== confirmacion) {
      setErrores({ confirmacion: 'Las contraseñas no coinciden' });
      return;
    }
    setEnviando(true);
    try {
      const r = await registrarCuenta({ nombre, correo, contrasena });
      if (r.pendiente) setPendiente(r.mensaje ?? 'Su cuenta está pendiente de autorización.');
    } catch (e) {
      const r = erroresDe(e);
      setErrores(r.porCampo);
      setMensaje(r.mensaje);
    } finally {
      setEnviando(false);
    }
  };

  if (pendiente) {
    return (
      <MarcoCuenta titulo="Cuenta creada" subtitulo="Falta un paso.">
        <Aviso tipo="info">{pendiente}</Aviso>
        <Boton texto="Volver al inicio de sesión" variante="secundario" alTocar={alVolver} />
      </MarcoCuenta>
    );
  }

  return (
    <MarcoCuenta titulo="Crear cuenta" subtitulo={requiereAprobacion ? 'Un administrador debe autorizar su cuenta antes de entrar.' : 'Regístrese con su correo para empezar a trabajar.'}>
      <Campo etiqueta="Nombre completo" valor={nombre} alCambiar={setNombre} mayusculas="words" autocompletar="name" error={errores.nombre} />
      <Campo etiqueta="Correo electrónico" valor={correo} alCambiar={setCorreo} teclado="email-address" mayusculas="none" autocompletar="email" error={errores.correo} marcador="nombre@empresa.co" />
      <Campo
        etiqueta="Contraseña"
        valor={contrasena}
        alCambiar={setContrasena}
        secreto
        mayusculas="none"
        autocompletar="new-password"
        error={errores.contrasena}
        ayuda={`Mínimo ${LARGO_MINIMO_CONTRASENA} caracteres, con letras y números.`}
      />
      <Campo etiqueta="Repita la contraseña" valor={confirmacion} alCambiar={setConfirmacion} secreto mayusculas="none" autocompletar="new-password" error={errores.confirmacion} />
      {mensaje ? <Aviso tipo="error">{mensaje}</Aviso> : null}
      <Boton texto="Crear cuenta" icono="person-add-outline" cargando={enviando} alTocar={crear} />
      <Enlace texto="Ya tengo cuenta: iniciar sesión" alTocar={alVolver} />
      <ServidorPlegable />
    </MarcoCuenta>
  );
}

/** Pantallas antes de entrar: alterna entre ingreso y registro sin navegación. */
export function PuertaDeEntrada() {
  const [modo, setModo] = useState<'ingreso' | 'registro'>('ingreso');
  return modo === 'ingreso' ? <Ingreso alRegistrarse={() => setModo('registro')} /> : <Registro alVolver={() => setModo('ingreso')} />;
}
