import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { nuevoId } from '../api.ts';
import { cantidad } from '../formato.ts';
import { useFormulario, useLectura } from '../ganchos.ts';
import type { BodegaEnLista, DetalleBodega } from '../tipos.ts';
import { Aviso, Boton, BotonEnlace, Cajon, Campo, ErrorFormulario, FilaVinculada, InsigniaEstado, Lectura, Pagina, Seccion, Vacio } from '../ui/componentes.tsx';

/** RL-01: bodegas de la empresa y lo que hay en cada una. */
export function Bodegas() {
  const lista = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const [nueva, setNueva] = useState(false);
  const navegar = useNavigate();
  return (
    <Pagina
      titulo="Bodegas"
      descripcion="Los lugares donde se guardan los equipos y los artículos antes de salir a campo."
      acciones={
        <Boton icono="mas" onClick={() => setNueva(true)}>
          Crear bodega
        </Boton>
      }
    >
      <Lectura estado={lista}>
        {({ datos }) =>
          datos.length === 0 ? (
            <Vacio titulo="Todavía no hay bodegas." accion={<Boton onClick={() => setNueva(true)}>Crear la primera bodega</Boton>}>
              Los equipos que llegan del proveedor siempre entran a una bodega.
            </Vacio>
          ) : (
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Bodega</th>
                    <th>Municipio</th>
                    <th className="derecha">Equipos</th>
                    <th className="derecha">Artículos con existencias</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((b) => (
                    <FilaVinculada key={b.id} a={`/bodegas/${b.id}`}>
                      <td>
                        <Link to={`/bodegas/${b.id}`}>{b.nombre}</Link>
                        {b.direccion ? <span className="secundaria">{b.direccion}</span> : null}
                      </td>
                      <td>
                        {b.municipio}, {b.departamento}
                      </td>
                      <td className="derecha num">{cantidad(b.equipos)}</td>
                      <td className="derecha num">{cantidad(b.articulos)}</td>
                    </FilaVinculada>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Lectura>
      {nueva ? <NuevaBodega alCerrar={() => setNueva(false)} alCrear={(id) => navegar(`/bodegas/${id}`)} /> : null}
    </Pagina>
  );
}

function NuevaBodega({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (id: string) => void }) {
  const f = useFormulario();
  const [v, setV] = useState({ nombre: '', municipio: '', departamento: '', direccion: '' });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const bodegaId = nuevoId();
    const { direccion, ...resto } = v;
    const r = await f.enviar('CREAR_BODEGA', { bodegaId, ...resto, ...(direccion.trim() ? { direccion } : {}) });
    if (r) alCrear(bodegaId);
  };
  return (
    <Cajon titulo="Crear bodega" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={Object.keys(v)} />
        <Campo etiqueta="Nombre" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('nombre')} marcador="Por ejemplo: Bodega Popayán" />
        <div className="rejilla-campos">
          <Campo etiqueta="Municipio" valor={v.municipio} alCambiar={cambiar('municipio')} error={f.errorDe('municipio')} />
          <Campo etiqueta="Departamento" valor={v.departamento} alCambiar={cambiar('departamento')} error={f.errorDe('departamento')} />
        </div>
        <Campo etiqueta="Dirección (opcional)" valor={v.direccion} alCambiar={cambiar('direccion')} error={f.errorDe('direccion')} />
        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Crear bodega
          </Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Cajon>
  );
}

export function Bodega() {
  const { id = '' } = useParams();
  const detalle = useLectura<DetalleBodega>(`/bodegas/${id}`);
  return (
    <Lectura estado={detalle}>
      {(d) => (
        <Pagina
          titulo={d.bodega.nombre}
          descripcion={[d.bodega.direccion, `${d.bodega.municipio}, ${d.bodega.departamento}`].filter(Boolean).join('. ')}
          volver={{ a: '/bodegas', texto: 'Bodegas' }}
          acciones={
            <>
              <BotonEnlace a={`/guias/nueva/DESPACHO?bodegaId=${d.bodega.id}`}>Despachar desde aquí</BotonEnlace>
              <BotonEnlace a={`/guias/nueva/TRASLADO?bodegaId=${d.bodega.id}`} variante="secundario">
                Trasladar a otra bodega
              </BotonEnlace>
            </>
          }
        >
          {d.aviso ? <Aviso tipo="info">{d.aviso.mensaje}</Aviso> : null}
          <div className="columnas">
            <Seccion titulo="Equipos" accion={<Link to={`/inventario?bodegaId=${d.bodega.id}`}>Ver uno por uno</Link>}>
              {d.equipos.length === 0 ? (
                <Vacio titulo="No hay equipos en esta bodega." accion={<Link to={`/equipos/nuevo?bodegaId=${d.bodega.id}`}>Ingresar equipo</Link>} />
              ) : (
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Estado</th>
                        <th className="derecha">Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.equipos.map((e) => (
                        <tr key={`${e.tipo}-${e.estado}`}>
                          <td>{e.tipoNombre}</td>
                          <td>
                            <InsigniaEstado estado={e.estado} />
                          </td>
                          <td className="derecha num">{cantidad(e.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>
            <Seccion titulo="Artículos" accion={<Link to={`/articulos/ingreso?bodegaId=${d.bodega.id}`}>Registrar ingreso</Link>}>
              {d.articulos.length === 0 ? (
                <Vacio titulo="No hay artículos en esta bodega." />
              ) : (
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th className="derecha">Existencias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.articulos.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <Link to={`/articulos/${a.id}`}>{a.nombre}</Link>
                            <span className="secundaria serial">{a.codigo}</span>
                          </td>
                          <td className="derecha num">
                            {cantidad(a.cantidad)} {a.unidad}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>
          </div>
        </Pagina>
      )}
    </Lectura>
  );
}
