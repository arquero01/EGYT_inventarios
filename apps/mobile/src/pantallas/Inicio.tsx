import { useFocusEffect, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { leerAjustes, sincronizar } from '../api/cliente.ts';
import type { ResumenInventario, StockPorTipo } from '../api/tipos.ts';
import type { Pestanas, Pila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, Cargando, Pantalla, Seccion, Tarjeta, TextoSuave } from '../ui/componentes.tsx';
import { useCola, useLectura } from '../ui/ganchos.ts';
import { color, espacio, radio } from '../ui/tema.ts';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<Pestanas, 'Inicio'>, NativeStackNavigationProp<Pila>>;

/** RF-18 (resumen general) y RF-10 (stock por tipo). */
export function Inicio() {
  const navegar = useNavigation<Nav>();
  const [sinServidor, setSinServidor] = useState(false);
  const resumen = useLectura<ResumenInventario>('/inventario/resumen');
  const stock = useLectura<StockPorTipo>('/inventario/stock-por-tipo');
  const cola = useCola();
  const [sincronizando, setSincronizando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      leerAjustes().then((a) => setSinServidor(!a.servidor));
    }, []),
  );

  const recargar = () => {
    resumen.recargar();
    stock.recargar();
  };

  const sincronizarAhora = async () => {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      Alert.alert('Sincronización', `Enviadas: ${r.enviados}. Rechazadas: ${r.rechazados}.`);
      recargar();
    } catch {
      Alert.alert('Sin conexión', 'No se pudo contactar el servidor. Se intentará de nuevo automáticamente.');
    } finally {
      setSincronizando(false);
    }
  };

  const r = resumen.datos;
  return (
    <Pantalla alRecargar={recargar} recargando={resumen.cargando && !!r}>
      {sinServidor ? (
        <>
          <Aviso tipo="aviso">Antes de empezar, configure la dirección del servidor.</Aviso>
          <Boton texto="Ir a Ajustes" icono="settings-outline" alTocar={() => navegar.navigate('Ajustes')} />
        </>
      ) : null}

      {cola.pendientes > 0 ? (
        <Tarjeta estilo={{ backgroundColor: color.avisoSuave, borderColor: color.atencion }}>
          <Text style={{ fontWeight: '700', color: color.aviso }}>
            {cola.pendientes} {cola.pendientes === 1 ? 'operación pendiente' : 'operaciones pendientes'} de enviar
          </Text>
          <TextoSuave>Se hicieron sin conexión. Se envían solas cuando vuelve la señal.</TextoSuave>
          <Boton texto="Sincronizar ahora" variante="secundario" icono="sync-outline" cargando={sincronizando} alTocar={sincronizarAhora} />
        </Tarjeta>
      ) : null}
      {cola.rechazados > 0 ? (
        <Tarjeta alTocar={() => navegar.navigate('Rechazados')} estilo={{ backgroundColor: color.peligroSuave, borderColor: color.peligro }}>
          <Text style={{ fontWeight: '700', color: color.peligro }}>
            {cola.rechazados} {cola.rechazados === 1 ? 'operación rechazada' : 'operaciones rechazadas'} al sincronizar
          </Text>
          <TextoSuave>Toque para revisarlas.</TextoSuave>
        </Tarjeta>
      ) : null}

      {resumen.desactualizado ? <AvisoDesactualizado guardadoEn={resumen.guardadoEn} /> : null}
      {resumen.error && !sinServidor ? <Aviso tipo="error">{resumen.error.message} {resumen.error.error.detalles[0]?.problema ?? ''}</Aviso> : null}

      <Seccion titulo="Resumen del inventario">
        {!r && resumen.cargando ? <Cargando /> : null}
        {r ? (
          <>
            <View style={estilos.cuadricula}>
              <Cifra titulo="Total" valor={r.total} />
              <Cifra titulo="En stock" valor={r.enStock} tinta={color.info} />
              <Cifra titulo="Instalados" valor={r.instalados} tinta={color.exito} />
              <Cifra titulo="Mantenimiento" valor={r.enMantenimiento} tinta={color.aviso} />
              <Cifra titulo="Dados de baja" valor={r.dadosDeBaja} tinta="#4F5D6B" />
              <Cifra titulo="En bodega / campo" valor={`${r.enBodega} / ${r.enCampo}`} />
            </View>
            {r.total === 0 ? <Aviso>No hay equipos registrados en el sistema actualmente.</Aviso> : null}
          </>
        ) : null}
      </Seccion>

      <Seccion titulo="En stock por tipo">
        {stock.datos?.datos.map((t) => (
          <View key={t.tipo} style={estilos.filaStock}>
            <Text style={{ fontSize: 15, color: color.texto }}>{t.tipoNombre}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.cantidad === 0 ? color.peligro : color.texto }}>
              {t.cantidad === 0 ? 'Sin stock' : t.cantidad}
            </Text>
          </View>
        ))}
      </Seccion>

      <Seccion titulo="Accesos rápidos">
        <Boton texto="Registrar ingreso de equipo" icono="add-circle-outline" alTocar={() => navegar.navigate('IngresoEquipo')} />
        <Boton texto="Nuevo despacho a proyecto" icono="arrow-forward-circle-outline" variante="secundario" alTocar={() => navegar.navigate('NuevoMovimiento', { tipo: 'DESPACHO' })} />
        <Boton texto="Buscar equipo" icono="search-outline" variante="secundario" alTocar={() => navegar.navigate('Inventario')} />
      </Seccion>
    </Pantalla>
  );
}

function Cifra({ titulo, valor, tinta = color.texto }: { titulo: string; valor: number | string; tinta?: string }) {
  return (
    <View style={estilos.cifra}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tinta }}>{valor}</Text>
      <Text style={{ fontSize: 13, color: color.textoSuave, marginTop: 2 }}>{titulo}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cuadricula: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.s },
  cifra: { width: '48.5%', backgroundColor: color.superficie, borderRadius: radio, borderWidth: 1, borderColor: color.borde, padding: espacio.m },
  filaStock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: color.superficie,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.m,
    borderBottomWidth: 1,
    borderBottomColor: color.borde,
  },
});
