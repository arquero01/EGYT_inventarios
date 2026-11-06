import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { nuevoId } from '../api/cliente.ts';
import type { FichaProyecto, ProyectoEnLista, ResumenProyecto } from '../api/tipos.ts';
import type { Pila, PropsPila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, BotonIcono, Campo, Cargando, FilaDato, InsigniaEstado, Pantalla, Seccion, Tarjeta, TextoSuave, Titulo, Vacio } from '../ui/componentes.tsx';
import { fecha, hoy } from '../ui/formato.ts';
import { useFormulario, useLectura } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';

/** Lista de proyectos con su resumen (RF-05). */
export function Proyectos() {
  const navegar = useNavigation<NativeStackNavigationProp<Pila>>();
  const lista = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');

  return (
    <Pantalla alRecargar={lista.recargar} recargando={lista.cargando && !!lista.datos}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espacio.m }}>
        <TextoSuave>{lista.datos ? `${lista.datos.datos.length} proyectos` : ' '}</TextoSuave>
        <BotonIcono icono="add-circle" etiqueta="Nuevo proyecto" alTocar={() => navegar.navigate('NuevoProyecto')} />
      </View>
      {lista.desactualizado ? <AvisoDesactualizado guardadoEn={lista.guardadoEn} /> : null}
      {lista.error ? <Aviso tipo="error">{lista.error.message}</Aviso> : null}
      {!lista.datos && lista.cargando ? <Cargando /> : null}
      {lista.datos?.datos.length === 0 ? <Vacio texto="Aún no hay proyectos. Cree el primero con el botón +." icono="map-outline" /> : null}
      {lista.datos?.datos.map((p) => (
        <Tarjeta key={p.id} alTocar={() => navegar.navigate('ProyectoDetalle', { proyectoId: p.id })}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: color.texto }}>{p.nombre}</Text>
          <TextoSuave>
            {p.vereda}, {p.municipio} ({p.departamento}) · desde {fecha(p.fechaInicio)}
          </TextoSuave>
          <LineaResumen resumen={p.resumen} />
        </Tarjeta>
      ))}
    </Pantalla>
  );
}

function LineaResumen({ resumen: r }: { resumen: ResumenProyecto }) {
  return (
    <Text style={{ marginTop: espacio.s, fontSize: 13, color: color.textoSuave }}>
      {r.total} equipos · {r.instalados} instalados · {r.enStock} en stock · {r.enMantenimiento} en mantenimiento · {r.dadosDeBaja} de baja
    </Text>
  );
}

/** RF-02 (ficha), RF-04 (equipos del proyecto) y RF-05 (resumen). */
export function ProyectoDetalle({ route, navigation }: PropsPila<'ProyectoDetalle'>) {
  const { proyectoId } = route.params;
  const ficha = useLectura<FichaProyecto>(`/proyectos/${proyectoId}`);
  const d = ficha.datos;
  if (!d) return <Pantalla>{ficha.error ? <Aviso tipo="error">{ficha.error.message}</Aviso> : <Cargando />}</Pantalla>;

  return (
    <Pantalla alRecargar={ficha.recargar} recargando={ficha.cargando}>
      {ficha.desactualizado ? <AvisoDesactualizado guardadoEn={ficha.guardadoEn} /> : null}
      <Titulo>{d.proyecto.nombre}</Titulo>
      <TextoSuave>
        {d.proyecto.vereda}, {d.proyecto.municipio} ({d.proyecto.departamento})
      </TextoSuave>
      {d.proyecto.descripcion ? <Text style={{ marginTop: espacio.s, color: color.texto }}>{d.proyecto.descripcion}</Text> : null}

      <Tarjeta estilo={{ marginTop: espacio.l }}>
        <FilaDato etiqueta="Fecha de inicio" valor={fecha(d.proyecto.fechaInicio)} />
        <FilaDato etiqueta="Usuarios atendidos" valor={d.usuariosAtendidos} />
        <FilaDato etiqueta="Equipos" valor={d.resumen.total} />
        <FilaDato etiqueta="Instalados" valor={d.resumen.instalados} />
        <FilaDato etiqueta="En stock" valor={d.resumen.enStock} />
        <FilaDato etiqueta="En mantenimiento" valor={d.resumen.enMantenimiento} />
        <FilaDato etiqueta="Dados de baja" valor={d.resumen.dadosDeBaja} />
      </Tarjeta>

      <Seccion titulo="Acciones">
        <Boton texto="Registrar ingreso para este proyecto" icono="add-circle-outline" alTocar={() => navigation.navigate('IngresoEquipo', { proyectoId })} />
        <Boton texto="Despachar a este proyecto" icono="arrow-forward-circle-outline" variante="secundario" alTocar={() => navigation.navigate('NuevoMovimiento', { tipo: 'DESPACHO', proyectoId })} />
        <Boton texto="Devolver material a bodega" icono="arrow-back-circle-outline" variante="secundario" alTocar={() => navigation.navigate('NuevoMovimiento', { tipo: 'DEVOLUCION', proyectoId })} />
      </Seccion>

      <Seccion titulo="Equipos del proyecto">
        {d.equipos.length === 0 ? <Aviso>No se encontraron equipos asociados a este proyecto.</Aviso> : null}
        {d.equipos.map((e) => (
          <Tarjeta key={e.id} alTocar={() => navigation.navigate('HojaDeVida', { equipoId: e.id })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: color.texto }}>{e.serial}</Text>
                <TextoSuave>
                  {e.tipoNombre} · {e.marca} {e.modelo}
                </TextoSuave>
              </View>
              <InsigniaEstado estado={e.estado} />
            </View>
          </Tarjeta>
        ))}
      </Seccion>
    </Pantalla>
  );
}

/** RF-01 */
export function NuevoProyecto({ navigation }: PropsPila<'NuevoProyecto'>) {
  const f = useFormulario();
  const [v, setV] = useState({ nombre: '', vereda: '', municipio: '', departamento: '', fechaInicio: hoy(), descripcion: '' });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  const guardar = async () => {
    const proyectoId = nuevoId();
    const r = await f.enviar('CREAR_PROYECTO', { proyectoId, ...v, ...(v.descripcion.trim() ? {} : { descripcion: undefined }) });
    if (!r) return;
    if (r.estado === 'APLICADO') {
      Alert.alert('Proyecto creado', v.nombre);
      navigation.replace('ProyectoDetalle', { proyectoId });
    } else {
      navigation.goBack();
    }
  };

  return (
    <Pantalla>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      <Campo etiqueta="Nombre del proyecto" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('nombre')} />
      <Campo etiqueta="Vereda" valor={v.vereda} alCambiar={cambiar('vereda')} error={f.errorDe('vereda')} mayusculas="words" />
      <Campo etiqueta="Municipio" valor={v.municipio} alCambiar={cambiar('municipio')} error={f.errorDe('municipio')} mayusculas="words" />
      <Campo etiqueta="Departamento" valor={v.departamento} alCambiar={cambiar('departamento')} error={f.errorDe('departamento')} mayusculas="words" />
      <Campo etiqueta="Fecha de inicio" valor={v.fechaInicio} alCambiar={cambiar('fechaInicio')} error={f.errorDe('fechaInicio')} ayuda="AAAA-MM-DD. No puede ser futura." teclado="numbers-and-punctuation" />
      <Campo etiqueta="Descripción (opcional)" valor={v.descripcion} alCambiar={cambiar('descripcion')} error={f.errorDe('descripcion')} multilinea />
      <Boton texto="Crear proyecto" icono="save-outline" cargando={f.enviando} alTocar={guardar} />
    </Pantalla>
  );
}
