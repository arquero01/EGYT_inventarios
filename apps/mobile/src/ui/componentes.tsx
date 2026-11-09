import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';
import { NOMBRE_ESTADO, type EstadoEquipo } from '@egt/domain';
import { color, colorEstado, espacio, radio } from './tema.ts';
import { fechaHora } from './formato.ts';

export type NombreIcono = ComponentProps<typeof Ionicons>['name'];

// ── Estructura ─────────────────────────────────────────────────────────────

export function Pantalla({ children, alRecargar, recargando = false }: { children: ReactNode; alRecargar?: () => void; recargando?: boolean }) {
  return (
    <ScrollView
      style={estilos.pantalla}
      contentContainerStyle={estilos.contenido}
      keyboardShouldPersistTaps="handled"
      refreshControl={alRecargar ? <RefreshControl refreshing={recargando} onRefresh={alRecargar} colors={[color.primario]} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <View style={{ marginBottom: espacio.l }}>
      <View style={estilos.filaSeccion}>
        <Text style={estilos.tituloSeccion}>{titulo}</Text>
        {accion}
      </View>
      {children}
    </View>
  );
}

export function Tarjeta({ children, alTocar, estilo }: { children: ReactNode; alTocar?: () => void; estilo?: ViewStyle }) {
  if (!alTocar) return <View style={[estilos.tarjeta, estilo]}>{children}</View>;
  return (
    <Pressable onPress={alTocar} style={({ pressed }) => [estilos.tarjeta, estilo, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

export function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <View style={estilos.filaDato}>
      <Text style={estilos.etiquetaDato}>{etiqueta}</Text>
      <Text style={estilos.valorDato}>{valor}</Text>
    </View>
  );
}

export function TextoSuave({ children }: { children: ReactNode }) {
  return <Text style={estilos.textoSuave}>{children}</Text>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={estilos.titulo}>{children}</Text>;
}

// ── Estados de carga ───────────────────────────────────────────────────────

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <View style={estilos.centro}>
      <ActivityIndicator color={color.primario} size="large" />
      <Text style={[estilos.textoSuave, { marginTop: espacio.s }]}>{texto}</Text>
    </View>
  );
}

type TipoAviso = 'info' | 'aviso' | 'error' | 'exito';
const estiloAviso: Record<TipoAviso, { fondo: string; texto: string; icono: NombreIcono }> = {
  info: { fondo: color.infoSuave, texto: color.info, icono: 'information-circle-outline' },
  aviso: { fondo: color.avisoSuave, texto: color.aviso, icono: 'warning-outline' },
  error: { fondo: color.peligroSuave, texto: color.peligro, icono: 'alert-circle-outline' },
  exito: { fondo: color.exitoSuave, texto: color.exito, icono: 'checkmark-circle-outline' },
};

export function Aviso({ tipo = 'info', children }: { tipo?: TipoAviso; children: ReactNode }) {
  const e = estiloAviso[tipo];
  return (
    <View style={[estilos.aviso, { backgroundColor: e.fondo }]}>
      <Ionicons name={e.icono} size={20} color={e.texto} style={{ marginRight: espacio.s }} />
      <Text style={{ color: e.texto, flex: 1, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

/** Aviso de que los datos vienen de la copia guardada (sin conexión). */
export function AvisoDesactualizado({ guardadoEn }: { guardadoEn?: string | undefined }) {
  return <Aviso tipo="aviso">Sin conexión. Datos guardados el {fechaHora(guardadoEn)}.</Aviso>;
}

export function Vacio({ texto, icono = 'file-tray-outline' }: { texto: string; icono?: NombreIcono }) {
  return (
    <View style={estilos.centro}>
      <Ionicons name={icono} size={40} color={color.textoSuave} />
      <Text style={[estilos.textoSuave, { marginTop: espacio.s, textAlign: 'center' }]}>{texto}</Text>
    </View>
  );
}

// ── Elementos ──────────────────────────────────────────────────────────────

export function InsigniaEstado({ estado }: { estado: EstadoEquipo }) {
  const c = colorEstado[estado];
  return (
    <View style={[estilos.insignia, { backgroundColor: c.fondo }]}>
      <Text style={{ color: c.texto, fontSize: 12, fontWeight: '600' }}>{NOMBRE_ESTADO[estado]}</Text>
    </View>
  );
}

export function Insignia({ texto, fondo = color.primarioSuave, tinta = color.primarioOscuro }: { texto: string; fondo?: string; tinta?: string }) {
  return (
    <View style={[estilos.insignia, { backgroundColor: fondo }]}>
      <Text style={{ color: tinta, fontSize: 12, fontWeight: '600' }}>{texto}</Text>
    </View>
  );
}

type VarianteBoton = 'primario' | 'secundario' | 'peligro';

export function Boton({
  texto,
  alTocar,
  variante = 'primario',
  cargando = false,
  deshabilitado = false,
  icono,
}: {
  texto: string;
  alTocar: () => void;
  variante?: VarianteBoton;
  cargando?: boolean;
  deshabilitado?: boolean;
  icono?: NombreIcono;
}) {
  const fondo = variante === 'primario' ? color.primario : variante === 'peligro' ? color.peligro : color.superficie;
  const tinta = variante === 'secundario' ? color.primario : '#FFFFFF';
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      onPress={alTocar}
      disabled={inactivo}
      accessibilityRole="button"
      style={({ pressed }) => [
        estilos.boton,
        { backgroundColor: fondo, opacity: inactivo ? 0.55 : pressed ? 0.8 : 1 },
        variante === 'secundario' && { borderWidth: 1, borderColor: color.primario },
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={tinta} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icono ? <Ionicons name={icono} size={18} color={tinta} style={{ marginRight: espacio.s }} /> : null}
          <Text style={{ color: tinta, fontSize: 16, fontWeight: '600' }}>{texto}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Campo({
  etiqueta,
  valor,
  alCambiar,
  error,
  ayuda,
  marcador,
  teclado,
  multilinea = false,
  mayusculas = 'sentences',
  secreto = false,
  autocompletar,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  error?: string | undefined;
  ayuda?: string;
  marcador?: string;
  teclado?: KeyboardTypeOptions;
  multilinea?: boolean;
  mayusculas?: 'none' | 'sentences' | 'words' | 'characters';
  /** Oculta lo que se escribe (contraseñas). */
  secreto?: boolean;
  autocompletar?: ComponentProps<typeof TextInput>['autoComplete'];
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={alCambiar}
        placeholder={marcador}
        placeholderTextColor="#94A3B3"
        keyboardType={teclado}
        multiline={multilinea}
        autoCapitalize={mayusculas}
        secureTextEntry={secreto}
        autoComplete={autocompletar}
        autoCorrect={!secreto && teclado !== 'email-address'}
        style={[estilos.entrada, multilinea && { minHeight: 80, textAlignVertical: 'top' }, error ? { borderColor: color.peligro } : null]}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : ayuda ? <Text style={estilos.ayuda}>{ayuda}</Text> : null}
    </View>
  );
}

export interface Opcion<T extends string> {
  valor: T;
  etiqueta: string;
  detalle?: string;
}

/** Selector de una opción, como fichas que se tocan. */
export function Selector<T extends string>({
  etiqueta,
  opciones,
  valor,
  alCambiar,
  error,
  vacio = 'No hay opciones disponibles.',
}: {
  etiqueta: string;
  opciones: Opcion<T>[];
  valor: T | '' | undefined;
  alCambiar: (v: T) => void;
  error?: string | undefined;
  vacio?: string;
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      {opciones.length === 0 ? <Text style={estilos.ayuda}>{vacio}</Text> : null}
      <View style={estilos.fichas}>
        {opciones.map((o) => {
          const activa = o.valor === valor;
          return (
            <Pressable
              key={o.valor}
              onPress={() => alCambiar(o.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: activa }}
              style={[estilos.ficha, activa && estilos.fichaActiva]}
            >
              <Text style={[estilos.textoFicha, activa && { color: '#FFFFFF' }]}>{o.etiqueta}</Text>
              {o.detalle ? <Text style={[estilos.detalleFicha, activa && { color: color.primarioSuave }]}>{o.detalle}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </View>
  );
}

export function Casilla({ marcada, alCambiar, children }: { marcada: boolean; alCambiar: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable onPress={() => alCambiar(!marcada)} style={estilos.casilla} accessibilityRole="checkbox" accessibilityState={{ checked: marcada }}>
      <Ionicons name={marcada ? 'checkbox' : 'square-outline'} size={24} color={marcada ? color.primario : color.textoSuave} />
      <View style={{ flex: 1, marginLeft: espacio.m }}>{children}</View>
    </Pressable>
  );
}

export function BotonIcono({ icono, alTocar, etiqueta }: { icono: NombreIcono; alTocar: () => void; etiqueta: string }) {
  return (
    <Pressable onPress={alTocar} hitSlop={10} accessibilityLabel={etiqueta} accessibilityRole="button" style={{ padding: espacio.xs }}>
      <Ionicons name={icono} size={24} color={color.primario} />
    </Pressable>
  );
}

export const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: espacio.l, paddingBottom: 48 },
  filaSeccion: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espacio.s },
  tituloSeccion: { fontSize: 13, fontWeight: '700', color: color.textoSuave, textTransform: 'uppercase', letterSpacing: 0.5 },
  titulo: { fontSize: 22, fontWeight: '700', color: color.texto, marginBottom: espacio.xs },
  tarjeta: { backgroundColor: color.superficie, borderRadius: radio, padding: espacio.l, marginBottom: espacio.s, borderWidth: 1, borderColor: color.borde },
  filaDato: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: espacio.m },
  etiquetaDato: { color: color.textoSuave, fontSize: 14 },
  valorDato: { color: color.texto, fontSize: 14, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  textoSuave: { color: color.textoSuave, fontSize: 14, lineHeight: 20 },
  centro: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  aviso: { flexDirection: 'row', alignItems: 'flex-start', padding: espacio.m, borderRadius: radio, marginBottom: espacio.m },
  insignia: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  boton: { minHeight: 48, borderRadius: radio, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio.l, marginTop: espacio.s },
  campo: { marginBottom: espacio.l },
  etiqueta: { fontSize: 14, fontWeight: '600', color: color.texto, marginBottom: 6 },
  entrada: {
    backgroundColor: color.superficie,
    borderWidth: 1,
    borderColor: color.borde,
    borderRadius: radio,
    paddingHorizontal: espacio.m,
    paddingVertical: 10,
    fontSize: 16,
    color: color.texto,
  },
  error: { color: color.peligro, fontSize: 13, marginTop: 4 },
  ayuda: { color: color.textoSuave, fontSize: 13, marginTop: 4 },
  fichas: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  ficha: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.superficie, borderRadius: radio, paddingHorizontal: espacio.m, paddingVertical: espacio.s },
  fichaActiva: { backgroundColor: color.primario, borderColor: color.primario },
  textoFicha: { fontSize: 14, color: color.texto, fontWeight: '500' },
  detalleFicha: { fontSize: 12, color: color.textoSuave, marginTop: 2 },
  casilla: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.s },
});
