import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { nuevoId } from '../api.ts';
import { cantidad, fecha, hoy } from '../formato.ts';
import { useFormulario, useLectura } from '../ganchos.ts';
import type { FichaProyecto, ProyectoEnLista } from '../tipos.ts';
import { Area, Boton, BotonEnlace, Cajon, Campo, Datos, ErrorFormulario, FilaVinculada, InsigniaEstado, Lectura, Pagina, Seccion, Vacio } from '../ui/componentes.tsx';

/** RF-01, RF-02 y RF-05: proyectos de electrificación y sus equipos. */
export function Proyectos() {
  const lista = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');
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
          <div className="superficie">
            <Datos
              pares={[
                ['Ubicación', `${d.proyecto.vereda}, ${d.proyecto.municipio}, ${d.proyecto.departamento}`],
                ['Inicio', fecha(d.proyecto.fechaInicio)],
                ['Equipos', cantidad(d.resumen.total)],
                ['Instalados', cantidad(d.resumen.instalados)],
                ['En stock', cantidad(d.resumen.enStock)],
                ['En mantenimiento', cantidad(d.resumen.enMantenimiento)],
                ['Usuarios atendidos', cantidad(d.usuariosAtendidos)],
              ]}
            />
          </div>
          <Seccion titulo="Equipos del proyecto" accion={<Link to={`/equipos/nuevo?proyectoId=${d.proyecto.id}`}>Ingresar equipo para este proyecto</Link>}>
            {d.equipos.length === 0 ? (
              <Vacio titulo="Este proyecto aún no tiene equipos." />
            ) : (
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
                          <span className="secundaria">
                            {e.marca} {e.modelo}
                          </span>
                        </td>
                        <td>
                          <InsigniaEstado estado={e.estado} />
                        </td>
                      </FilaVinculada>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Seccion>
        </Pagina>
      )}
    </Lectura>
  );
}
