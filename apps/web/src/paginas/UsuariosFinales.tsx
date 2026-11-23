import { NOMBRE_TIPO_ENTREGA } from '@egt/domain';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { FalloApi, pedir } from '../api.ts';
import { cantidad, fecha, nombrePropio } from '../formato.ts';
import { useEsAdmin, useLectura } from '../ganchos.ts';
import { escalaUsuarios, MapaUsuarios, useDatosMapa, useZonasUbicadas } from '../mapa/MapaUsuarios.tsx';
import { normalizarNombre, type ZonaUbicada } from '../mapa/ubicar.ts';
import type { FichaUsuarioFinal, Paginacion as DatosPaginacion, ResumenUsuarios, UsuarioFinalEnLista, ZonaDeUsuarios } from '../tipos.ts';
import { Aviso, Boton, Cajon, Campo, Datos, FilaVinculada, Lista, InsigniaEstado, Lectura, Pagina, Paginacion, Seccion, Vacio } from '../ui/componentes.tsx';
import { Icono } from '../ui/iconos.tsx';

/**
 * Usuarios finales: las personas que tienen o tuvieron equipos. Arriba, las
 * cifras; luego el mapa de Colombia con los municipios sombreados y la lista
 * escrita de zonas (se eligen en cualquiera de los dos); abajo, la lista de
 * usuarios de las zonas elegidas.
 */
