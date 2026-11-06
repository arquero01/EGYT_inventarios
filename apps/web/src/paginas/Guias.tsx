import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { NOMBRE_MOVIMIENTO, TIPOS_MOVIMIENTO, type MovimientoEquipo, type TipoComando } from '@egt/domain';
import { aNumero, cantidad, fecha, fechaHora, pesos } from '../formato.ts';
import { useFormulario, useLectura, useSesion } from '../ganchos.ts';
import type { ArticuloConCantidad, BodegaEnLista, DetalleMovimiento, ListaMovimientos, ListaEquipos, ProyectoEnLista } from '../tipos.ts';
import { Area, Aviso, Boton, BotonEnlace, Campo, Cargando, ErrorFormulario, FilaVinculada, InsigniaEstado, Lectura, Lista, Pagina, Paginacion, Seccion, Vacio } from '../ui/componentes.tsx';
import { Icono } from '../ui/iconos.tsx';

const MOVIMIENTOS_EQUIPO: MovimientoEquipo[] = ['DESPACHO', 'TRASLADO', 'DEVOLUCION'];

/** Todas las guías numeradas (ingreso, despacho, traslado y devolución). */
export function Guias() {
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo') ?? '';
  const pagina = params.get('pagina') ?? '1';
  const lista = useLectura<ListaMovimientos>(`/movimientos?porPagina=25&pagina=${pagina}${tipo ? `&tipo=${tipo}` : ''}`);
  const fijar = (clave: string, valor: string) => {
    const n = new URLSearchParams(params);
    if (valor) n.set(clave, valor);
    else n.delete(clave);
    if (clave !== 'pagina') n.delete('pagina');
    setParams(n, { replace: true });
  };

  return (
    <Pagina
      titulo="Guías de movimiento"
      descripcion="Cada entrada o salida de material queda en una guía con número consecutivo."
      acciones={
        <>
          {MOVIMIENTOS_EQUIPO.map((m, i) => (
            <BotonEnlace key={m} a={`/guias/nueva/${m}`} variante={i === 0 ? 'primario' : 'secundario'}>
              {NOMBRE_MOVIMIENTO[m]}
            </BotonEnlace>
          ))}
        </>
      }
    >
      <div style={{ maxWidth: 260, marginBottom: 16 }}>
        <Lista etiqueta="Tipo" clase="visualmente-oculto-etiqueta" valor={tipo} alCambiar={(v) => fijar('tipo', v)} vacia="Todos los tipos" opciones={TIPOS_MOVIMIENTO.map((t) => ({ valor: t, etiqueta: NOMBRE_MOVIMIENTO[t] }))} />
      </div>
      <Lectura estado={lista}>
        {(r) =>
          r.datos.length === 0 ? (
            <Vacio titulo={tipo ? 'No hay guías de este tipo.' : 'Todavía no hay guías.'} />
          ) : (
            <>
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Guía</th>
                      <th>Tipo</th>
                      <th>Desde</th>
                      <th>Hacia</th>
                      <th>Responsable</th>
                      <th className="derecha">Contenido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.datos.map((m) => (
                      <FilaVinculada key={m.id} a={`/guias/${m.numero}`}>
                        <td>
                          <Link className="serial" to={`/guias/${m.numero}`}>
                            {m.numero}
                          </Link>
                          <span className="secundaria">{fechaHora(m.ocurridoEn)}</span>
                        </td>
                        <td>{m.tipoNombre}</td>
                        <td>{m.origen ?? (m.tipo === 'INGRESO' ? 'Proveedor' : '—')}</td>
                        <td>{m.destino ?? m.proyecto ?? '—'}</td>
                        <td>{m.responsable ?? '—'}</td>
                        <td className="derecha num">
                          {[m.equipos ? `${m.equipos} equipo${m.equipos === 1 ? '' : 's'}` : null, m.articulos ? `${m.articulos} artículo${m.articulos === 1 ? '' : 's'}` : null].filter(Boolean).join(', ') || '—'}
                        </td>
                      </FilaVinculada>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion datos={r.paginacion} alCambiar={(p) => fijar('pagina', String(p))} />
            </>
          )
        }
      </Lectura>
    </Pagina>
  );
}

/** La guía como documento: se puede imprimir para acompañar el material. */
export function Guia() {
  const { idONumero = '' } = useParams();
  const guia = useLectura<DetalleMovimiento>(`/movimientos/${encodeURIComponent(idONumero)}`);
  return (
    <Lectura estado={guia}>
      {(g) => {
        const desde = g.origen ?? (g.compra ? g.compra.proveedor : '—');
        const hacia = g.destino ?? g.proyecto ?? '—';
        const totalArticulos = g.articulos.reduce((s, a) => s + (a.valorUnitario ?? 0) * a.cantidad, 0);
        return (
          <Pagina
            titulo={g.tipoNombre}
            volver={{ a: '/guias', texto: 'Guías' }}
            acciones={
              <Boton variante="secundario" icono="imprimir" onClick={() => window.print()}>
                Imprimir guía
              </Boton>
            }
          >
            <article className="guia">
              <header className="guia-cabeza">
                <div>
                  <div className="guia-numero">{g.numero}</div>
                  <span className="guia-tipo">{g.tipoNombre}</span>
                </div>
                <div className="guia-cuando">
                  <div>{fechaHora(g.ocurridoEn)}</div>
                  {g.autor ? <div>Registró {g.autor}</div> : null}
                </div>
              </header>
              <div className="guia-ruta">
                <div className="lugar">
                  <small>Desde</small>
                  <strong>{desde}</strong>
                </div>
                <Icono nombre="flecha" tamano={28} className="flecha" />
                <div className="lugar">
                  <small>Hacia</small>
                  <strong>{hacia}</strong>
                  {g.proyecto && g.destino ? <small>Proyecto {g.proyecto}</small> : null}
                </div>
              </div>
              <div className="guia-cuerpo">
                {g.compra ? (
                  <p className="suave">
                    Factura {g.compra.numeroFactura} de {g.compra.proveedor} (NIT {g.compra.nit}), del {fecha(g.compra.fechaCompra)}.
                  </p>
                ) : null}
                {g.equipos.length > 0 ? (
                  <>
                    <h3>Equipos con serial ({g.equipos.length})</h3>
                    <div className="tabla-envoltura">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th>Serial</th>
                            <th>Equipo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.equipos.map((e) => (
                            <tr key={e.id}>
                              <td>
                                <Link className="serial" to={`/equipos/${e.id}`}>
                                  {e.serial}
                                </Link>
                              </td>
                              <td>
                                {e.tipoNombre} {e.marca} {e.modelo}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
                {g.articulos.length > 0 ? (
                  <>
                    <h3>Artículos por cantidad ({g.articulos.length})</h3>
                    <div className="tabla-envoltura">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th>Artículo</th>
                            <th className="derecha">Cantidad</th>
                            {g.compra ? <th className="derecha">Valor unitario</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {g.articulos.map((a) => (
                            <tr key={a.id}>
                              <td className="serial">{a.codigo}</td>
                              <td>
                                <Link to={`/articulos/${a.id}`}>{a.nombre}</Link>
                              </td>
                              <td className="derecha num">
                                {cantidad(a.cantidad)} {a.unidad}
                              </td>
                              {g.compra ? <td className="derecha num">{pesos(a.valorUnitario)}</td> : null}
                            </tr>
                          ))}
                          {g.compra ? (
                            <tr>
                              <td colSpan={3} className="derecha">
                                Total
                              </td>
                              <td className="derecha num">
                                <strong>{pesos(totalArticulos)}</strong>
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
                <h3>Responsable</h3>
                <p style={{ margin: 0 }}>{g.responsable ?? '—'}</p>
                {g.observacion ? (
                  <>
                    <h3>Observación</h3>
                    <p style={{ margin: 0 }}>{g.observacion}</p>
                  </>
                ) : null}
              </div>
            </article>
          </Pagina>
        );
      }}
    </Lectura>
  );
}

const COMANDO: Record<MovimientoEquipo, TipoComando> = {
  DESPACHO: 'REGISTRAR_DESPACHO',
  TRASLADO: 'REGISTRAR_TRASLADO',
  DEVOLUCION: 'REGISTRAR_DEVOLUCION',
};

const EXPLICACION: Record<MovimientoEquipo, string> = {
  DESPACHO: 'Sale material de una bodega hacia un proyecto. Los equipos quedan en campo y asignados a ese proyecto.',
  TRASLADO: 'Material que pasa de una bodega a otra.',
  DEVOLUCION: 'Material que vuelve de un proyecto a una bodega. Los equipos instalados primero deben retirarse.',
};

/** RL-05 (despacho), RL-06 (traslado) y RL-07 (devolución). */
export function NuevaGuia() {
  const { tipo: tipoRuta = '' } = useParams();
  const tipo = (MOVIMIENTOS_EQUIPO as string[]).includes(tipoRuta) ? (tipoRuta as MovimientoEquipo) : null;
  if (!tipo) return <Aviso tipo="error">Tipo de movimiento no válido.</Aviso>;
  return <FormularioGuia key={tipo} tipo={tipo} />;
}

function FormularioGuia({ tipo }: { tipo: MovimientoEquipo }) {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const sesion = useSesion();
  const f = useFormulario();
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>(tipo === 'TRASLADO' ? null : '/proyectos');

  const [origen, setOrigen] = useState(tipo === 'DEVOLUCION' ? (params.get('proyectoId') ?? '') : (params.get('bodegaId') ?? ''));
  const [destino, setDestino] = useState(tipo === 'DESPACHO' ? (params.get('proyectoId') ?? '') : '');
  const [responsable, setResponsable] = useState(sesion?.usuario.nombre ?? '');
  const [observacion, setObservacion] = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(params.get('equipoId') ? [params.get('equipoId')!] : []));
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  const rutaEquipos = !origen
    ? null
    : tipo === 'DEVOLUCION'
      ? `/equipos?proyectoId=${origen}&ubicacion=CAMPO&porPagina=100`
      : `/equipos?bodegaId=${origen}${tipo === 'DESPACHO' ? '&estado=EN_STOCK' : ''}&porPagina=100`;
  const equipos = useLectura<ListaEquipos>(rutaEquipos);
  const articulos = useLectura<{ datos: ArticuloConCantidad[] }>(!origen ? null : tipo === 'DEVOLUCION' ? `/existencias?proyectoId=${origen}` : `/existencias?bodegaId=${origen}`);

  const disponibles = (equipos.datos?.datos ?? []).filter((e) => e.estado !== 'DADO_DE_BAJA' && e.estado !== 'INSTALADO');
  const instalados = tipo === 'DEVOLUCION' ? (equipos.datos?.datos ?? []).filter((e) => e.estado === 'INSTALADO').length : 0;

  const cambiarOrigen = (id: string) => {
    setOrigen(id);
    setElegidos(new Set());
    setCantidades({});
  };
  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todos = () => setElegidos(elegidos.size === disponibles.length ? new Set() : new Set(disponibles.map((e) => e.id)));

  const lineas = Object.entries(cantidades).filter(([, c]) => c.trim() !== '');
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const lugares =
      tipo === 'DESPACHO'
        ? { bodegaOrigenId: origen, proyectoId: destino }
        : tipo === 'TRASLADO'
          ? { bodegaOrigenId: origen, bodegaDestinoId: destino }
          : { proyectoId: origen, bodegaDestinoId: destino };
    const r = await f.enviar(COMANDO[tipo], {
      ...lugares,
      equipos: [...elegidos],
      articulos: lineas.map(([articuloId, c]) => ({ articuloId, cantidad: aNumero(c) })),
      responsable,
      ...(observacion.trim() ? { observacion } : {}),
    });
    if (r) navegar(`/guias/${String(r.numero)}`);
  };

  const opcionesBodega = (excluir?: string) => (bodegas.datos?.datos ?? []).filter((b) => b.id !== excluir).map((b) => ({ valor: b.id, etiqueta: `${b.nombre} (${b.municipio})` }));
  const opcionesProyecto = (proyectos.datos?.datos ?? []).map((p) => ({ valor: p.id, etiqueta: `${p.nombre} (${p.municipio})` }));
  const visibles = ['bodegaOrigenId', 'bodegaDestinoId', 'proyectoId', 'equipos', 'articulos', 'responsable', 'observacion'];

  return (
    <Pagina titulo={NOMBRE_MOVIMIENTO[tipo]} descripcion={EXPLICACION[tipo]} volver={{ a: '/guias', texto: 'Guías' }}>
      <form className="formulario" onSubmit={guardar} noValidate style={{ maxWidth: 900 }}>
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={visibles} />
        <div className="superficie" style={{ padding: 20 }}>
          <div className="rejilla-campos">
            {tipo === 'DEVOLUCION' ? (
              <Lista etiqueta="Desde el proyecto" valor={origen} alCambiar={cambiarOrigen} error={f.errorDe('proyectoId')} opciones={opcionesProyecto} />
            ) : (
              <Lista etiqueta="Desde la bodega" valor={origen} alCambiar={cambiarOrigen} error={f.errorDe('bodegaOrigenId')} opciones={opcionesBodega()} />
            )}
            {tipo === 'DESPACHO' ? (
              <Lista etiqueta="Hacia el proyecto" valor={destino} alCambiar={setDestino} error={f.errorDe('proyectoId')} opciones={opcionesProyecto} />
            ) : (
              <Lista etiqueta="Hacia la bodega" valor={destino} alCambiar={setDestino} error={f.errorDe('bodegaDestinoId')} opciones={opcionesBodega(tipo === 'TRASLADO' ? origen : undefined)} />
            )}
          </div>
        </div>

        {!origen ? (
          <Aviso>Elija el origen para ver qué se puede mover desde allí.</Aviso>
        ) : (
          <>
            <Seccion
              titulo={`Equipos con serial (${elegidos.size} de ${disponibles.length})`}
              accion={
                disponibles.length > 1 ? (
                  <button type="button" className="boton-texto" onClick={todos}>
                    {elegidos.size === disponibles.length ? 'Quitar todos' : 'Elegir todos'}
                  </button>
                ) : null
              }
            >
              {f.errores.equipos ? <Aviso tipo="error">{f.errores.equipos}</Aviso> : null}
              {instalados > 0 ? (
                <Aviso tipo="atencion">
                  {instalados === 1 ? 'Hay 1 equipo instalado' : `Hay ${instalados} equipos instalados`} en viviendas de este proyecto: primero hay que retirarlos (RF-13).
                </Aviso>
              ) : null}
              {equipos.cargando && !equipos.datos ? (
                <Cargando texto="Buscando equipos…" />
              ) : disponibles.length === 0 ? (
                <Vacio titulo="No hay equipos para mover desde aquí." />
              ) : (
                <div className="superficie seleccion">
                  {disponibles.map((e) => (
                    <label key={e.id}>
                      <input type="checkbox" checked={elegidos.has(e.id)} onChange={() => alternar(e.id)} />
                      <span>
                        <span className="serial">{e.serial}</span>
                        <span className="secundaria suave" style={{ display: 'block', fontSize: 'var(--t-xs)' }}>
                          {e.tipoNombre} {e.marca} {e.modelo}
                        </span>
                      </span>
                      <InsigniaEstado estado={e.estado} />
                    </label>
                  ))}
                </div>
              )}
            </Seccion>

            <Seccion titulo="Artículos por cantidad">
              {f.errores.articulos ? <Aviso tipo="error">{f.errores.articulos}</Aviso> : null}
              {articulos.datos && articulos.datos.datos.length === 0 ? (
                <Vacio titulo="No hay artículos con existencias aquí." />
              ) : (
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th className="derecha">Disponible</th>
                        <th style={{ width: 180 }}>Cantidad a mover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articulos.datos?.datos.map((a) => {
                        // Posición en la lista enviada, para ubicar el error del servidor.
                        const indice = lineas.findIndex(([id]) => id === a.id);
                        return (
                          <tr key={a.id}>
                            <td>
                              {a.nombre}
                              <span className="secundaria serial">{a.codigo}</span>
                            </td>
                            <td className="derecha num">
                              {cantidad(a.cantidad)} {a.unidad}
                            </td>
                            <td>
                              <Campo
                                etiqueta={`Cantidad de ${a.nombre}`}
                                clase="visualmente-oculto-etiqueta"
                                valor={cantidades[a.id] ?? ''}
                                alCambiar={(c) => setCantidades((x) => ({ ...x, [a.id]: c }))}
                                modoTeclado="decimal"
                                marcador="0"
                                error={indice >= 0 ? f.errorDe(`articulos.${indice}`) : undefined}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>
          </>
        )}

        <div className="rejilla-campos">
          <Campo etiqueta="Responsable" valor={responsable} alCambiar={setResponsable} error={f.errorDe('responsable')} ayuda="Quién transporta o recibe el material." />
        </div>
        <Area etiqueta="Observación (opcional)" valor={observacion} alCambiar={setObservacion} error={f.errorDe('observacion')} />
        <div className="pie-formulario">
          <Boton tipo="submit" cargando={f.enviando}>
            Registrar {NOMBRE_MOVIMIENTO[tipo].toLowerCase()}
          </Boton>
        </div>
      </form>
    </Pagina>
  );
}
