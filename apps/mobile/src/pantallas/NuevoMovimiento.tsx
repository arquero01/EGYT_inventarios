import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { NOMBRE_MOVIMIENTO, type TipoComando } from '@egt/domain';
import { leerSesion } from '../api/cliente.ts';
import type { ArticuloConCantidad, BodegaEnLista, EquipoEnLista, ListaEquipos, ProyectoEnLista } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, Boton, Campo, Cargando, Casilla, InsigniaEstado, Pantalla, Seccion, Selector, Tarjeta, TextoSuave } from '../ui/componentes.tsx';
import { aNumero, cantidad } from '../ui/formato.ts';
import { useFormulario, useLectura } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';

const COMANDO: Record<'DESPACHO' | 'TRASLADO' | 'DEVOLUCION', TipoComando> = {
  DESPACHO: 'REGISTRAR_DESPACHO',
  TRASLADO: 'REGISTRAR_TRASLADO',
  DEVOLUCION: 'REGISTRAR_DEVOLUCION',
};

/**
 * RL-05 (despacho), RL-06 (traslado) y RL-07 (devolución). Una misma guía
 * puede llevar equipos con serial y artículos por cantidad.
 */
export function NuevoMovimiento({ route, navigation }: PropsPila<'NuevoMovimiento'>) {
  const { tipo } = route.params;
  const f = useFormulario();
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>(tipo === 'TRASLADO' ? null : '/proyectos');

  const [origen, setOrigen] = useState(tipo === 'DEVOLUCION' ? route.params.proyectoId ?? '' : route.params.bodegaId ?? '');
  const [destino, setDestino] = useState(tipo === 'DESPACHO' ? route.params.proyectoId ?? '' : '');
  const [responsable, setResponsable] = useState('');
  const [observacion, setObservacion] = useState('');
  const [equiposElegidos, setEquiposElegidos] = useState<Set<string>>(new Set(route.params.equipoId ? [route.params.equipoId] : []));
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  useEffect(() => {
    navigation.setOptions({ title: NOMBRE_MOVIMIENTO[tipo] });
    leerSesion().then((s) => s && setResponsable((r) => r || s.usuario.nombre));
  }, [navigation, tipo]);

  // Equipos y artículos disponibles en el lugar de origen.
  const rutaEquipos = !origen
    ? null
    : tipo === 'DEVOLUCION'
      ? `/equipos?proyectoId=${origen}&ubicacion=CAMPO&porPagina=100`
      : `/equipos?bodegaId=${origen}${tipo === 'DESPACHO' ? '&estado=EN_STOCK' : ''}&porPagina=100`;
  const equipos = useLectura<ListaEquipos>(rutaEquipos);
  const articulos = useLectura<{ datos: ArticuloConCantidad[] }>(!origen ? null : tipo === 'DEVOLUCION' ? `/existencias?proyectoId=${origen}` : `/existencias?bodegaId=${origen}`);

  const disponibles = (equipos.datos?.datos ?? []).filter((e) => e.estado !== 'DADO_DE_BAJA' && e.estado !== 'INSTALADO');
  const instaladosEnCampo = tipo === 'DEVOLUCION' ? (equipos.datos?.datos ?? []).filter((e) => e.estado === 'INSTALADO').length : 0;

  const cambiarOrigen = (id: string) => {
    setOrigen(id);
    setEquiposElegidos(new Set());
    setCantidades({});
  };
  const alternar = (id: string, marcar: boolean) => {
    const s = new Set(equiposElegidos);
    if (marcar) s.add(id);
    else s.delete(id);
    setEquiposElegidos(s);
  };

  const guardar = async () => {
    const lugares =
      tipo === 'DESPACHO'
        ? { bodegaOrigenId: origen, proyectoId: destino }
        : tipo === 'TRASLADO'
          ? { bodegaOrigenId: origen, bodegaDestinoId: destino }
          : { proyectoId: origen, bodegaDestinoId: destino };
    const lineas = Object.entries(cantidades)
      .filter(([, c]) => c.trim() !== '')
      .map(([articuloId, c]) => ({ articuloId, cantidad: aNumero(c) }));
    const r = await f.enviar(COMANDO[tipo], {
      ...lugares,
      equipos: [...equiposElegidos],
      articulos: lineas,
      responsable,
      ...(observacion.trim() ? { observacion } : {}),
    });
    if (!r) return;
    if (r.estado === 'APLICADO') {
      Alert.alert('Movimiento registrado', `Guía ${String(r.respuesta.numero)}`);
      navigation.replace('MovimientoDetalle', { idONumero: String(r.respuesta.movimientoId) });
    } else {
      navigation.goBack();
    }
  };

  const opcionesBodega = (excluir?: string) =>
    (bodegas.datos?.datos ?? []).filter((b) => b.id !== excluir).map((b) => ({ valor: b.id, etiqueta: b.nombre, detalle: b.municipio }));
  const opcionesProyecto = (proyectos.datos?.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre, detalle: p.municipio }));

  return (
    <Pantalla>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}

      <Seccion titulo="Ruta">
        {tipo === 'DEVOLUCION' ? (
          <Selector etiqueta="Desde el proyecto" opciones={opcionesProyecto} valor={origen} alCambiar={cambiarOrigen} error={f.errorDe('proyectoId')} />
        ) : (
          <Selector etiqueta="Desde la bodega" opciones={opcionesBodega()} valor={origen} alCambiar={cambiarOrigen} error={f.errorDe('bodegaOrigenId')} vacio="No hay bodegas." />
        )}
        {tipo === 'DESPACHO' ? (
          <Selector etiqueta="Hacia el proyecto" opciones={opcionesProyecto} valor={destino} alCambiar={setDestino} error={f.errorDe('proyectoId')} vacio="No hay proyectos." />
        ) : (
          <Selector
            etiqueta="Hacia la bodega"
            opciones={opcionesBodega(tipo === 'TRASLADO' ? origen : undefined)}
            valor={destino}
            alCambiar={setDestino}
            error={f.errorDe('bodegaDestinoId')}
            vacio="No hay otra bodega."
          />
        )}
      </Seccion>

      {origen ? (
        <>
          <Seccion titulo={`Equipos (${equiposElegidos.size} elegidos)`}>
            {f.errorDe('equipos') ? <Aviso tipo="error">{f.errorDe('equipos')}</Aviso> : null}
            {equipos.cargando && !equipos.datos ? <Cargando texto="Buscando equipos…" /> : null}
            {equipos.datos && disponibles.length === 0 ? <TextoSuave>No hay equipos para mover desde aquí.</TextoSuave> : null}
            {instaladosEnCampo > 0 ? (
              <Aviso>
                {instaladosEnCampo} {instaladosEnCampo === 1 ? 'equipo está instalado' : 'equipos están instalados'} en viviendas: primero hay que retirarlos (RF-13).
              </Aviso>
            ) : null}
            {disponibles.length > 0 ? (
              <Tarjeta>
                {disponibles.map((e) => (
                  <FilaEquipo key={e.id} equipo={e} marcado={equiposElegidos.has(e.id)} alCambiar={(m) => alternar(e.id, m)} />
                ))}
              </Tarjeta>
            ) : null}
          </Seccion>

          <Seccion titulo="Artículos por cantidad">
            {f.errorDe('articulos') ? <Aviso tipo="error">{f.errorDe('articulos')}</Aviso> : null}
            {articulos.datos && articulos.datos.datos.length === 0 ? <TextoSuave>No hay artículos con existencias aquí.</TextoSuave> : null}
            {articulos.datos?.datos.map((a) => {
              // Posición del artículo en la lista enviada, para ubicar el error del servidor.
              const indice = Object.keys(cantidades).filter((k) => cantidades[k]?.trim()).indexOf(a.id);
              return (
                <Campo
                  key={a.id}
                  etiqueta={`${a.codigo} · ${a.nombre}`}
                  valor={cantidades[a.id] ?? ''}
                  alCambiar={(c) => setCantidades({ ...cantidades, [a.id]: c })}
                  teclado="decimal-pad"
                  marcador="0"
                  ayuda={`Disponible: ${cantidad(a.cantidad)} ${a.unidad}`}
                  error={indice >= 0 ? f.errorDe(`articulos.${indice}`) : undefined}
                />
              );
            })}
          </Seccion>
        </>
      ) : (
        <Aviso>Elija el origen para ver qué se puede mover.</Aviso>
      )}

      <Campo etiqueta="Responsable" valor={responsable} alCambiar={setResponsable} error={f.errorDe('responsable')} mayusculas="words" ayuda="Quién transporta o recibe el material." />
      <Campo etiqueta="Observación (opcional)" valor={observacion} alCambiar={setObservacion} error={f.errorDe('observacion')} multilinea />
      <Boton texto={`Registrar ${NOMBRE_MOVIMIENTO[tipo].toLowerCase()}`} icono="save-outline" cargando={f.enviando} alTocar={guardar} />
    </Pantalla>
  );
}

function FilaEquipo({ equipo: e, marcado, alCambiar }: { equipo: EquipoEnLista; marcado: boolean; alCambiar: (m: boolean) => void }) {
  return (
    <Casilla marcada={marcado} alCambiar={alCambiar}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1, marginRight: espacio.s }}>
          <Text style={{ fontWeight: '700', color: color.texto }}>{e.serial}</Text>
          <Text style={{ fontSize: 13, color: color.textoSuave }}>
            {e.tipoNombre} · {e.marca} {e.modelo}
          </Text>
        </View>
        <InsigniaEstado estado={e.estado} />
      </View>
    </Casilla>
  );
}
