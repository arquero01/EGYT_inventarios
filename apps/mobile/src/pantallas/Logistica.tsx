import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, View } from 'react-native';
import type { Pila } from '../navegacion.tsx';
import { Boton, Pantalla, Seccion, Tarjeta, TextoSuave, type NombreIcono } from '../ui/componentes.tsx';
import { color, espacio } from '../ui/tema.ts';

/** Menú del área de logística. */
export function Logistica() {
  const navegar = useNavigation<NativeStackNavigationProp<Pila>>();
  return (
    <Pantalla>
      <Seccion titulo="Registrar">
        <Boton texto="Despacho: de bodega a proyecto" icono="arrow-forward-circle-outline" alTocar={() => navegar.navigate('NuevoMovimiento', { tipo: 'DESPACHO' })} />
        <Boton texto="Traslado entre bodegas" icono="swap-horizontal-outline" variante="secundario" alTocar={() => navegar.navigate('NuevoMovimiento', { tipo: 'TRASLADO' })} />
        <Boton texto="Devolución: de proyecto a bodega" icono="arrow-back-circle-outline" variante="secundario" alTocar={() => navegar.navigate('NuevoMovimiento', { tipo: 'DEVOLUCION' })} />
        <Boton texto="Ingreso de artículos por cantidad" icono="download-outline" variante="secundario" alTocar={() => navegar.navigate('IngresoArticulos')} />
        <Boton texto="Ingreso de equipo con serial" icono="add-circle-outline" variante="secundario" alTocar={() => navegar.navigate('IngresoEquipo')} />
      </Seccion>

      <Seccion titulo="Consultar">
        <Opcion icono="business-outline" titulo="Bodegas" detalle="Qué hay en cada bodega" alTocar={() => navegar.navigate('Bodegas')} />
        <Opcion icono="layers-outline" titulo="Artículos" detalle="Cables, conectores, estructuras… y su kardex" alTocar={() => navegar.navigate('Articulos')} />
        <Opcion icono="document-text-outline" titulo="Guías de movimiento" detalle="Ingresos, despachos, traslados y devoluciones" alTocar={() => navegar.navigate('Movimientos')} />
      </Seccion>
    </Pantalla>
  );
}

function Opcion({ icono, titulo, detalle, alTocar }: { icono: NombreIcono; titulo: string; detalle: string; alTocar: () => void }) {
  return (
    <Tarjeta alTocar={alTocar}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icono} size={26} color={color.primario} style={{ marginRight: espacio.m }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: color.texto }}>{titulo}</Text>
          <TextoSuave>{detalle}</TextoSuave>
        </View>
        <Ionicons name="chevron-forward" size={20} color={color.textoSuave} />
      </View>
    </Tarjeta>
  );
}
