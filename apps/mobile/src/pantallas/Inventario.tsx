import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ESTADOS_EQUIPO, NOMBRE_ESTADO, NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO, type EstadoEquipo, type TipoEquipo, type Ubicacion } from '@egt/domain';
import type { EquipoEnLista, ListaEquipos } from '../api/tipos.ts';
import type { Pila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, BotonIcono, Campo, Cargando, InsigniaEstado, Pantalla, Selector, Tarjeta, TextoSuave } from '../ui/componentes.tsx';
import { useLectura } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';

type Todos = 'TODOS';

/**
 * Arma "?a=1&b=2" omitiendo los valores vacíos. Se hace a mano porque el
 * URLSearchParams de React Native no implementa todos sus métodos.
 */
function consulta(valores: Record<string, string | undefined>): string {
  const partes = Object.entries(valores)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  return partes.length ? `?${partes.join('&')}` : '';
}
const TODOS = { valor: 'TODOS' as Todos, etiqueta: 'Todos' };

/** RF-19 (listado), RF-20 (por estado), RF-21 (por tipo), RF-22 (búsqueda). */
export function Inventario() {
  const navegar = useNavigation<NativeStackNavigationProp<Pila>>();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoEquipo | Todos>('TODOS');
  const [tipo, setTipo] = useState<TipoEquipo | Todos>('TODOS');
  const [ubicacion, setUbicacion] = useState<Ubicacion | Todos>('TODOS');
  const [pagina, setPagina] = useState(1);
  const [verFiltros, setVerFiltros] = useState(false);

  const q = busqueda.trim();
  const lista = useLectura<ListaEquipos>(
    `/equipos${consulta({
      pagina: String(pagina),
      porPagina: '20',
      q: q.length >= 2 ? q : undefined,
      estado: estado === 'TODOS' ? undefined : estado,
      tipo: tipo === 'TODOS' ? undefined : tipo,
      ubicacion: ubicacion === 'TODOS' ? undefined : ubicacion,
    })}`,
  );

  const cambiar = <T,>(fijar: (v: T) => void) => (v: T) => {
    fijar(v);
    setPagina(1);
  };

  const p = lista.datos?.paginacion;
  return (
    <Pantalla alRecargar={lista.recargar} recargando={lista.cargando && !!lista.datos}>
      <Campo
        etiqueta="Buscar"
        valor={busqueda}
        alCambiar={cambiar(setBusqueda)}
        marcador="Serial, marca, modelo, proveedor, proyecto o usuario"
        mayusculas="none"
        ayuda={q.length === 1 ? 'Escriba al menos 2 caracteres.' : undefined}
      />
      <Boton
        texto={verFiltros ? 'Ocultar filtros' : 'Filtrar por estado, tipo o ubicación'}
        icono="filter-outline"
        variante="secundario"
        alTocar={() => setVerFiltros(!verFiltros)}
      />
      {verFiltros ? (
        <View style={{ marginTop: espacio.l }}>
          <Selector
            etiqueta="Estado"
            opciones={[TODOS, ...ESTADOS_EQUIPO.map((e) => ({ valor: e, etiqueta: NOMBRE_ESTADO[e] }))]}
            valor={estado}
            alCambiar={cambiar(setEstado)}
          />
          <Selector
            etiqueta="Tipo"
            opciones={[TODOS, ...TIPOS_EQUIPO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_EQUIPO[t] }))]}
            valor={tipo}
            alCambiar={cambiar(setTipo)}
          />
          <Selector
            etiqueta="Ubicación"
            opciones={[TODOS, { valor: 'BODEGA' as const, etiqueta: 'En bodega' }, { valor: 'CAMPO' as const, etiqueta: 'En campo' }]}
            valor={ubicacion}
            alCambiar={cambiar(setUbicacion)}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: espacio.m }}>
        <TextoSuave>{p ? `${p.total} ${p.total === 1 ? 'equipo' : 'equipos'}` : ' '}</TextoSuave>
        <BotonIcono icono="add-circle" etiqueta="Registrar ingreso" alTocar={() => navegar.navigate('IngresoEquipo')} />
      </View>

      {lista.desactualizado ? <AvisoDesactualizado guardadoEn={lista.guardadoEn} /> : null}
      {lista.error ? <Aviso tipo="error">{lista.error.message}</Aviso> : null}
      {!lista.datos && lista.cargando ? <Cargando /> : null}
      {lista.datos?.aviso ? <Aviso>{lista.datos.aviso.mensaje}</Aviso> : null}

      {lista.datos?.datos.map((e) => <TarjetaEquipo key={e.id} equipo={e} alTocar={() => navegar.navigate('HojaDeVida', { equipoId: e.id })} />)}

      {p && p.totalPaginas > 1 ? (
        <View style={{ flexDirection: 'row', gap: espacio.s, marginTop: espacio.s }}>
          <View style={{ flex: 1 }}>
            <Boton texto="Anterior" variante="secundario" deshabilitado={pagina <= 1} alTocar={() => setPagina(pagina - 1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Boton texto="Siguiente" variante="secundario" deshabilitado={pagina >= p.totalPaginas} alTocar={() => setPagina(pagina + 1)} />
          </View>
        </View>
      ) : null}
      {p && p.totalPaginas > 1 ? <TextoSuave>Página {p.pagina} de {p.totalPaginas}</TextoSuave> : null}
    </Pantalla>
  );
}

export function TarjetaEquipo({ equipo: e, alTocar }: { equipo: EquipoEnLista; alTocar: () => void }) {
  return (
    <Tarjeta alTocar={alTocar}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, marginRight: espacio.s }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: color.texto }}>{e.serial}</Text>
          <TextoSuave>
            {e.tipoNombre} · {e.marca} {e.modelo}
          </TextoSuave>
        </View>
        <InsigniaEstado estado={e.estado} />
      </View>
      <Text style={{ marginTop: espacio.s, fontSize: 13, color: color.textoSuave }}>
        {e.ubicacion === 'BODEGA' ? `📦 ${e.bodega?.nombre ?? 'Bodega'}` : `📍 En campo · ${e.proyecto.nombre}`}
        {e.usuarioFinal ? ` · ${e.usuarioFinal.nombre}` : ''}
      </Text>
    </Tarjeta>
  );
}
