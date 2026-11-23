import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { nuevoId } from '../api.ts';
import { ESTADOS_EQUIPO, NOMBRE_ESTADO, type TipoEquipo } from '@egt/domain';
import { cantidad, fecha, pesos } from '../formato.ts';
import { useFormulario, useLectura } from '../ganchos.ts';
import type { BodegaEnLista, DetalleBodega, EspecificacionBodega } from '../tipos.ts';
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
          <Seccion
            titulo={`Equipos (${cantidad(d.totalEquipos)})`}
            accion={d.totalEquipos > 0 ? <Link to={`/inventario?bodegaId=${d.bodega.id}`}>Ver en Equipos, con filtros</Link> : null}
          >
            {d.totalEquipos === 0 ? (
              <Vacio titulo="No hay equipos en esta bodega." accion={<Link to={`/equipos/nuevo?bodegaId=${d.bodega.id}`}>Ingresar equipo</Link>} />
            ) : (
              <EspecificacionesBodega grupos={d.especificaciones} recortado={d.recortado} />
            )}
          </Seccion>
          <div className="columnas">
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

/**
 * Los equipos de la bodega agrupados por especificación (tipo, marca, modelo
 * y potencia). Cada grupo se abre para ver sus unidades una por una.
 */
function EspecificacionesBodega({ grupos, recortado }: { grupos: EspecificacionBodega[]; recortado: boolean }) {
  const [tipo, setTipo] = useState<TipoEquipo | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const tipos = [...new Map(grupos.map((g) => [g.tipo, g.tipoNombre])).entries()];
  const texto = busqueda.trim().toLowerCase();
  const visibles = grupos
    .filter((g) => !tipo || g.tipo === tipo)
    .map((g) => {
      if (!texto) return g;
      const enGrupo = [g.marca, g.modelo, g.tipoNombre].filter(Boolean).join(' ').toLowerCase().includes(texto);
      const equipos = enGrupo
        ? g.equipos
        : g.equipos.filter((u) => [u.serial, u.serialFabricante, u.descripcion, u.proyecto].filter(Boolean).join(' ').toLowerCase().includes(texto));
      return { ...g, equipos };
    })
    .filter((g) => g.equipos.length > 0);

  return (
    <div className="especificaciones">
      <div className="especificaciones-filtros">
        <div className="opciones-radio" role="radiogroup" aria-label="Tipo de equipo">
          <label>
            <input type="radio" name="tipo-bodega" checked={tipo === ''} onChange={() => setTipo('')} />
            Todos
          </label>
          {tipos.map(([t, nombre]) => (
            <label key={t}>
              <input type="radio" name="tipo-bodega" checked={tipo === t} onChange={() => setTipo(t)} />
              {nombre} ({cantidad(grupos.filter((g) => g.tipo === t).reduce((a, g) => a + g.cantidad, 0))})
            </label>
          ))}
        </div>
        <Campo etiqueta="Buscar en esta bodega" valor={busqueda} alCambiar={setBusqueda} marcador="Serial, marca, modelo o descripción" autocompletar="off" />
      </div>

      {visibles.length === 0 ? <p className="suave">Ningún equipo coincide con la búsqueda.</p> : null}
      {visibles.map((g) => (
        <details key={g.clave} className="grupo-espec" open={Boolean(texto)}>
          <summary>
            <span className="espec-nombre">
              <b>{g.tipoNombre}</b>
              <span className="secundaria">
                {[g.marca ?? 'Sin marca', g.modelo].filter(Boolean).join(' · ')}
                {g.potencia != null ? ` · ${cantidad(g.potencia)} ${g.unidad ?? ''}` : ' · potencia sin registrar'}
              </span>
            </span>
            <span className="espec-estados">
              {ESTADOS_EQUIPO.filter((e) => g.porEstado[e]).map((e) => (
                <span key={e} className={`insignia ${e}`}>
                  {g.porEstado[e]} {NOMBRE_ESTADO[e].toLowerCase()}
                </span>
              ))}
              {g.equipos.some((u) => u.pendientes.some((p) => p.startsWith('Verificar'))) ? (
                <span className="pendiente-dato">
                  {g.equipos.filter((u) => u.pendientes.some((p) => p.startsWith('Verificar'))).length} por verificar
                </span>
              ) : null}
            </span>
            <span className="espec-cantidad num">
              <b>{cantidad(texto ? g.equipos.length : g.cantidad)}</b>
              <span className="secundaria">{g.conValor > 0 ? pesos(g.valorTotal) : 'unidades'}</span>
            </span>
          </summary>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Serial</th>
                  <th>Descripción</th>
                  <th>Estado</th>
                  <th>Proyecto</th>
                  <th>Garantía</th>
                  <th className="derecha">Valor</th>
                </tr>
              </thead>
              <tbody>
                {g.equipos.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link className="serial" to={`/equipos/${u.id}`}>
                        {u.serial}
                      </Link>
                      {u.serialFabricante ? <span className="secundaria">Fabricante: {u.serialFabricante}</span> : null}
                    </td>
                    <td className="espec-descripcion">
                      {u.descripcion ?? <span className="suave">—</span>}
                      {u.pendientes.length > 0 ? (
                        <span className={`secundaria ${u.pendientes.some((p) => p.startsWith('Verificar')) ? 'texto-verificar' : ''}`}>
                          Por completar o verificar: {u.pendientes.join(', ')}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <InsigniaEstado estado={u.estado} />
                    </td>
                    <td>{u.proyecto ?? <span className="suave">Sin proyecto</span>}</td>
                    <td className="num">{u.garantiaHasta ? fecha(u.garantiaHasta) : <span className="suave">—</span>}</td>
                    <td className="derecha num">{u.valorPagado != null ? pesos(u.valorPagado) : <span className="suave">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      {recortado ? (
        <p className="suave" style={{ fontSize: 'var(--t-s)' }}>
          La bodega tiene muchos equipos: aquí se listan los primeros mil. Vea todos en Equipos, con filtros.
        </p>
      ) : null}
    </div>
  );
}
