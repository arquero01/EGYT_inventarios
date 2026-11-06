import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO, UNIDADES_CAPACIDAD, type OrigenSerial, type TipoEquipo, type UnidadCapacidad } from '@egt/domain';
import { nuevoId } from '../api.ts';
import { aNumero, hoy, pesos } from '../formato.ts';
import { useFormulario, useLectura } from '../ganchos.ts';
import type { BodegaEnLista, ProyectoEnLista } from '../tipos.ts';
import { Alternativas, Aviso, Boton, Campo, ErrorFormulario, Lista, Pagina } from '../ui/componentes.tsx';

const UNIDAD_SUGERIDA: Record<TipoEquipo, UnidadCapacidad> = {
  PANEL_SOLAR: 'W',
  BATERIA_GEL: 'Ah',
  BATERIA_LITIO: 'kWh',
  INVERSOR: 'W',
  MEDIDOR: 'A',
};

/** RF-06 (equipo), RF-07 (serial único), RF-08 (compra) y RL-02 (bodega de llegada). */
export function IngresoEquipo() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const f = useFormulario();
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const [registrados, setRegistrados] = useState<{ id: string; serial: string }[]>([]);

  const [v, setV] = useState({
    tipo: 'PANEL_SOLAR' as TipoEquipo,
    marca: '',
    modelo: '',
    origenSerial: 'PROVEEDOR' as OrigenSerial,
    serial: '',
    potencia: '',
    unidad: 'W' as UnidadCapacidad,
    proyectoId: params.get('proyectoId') ?? '',
    bodegaId: params.get('bodegaId') ?? '',
    proveedor: '',
    nit: '',
    numeroFactura: '',
    fechaCompra: hoy(),
    valorPagado: '',
  });
  const cambiar = <K extends keyof typeof v>(campo: K) => (valor: (typeof v)[K]) => setV((a) => ({ ...a, [campo]: valor }));
  const [otro, setOtro] = useState(true);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const equipoId = nuevoId();
    const r = await f.enviar('REGISTRAR_INGRESO', {
      equipoId,
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
    const serial = String(r.serial ?? v.serial);
    if (otro) {
      // Mismo tipo, modelo, destino y factura: solo cambia el serial de la siguiente unidad.
      setRegistrados((l) => [{ id: equipoId, serial }, ...l]);
      setV((a) => ({ ...a, serial: '' }));
      document.querySelector<HTMLInputElement>('#campo-serial input')?.focus();
    } else {
      navegar(`/equipos/${equipoId}`);
    }
  };

  const visibles = ['tipo', 'marca', 'modelo', 'origenSerial', 'serial', 'potencia', 'unidad', 'proyectoId', 'bodegaId', 'compra', 'valorPagado'];
  return (
    <Pagina titulo="Ingreso de equipo" descripcion="Registre cada unidad que llega del proveedor. Queda en la bodega elegida y asignada al proyecto." volver={{ a: '/inventario', texto: 'Equipos' }}>
      <form className="formulario" onSubmit={guardar} noValidate style={{ maxWidth: 860 }}>
        {bodegas.datos?.datos.length === 0 ? (
          <Aviso tipo="atencion">
            Primero cree una bodega en <Link to="/bodegas">Bodegas</Link>.
          </Aviso>
        ) : null}
        {proyectos.datos?.datos.length === 0 ? (
          <Aviso tipo="atencion">
            Primero cree un proyecto en <Link to="/proyectos">Proyectos</Link>.
          </Aviso>
        ) : null}
        {registrados.length > 0 ? (
          <Aviso tipo="exito">
            {registrados.length === 1 ? 'Se registró 1 unidad' : `Se registraron ${registrados.length} unidades`}:{' '}
            {registrados.slice(0, 8).map((x, i) => (
              <span key={x.id}>
                {i > 0 ? ', ' : ''}
                <Link className="serial" to={`/equipos/${x.id}`}>
                  {x.serial}
                </Link>
              </span>
            ))}
            {registrados.length > 8 ? ` y ${registrados.length - 8} más` : ''}. Puede seguir con la siguiente.
          </Aviso>
        ) : null}
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={visibles} />

        <fieldset className="grupo-campos superficie" style={{ padding: 20 }}>
          <legend className="visualmente-oculto">Equipo</legend>
          <h2 style={{ fontSize: 'var(--t-l)' }}>Equipo</h2>
          <div className="rejilla-campos">
            <Lista
              etiqueta="Tipo de equipo"
              valor={v.tipo}
              vacia={null}
              alCambiar={(t) => setV((a) => ({ ...a, tipo: t as TipoEquipo, unidad: UNIDAD_SUGERIDA[t as TipoEquipo] }))}
              opciones={TIPOS_EQUIPO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_EQUIPO[t] }))}
              error={f.errorDe('tipo')}
            />
            <Campo etiqueta="Marca" valor={v.marca} alCambiar={cambiar('marca')} error={f.errorDe('marca')} />
            <Campo etiqueta="Modelo" valor={v.modelo} alCambiar={cambiar('modelo')} error={f.errorDe('modelo')} />
            <Campo etiqueta="Potencia o capacidad" valor={v.potencia} alCambiar={cambiar('potencia')} error={f.errorDe('potencia')} modoTeclado="decimal" />
            <Lista etiqueta="Unidad" valor={v.unidad} vacia={null} alCambiar={(u) => cambiar('unidad')(u as UnidadCapacidad)} opciones={UNIDADES_CAPACIDAD.map((u) => ({ valor: u, etiqueta: u }))} error={f.errorDe('unidad')} />
          </div>
          <Alternativas
            etiqueta="Serial"
            valor={v.origenSerial}
            alCambiar={cambiar('origenSerial')}
            opciones={[
              { valor: 'PROVEEDOR', etiqueta: 'Trae serial del proveedor' },
              { valor: 'EMPRESA', etiqueta: 'Asignar serial de la empresa' },
            ]}
            error={f.errorDe('origenSerial')}
          />
          {v.origenSerial === 'PROVEEDOR' ? (
            <div id="campo-serial" style={{ maxWidth: 360 }}>
              <Campo etiqueta="Número de serial" valor={v.serial} alCambiar={cambiar('serial')} error={f.errorDe('serial')} autocompletar="off" />
            </div>
          ) : (
            <p className="suave" style={{ margin: 0 }}>
              El sistema asigna un serial consecutivo de la empresa al guardar.
            </p>
          )}
        </fieldset>

        <fieldset className="grupo-campos superficie" style={{ padding: 20 }}>
          <legend className="visualmente-oculto">Destino</legend>
          <h2 style={{ fontSize: 'var(--t-l)' }}>Destino</h2>
          <div className="rejilla-campos">
            <Lista etiqueta="Proyecto" valor={v.proyectoId} alCambiar={cambiar('proyectoId')} error={f.errorDe('proyectoId')} opciones={(proyectos.datos?.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }))} />
            <Lista etiqueta="Bodega donde llega" valor={v.bodegaId} alCambiar={cambiar('bodegaId')} error={f.errorDe('bodegaId')} opciones={(bodegas.datos?.datos ?? []).map((b) => ({ valor: b.id, etiqueta: b.nombre }))} />
          </div>
        </fieldset>

        <fieldset className="grupo-campos superficie" style={{ padding: 20 }}>
          <legend className="visualmente-oculto">Compra</legend>
          <h2 style={{ fontSize: 'var(--t-l)' }}>Compra</h2>
          <div className="rejilla-campos">
            <Campo etiqueta="Proveedor" valor={v.proveedor} alCambiar={cambiar('proveedor')} error={f.errorDe('compra.proveedor')} />
            <Campo etiqueta="NIT del proveedor" valor={v.nit} alCambiar={cambiar('nit')} error={f.errorDe('compra.nit')} ayuda="Por ejemplo: 900123456-7" />
            <Campo etiqueta="Número de factura" valor={v.numeroFactura} alCambiar={cambiar('numeroFactura')} error={f.errorDe('compra.numeroFactura')} />
            <Campo etiqueta="Fecha de compra" tipo="date" valor={v.fechaCompra} alCambiar={cambiar('fechaCompra')} error={f.errorDe('compra.fechaCompra')} />
            <Campo
              etiqueta="Valor pagado por esta unidad"
              valor={v.valorPagado}
              alCambiar={cambiar('valorPagado')}
              error={f.errorDe('valorPagado')}
              modoTeclado="numeric"
              ayuda={aNumero(v.valorPagado) > 0 ? pesos(aNumero(v.valorPagado)) : 'En pesos, sin puntos'}
            />
          </div>
        </fieldset>

        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="checkbox" checked={otro} onChange={(e) => setOtro(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--azul)' }} />
          Después de guardar, seguir con otra unidad de la misma factura
        </label>
        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Registrar ingreso
          </Boton>
        </div>
      </form>
    </Pagina>
  );
}
