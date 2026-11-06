import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { nuevoId } from '../api/cliente.ts';
import type { BodegaEnLista, DetalleBodega, ListaEquipos } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, BotonIcono, Campo, Cargando, FilaDato, Pantalla, Seccion, Tarjeta, TextoSuave, Titulo, Vacio } from '../ui/componentes.tsx';
import { cantidad } from '../ui/formato.ts';
import { useFormulario, useLectura } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';
import { TarjetaEquipo } from './Inventario.tsx';

/** RL-01: bodegas activas con lo que guardan. */
export function Bodegas({ navigation }: PropsPila<'Bodegas'>) {
  const lista = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  return (
    <Pantalla alRecargar={lista.recargar} recargando={lista.cargando && !!lista.datos}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.m }}>
        <TextoSuave>{lista.datos ? `${lista.datos.datos.length} bodegas` : ' '}</TextoSuave>
        <BotonIcono icono="add-circle" etiqueta="Nueva bodega" alTocar={() => navigation.navigate('NuevaBodega')} />
      </View>
      {lista.desactualizado ? <AvisoDesactualizado guardadoEn={lista.guardadoEn} /> : null}
      {lista.error ? <Aviso tipo="error">{lista.error.message}</Aviso> : null}
      {!lista.datos && lista.cargando ? <Cargando /> : null}
      {lista.datos?.datos.length === 0 ? <Vacio texto="Aún no hay bodegas. Cree la primera con el botón +." icono="business-outline" /> : null}
      {lista.datos?.datos.map((b) => (
        <Tarjeta key={b.id} alTocar={() => navigation.navigate('BodegaDetalle', { bodegaId: b.id })}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: color.texto }}>{b.nombre}</Text>
          <TextoSuave>
            {b.municipio} ({b.departamento}){b.direccion ? ` · ${b.direccion}` : ''}
          </TextoSuave>
          <Text style={{ marginTop: espacio.s, fontSize: 13, color: color.textoSuave }}>
            {b.equipos} equipos · {b.articulos} artículos con existencias
          </Text>
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

/** RL-11: qué hay hoy en la bodega. */
export function BodegaDetalle({ route, navigation }: PropsPila<'BodegaDetalle'>) {
  const { bodegaId } = route.params;
  const detalle = useLectura<DetalleBodega>(`/bodegas/${bodegaId}`);
  const equipos = useLectura<ListaEquipos>(`/equipos?bodegaId=${bodegaId}&porPagina=100`);
  const d = detalle.datos;
  if (!d) return <Pantalla>{detalle.error ? <Aviso tipo="error">{detalle.error.message}</Aviso> : <Cargando />}</Pantalla>;

  const recargar = () => {
    detalle.recargar();
    equipos.recargar();
  };
  return (
    <Pantalla alRecargar={recargar} recargando={detalle.cargando}>
      {detalle.desactualizado ? <AvisoDesactualizado guardadoEn={detalle.guardadoEn} /> : null}
      <Titulo>{d.bodega.nombre}</Titulo>
      <TextoSuave>
        {d.bodega.municipio} ({d.bodega.departamento}){d.bodega.direccion ? ` · ${d.bodega.direccion}` : ''}
      </TextoSuave>
      {d.aviso ? <Aviso>{d.aviso.mensaje}</Aviso> : null}

      <Seccion titulo="Acciones">
        <Boton texto="Despachar desde esta bodega" icono="arrow-forward-circle-outline" alTocar={() => navigation.navigate('NuevoMovimiento', { tipo: 'DESPACHO', bodegaId })} />
        <Boton texto="Trasladar a otra bodega" icono="swap-horizontal-outline" variante="secundario" alTocar={() => navigation.navigate('NuevoMovimiento', { tipo: 'TRASLADO', bodegaId })} />
        <Boton texto="Ingreso de artículos" icono="download-outline" variante="secundario" alTocar={() => navigation.navigate('IngresoArticulos', { bodegaId })} />
        <Boton texto="Ingreso de equipo" icono="add-circle-outline" variante="secundario" alTocar={() => navigation.navigate('IngresoEquipo', { bodegaId })} />
      </Seccion>

      {d.articulos.length > 0 ? (
        <Seccion titulo="Artículos">
          <Tarjeta>
            {d.articulos.map((a) => (
              <FilaDato key={a.id} etiqueta={`${a.codigo} · ${a.nombre}`} valor={`${cantidad(a.cantidad)} ${a.unidad}`} />
            ))}
          </Tarjeta>
        </Seccion>
      ) : null}

      {d.equipos.length > 0 ? (
        <Seccion titulo="Equipos por tipo y estado">
          <Tarjeta>
            {d.equipos.map((e) => (
              <FilaDato key={`${e.tipo}-${e.estado}`} etiqueta={`${e.tipoNombre} · ${e.estadoNombre}`} valor={e.cantidad} />
            ))}
          </Tarjeta>
        </Seccion>
      ) : null}

      {equipos.datos && equipos.datos.datos.length > 0 ? (
        <Seccion titulo="Equipos en esta bodega">
          {equipos.datos.datos.map((e) => (
            <TarjetaEquipo key={e.id} equipo={e} alTocar={() => navigation.navigate('HojaDeVida', { equipoId: e.id })} />
          ))}
        </Seccion>
      ) : null}
    </Pantalla>
  );
}

/** RL-01 */
export function NuevaBodega({ navigation }: PropsPila<'NuevaBodega'>) {
  const f = useFormulario();
  const [v, setV] = useState({ nombre: '', municipio: '', departamento: '', direccion: '' });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  const guardar = async () => {
    const r = await f.enviar('CREAR_BODEGA', { bodegaId: nuevoId(), nombre: v.nombre, municipio: v.municipio, departamento: v.departamento, ...(v.direccion.trim() ? { direccion: v.direccion } : {}) });
    if (!r) return;
    if (r.estado === 'APLICADO') Alert.alert('Bodega creada', v.nombre);
    navigation.goBack();
  };

  return (
    <Pantalla>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      <Campo etiqueta="Nombre" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('nombre')} marcador="Ej.: Bodega Popayán" />
      <Campo etiqueta="Municipio" valor={v.municipio} alCambiar={cambiar('municipio')} error={f.errorDe('municipio')} mayusculas="words" />
      <Campo etiqueta="Departamento" valor={v.departamento} alCambiar={cambiar('departamento')} error={f.errorDe('departamento')} mayusculas="words" />
      <Campo etiqueta="Dirección (opcional)" valor={v.direccion} alCambiar={cambiar('direccion')} error={f.errorDe('direccion')} />
      <Boton texto="Crear bodega" icono="save-outline" cargando={f.enviando} alTocar={guardar} />
    </Pantalla>
  );
}
