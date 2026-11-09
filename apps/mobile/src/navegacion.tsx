import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Accion, MovimientoEquipo } from '@egt/domain';
import { color } from './ui/tema.ts';
import { Inicio } from './pantallas/Inicio.tsx';
import { Inventario } from './pantallas/Inventario.tsx';
import { HojaDeVida } from './pantallas/HojaDeVida.tsx';
import { AccionEquipo } from './pantallas/AccionEquipo.tsx';
import { IngresoEquipo } from './pantallas/IngresoEquipo.tsx';
import { Proyectos, ProyectoDetalle, NuevoProyecto } from './pantallas/Proyectos.tsx';
import { Logistica } from './pantallas/Logistica.tsx';
import { Bodegas, BodegaDetalle, NuevaBodega } from './pantallas/Bodegas.tsx';
import { Articulos, ArticuloDetalle, NuevoArticulo, IngresoArticulos } from './pantallas/Articulos.tsx';
import { Movimientos, MovimientoDetalle } from './pantallas/Movimientos.tsx';
import { NuevoMovimiento } from './pantallas/NuevoMovimiento.tsx';
import { Ajustes, Rechazados } from './pantallas/Ajustes.tsx';

export type Pestanas = {
  Inicio: undefined;
  Inventario: undefined;
  Proyectos: undefined;
  Logistica: undefined;
  Ajustes: undefined;
};

export type Pila = {
  Pestanas: NavigatorScreenParams<Pestanas> | undefined;
  HojaDeVida: { equipoId: string };
  AccionEquipo: { equipoId: string; serial: string; accion: Accion; proyectoId: string; ubicacion: { vereda: string; municipio: string; departamento: string } };
  IngresoEquipo: { proyectoId?: string; bodegaId?: string } | undefined;
  ProyectoDetalle: { proyectoId: string };
  NuevoProyecto: undefined;
  Bodegas: undefined;
  BodegaDetalle: { bodegaId: string };
  NuevaBodega: undefined;
  Articulos: undefined;
  ArticuloDetalle: { articuloId: string };
  NuevoArticulo: undefined;
  IngresoArticulos: { bodegaId?: string } | undefined;
  Movimientos: undefined;
  MovimientoDetalle: { idONumero: string };
  NuevoMovimiento: { tipo: MovimientoEquipo; equipoId?: string; bodegaId?: string; proyectoId?: string };
  Rechazados: undefined;
};

export type PropsPila<N extends keyof Pila> = NativeStackScreenProps<Pila, N>;

const Tab = createBottomTabNavigator<Pestanas>();
const Stack = createNativeStackNavigator<Pila>();

const ICONOS: Record<keyof Pestanas, keyof typeof Ionicons.glyphMap> = {
  Inicio: 'home-outline',
  Inventario: 'cube-outline',
  Proyectos: 'map-outline',
  Logistica: 'swap-horizontal-outline',
  Ajustes: 'settings-outline',
};

const cabecera = {
  headerStyle: { backgroundColor: color.primario },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: '700' as const },
};

function PestanasPrincipales() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...cabecera,
        tabBarActiveTintColor: color.primario,
        tabBarInactiveTintColor: color.textoSuave,
        tabBarIcon: ({ color: tinta, size }) => <Ionicons name={ICONOS[route.name]} size={size} color={tinta} />,
      })}
    >
      <Tab.Screen name="Inicio" component={Inicio} options={{ title: 'eg&t Inventario', tabBarLabel: 'Inicio' }} />
      <Tab.Screen name="Inventario" component={Inventario} />
      <Tab.Screen name="Proyectos" component={Proyectos} />
      <Tab.Screen name="Logistica" component={Logistica} options={{ title: 'Logística' }} />
      <Tab.Screen name="Ajustes" component={Ajustes} />
    </Tab.Navigator>
  );
}

const tema = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: color.primario, background: color.fondo } };

export function Navegacion() {
  return (
    <NavigationContainer theme={tema}>
      <Stack.Navigator screenOptions={{ ...cabecera, headerBackTitle: 'Atrás' }}>
        <Stack.Screen name="Pestanas" component={PestanasPrincipales} options={{ headerShown: false }} />
        <Stack.Screen name="HojaDeVida" component={HojaDeVida} options={{ title: 'Hoja de vida' }} />
        <Stack.Screen name="AccionEquipo" component={AccionEquipo} options={{ title: 'Operación' }} />
        <Stack.Screen name="IngresoEquipo" component={IngresoEquipo} options={{ title: 'Ingreso de equipo' }} />
        <Stack.Screen name="ProyectoDetalle" component={ProyectoDetalle} options={{ title: 'Proyecto' }} />
        <Stack.Screen name="NuevoProyecto" component={NuevoProyecto} options={{ title: 'Nuevo proyecto' }} />
        <Stack.Screen name="Bodegas" component={Bodegas} />
        <Stack.Screen name="BodegaDetalle" component={BodegaDetalle} options={{ title: 'Bodega' }} />
        <Stack.Screen name="NuevaBodega" component={NuevaBodega} options={{ title: 'Nueva bodega' }} />
        <Stack.Screen name="Articulos" component={Articulos} options={{ title: 'Artículos' }} />
        <Stack.Screen name="ArticuloDetalle" component={ArticuloDetalle} options={{ title: 'Kardex' }} />
        <Stack.Screen name="NuevoArticulo" component={NuevoArticulo} options={{ title: 'Nuevo artículo' }} />
        <Stack.Screen name="IngresoArticulos" component={IngresoArticulos} options={{ title: 'Ingreso de artículos' }} />
        <Stack.Screen name="Movimientos" component={Movimientos} options={{ title: 'Guías de movimiento' }} />
        <Stack.Screen name="MovimientoDetalle" component={MovimientoDetalle} options={{ title: 'Guía' }} />
        <Stack.Screen name="NuevoMovimiento" component={NuevoMovimiento} options={{ title: 'Movimiento' }} />
        <Stack.Screen name="Rechazados" component={Rechazados} options={{ title: 'Operaciones rechazadas' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
