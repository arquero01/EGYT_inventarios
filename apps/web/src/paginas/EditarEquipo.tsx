import { NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO, UNIDADES_CAPACIDAD } from '@egt/domain';
import { useState, type FormEvent } from 'react';
import { numero } from '../importacion.ts';
import { useFormulario } from '../ganchos.ts';
import type { HojaDeVida } from '../tipos.ts';
import { Area, Aviso, Boton, Cajon, Campo, ErrorFormulario, Lista } from '../ui/componentes.tsx';

/**
 * Corregir los datos de un equipo (lo que vino mal en el Excel o quedó "por
 * completar"). Solo se envía lo que cambió; el servidor lo deja en el
 * historial con el valor anterior y el nuevo.
 */

const texto = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));
/** 1000 → "1000"; 5.1 → "5,1" (como se escribe en Colombia). */
const numeroATexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const textoANumero = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  // "5,1" → 5.1; "2.500.000" o "$ 2.500.000" → 2500000
  const n = /^\d+,\d+$/.test(t) ? Number(t.replace(',', '.')) : numero(t);
  return Number.isFinite(n) ? n : NaN;
};

export function EditarEquipo({ hoja, alCerrar, alTerminar }: { hoja: HojaDeVida; alCerrar: () => void; alTerminar: (mensaje: string) => void }) {
  const f = useFormulario();
  const e = hoja.equipo;
  // La instalación vigente o, si no hay, la última.
  const instalacion =
    hoja.instalacionActual ?? [...hoja.instalacionesAnteriores].sort((a, b) => b.fechaInstalacion.localeCompare(a.fechaInstalacion))[0] ?? null;
  const puedeTenerUsuario = Boolean(instalacion) || e.estado !== 'EN_STOCK';

  const inicial = {
    serial: e.serial,
    serialFabricante: texto(e.serialFabricante),
    tipo: e.tipo,
    marca: texto(e.marca),
    modelo: texto(e.modelo),
    descripcion: texto(e.descripcion),
    potencia: numeroATexto(e.potencia),
    unidad: texto(e.unidad),
    zona: texto(e.zona),
    garantiaHasta: texto(e.garantiaHasta),
    valorPagado: numeroATexto(hoja.valorPagado),
    proveedor: texto(hoja.compra?.proveedor),
    nit: texto(hoja.compra?.nit),
    numeroFactura: texto(hoja.compra?.numeroFactura),
    fechaCompra: texto(hoja.compra?.fechaCompra),
    cedula: texto(instalacion?.usuarioFinal.cedula),
    nombre: instalacion?.usuarioFinal.nombre === 'Por completar' ? '' : texto(instalacion?.usuarioFinal.nombre),
    telefono: texto(instalacion?.usuarioFinal.telefono),
    niu: texto(instalacion?.usuarioFinal.niu),
    fechaEntrega: texto(instalacion?.fechaInstalacion),
  };
  const [v, setV] = useState(inicial);
  const [pendientes, setPendientes] = useState<string[]>(e.pendientes);
  const [motivo, setMotivo] = useState('');
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));
  const cambio = (campo: keyof typeof v) => v[campo].trim() !== inicial[campo].trim();

  const armar = (): Record<string, unknown> | string => {
    const p: Record<string, unknown> = { equipoId: e.id };
    if (cambio('serial')) p.serial = v.serial;
    for (const campo of ['serialFabricante', 'marca', 'modelo', 'descripcion', 'zona'] as const) {
      if (cambio(campo)) p[campo] = v[campo].trim() || null;
    }
    if (cambio('tipo')) p.tipo = v.tipo;
    if (cambio('potencia') || cambio('unidad')) {
      const n = textoANumero(v.potencia);
      if (Number.isNaN(n)) return 'potencia';
      p.potencia = n;
      p.unidad = v.unidad || null;
    }
    if (cambio('garantiaHasta')) p.garantiaHasta = v.garantiaHasta || null;
    if (cambio('valorPagado')) {
      const n = textoANumero(v.valorPagado);
      if (Number.isNaN(n)) return 'valorPagado';
      p.valorPagado = n;
    }
    if (cambio('proveedor') || cambio('nit') || cambio('numeroFactura') || cambio('fechaCompra')) {
      p.compra = v.proveedor.trim()
        ? { proveedor: v.proveedor, nit: v.nit.trim() || null, numeroFactura: v.numeroFactura.trim() || null, fechaCompra: v.fechaCompra || null }
        : null;
    }
    if (puedeTenerUsuario && v.cedula.trim() && (cambio('cedula') || cambio('nombre') || cambio('telefono') || cambio('niu'))) {
      p.usuario = {
        cedula: v.cedula,
        ...(cambio('nombre') || cambio('cedula') ? { nombre: v.nombre.trim() || undefined } : {}),
        ...(cambio('telefono') ? { telefono: v.telefono.trim() || null } : {}),
        ...(cambio('niu') ? { niu: v.niu.trim() || null } : {}),
      };
    }
    if (puedeTenerUsuario && cambio('fechaEntrega') && v.fechaEntrega) p.fechaEntrega = v.fechaEntrega;
    if (pendientes.length !== e.pendientes.length || pendientes.some((x) => !e.pendientes.includes(x))) p.pendientes = pendientes;
    if (motivo.trim()) p.motivo = motivo;
    return p;
  };

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    const payload = armar();
    if (typeof payload === 'string') {
      f.limpiar();
      f.fijarError(payload, 'Escriba solo el número, por ejemplo 1500 o 2.500.000');
      return;
    }
    if (Object.keys(payload).filter((k) => k !== 'equipoId' && k !== 'motivo').length === 0) {
      f.limpiar();
      f.fijarError('general', 'No cambió ningún dato.');
      return;
    }
    const r = await f.enviar('EDITAR_EQUIPO', payload);
    if (r) {
      const quedan = Array.isArray(r.pendientes) ? (r.pendientes as string[]).length : 0;
      alTerminar(`Datos guardados.${quedan > 0 ? ` Quedan ${quedan} por completar o verificar.` : ' El equipo ya no tiene datos por completar.'}`);
    }
  };

  const visibles = [
    'serial',
    'serialFabricante',
    'tipo',
    'marca',
    'modelo',
    'descripcion',
    'potencia',
    'unidad',
    'zona',
    'garantiaHasta',
    'valorPagado',
    'compra',
    'usuario',
    'fechaEntrega',
  ];
  return (
    <Cajon titulo="Editar datos del equipo" descripcion={<>Corrija lo que vino mal en el archivo o complete lo que faltaba. El estado y la ubicación se cambian con las acciones y las guías.</>} alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <ErrorFormulario mensaje={f.mensaje ?? f.errores.general ?? null} errores={f.errores} visibles={[...visibles, 'general']} />
        {e.estado === 'DADO_DE_BAJA' ? (
          <Aviso tipo="info">Equipo dado de baja: se pueden corregir sus datos porque vino del inventario histórico, pero no su estado.</Aviso>
        ) : null}

        {pendientes.length > 0 || e.pendientes.length > 0 ? (
          <fieldset className="grupo-edicion">
            <legend>Por completar o verificar</legend>
            <p className="suave">Desmarque lo que ya revisó. Lo que llene abajo se quita solo.</p>
            <div className="casillas">
              {e.pendientes.map((x) => (
                <label key={x} className={x.startsWith('Verificar') ? 'verificar' : undefined}>
                  <input
                    type="checkbox"
                    checked={pendientes.includes(x)}
                    onChange={(ev) => setPendientes((a) => (ev.target.checked ? [...a, x] : a.filter((y) => y !== x)))}
                  />
                  {x}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="grupo-edicion">
          <legend>Equipo</legend>
          <div className="rejilla-campos">
            <Campo
              etiqueta={e.origenSerial === 'EMPRESA' ? 'Serial del sistema o código interno' : e.origenSerial === 'INTERNO' ? 'Código interno' : 'Serial'}
              valor={v.serial}
              alCambiar={cambiar('serial')}
              error={f.errorDe('serial')}
              autocompletar="off"
            />
            <Campo etiqueta="Serial del fabricante" valor={v.serialFabricante} alCambiar={cambiar('serialFabricante')} error={f.errorDe('serialFabricante')} autocompletar="off" />
            <Lista
              etiqueta="Tipo de equipo"
              valor={v.tipo}
              alCambiar={cambiar('tipo')}
              vacia={null}
              error={f.errorDe('tipo')}
              opciones={TIPOS_EQUIPO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_EQUIPO[t] }))}
            />
            <Campo etiqueta="Marca" valor={v.marca} alCambiar={cambiar('marca')} error={f.errorDe('marca')} />
            <Campo etiqueta="Modelo" valor={v.modelo} alCambiar={cambiar('modelo')} error={f.errorDe('modelo')} />
            <div className="rejilla-campos">
              <Campo etiqueta="Potencia o capacidad" valor={v.potencia} alCambiar={cambiar('potencia')} error={f.errorDe('potencia')} modoTeclado="decimal" />
              <Lista
                etiqueta="Unidad"
                valor={v.unidad}
                alCambiar={cambiar('unidad')}
                vacia="—"
                error={f.errorDe('unidad')}
                opciones={UNIDADES_CAPACIDAD.map((u) => ({ valor: u, etiqueta: u }))}
              />
            </div>
          </div>
          <Area etiqueta="Descripción" valor={v.descripcion} alCambiar={cambiar('descripcion')} error={f.errorDe('descripcion')} />
          <div className="rejilla-campos">
            <Campo etiqueta="Zona (centro de costos)" valor={v.zona} alCambiar={cambiar('zona')} error={f.errorDe('zona')} />
            <Campo etiqueta="Fin de la garantía" tipo="date" valor={v.garantiaHasta} alCambiar={cambiar('garantiaHasta')} error={f.errorDe('garantiaHasta')} />
          </div>
        </fieldset>

        <fieldset className="grupo-edicion">
          <legend>Compra</legend>
          <div className="rejilla-campos">
            <Campo etiqueta="Proveedor" valor={v.proveedor} alCambiar={cambiar('proveedor')} error={f.errorDe('compra.proveedor')} ayuda="Vacío: el equipo queda sin compra." />
            <Campo etiqueta="NIT del proveedor" valor={v.nit} alCambiar={cambiar('nit')} error={f.errorDe('compra.nit')} modoTeclado="numeric" />
            <Campo etiqueta="Número de factura" valor={v.numeroFactura} alCambiar={cambiar('numeroFactura')} error={f.errorDe('compra.numeroFactura')} />
            <Campo etiqueta="Fecha de compra" tipo="date" valor={v.fechaCompra} alCambiar={cambiar('fechaCompra')} error={f.errorDe('compra.fechaCompra')} />
            <Campo etiqueta="Valor pagado" valor={v.valorPagado} alCambiar={cambiar('valorPagado')} error={f.errorDe('valorPagado')} modoTeclado="decimal" ayuda="En pesos, por ejemplo 1.303.407" />
          </div>
        </fieldset>

        {puedeTenerUsuario ? (
          <fieldset className="grupo-edicion">
            <legend>Usuario final</legend>
            {!instalacion ? <p className="suave">El equipo vino sin usuario. Escriba la cédula para registrarle la entrega.</p> : null}
            <div className="rejilla-campos">
              <Campo
                etiqueta="Cédula"
                valor={v.cedula}
                alCambiar={cambiar('cedula')}
                error={f.errorDe('usuario.cedula')}
                modoTeclado="numeric"
                ayuda={instalacion ? 'Otra cédula cambia la persona a la que se entregó.' : undefined}
              />
              <Campo etiqueta="Nombre" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('usuario.nombre')} />
              <Campo etiqueta="Teléfono" tipo="tel" valor={v.telefono} alCambiar={cambiar('telefono')} error={f.errorDe('usuario.telefono')} ayuda="10 dígitos" />
              <Campo etiqueta="NIU" valor={v.niu} alCambiar={cambiar('niu')} error={f.errorDe('usuario.niu')} modoTeclado="numeric" />
              <Campo etiqueta="Fecha de entrega" tipo="date" valor={v.fechaEntrega} alCambiar={cambiar('fechaEntrega')} error={f.errorDe('fechaEntrega')} />
            </div>
          </fieldset>
        ) : null}

        <Campo etiqueta="Motivo de la corrección (opcional)" valor={motivo} alCambiar={setMotivo} marcador="Por ejemplo: celda en amarillo, revisada con la factura" />

        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Guardar cambios
          </Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Cajon>
  );
}