export function UsuariosFinales() {
  const [params, setParams] = useSearchParams();
  const seleccion = params.getAll('zona');
  const q = params.get('q') ?? '';
  const pagina = params.get('pagina') ?? '1';
  const resumen = useLectura<ResumenUsuarios>('/usuarios-finales/resumen');
  const mapa = useDatosMapa();
  const ubicadas = useZonasUbicadas(resumen.datos?.zonas ?? [], mapa);
  const esAdmin = useEsAdmin();
  const [ubicando, setUbicando] = useState(false);
  const [texto, setTexto] = useState(q);

  const consulta = new URLSearchParams({ pagina, porPagina: '25' });
  if (q.trim()) consulta.set('q', q.trim());
  for (const z of seleccion) consulta.append('zona', z);
  const lista = useLectura<{ datos: UsuarioFinalEnLista[]; paginacion: DatosPaginacion }>(`/usuarios-finales?${consulta}`);

  const cambiar = (cambio: (p: URLSearchParams) => void) => {
    const n = new URLSearchParams(params);
    cambio(n);
    if (!n.has('pagina') || n.get('pagina') === '1') n.delete('pagina');
    setParams(n, { replace: true });
  };
  const alternar = (llave: string) =>
    cambiar((n) => {
      const actuales = n.getAll('zona');
      n.delete('zona');
      for (const z of actuales.includes(llave) ? actuales.filter((x) => x !== llave) : [...actuales, llave]) n.append('zona', z);
      n.delete('pagina');
    });
  const limpiar = () =>
    cambiar((n) => {
      n.delete('zona');
      n.delete('pagina');
    });

  // La búsqueda espera a que se deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== texto.trim())
        cambiar((n) => {
          if (texto.trim()) n.set('q', texto.trim());
          else n.delete('q');
          n.delete('pagina');
        });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const zonas = resumen.datos?.zonas ?? [];
  const escala = useMemo(() => escalaUsuarios(Math.max(1, ...zonas.map((z) => z.usuarios))), [zonas]);
  const ubicadaPorLlave = new Map(ubicadas.map((u) => [u.zona.llave, u]));
  const deptoDe = (z: ZonaDeUsuarios) => {
    const u = ubicadaPorLlave.get(z.llave);
    return u?.municipio && mapa ? mapa.nombreDepto[u.municipio.dc] : z.departamento;
  };
  const sinUbicar = ubicadas.filter((u) => !u.municipio);
  const supuestas = ubicadas.filter((u) => u.metodo === 'SUPUESTA');
  const nombreZona = (llave: string) => zonas.find((z) => z.llave === llave)?.zona ?? llave;
  const total = lista.datos?.paginacion.total;

  return (
    <Pagina titulo="Usuarios" descripcion="Las personas que tienen o tuvieron equipos de la empresa, y en qué zonas están.">
      <Lectura estado={resumen}>
        {(r) =>
          r.usuarios === 0 ? (
            <Vacio titulo="Todavía no hay usuarios.">Los usuarios aparecen cuando se instala un equipo o se importa el inventario histórico de la empresa.</Vacio>
          ) : (
            <>
              <div className="resumen-historico">
                <div className="cifra">
                  <b className="num">{cantidad(r.usuarios)}</b>
                  <span>usuarios atendidos</span>
                </div>
                <div className="cifra">
                  <b className="num">{cantidad(r.conEquipo)}</b>
                  <span>tienen equipo instalado</span>
                </div>
                <div className="cifra">
                  <b className="num">{cantidad(r.instalados)}</b>
                  <span>equipos instalados</span>
                </div>
                <div className="cifra">
                  <b className="num">{cantidad(r.reposiciones)}</b>
                  <span>reposiciones por falla</span>
                </div>
                <div className="cifra">
                  <b className="num">{cantidad(r.zonas.length)}</b>
                  <span>zonas</span>
                </div>
              </div>

              <section className="tarjeta tarjeta-mapa" aria-labelledby="titulo-mapa">
                <header className="tarjeta-cabecera">
                  <div>
                    <h2 id="titulo-mapa">Mapa de usuarios</h2>
                    <p>Toque un municipio sombreado o marque una zona en la lista para ver solo sus usuarios.</p>
                  </div>
                  {esAdmin && mapa ? (
                    <Boton variante="secundario" pequeno onClick={() => setUbicando(true)}>
                      Ubicar zonas
                    </Boton>
                  ) : null}
                </header>

                <div className="tarjeta-mapa-cuerpo">
                  {mapa ? (
                    <MapaUsuarios mapa={mapa} ubicadas={ubicadas} seleccion={seleccion} escala={escala} alAlternar={alternar} />
                  ) : (
                    <div className="mapa mapa-cargando">Cargando el mapa…</div>
                  )}

                  <aside className="panel-zonas" aria-labelledby="titulo-zonas">
                    <div className="panel-zonas-cabecera">
                      <h3 id="titulo-zonas">
                        Zonas <span className="suave">({cantidad(r.zonas.length)})</span>
                      </h3>
                      {seleccion.length > 0 ? (
                        <button type="button" className="enlace" onClick={limpiar}>
                          Ver todas
                        </button>
                      ) : (
                        <span className="suave">Marque una o varias</span>
                      )}
                    </div>
                    <fieldset className="lista-zonas-elegir">
                      <legend className="visualmente-oculto">Elija las zonas que quiere ver</legend>
                      <div className="fila-zona titulos" aria-hidden="true">
                        <span />
                        <span>Zona</span>
                        <span className="derecha">Usuarios</span>
                        <span className="derecha">Equipos</span>
                      </div>
                      {r.zonas.map((z) => {
                        const elegida = seleccion.includes(z.llave);
                        const u = ubicadaPorLlave.get(z.llave);
                        return (
                          <label key={z.llave} className={`fila-zona${elegida ? ' elegida' : ''}`}>
                            <input type="checkbox" checked={elegida} onChange={() => alternar(z.llave)} />
                            <span className="nombre-zona">
                              <span className="muestra" style={{ background: escala.tono(z.usuarios) }} aria-hidden="true" />
                              <span>
                                {z.zona}
                                <span className="secundaria">
                                  {deptoDe(z) ?? 'Sin departamento'}
                                  {u?.metodo === 'SUPUESTA' ? ' · por confirmar' : !u?.municipio && mapa ? ' · sin ubicar' : ''}
                                </span>
                              </span>
                            </span>
                            <b className="num derecha">{cantidad(z.usuarios)}</b>
                            <span className="num derecha">{cantidad(z.instalados)}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  </aside>
                </div>

                {sinUbicar.length > 0 || supuestas.length > 0 ? (
                  <p className="nota-mapa">
                    <Icono nombre="info" tamano={16} />
                    <span>
                      {sinUbicar.length > 0 ? `Sin ubicar en el mapa: ${sinUbicar.map((u) => u.zona.zona).join(', ')}. ` : ''}
                      {supuestas.length > 0
                        ? `Ubicación supuesta (el nombre existe en varios departamentos): ${supuestas.map((u) => `${u.zona.zona} → ${mapa?.nombreDepto[u.municipio!.dc] ?? ''}`).join(', ')}. `
                        : ''}
                      {esAdmin ? 'Confírmela con «Ubicar zonas».' : 'Un administrador puede confirmarla.'}
                    </span>
                  </p>
                ) : null}
              </section>
            </>
          )
        }
      </Lectura>

      <section className="seccion tarjeta tarjeta-lista" aria-labelledby="titulo-lista">
        <header className="tarjeta-cabecera">
          <div>
            <h2 id="titulo-lista">Usuarios</h2>
            <p>
              {total === undefined
                ? 'Cargando…'
                : `${cantidad(total)} ${total === 1 ? 'usuario' : 'usuarios'}${seleccion.length > 0 ? ` en ${seleccion.map(nombreZona).join(', ')}` : ' en todas las zonas'}${q ? ` que coinciden con «${q}»` : ''}`}
            </p>
          </div>
        </header>
        <div className="barra-lista">
          <div className="campo buscador">
            <label htmlFor="buscar-usuario" className="visualmente-oculto">
              Buscar usuario
            </label>
            <Icono nombre="buscar" />
            <input id="buscar-usuario" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, cédula o NIU" autoComplete="off" />
          </div>
          {seleccion.length > 0 ? (
            <div className="filtros-elegidos" aria-label="Zonas elegidas">
              {seleccion.map((l) => (
                <button key={l} type="button" className="chip chip-quitar" onClick={() => alternar(l)} aria-label={`Quitar ${nombreZona(l)}`}>
                  {nombreZona(l)}
                  <Icono nombre="cerrar" tamano={14} />
                </button>
              ))}
              <button type="button" className="enlace" onClick={limpiar}>
                Quitar filtros
              </button>
            </div>
          ) : null}
        </div>
        <Lectura estado={lista}>
          {(l) =>
            l.datos.length === 0 ? (
              <Vacio titulo="Ningún usuario coincide." />
            ) : (
              <>
                <div className="tabla-envoltura">
                  <table className="tabla tabla-usuarios">
                    <thead>
                      <tr>
                        <th>Usuario</th>
                        <th>NIU</th>
                        <th>Zona</th>
                        <th className="derecha">Equipos actuales</th>
                        <th className="derecha">Entregas</th>
                        <th>Última entrega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.datos.map((u) => (
                        <FilaVinculada key={u.id} a={`/usuarios-finales/${u.id}`}>
                          <td>
                            <Link to={`/usuarios-finales/${u.id}`}>{nombrePropio(u.nombre)}</Link>
                            <span className="secundaria num">C.C. {u.cedula}</span>
                          </td>
                          <td className="num">{u.niu ?? <span className="suave">—</span>}</td>
                          <td>{u.zonas.join(', ')}</td>
                          <td className="derecha num">{cantidad(u.equiposActuales)}</td>
                          <td className="derecha num">
                            {cantidad(u.entregas)}
                            {u.reposiciones > 0 ? <span className="secundaria">{u.reposiciones === 1 ? '1 reposición' : `${u.reposiciones} reposiciones`}</span> : null}
                          </td>
                          <td className="num">{u.ultimaEntrega ? fecha(u.ultimaEntrega) : <span className="suave">Sin fecha</span>}</td>
                        </FilaVinculada>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Paginacion datos={l.paginacion} alCambiar={(p) => cambiar((n) => n.set('pagina', String(p)))} />
              </>
            )
          }
        </Lectura>
      </section>

      {ubicando && mapa ? (
        <UbicarZonas
          ubicadas={ubicadas}
          municipios={mapa.municipios}
          nombreDepto={mapa.nombreDepto}
          alCerrar={() => setUbicando(false)}
          alGuardar={() => resumen.recargar()}
        />
      ) : null}
    </Pagina>
  );
}

/** El administrador elige en qué municipio se dibuja cada zona. */
function UbicarZonas({
  ubicadas,
  municipios,
  nombreDepto,
  alCerrar,
  alGuardar,
}: {
  ubicadas: ZonaUbicada<ZonaDeUsuarios>[];
  municipios: { c: string; n: string; dc: string }[];
  nombreDepto: Record<string, string>;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  // Primero las que hay que revisar.
  const orden = { null: 0, SUPUESTA: 1, NOMBRE: 2, ELEGIDA: 3 } as const;
  const filas = [...ubicadas].sort((a, b) => orden[a.metodo ?? 'null'] - orden[b.metodo ?? 'null']);
  return (
    <Cajon titulo="Ubicar zonas en el mapa" descripcion="Elija el municipio de cada zona. Solo hace falta en las que no se ubicaron solas o quedaron en otro departamento." alCerrar={alCerrar}>
      <div className="formulario">
        {filas.map((u) => (
          <FilaUbicar key={u.zona.llave} u={u} municipios={municipios} nombreDepto={nombreDepto} alGuardar={alGuardar} />
        ))}
        <div className="pie-formulario">
          <Boton onClick={alCerrar}>Listo</Boton>
        </div>
      </div>
    </Cajon>
  );
}

function FilaUbicar({
  u,
  municipios,
  nombreDepto,
  alGuardar,
}: {
  u: ZonaUbicada<ZonaDeUsuarios>;
  municipios: { c: string; n: string; dc: string }[];
  nombreDepto: Record<string, string>;
  alGuardar: () => void;
}) {
  const [busqueda, setBusqueda] = useState(u.candidatos.length > 0 ? '' : u.zona.zona);
  const [codigo, setCodigo] = useState(u.municipio?.c ?? '');
  const [estado, setEstado] = useState<'listo' | 'guardando' | 'guardado' | string>('listo');
  const opciones = useMemo(() => {
    const texto = normalizarNombre(busqueda);
    const base = texto ? municipios.filter((m) => normalizarNombre(m.n).includes(texto)).slice(0, 40) : u.candidatos;
    // La ubicación actual siempre aparece.
    return u.municipio && !base.some((m) => m.c === u.municipio!.c) ? [u.municipio, ...base] : base;
  }, [busqueda, municipios, u]);

  const guardar = async (municipioCodigo: string | null) => {
    setEstado('guardando');
    try {
      await pedir('PUT', '/zonas/ubicacion', { zona: u.zona.zona, municipioCodigo });
      setEstado('guardado');
      alGuardar();
    } catch (e) {
      setEstado(e instanceof FalloApi ? e.error.mensaje : String(e));
    }
  };

  const textoMetodo =
    u.metodo === 'ELEGIDA'
      ? 'Elegida por un administrador'
      : u.metodo === 'NOMBRE'
        ? 'Ubicada por el nombre'
        : u.metodo === 'SUPUESTA'
          ? 'Supuesta: el nombre existe en varios departamentos'
          : 'Sin ubicar';
  return (
    <fieldset className="grupo-edicion">
      <legend>
        {u.zona.zona} <span className="suave">({cantidad(u.zona.usuarios)} usuarios)</span>
      </legend>
      <p className={u.metodo === 'SUPUESTA' || !u.metodo ? 'texto-verificar' : 'suave'} style={{ margin: 0, fontSize: 'var(--t-s)' }}>
        {textoMetodo}
        {u.municipio ? `: ${u.municipio.n}, ${nombreDepto[u.municipio.dc]}` : ''}
      </p>
      <div className="rejilla-campos">
        <Campo etiqueta="Buscar municipio" valor={busqueda} alCambiar={setBusqueda} marcador="Nombre del municipio" autocompletar="off" />
        <Lista
          etiqueta="Municipio"
          valor={codigo}
          alCambiar={setCodigo}
          vacia="— Elija —"
          opciones={opciones.map((m) => ({ valor: m.c, etiqueta: `${m.n}, ${nombreDepto[m.dc]}` }))}
        />
      </div>
      <div className="acciones">
        <Boton pequeno disabled={!codigo || estado === 'guardando'} onClick={() => void guardar(codigo)}>
          Guardar
        </Boton>
        {u.metodo === 'ELEGIDA' ? (
          <Boton pequeno variante="secundario" onClick={() => void guardar(null)}>
            Volver a ubicar por el nombre
          </Boton>
        ) : null}
        {estado === 'guardado' ? <span className="suave">Guardado.</span> : null}
        {estado !== 'listo' && estado !== 'guardando' && estado !== 'guardado' ? <Aviso tipo="error">{estado}</Aviso> : null}
      </div>
    </fieldset>
  );
}

/** Ficha de un usuario final: sus datos y cada equipo que se le ha entregado. */
export function UsuarioFinal() {
  const { id = '' } = useParams();
  const ficha = useLectura<FichaUsuarioFinal>(`/usuarios-finales/${id}`);
  return (
    <Lectura estado={ficha}>
      {(d) => {
        const actuales = d.entregas.filter((x) => x.vigente);
        const zonas = [...new Set(d.entregas.map((x) => x.zona))];
        return (
          <Pagina titulo={nombrePropio(d.usuario.nombre)} descripcion={`C.C. ${d.usuario.cedula}`} volver={{ a: '/usuarios-finales', texto: 'Usuarios' }}>
            <div className="resumen-historico">
              <div className="cifra">
                <b className="num">{cantidad(actuales.length)}</b>
                <span>equipos que tiene</span>
              </div>
              <div className="cifra">
                <b className="num">{cantidad(d.entregas.length)}</b>
                <span>entregas en total</span>
              </div>
              <div className="cifra">
                <b className="num">{cantidad(d.entregas.filter((x) => x.tipoEntrega === 'REPOSICION').length)}</b>
                <span>reposiciones</span>
              </div>
            </div>
            <div className="tarjeta tarjeta-datos">
              <Datos
                pares={[
                  ['NIU', d.usuario.niu ? <span className="num">{d.usuario.niu}</span> : 'Sin registrar'],
                  ['Teléfono', d.usuario.telefono ? <span className="num">{d.usuario.telefono}</span> : 'Sin registrar'],
                  ['Zona', zonas.join(', ')],
                ]}
              />
            </div>
            <Seccion titulo="Equipos entregados">
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Equipo</th>
                      <th>Entrega</th>
                      <th>Zona y proyecto</th>
                      <th>Estado del equipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.entregas.map((x) => (
                      <FilaVinculada key={x.instalacionId} a={`/equipos/${x.equipoId}`}>
                        <td>
                          <Link className="serial" to={`/equipos/${x.equipoId}`}>
                            {x.serial}
                          </Link>
                          <span className="secundaria">{[x.tipoNombre, x.marca, x.modelo].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td>
                          {x.sinFecha ? <span className="suave">Sin fecha en el archivo</span> : <span className="num">{fecha(x.fecha)}</span>}
                          {x.tipoEntrega !== 'ENTREGA' ? <span className="etiqueta-entrega">{NOMBRE_TIPO_ENTREGA[x.tipoEntrega]}</span> : null}
                          {x.reemplazaSerial ? <span className="secundaria">Reemplazó a {x.reemplazaSerial}</span> : null}
                        </td>
                        <td>
                          {x.zona}
                          <span className="secundaria">{[x.vereda, x.proyecto ?? 'Sin proyecto'].filter(Boolean).join(' · ')}</span>
                        </td>
                        <td>
                          <InsigniaEstado estado={x.estado} />
                          <span className="secundaria">{x.vigente ? 'Lo tiene' : `Ya no lo tiene${x.motivoFin ? `: ${x.motivoFin}` : ''}`}</span>
                        </td>
                      </FilaVinculada>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          </Pagina>
        );
      }}
    </Lectura>
  );
}
