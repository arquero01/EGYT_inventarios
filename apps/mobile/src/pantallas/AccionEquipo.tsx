import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { Accion } from '@egt/domain';
import { leerSesion, nuevoId } from '../api/cliente.ts';
import type { ProyectoEnLista } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, Boton, Campo, Pantalla, Selector, TextoSuave, Titulo } from '../ui/componentes.tsx';
import { hoy } from '../ui/formato.ts';
import { useFormulario, useLectura } from '../ui/ganchos.ts';

const TITULO: Record<Accion, string> = {
  INSTALAR: 'Instalar a usuario final',
  RETIRAR: 'Retirar de la vivienda',
  ENVIAR_A_MANTENIMIENTO: 'Enviar a mantenimiento',
  FINALIZAR_MANTENIMIENTO: 'Finalizar mantenimiento',
  CAMBIAR_PROYECTO: 'Cambiar de proyecto',
  DAR_DE_BAJA: 'Dar de baja',
};

/** RF-11 a RF-15 y RF-03: una pantalla por cada acción sobre el equipo. */
export function AccionEquipo({ route, navigation }: PropsPila<'AccionEquipo'>) {
  const { equipoId, serial, accion, proyectoId, ubicacion } = route.params;
  const f = useFormulario();
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>(accion === 'CAMBIAR_PROYECTO' ? '/proyectos' : null);

  const [v, setV] = useState({
    nombre: '',
    cedula: '',
    telefono: '',
    vereda: ubicacion.vereda,
    municipio: ubicacion.municipio,
    departamento: ubicacion.departamento,
    fechaInstalacion: hoy(),
    tecnico: '',
    motivo: '',
    observacion: '',
    proyectoId: '',
  });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  useEffect(() => {
    navigation.setOptions({ title: TITULO[accion] });
    leerSesion().then((s) => s && setV((x) => (x.tecnico ? x : { ...x, tecnico: s.usuario.nombre })));
  }, [accion, navigation]);

  const armar = (): { tipo: Parameters<typeof f.enviar>[0]; payload: Record<string, unknown> } => {
    switch (accion) {
      case 'INSTALAR':
        return {
          tipo: 'INSTALAR_EQUIPO',
          payload: {
            equipoId,
            instalacionId: nuevoId(),
            usuario: { nombre: v.nombre, cedula: v.cedula, telefono: v.telefono },
            ubicacion: { vereda: v.vereda, municipio: v.municipio, departamento: v.departamento },
            fechaInstalacion: v.fechaInstalacion,
            tecnico: v.tecnico,
          },
        };
      case 'RETIRAR':
        return { tipo: 'RETIRAR_EQUIPO', payload: { equipoId, motivo: v.motivo } };
      case 'ENVIAR_A_MANTENIMIENTO':
        return { tipo: 'ENVIAR_A_MANTENIMIENTO', payload: { equipoId, motivo: v.motivo } };
      case 'FINALIZAR_MANTENIMIENTO':
        return { tipo: 'FINALIZAR_MANTENIMIENTO', payload: { equipoId, ...(v.observacion.trim() ? { observacion: v.observacion } : {}) } };
      case 'DAR_DE_BAJA':
        return { tipo: 'DAR_DE_BAJA', payload: { equipoId, motivo: v.motivo } };
      case 'CAMBIAR_PROYECTO':
        return { tipo: 'CAMBIAR_PROYECTO', payload: { equipoId, proyectoId: v.proyectoId } };
    }
  };

  const guardar = async () => {
    const { tipo, payload } = armar();
    const r = await f.enviar(tipo, payload);
    if (r) {
      if (r.estado === 'APLICADO') Alert.alert('Listo', `${TITULO[accion]}: operación registrada.`);
      navigation.goBack();
    }
  };

  const confirmar = () => {
    if (accion !== 'DAR_DE_BAJA') return guardar();
    Alert.alert('Dar de baja', `El equipo ${serial} quedará dado de baja de forma definitiva y no podrá modificarse. ¿Continuar?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Dar de baja', style: 'destructive', onPress: guardar },
    ]);
  };

  const pideMotivo = accion === 'RETIRAR' || accion === 'ENVIAR_A_MANTENIMIENTO' || accion === 'DAR_DE_BAJA';
  return (
    <Pantalla>
      <Titulo>{TITULO[accion]}</Titulo>
      <TextoSuave>Equipo {serial}</TextoSuave>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}

      {accion === 'INSTALAR' ? (
        <>
          <Campo etiqueta="Nombre del usuario final" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('usuario.nombre')} mayusculas="words" />
          <Campo etiqueta="Cédula" valor={v.cedula} alCambiar={cambiar('cedula')} error={f.errorDe('usuario.cedula')} teclado="number-pad" />
          <Campo etiqueta="Teléfono" valor={v.telefono} alCambiar={cambiar('telefono')} error={f.errorDe('usuario.telefono')} teclado="phone-pad" ayuda="10 dígitos" />
          <Campo etiqueta="Vereda" valor={v.vereda} alCambiar={cambiar('vereda')} error={f.errorDe('ubicacion.vereda')} />
          <Campo etiqueta="Municipio" valor={v.municipio} alCambiar={cambiar('municipio')} error={f.errorDe('ubicacion.municipio')} />
          <Campo etiqueta="Departamento" valor={v.departamento} alCambiar={cambiar('departamento')} error={f.errorDe('ubicacion.departamento')} />
          <Campo etiqueta="Fecha de instalación" valor={v.fechaInstalacion} alCambiar={cambiar('fechaInstalacion')} error={f.errorDe('fechaInstalacion')} ayuda="AAAA-MM-DD" teclado="numbers-and-punctuation" />
          <Campo etiqueta="Técnico responsable" valor={v.tecnico} alCambiar={cambiar('tecnico')} error={f.errorDe('tecnico')} mayusculas="words" />
        </>
      ) : null}

      {pideMotivo ? (
        <Campo
          etiqueta="Motivo"
          valor={v.motivo}
          alCambiar={cambiar('motivo')}
          error={f.errorDe('motivo')}
          multilinea
          ayuda={accion === 'RETIRAR' ? 'Mínimo 10 caracteres.' : undefined}
        />
      ) : null}

      {accion === 'FINALIZAR_MANTENIMIENTO' ? (
        <Campo etiqueta="Observación (opcional)" valor={v.observacion} alCambiar={cambiar('observacion')} error={f.errorDe('observacion')} multilinea marcador="Ej.: se cambió el fusible" />
      ) : null}

      {accion === 'CAMBIAR_PROYECTO' ? (
        <Selector
          etiqueta="Nuevo proyecto"
          opciones={(proyectos.datos?.datos ?? []).filter((p) => p.id !== proyectoId).map((p) => ({ valor: p.id, etiqueta: p.nombre, detalle: p.municipio }))}
          valor={v.proyectoId}
          alCambiar={cambiar('proyectoId')}
          error={f.errorDe('proyectoId')}
          vacio={proyectos.cargando ? 'Cargando proyectos…' : 'No hay otros proyectos.'}
        />
      ) : null}

      <Boton
        texto={TITULO[accion]}
        variante={accion === 'DAR_DE_BAJA' ? 'peligro' : 'primario'}
        cargando={f.enviando}
        alTocar={confirmar}
      />
    </Pantalla>
  );
}
