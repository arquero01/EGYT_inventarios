import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { nuevoId } from '../api.ts';
import { cantidad, fecha, hoy } from '../formato.ts';
import { useFormulario, useLectura } from '../ganchos.ts';
import type { FichaProyecto, ListaMovimientos, ProyectoEnLista } from '../tipos.ts';
import { Area, Boton, BotonEnlace, Cajon, Campo, ErrorFormulario, FilaVinculada, InsigniaEstado, Lectura, Pagina, Seccion, Vacio } from '../ui/componentes.tsx';
import { ListaGuias, ListaZonas, RepartoEquipos, TablaPorTipo } from '../ui/Tablero.tsx';

/** RF-01, RF-02 y RF-05: proyectos de electrificación y sus equipos. */
export function Proyectos() {
  const lista = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');
  const sinProyecto = useLectura<{ paginacion: { total: number } }>('/equipos?sinProyecto=si&porPagina=1');
  const [nuevo, setNuevo] = useState(false);
  const navegar = useNavigate();

  return (
    <Pagina
      titulo="Proyectos"
      descripcion="Cada proyecto agrupa los equipos que se instalan en una vereda."
      acciones={
        <Boton icono="mas" onClick={() => setNuevo(true)}>
          Crear proyecto
        </Boton>
      }
    >
      <Lectura estado={lista}>
        {({ datos }) =>
          datos.length === 0 ? (
            <Vacio titulo="Todavía no hay proyectos." accion={<Boton onClick={() => setNuevo(true)}>Crear proyecto</Boton>} />
          ) : (
            <>
            <div className="resumen-historico resumen-proyectos">
              <div className="cifra">
                <b className="num">{cantidad(datos.length)}</b>
                <span>{datos.length === 1 ? 'proyecto' : 'proyectos'}</span>
              </div>
              <div className="cifra">
                <b className="num">{cantidad(datos.reduce((a, p) => a + p.resumen.total, 0))}</b>
                <span>equipos en proyectos</span>
              </div>
              <div className="cifra">
                <b className="num">{cantidad(datos.reduce((a, p) => a + p.resumen.instalados, 0))}</b>
                <span>instalados</span>
              </div>
              <div className="cifra">
                <b className="num">{cantidad(datos.reduce((a, p) => a + p.resumen.enStock, 0))}</b>
                <span>en stock para instalar</span>
              </div>
              {sinProyecto.datos && sinProyecto.datos.paginacion.total > 0 ? (
                <Link className="cifra atencion" to="/inventario?sinProyecto=si">
                  <b className="num">{cantidad(sinProyecto.datos.paginacion.total)}</b>
                  <span>equipos sin proyecto: asígneles uno</span>
                </Link>
              ) : null}
            </div>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Proyecto</th>
                    <th>Ubicación</th>
                    <th>Inicio</th>
                    <th className="derecha">Equipos</th>
                    <th className="derecha">Instalados</th>
                    <th className="derecha">En stock</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((p) => (
                    <FilaVinculada key={p.id} a={`/proyectos/${p.id}`}>
                      <td>
                        <Link to={`/proyectos/${p.id}`}>{p.nombre}</Link>
                      </td>
                      <td>
                        {p.vereda}
                        <span className="secundaria">
                          {p.municipio}, {p.departamento}
                        </span>
                      </td>
                      <td className="num">{fecha(p.fechaInicio)}</td>
                      <td className="derecha num">{cantidad(p.resumen.total)}</td>
                      <td className="derecha num">{cantidad(p.resumen.instalados)}</td>
                      <td className="derecha num">{cantidad(p.resumen.enStock)}</td>
                    </FilaVinculada>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )
        }
      </Lectura>
      {nuevo ? <NuevoProyecto alCerrar={() => setNuevo(false)} alCrear={(id) => navegar(`/proyectos/${id}`)} /> : null}
    </Pagina>
  );
}

function NuevoProyecto({ alCerrar, alCrear }: { alCerrar: () => void; alCrear: (id: string) => void }) {
  const f = useFormulario();
  const [v, setV] = useState({ nombre: '', vereda: '', municipio: '', departamento: '', fechaInicio: hoy(), descripcion: '' });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const proyectoId = nuevoId();
    const { descripcion, ...resto } = v;
    const r = await f.enviar('CREAR_PROYECTO', { proyectoId, ...resto, ...(descripcion.trim() ? { descripcion } : {}) });
    if (r) alCrear(proyectoId);
  };
  return (
    <Cajon titulo="Crear proyecto" alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={Object.keys(v)} />
        <Campo etiqueta="Nombre del proyecto" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('nombre')} marcador="Por ejemplo: Electrificación La Esperanza" />
        <div className="rejilla-campos">
          <Campo etiqueta="Vereda" valor={v.vereda} alCambiar={cambiar('vereda')} error={f.errorDe('vereda')} />
          <Campo etiqueta="Municipio" valor={v.municipio} alCambiar={cambiar('municipio')} error={f.errorDe('municipio')} />
          <Campo etiqueta="Departamento" valor={v.departamento} alCambiar={cambiar('departamento')} error={f.errorDe('departamento')} />
          <Campo etiqueta="Fecha de inicio" tipo="date" valor={v.fechaInicio} alCambiar={cambiar('fechaInicio')} error={f.errorDe('fechaInicio')} />
        </div>
        <Area etiqueta="Descripción (opcional)" valor={v.descripcion} alCambiar={cambiar('descripcion')} error={f.errorDe('descripcion')} />
        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Crear proyecto
          </Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Cajon>
  );
}

