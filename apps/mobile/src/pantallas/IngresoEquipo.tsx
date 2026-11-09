import { useState } from 'react';
import { Alert } from 'react-native';
import { NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO, UNIDADES_CAPACIDAD, type OrigenSerial, type TipoEquipo, type UnidadCapacidad } from '@egt/domain';
import { nuevoId } from '../api/cliente.ts';
import type { BodegaEnLista, ProyectoEnLista } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, Boton, Campo, Pantalla, Seccion, Selector } from '../ui/componentes.tsx';
import { aNumero, hoy } from '../ui/formato.ts';
import { useFormulario, useLectura } from '../ui/ganchos.ts';

/** Unidad sugerida para cada tipo de equipo. */
const UNIDAD_SUGERIDA: Record<TipoEquipo, UnidadCapacidad> = {
  PANEL_SOLAR: 'W',
  BATERIA_GEL: 'Ah',
  BATERIA_LITIO: 'kWh',
  INVERSOR: 'W',
  MEDIDOR: 'A',
  CONTROLADOR: 'A',
};

/** RF-06 (equipo), RF-07 (serial único), RF-08 (compra) y RL-02 (bodega de llegada). */
export function IngresoEquipo({ route, navigation }: PropsPila<'IngresoEquipo'>) {
  const f = useFormulario();
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');

  const [v, setV] = useState({
    tipo: 'PANEL_SOLAR' as TipoEquipo,
    marca: '',
    modelo: '',
    origenSerial: 'PROVEEDOR' as OrigenSerial,
    serial: '',
    potencia: '',
    unidad: 'W' as UnidadCapacidad,
    proyectoId: route.params?.proyectoId ?? '',
    bodegaId: route.params?.bodegaId ?? '',
    proveedor: '',
    nit: '',
    numeroFactura: '',
    fechaCompra: hoy(),
    valorPagado: '',
  });
  const cambiar = <K extends keyof typeof v>(campo: K) => (valor: (typeof v)[K]) => setV((a) => ({ ...a, [campo]: valor }));

  const guardar = async (otro: boolean) => {
    const r = await f.enviar('REGISTRAR_INGRESO', {
      equipoId: nuevoId(),
      tipo: v.tipo,
      marca: v.marca,
      modelo: v.modelo,
      origenSerial: v.origenSerial,
      ...(v.origenSerial === 'PROVEEDOR' ? { serial: v.serial } : {}),
      potencia: aNumero(v.potencia),
      unidad: v.unidad,
      proyectoId: v.proyectoId,
      bodegaId: v.bodegaId,
      compra: { proveedor: v.proveedor, nit: v.nit, numeroFactura: v.numeroFactura, fechaCompra: v.fechaCompra },
      valorPagado: aNumero(v.valorPagado),
    });
    if (!r) return;
    const serial = r.estado === 'APLICADO' ? String(r.respuesta.serial ?? v.serial) : v.serial || '(se asignará al sincronizar)';
    if (otro) {
      // Mismo tipo, modelo, proyecto, bodega y factura: solo cambia el serial.
      setV((a) => ({ ...a, serial: '' }));
      if (r.estado === 'APLICADO') Alert.alert('Equipo registrado', `Serial ${serial}. Puede registrar la siguiente unidad.`);
    } else {
      if (r.estado === 'APLICADO') Alert.alert('Equipo registrado', `Serial ${serial}.`);
      navigation.goBack();
    }
  };

  const sinBodegas = bodegas.datos && bodegas.datos.datos.length === 0;
  const sinProyectos = proyectos.datos && proyectos.datos.datos.length === 0;
  return (
    <Pantalla>
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      {sinBodegas ? <Aviso tipo="aviso">Primero cree una bodega en Logística → Bodegas.</Aviso> : null}
      {sinProyectos ? <Aviso tipo="aviso">Primero cree un proyecto en la pestaña Proyectos.</Aviso> : null}

      <Seccion titulo="Equipo">
        <Selector
          etiqueta="Tipo de equipo"
          opciones={TIPOS_EQUIPO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_EQUIPO[t] }))}
          valor={v.tipo}
          alCambiar={(t) => setV((a) => ({ ...a, tipo: t, unidad: UNIDAD_SUGERIDA[t] }))}
          error={f.errorDe('tipo')}
        />
        <Campo etiqueta="Marca" valor={v.marca} alCambiar={cambiar('marca')} error={f.errorDe('marca')} />
        <Campo etiqueta="Modelo" valor={v.modelo} alCambiar={cambiar('modelo')} error={f.errorDe('modelo')} />
        <Selector
          etiqueta="Serial"
          opciones={[
            { valor: 'PROVEEDOR' as const, etiqueta: 'Trae serial del proveedor' },
            { valor: 'EMPRESA' as const, etiqueta: 'Asignar serial de la empresa' },
          ]}
          valor={v.origenSerial}
          alCambiar={cambiar('origenSerial')}
          error={f.errorDe('origenSerial')}
        />
        {v.origenSerial === 'PROVEEDOR' ? (
          <Campo etiqueta="Número de serial" valor={v.serial} alCambiar={cambiar('serial')} error={f.errorDe('serial')} mayusculas="characters" />
        ) : (
          <Aviso>El sistema asignará un serial EGT consecutivo al guardar.</Aviso>
        )}
        <Campo etiqueta="Potencia o capacidad" valor={v.potencia} alCambiar={cambiar('potencia')} error={f.errorDe('potencia')} teclado="decimal-pad" />
        <Selector
          etiqueta="Unidad"
          opciones={UNIDADES_CAPACIDAD.map((u) => ({ valor: u, etiqueta: u }))}
          valor={v.unidad}
          alCambiar={cambiar('unidad')}
          error={f.errorDe('unidad')}
        />
      </Seccion>

      <Seccion titulo="Destino">
        <Selector
          etiqueta="Proyecto"
          opciones={(proyectos.datos?.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre, detalle: p.municipio }))}
          valor={v.proyectoId}
          alCambiar={cambiar('proyectoId')}
          error={f.errorDe('proyectoId')}
          vacio={proyectos.cargando ? 'Cargando…' : 'No hay proyectos.'}
        />
        <Selector
          etiqueta="Bodega donde llega"
          opciones={(bodegas.datos?.datos ?? []).map((b) => ({ valor: b.id, etiqueta: b.nombre, detalle: b.municipio }))}
          valor={v.bodegaId}
          alCambiar={cambiar('bodegaId')}
          error={f.errorDe('bodegaId')}
          vacio={bodegas.cargando ? 'Cargando…' : 'No hay bodegas.'}
        />
      </Seccion>

      <Seccion titulo="Compra">
        <Campo etiqueta="Proveedor" valor={v.proveedor} alCambiar={cambiar('proveedor')} error={f.errorDe('compra.proveedor')} />
        <Campo etiqueta="NIT del proveedor" valor={v.nit} alCambiar={cambiar('nit')} error={f.errorDe('compra.nit')} teclado="numbers-and-punctuation" ayuda="Ej.: 900123456-7" />
        <Campo etiqueta="Número de factura" valor={v.numeroFactura} alCambiar={cambiar('numeroFactura')} error={f.errorDe('compra.numeroFactura')} mayusculas="characters" />
        <Campo etiqueta="Fecha de compra" valor={v.fechaCompra} alCambiar={cambiar('fechaCompra')} error={f.errorDe('compra.fechaCompra')} ayuda="AAAA-MM-DD" teclado="numbers-and-punctuation" />
        <Campo etiqueta="Valor pagado por esta unidad" valor={v.valorPagado} alCambiar={cambiar('valorPagado')} error={f.errorDe('valorPagado')} teclado="number-pad" marcador="Ej.: 520000" />
      </Seccion>

      <Boton texto="Guardar" icono="save-outline" cargando={f.enviando} alTocar={() => guardar(false)} />
      <Boton texto="Guardar y registrar otra unidad" variante="secundario" deshabilitado={f.enviando} alTocar={() => guardar(true)} />
    </Pantalla>
  );
}
