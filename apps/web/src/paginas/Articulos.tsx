import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { UNIDADES_MEDIDA, type UnidadMedida } from '@egt/domain';
import { nuevoId } from '../api.ts';
import { aNumero, cantidad, fechaHora, hoy, pesos } from '../formato.ts';
import { useFormulario, useLectura } from '../ganchos.ts';
import type { ArticuloEnLista, BodegaEnLista, Kardex } from '../tipos.ts';
import { Area, Aviso, Boton, BotonEnlace, Cajon, Campo, ErrorFormulario, FilaVinculada, Lectura, Lista, Pagina, Seccion, Vacio } from '../ui/componentes.tsx';
import { Icono } from '../ui/iconos.tsx';

const NOMBRE_UNIDAD: Record<UnidadMedida, string> = {
  UND: 'Unidad',
  PAR: 'Par',
  JUEGO: 'Juego',
  CAJA: 'Caja',
  ROLLO: 'Rollo',
  M: 'Metro',
  KG: 'Kilogramo',
  L: 'Litro',
};

/** RL-03: artículos que se controlan por cantidad (cables, conectores, estructuras…). */
export function Articulos() {
  const lista = useLectura<{ datos: ArticuloEnLista[] }>('/articulos');
  const [nuevo, setNuevo] = useState(false);
  const navegar = useNavigate();
  return (
    <Pagina
      titulo="Artículos"
      descripcion="Material que se maneja por cantidad y no por serial: cable, conectores, estructuras, tornillería."
      acciones={
        <>
          <BotonEnlace a="/articulos/ingreso" icono="mas">
            Registrar ingreso
          </BotonEnlace>
          <Boton variante="secundario" onClick={() => setNuevo(true)}>
            Crear artículo
          </Boton>
        </>
      }
    >
      <Lectura estado={lista}>
        {({ datos }) =>
          datos.length === 0 ? (
            <Vacio titulo="El catálogo de artículos está vacío." accion={<Boton onClick={() => setNuevo(true)}>Crear artículo</Boton>}>
              Cree cada artículo una vez; luego registre sus ingresos y despachos por cantidad.
            </Vacio>
          ) : (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Artículo</th>
                    <th>Unidad</th>
                    <th className="derecha">En bodegas</th>
                    <th className="derecha">En campo</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((a) => (
                    <FilaVinculada key={a.id} a={`/articulos/${a.id}`}>
                      <td>
                        <Link className="serial" to={`/articulos/${a.id}`}>
                          {a.codigo}
                        </Link>
                      </td>
                      <td>
                        {a.nombre}
                        {a.descripcion ? <span className="secundaria">{a.descripcion}</span> : null}
                      </td>
                      <td>{NOMBRE_UNIDAD[a.unidad]}</td>
                      <td className="derecha num">{cantidad(a.enBodegas)}</td>
                      <td className="derecha num">{cantidad(a.enCampo)}</td>
                    </FilaVinculada>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Lectura>
      {nuevo ? <NuevoArticulo alCerrar={() => setNuevo(false)} alCrear={(id) => navegar(`/articulos/${id}`)} /> : null}
    </Pagina>
  );
}

function NuevoArticulo({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (id: string) => void }) {
  const f = useFormulario();
  const [v, setV] = useState({ codigo: '', nombre: '', unidad: 'UND', descripcion: '' });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const articuloId = nuevoId();
    const { descripcion, ...resto } = v;
    const r = await f.enviar('CREAR_ARTICULO', { articuloId, ...resto, ...(descripcion.trim() ? { descripcion } : {}) });
    if (r) alCrear(articuloId);
  };
  return (
    <Cajon titulo="Crear artículo" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={Object.keys(v)} />
        <div className="rejilla-campos">
          <Campo etiqueta="Código" valor={v.codigo} alCambiar={cambiar('codigo')} error={f.errorDe('codigo')} marcador="CAB-6MM" />
          <Lista etiqueta="Unidad de medida" valor={v.unidad} vacia={null} alCambiar={cambiar('unidad')} error={f.errorDe('unidad')} opciones={UNIDADES_MEDIDA.map((u) => ({ valor: u, etiqueta: NOMBRE_UNIDAD[u] }))} />
        </div>
        <Campo etiqueta="Nombre" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('nombre')} marcador="Cable solar 6 mm²" />
        <Area etiqueta="Descripción (opcional)" valor={v.descripcion} alCambiar={cambiar('descripcion')} error={f.errorDe('descripcion')} />
        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Crear artículo
          </Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Cajon>
  );
}

/** Kardex: existencias por lugar y todas las entradas y salidas del artículo. */
export function Articulo() {
  const { id = '' } = useParams();
  const kardex = useLectura<Kardex>(`/articulos/${id}`);
  return (
    <Lectura estado={kardex}>
      {(k) => {
        const total = k.existencias.reduce((s, e) => s + e.cantidad, 0);
        return (
          <Pagina
            titulo={k.articulo.nombre}
            descripcion={
              <>
                <span className="serial">{k.articulo.codigo}</span>. {cantidad(total)} {k.articulo.unidad} en total.
                {k.articulo.descripcion ? ` ${k.articulo.descripcion}` : ''}
              </>
            }
            volver={{ a: '/articulos', texto: 'Artículos' }}
            acciones={<BotonEnlace a="/articulos/ingreso">Registrar ingreso</BotonEnlace>}
          >
            {k.aviso ? <Aviso tipo="info">{k.aviso.mensaje}</Aviso> : null}
            <div className="columnas">
              <Seccion titulo="Movimientos">
                {k.movimientos.length === 0 ? (
                  <Vacio titulo="Sin movimientos todavía." />
                ) : (
                  <div className="tabla-envoltura">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Guía</th>
                          <th>Recorrido</th>
                          <th className="derecha">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {k.movimientos.map((m) => (
                          <FilaVinculada key={`${m.movimientoId}`} a={`/guias/${m.numero}`}>
                            <td>
                              <Link className="serial" to={`/guias/${m.numero}`}>
                                {m.numero}
                              </Link>
                              <span className="secundaria">{fechaHora(m.ocurridoEn)}</span>
                            </td>
                            <td>
                              {m.tipoNombre}
                              <span className="secundaria">{[m.origen ?? 'Proveedor', m.destino ?? m.proyecto].filter(Boolean).join(' a ')}</span>
                            </td>
                            <td className="derecha num">{cantidad(m.cantidad)}</td>
                          </FilaVinculada>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Seccion>
              <Seccion titulo="Existencias por lugar">
                {k.existencias.length === 0 ? (
                  <Vacio titulo="No hay existencias." />
                ) : (
                  <ul className="lista superficie">
                    {k.existencias.map((e) => (
                      <li key={e.lugar.id} style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                        <Icono nombre={e.lugar.tipo === 'BODEGA' ? 'bodegas' : 'proyectos'} tamano={16} />
                        <Link to={e.lugar.tipo === 'BODEGA' ? `/bodegas/${e.lugar.id}` : `/proyectos/${e.lugar.id}`}>{e.lugar.nombre}</Link>
                        <span className="num">
                          {cantidad(e.cantidad)} {k.articulo.unidad}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            </div>
          </Pagina>
        );
      }}
    </Lectura>
  );
}

interface Renglon {
  articuloId: string;
  cantidad: string;
  valorUnitario: string;
}

/** RL-04: entrada de artículos por cantidad con su factura. */
export function IngresoArticulos() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const f = useFormulario();
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const catalogo = useLectura<{ datos: ArticuloEnLista[] }>('/articulos');
  const [v, setV] = useState({ bodegaId: params.get('bodegaId') ?? '', proveedor: '', nit: '', numeroFactura: '', fechaCompra: hoy(), observacion: '' });
  const [renglones, setRenglones] = useState<Renglon[]>([{ articuloId: '', cantidad: '', valorUnitario: '' }]);
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));
  const cambiarRenglon = (i: number, campo: keyof Renglon, valor: string) => setRenglones((rs) => rs.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
  const articulo = (id: string) => catalogo.datos?.datos.find((a) => a.id === id);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const items = renglones.filter((r) => r.articuloId || r.cantidad || r.valorUnitario);
    const r = await f.enviar('INGRESAR_ARTICULOS', {
      bodegaId: v.bodegaId,
      compra: { proveedor: v.proveedor, nit: v.nit, numeroFactura: v.numeroFactura, fechaCompra: v.fechaCompra },
      items: items.map((x) => ({ articuloId: x.articuloId, cantidad: aNumero(x.cantidad), valorUnitario: aNumero(x.valorUnitario) })),
      ...(v.observacion.trim() ? { observacion: v.observacion } : {}),
    });
    if (r) navegar(`/guias/${String(r.numero)}`);
  };

  const total = renglones.reduce((s, x) => s + (aNumero(x.cantidad) || 0) * (aNumero(x.valorUnitario) || 0), 0);
  const visibles = ['bodegaId', 'compra', 'items', 'observacion'];
  return (
    <Pagina titulo="Ingreso de artículos" descripcion="Material que llega del proveedor con su factura. Genera una guía de ingreso." volver={{ a: '/articulos', texto: 'Artículos' }}>
      <form className="formulario" onSubmit={guardar} noValidate style={{ maxWidth: 900 }}>
        {catalogo.datos?.datos.length === 0 ? (
          <Aviso tipo="atencion">
            Primero cree los artículos en el <Link to="/articulos">catálogo</Link>.
          </Aviso>
        ) : null}
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={visibles} />
        <div className="superficie" style={{ padding: 20 }}>
          <div className="rejilla-campos">
            <Lista etiqueta="Bodega donde llegan" valor={v.bodegaId} alCambiar={cambiar('bodegaId')} error={f.errorDe('bodegaId')} opciones={(bodegas.datos?.datos ?? []).map((b) => ({ valor: b.id, etiqueta: b.nombre }))} />
            <Campo etiqueta="Proveedor" valor={v.proveedor} alCambiar={cambiar('proveedor')} error={f.errorDe('compra.proveedor')} />
            <Campo etiqueta="NIT" valor={v.nit} alCambiar={cambiar('nit')} error={f.errorDe('compra.nit')} />
            <Campo etiqueta="Número de factura" valor={v.numeroFactura} alCambiar={cambiar('numeroFactura')} error={f.errorDe('compra.numeroFactura')} />
            <Campo etiqueta="Fecha de compra" tipo="date" valor={v.fechaCompra} alCambiar={cambiar('fechaCompra')} error={f.errorDe('compra.fechaCompra')} />
          </div>
        </div>

        <Seccion titulo="Artículos recibidos">
          {f.errores.items ? <Aviso tipo="error">{f.errores.items}</Aviso> : null}
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th style={{ width: '46%' }}>Artículo</th>
                  <th>Cantidad</th>
                  <th>Valor unitario</th>
                  <th className="derecha">Subtotal</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {renglones.map((x, i) => {
                  const a = articulo(x.articuloId);
                  return (
                    <tr key={i}>
                      <td>
                        <Lista
                          etiqueta={`Artículo ${i + 1}`}
                          clase="visualmente-oculto-etiqueta"
                          valor={x.articuloId}
                          alCambiar={(id) => cambiarRenglon(i, 'articuloId', id)}
                          error={f.errorDe(`items.${i}.articuloId`)}
                          opciones={(catalogo.datos?.datos ?? [])
                            .filter((c) => c.id === x.articuloId || !renglones.some((r) => r.articuloId === c.id))
                            .map((c) => ({ valor: c.id, etiqueta: `${c.codigo}, ${c.nombre}` }))}
                        />
                      </td>
                      <td>
                        <Campo etiqueta={`Cantidad ${i + 1}`} clase="visualmente-oculto-etiqueta" valor={x.cantidad} alCambiar={(c) => cambiarRenglon(i, 'cantidad', c)} modoTeclado="decimal" error={f.errorDe(`items.${i}.cantidad`)} ayuda={a ? NOMBRE_UNIDAD[a.unidad] : undefined} />
                      </td>
                      <td>
                        <Campo etiqueta={`Valor unitario ${i + 1}`} clase="visualmente-oculto-etiqueta" valor={x.valorUnitario} alCambiar={(c) => cambiarRenglon(i, 'valorUnitario', c)} modoTeclado="numeric" error={f.errorDe(`items.${i}.valorUnitario`)} />
                      </td>
                      <td className="derecha num">{pesos((aNumero(x.cantidad) || 0) * (aNumero(x.valorUnitario) || 0))}</td>
                      <td className="derecha">
                        {renglones.length > 1 ? (
                          <button type="button" className="boton-texto peligro" onClick={() => setRenglones((rs) => rs.filter((_, j) => j !== i))}>
                            Quitar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={3}>
                    <button type="button" className="boton-texto" onClick={() => setRenglones((rs) => [...rs, { articuloId: '', cantidad: '', valorUnitario: '' }])}>
                      Agregar otro artículo
                    </button>
                  </td>
                  <td className="derecha num">
                    <strong>{pesos(total)}</strong>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </Seccion>
        <Area etiqueta="Observación (opcional)" valor={v.observacion} alCambiar={cambiar('observacion')} error={f.errorDe('observacion')} />
        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Registrar ingreso
          </Boton>
        </div>
      </form>
    </Pagina>
  );
}