export function Proyecto() {
  const { id = '' } = useParams();
  const ficha = useLectura<FichaProyecto>(`/proyectos/${id}`);
  const guias = useLectura<ListaMovimientos>(`/movimientos?proyectoId=${id}&porPagina=6`);
  const filtro = `proyectoId=${id}`;
  return (
    <Lectura estado={ficha}>
      {(d) => (
        <Pagina
          titulo={d.proyecto.nombre}
          descripcion={d.proyecto.descripcion ?? undefined}
          volver={{ a: '/proyectos', texto: 'Proyectos' }}
          acciones={
            <>
              <BotonEnlace a={`/guias/nueva/DESPACHO?proyectoId=${d.proyecto.id}`}>Despachar a este proyecto</BotonEnlace>
              <BotonEnlace a={`/guias/nueva/DEVOLUCION?proyectoId=${d.proyecto.id}`} variante="secundario">
                Devolver a bodega
              </BotonEnlace>
            </>
          }
        >
          <p className="datos-proyecto">
            <span>
              {d.proyecto.vereda}, {d.proyecto.municipio}, {d.proyecto.departamento}
            </span>
            <span>Inicio: {fecha(d.proyecto.fechaInicio)}</span>
            <span>
              <b className="num">{cantidad(d.usuariosAtendidos)}</b> usuarios atendidos
            </span>
            {d.reposiciones > 0 ? (
              <Link to={`/inventario?${filtro}&entrega=REPOSICION`}>
                <b className="num">{cantidad(d.reposiciones)}</b> {d.reposiciones === 1 ? 'reposición' : 'reposiciones'}
              </Link>
            ) : null}
          </p>

          {d.resumen.total === 0 ? (
            <Vacio
              titulo="Este proyecto aún no tiene equipos."
              accion={<BotonEnlace a={`/guias/nueva/DESPACHO?proyectoId=${d.proyecto.id}`}>Despachar equipos</BotonEnlace>}
            >
              Despache equipos desde una bodega, ingrese equipos nuevos para el proyecto o asígneselo a los equipos del histórico desde su hoja de vida.
            </Vacio>
          ) : (
            <RepartoEquipos r={d.resumen} filtro={filtro} texto="equipos en el proyecto" />
          )}

          <div className="columnas">
            <Seccion titulo="Equipos por tipo">
              <TablaPorTipo datos={d.porTipo} filtro={filtro} />
            </Seccion>
            <div>
              {d.porZona.length > 0 ? (
                <Seccion titulo="Equipos por zona">
                  <ListaZonas datos={d.porZona} filtro={filtro} />
                </Seccion>
              ) : null}
              <Seccion titulo="Últimas guías del proyecto" accion={<Link to={`/guias?proyectoId=${d.proyecto.id}`}>Ver todas</Link>}>
                <Lectura estado={guias}>{(g) => <ListaGuias guias={g} />}</Lectura>
              </Seccion>
            </div>
          </div>

          <Seccion
            titulo="Equipos del proyecto"
            accion={
              <span className="acciones-enlace">
                {d.resumen.total > 0 ? <Link to={`/inventario?${filtro}`}>Ver todos con filtros</Link> : null}
                <Link to={`/equipos/nuevo?proyectoId=${d.proyecto.id}`}>Ingresar equipo para este proyecto</Link>
              </span>
            }
          >
            {d.equipos.length === 0 ? (
              <Vacio titulo="Este proyecto aún no tiene equipos." />
            ) : (
              <>
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Serial</th>
                        <th>Equipo</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.equipos.map((e) => (
                        <FilaVinculada key={e.id} a={`/equipos/${e.id}`}>
                          <td>
                            <Link className="serial" to={`/equipos/${e.id}`}>
                              {e.serial}
                            </Link>
                          </td>
                          <td>
                            {e.tipoNombre}
                            <span className="secundaria">{[e.marca, e.modelo].filter(Boolean).join(' ')}</span>
                          </td>
                          <td>
                            <InsigniaEstado estado={e.estado} />
                          </td>
                        </FilaVinculada>
                      ))}
                    </tbody>
                  </table>
                </div>
                {d.resumen.total > d.equipos.length ? (
                  <p className="suave" style={{ fontSize: 'var(--t-s)' }}>
                    Se muestran {d.equipos.length} de {cantidad(d.resumen.total)}. <Link to={`/inventario?${filtro}`}>Ver todos en Equipos</Link>, donde
                    se pueden buscar y filtrar.
                  </p>
                ) : null}
              </>
            )}
          </Seccion>
        </Pagina>
      )}
    </Lectura>
  );
}
