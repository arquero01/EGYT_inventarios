import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { UNIDADES_MEDIDA, type UnidadMedida } from '@egt/domain';
import { nuevoId } from '../api/cliente.ts';
import type { ArticuloEnLista, BodegaEnLista, Kardex } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, BotonIcono, Campo, Cargando, FilaDato, Pantalla, Seccion, Selector, Tarjeta, TextoSuave, Titulo, Vacio } from '../ui/componentes.tsx';
import { aNumero, cantidad, fechaHora, hoy, pesos } from '../ui/formato.ts';
import { useFormulario, useLectura } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';

const NOMBRE_UNIDAD: Record<UnidadMedida, string> = {
  UND: 'Unidad',
  PAR: 'Par',
  JUEGO: 'Juego',
  CAJA: 'Caja',
  ROLLO: 'Rollo',
  M: 'Metro',
  KG: 'Kilo',
  L: 'Litro',
};

/** RL-03: artículos que se controlan por cantidad. */
export function Articulos({ navigation }: PropsPila<'Articulos'>) {
  const lista = useLectura<{ datos: ArticuloEnLista[] }>('/articulos');
  return (
    <Pantalla alRecargar={lista.recargar} recargando={lista.cargando && !!lista.datos}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.m }}>
        <TextoSuave>{lista.datos ? `${lista.datos.datos.length} artículos` : ' '}</TextoSuave>
        <BotonIcono icono="add-circle" etiqueta="Nuevo artículo" alTocar={() => navigation.navigate('NuevoArticulo')} />
      </View>
      {lista.desactualizado ? <AvisoDesactualizado guardadoEn={lista.guardadoEn} /> : null}
      {lista.error ? <Aviso tipo="error">{lista.error.message}</Aviso> : null}
      {!lista.datos && lista.cargando ? <Cargando /> : null}
      {lista.datos?.datos.length === 0 ? <Vacio texto="Aún no hay artículos. Cree el primero con el botón +." icono="layers-outline" /> : null}
      {lista.datos?.datos.map((a) => (
        <Tarjeta key={a.id} alTocar={() => navigation.navigate('ArticuloDetalle', { articuloId: a.id })}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: color.texto }}>
            {a.codigo} · {a.nombre}
          </Text>
          <Text style={{ marginTop: espacio.xs, fontSize: 13, color: color.textoSuave }}>
            En bodegas: {cantidad(a.enBodegas)} {a.unidad} · En campo: {cantidad(a.enCampo)} {a.unidad}
          </Text>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

/** RL-09: kardex del artículo. */
export function ArticuloDetalle({ route, navigation }: PropsPila<'ArticuloDetalle'>) {
  const k = useLectura<Kardex>(`/articulos/${route.params.articuloId}`);
  const d = k.datos;
  if (!d) return <Pantalla>{k.error ? <Aviso tipo="error">{k.error.message}</Aviso> : <Cargando />}</Pantalla>;
  return (
    <Pantalla alRecargar={k.recargar} recargando={k.cargando}>
      {k.desactualizado ? <AvisoDesactualizado guardadoEn={k.guardadoEn} /> : null}
      <Titulo>{d.articulo.codigo}</Titulo>
      <TextoSuave>
        {d.articulo.nombre} · se maneja en {NOMBRE_UNIDAD[d.articulo.unidad].toLowerCase()} ({d.articulo.unidad})
      </TextoSuave>

      <Seccion titulo="Dónde está">
        {d.existencias.length === 0 ? <Aviso>Sin existencias.</Aviso> : null}
        {d.existencias.length > 0 ? (
          <Tarjeta>
            {d.existencias.map((e) => (
              <FilaDato key={e.lugar.id} etiqueta={`${e.lugar.tipo === 'BODEGA' ? '📦' : '📍'} ${e.lugar.nombre}`} valor={`${cantidad(e.cantidad)} ${d.articulo.unidad}`} />
            ))}
          </Tarjeta>
        ) : null}
      </Seccion>

      <Seccion titulo="Movimientos">
        {d.aviso ? <Aviso>{d.aviso.mensaje}</Aviso> : null}
        {d.movimientos.map((m) => (
          <Tarjeta key={`${m.movimientoId}`} alTocar={() => navigation.navigate('MovimientoDetalle', { idONumero: m.movimientoId })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', color: color.texto }}>
                {m.numero} · {m.tipoNombre}
              </Text>
              <Text style={{ fontWeight: '700', color: m.tipo === 'INGRESO' ? color.primario : color.texto }}>
                {cantidad(m.cantidad)} {d.articulo.unidad}
              </Text>
            </View>
            <TextoSuave>{rutaMovimiento(m)}</TextoSuave>
            <TextoSuave>{fechaHora(m.ocurridoEn)}</TextoSuave>
          </Tarjeta>
        ))}
      </Seccion>
    </Pantalla>
  );
}

export function rutaMovimiento(m: { tipo: string; origen: string | null; destino: string | null; proyecto: string | null }): string {
  switch (m.tipo) {
    case 'INGRESO':
      return `Proveedor → ${m.destino}`;
    case 'DESPACHO':
      return `${m.origen} → proyecto ${m.proyecto}`;
    case 'TRASLADO':
      return `${m.origen} → ${m.destino}`;
    default:
      return `Proyecto ${m.proyecto} → ${m.destino}`;
  }
}

/** RL-03 */
export function NuevoArticulo({ navigation }: PropsPila<'NuevoArticulo'>) {
  const f = useFormulario();
  const [v, setV] = useState({ codigo: '', nombre: '', unidad: 'UND' as UnidadMedida, descripcion: '' });
  const guardar = async () => {
    const r = await f.enviar('CREAR_ARTICULO', {
      articuloId: nuevoId(),
      codigo: v.codigo,
      nombre: v.nombre,
      unidad: v.unidad,
      ...(v.descripcion.trim() ? { descripcion: v.descripcion } : {}),
    });
    if (!r) return;
    if (r.estado === 'APLICADO') Alert.alert('Artículo creado', `${v.codigo.toUpperCase()} · ${v.nombre}`);
    navigation.goBack();
  };
  return (
    <Pantalla>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      <Campo etiqueta="Código" valor={v.codigo} alCambiar={(c) => setV({ ...v, codigo: c })} error={f.errorDe('codigo')} mayusculas="characters" marcador="Ej.: CAB-6MM" ayuda="Letras, números, punto y guion. Sin espacios." />
      <Campo etiqueta="Nombre" valor={v.nombre} alCambiar={(n) => setV({ ...v, nombre: n })} error={f.errorDe('nombre')} marcador="Ej.: Cable solar 6 mm²" />
      <Selector
        etiqueta="Unidad de medida"
        opciones={UNIDADES_MEDIDA.map((u) => ({ valor: u, etiqueta: NOMBRE_UNIDAD[u] }))}
        valor={v.unidad}
        alCambiar={(u) => setV({ ...v, unidad: u })}
        error={f.errorDe('unidad')}
      />
      <Campo etiqueta="Descripción (opcional)" valor={v.descripcion} alCambiar={(d) => setV({ ...v, descripcion: d })} error={f.errorDe('descripcion')} multilinea />
      <Boton texto="Crear artículo" icono="save-outline" cargando={f.enviando} alTocar={guardar} />
    </Pantalla>
  );
}

interface Renglon {
  articuloId: string;
  etiqueta: string;
  unidad: string;
  cantidad: string;
  valorUnitario: string;
}

/** RL-04: entrada de artículos por cantidad con su factura. */
export function IngresoArticulos({ route, navigation }: PropsPila<'IngresoArticulos'>) {
  const f = useFormulario();
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const catalogo = useLectura<{ datos: ArticuloEnLista[] }>('/articulos');
  const [v, setV] = useState({ bodegaId: route.params?.bodegaId ?? '', proveedor: '', nit: '', numeroFactura: '', fechaCompra: hoy(), observacion: '' });
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [elegido, setElegido] = useState('');
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  const agregar = (id: string) => {
    const a = catalogo.datos?.datos.find((x) => x.id === id);
    if (!a || renglones.some((r) => r.articuloId === id)) return;
    setRenglones([...renglones, { articuloId: id, etiqueta: `${a.codigo} · ${a.nombre}`, unidad: a.unidad, cantidad: '', valorUnitario: '' }]);
    setElegido('');
  };
  const cambiarRenglon = (i: number, campo: 'cantidad' | 'valorUnitario', valor: string) =>
    setRenglones(renglones.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));

  const guardar = async () => {
    const r = await f.enviar('INGRESAR_ARTICULOS', {
      bodegaId: v.bodegaId,
      compra: { proveedor: v.proveedor, nit: v.nit, numeroFactura: v.numeroFactura, fechaCompra: v.fechaCompra },
      items: renglones.map((x) => ({ articuloId: x.articuloId, cantidad: aNumero(x.cantidad), valorUnitario: aNumero(x.valorUnitario) })),
      ...(v.observacion.trim() ? { observacion: v.observacion } : {}),
    });
    if (!r) return;
    if (r.estado === 'APLICADO') {
      Alert.alert('Ingreso registrado', `Guía ${String(r.respuesta.numero)}`);
      navigation.replace('MovimientoDetalle', { idONumero: String(r.respuesta.movimientoId) });
    } else {
      navigation.goBack();
    }
  };

  const total = renglones.reduce((s, x) => s + (aNumero(x.cantidad) || 0) * (aNumero(x.valorUnitario) || 0), 0);
  return (
    <Pantalla>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      <Selector
        etiqueta="Bodega donde llegan"
        opciones={(bodegas.datos?.datos ?? []).map((b) => ({ valor: b.id, etiqueta: b.nombre }))}
        valor={v.bodegaId}
        alCambiar={cambiar('bodegaId')}
        error={f.errorDe('bodegaId')}
        vacio="No hay bodegas. Cree una primero."
      />

      <Seccion titulo="Factura">
        <Campo etiqueta="Proveedor" valor={v.proveedor} alCambiar={cambiar('proveedor')} error={f.errorDe('compra.proveedor')} />
        <Campo etiqueta="NIT" valor={v.nit} alCambiar={cambiar('nit')} error={f.errorDe('compra.nit')} teclado="numbers-and-punctuation" />
        <Campo etiqueta="Número de factura" valor={v.numeroFactura} alCambiar={cambiar('numeroFactura')} error={f.errorDe('compra.numeroFactura')} mayusculas="characters" />
        <Campo etiqueta="Fecha de compra" valor={v.fechaCompra} alCambiar={cambiar('fechaCompra')} error={f.errorDe('compra.fechaCompra')} ayuda="AAAA-MM-DD" teclado="numbers-and-punctuation" />
      </Seccion>

      <Seccion titulo="Artículos recibidos">
        {f.errorDe('items') ? <Aviso tipo="error">{f.errorDe('items')}</Aviso> : null}
        {renglones.map((x, i) => (
          <Tarjeta key={x.articuloId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.s }}>
              <Text style={{ fontWeight: '700', color: color.texto, flex: 1 }}>{x.etiqueta}</Text>
              <Pressable onPress={() => setRenglones(renglones.filter((_, j) => j !== i))} accessibilityLabel="Quitar" hitSlop={10}>
                <Ionicons name="close-circle" size={22} color={color.peligro} />
              </Pressable>
            </View>
            <Campo etiqueta={`Cantidad (${x.unidad})`} valor={x.cantidad} alCambiar={(c) => cambiarRenglon(i, 'cantidad', c)} error={f.errorDe(`items.${i}.cantidad`)} teclado="decimal-pad" />
            <Campo etiqueta="Valor unitario" valor={x.valorUnitario} alCambiar={(c) => cambiarRenglon(i, 'valorUnitario', c)} error={f.errorDe(`items.${i}.valorUnitario`) ?? f.errorDe(`items.${i}.articuloId`)} teclado="number-pad" />
          </Tarjeta>
        ))}
        <Selector
          etiqueta="Agregar artículo"
          opciones={(catalogo.datos?.datos ?? []).filter((a) => !renglones.some((r) => r.articuloId === a.id)).map((a) => ({ valor: a.id, etiqueta: a.codigo, detalle: a.nombre }))}
          valor={elegido}
          alCambiar={agregar}
          vacio="No hay más artículos en el catálogo. Créelos en Logística → Artículos."
        />
        {renglones.length > 0 ? <FilaDato etiqueta="Total de la factura" valor={pesos(total)} /> : null}
      </Seccion>

      <Campo etiqueta="Observación (opcional)" valor={v.observacion} alCambiar={cambiar('observacion')} multilinea />
      <Boton texto="Registrar ingreso" icono="save-outline" cargando={f.enviando} alTocar={guardar} />
    </Pantalla>
  );
}
