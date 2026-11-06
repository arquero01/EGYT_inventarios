import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ESTADOS_EQUIPO, NOMBRE_ESTADO, NOMBRE_TIPO_EQUIPO, TIPOS_EQUIPO } from '@egt/domain';
import { useLectura } from '../ganchos.ts';
import type { BodegaEnLista, ListaEquipos, ProyectoEnLista } from '../tipos.ts';
import { Aviso, BotonEnlace, FilaVinculada, InsigniaEstado, Lectura, Lista, Pagina, Paginacion, Vacio } from '../ui/componentes.tsx';
import { Icono } from '../ui/iconos.tsx';

const FILTROS = ['q', 'tipo', 'estado', 'ubicacion', 'bodegaId', 'proyectoId', 'pagina'] as const;

/** RF-18 a RF-21: búsqueda por serial, usuario o cédula y filtros combinables. */
export function Inventario() {
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');

  const cambiar = (clave: (typeof FILTROS)[number], valor: string) => {
    const nuevos = new URLSearchParams(params);
    if (valor) nuevos.set(clave, valor);
    else nuevos.delete(clave);
    if (clave !== 'pagina') nuevos.delete('pagina');
    setParams(nuevos, { replace: true });
  };

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== texto.trim()) cambiar('q', texto.trim());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const consulta = new URLSearchParams();
  for (const f of FILTROS) {
    const v = params.get(f);
    if (v) consulta.set(f, v);
  }
  consulta.set('porPagina', '25');
  const equipos = useLectura<ListaEquipos>(`/equipos?${consulta.toString()}`);
  const hayFiltros = FILTROS.some((f) => f !== 'pagina' && params.get(f));

  return (
    <Pagina
      titulo="Equipos"
      descripcion="Paneles, baterías, inversores y medidores con serial. Busque por serial, usuario final o cédula."
      acciones={
        <BotonEnlace a="/equipos/nuevo" icono="mas">
          Ingresar equipo
        </BotonEnlace>
      }
    >
      <div className="filtros">
        <div className="campo buscador">
          <label htmlFor="buscar" className="visualmente-oculto">
            Buscar
          </label>
          <Icono nombre="buscar" />
          <input id="buscar" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Serial, nombre o cédula" autoComplete="off" />
        </div>
        <Lista etiqueta="Tipo" clase="visualmente-oculto-etiqueta" valor={params.get('tipo') ?? ''} alCambiar={(v) => cambiar('tipo', v)} vacia="Todos los tipos" opciones={TIPOS_EQUIPO.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_EQUIPO[t] }))} />
        <Lista etiqueta="Estado" clase="visualmente-oculto-etiqueta" valor={params.get('estado') ?? ''} alCambiar={(v) => cambiar('estado', v)} vacia="Todos los estados" opciones={ESTADOS_EQUIPO.map((e) => ({ valor: e, etiqueta: NOMBRE_ESTADO[e] }))} />
        <Lista
          etiqueta="Bodega"
          clase="visualmente-oculto-etiqueta"
          valor={params.get('bodegaId') ?? ''}
          alCambiar={(v) => cambiar('bodegaId', v)}
          vacia="Todas las bodegas"
          opciones={(bodegas.datos?.datos ?? []).map((b) => ({ valor: b.id, etiqueta: b.nombre }))}
        />
        <Lista
          etiqueta="Proyecto"
          clase="visualmente-oculto-etiqueta"
          valor={params.get('proyectoId') ?? ''}
          alCambiar={(v) => cambiar('proyectoId', v)}
          vacia="Todos los proyectos"
          opciones={(proyectos.datos?.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.nombre }))}
        />
      </div>

      <Lectura estado={equipos}>
        {(r) => (
          <>
            {r.aviso ? <Aviso tipo="info">{r.aviso.mensaje}</Aviso> : null}
            {r.datos.length === 0 ? (
              <Vacio
                titulo={hayFiltros ? 'Ningún equipo coincide con la búsqueda.' : 'Todavía no hay equipos.'}
                accion={
                  hayFiltros ? (
                    <button
                      className="boton-texto"
                      type="button"
                      onClick={() => {
                        setTexto('');
                        setParams(new URLSearchParams(), { replace: true });
                      }}
                    >
                      Quitar los filtros
                    </button>
                  ) : (
                    <BotonEnlace a="/equipos/nuevo">Ingresar equipo</BotonEnlace>
                  )
                }
              />
            ) : (
              <>
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Serial</th>
                        <th>Equipo</th>
                        <th>Estado</th>
                        <th>Dónde está</th>
                        <th>Proyecto</th>
                        <th>Usuario final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.datos.map((e) => (
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
                          <td>{e.ubicacion === 'BODEGA' ? (e.bodega?.nombre ?? 'Bodega') : 'En campo'}</td>
                          <td>{e.proyecto.nombre}</td>
                          <td>
                            {e.usuarioFinal ? (
                              <>
                                {e.usuarioFinal.nombre}
                                <span className="secundaria num">C.C. {e.usuarioFinal.cedula}</span>
                              </>
                            ) : (
                              <span className="suave">—</span>
                            )}
                          </td>
                        </FilaVinculada>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginacion datos={r.paginacion} alCambiar={(p) => cambiar('pagina', String(p))} />
              </>
            )}
          </>
        )}
      </Lectura>
    </Pagina>
  );
}
