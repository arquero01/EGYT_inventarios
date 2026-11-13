import { NOMBRE_ESTADO, type EstadoEquipo } from '@egt/domain';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { FalloApi, enviarComando, enviarComandoConResultado } from '../api.ts';
import { useEsAdmin, useLectura } from '../ganchos.ts';
import { TITULOS_HISTORICO, idFijo, leerHistorico, type ClaveHistorico, type FilaHistorico } from '../historico.ts';
import type { Celda } from '../importacion.ts';
import type { BodegaEnLista } from '../tipos.ts';
import { Aviso, Boton, Insignia, InsigniaEstado, Lista, Seccion } from '../ui/componentes.tsx';

export interface HojaArchivo {
  nombre: string;
  datos: Celda[][];
  /** Colores de relleno por fila (de Excel, desde 1) y columna. */
  colores?: Map<number, Map<number, string>> | undefined;
}

type Estado =
  | { estado: 'enviando' }
  | { estado: 'ok'; equipoId: string; serial: string }
  | { estado: 'existe' }
  | { estado: 'error'; mensaje: string };

const ENCABEZADO = { fontWeight: 'bold' as const, backgroundColor: '#0A2540', color: '#FFFFFF' };
/** Envíos a la vez: con internet lento (Codespaces) acelera mucho y el servidor los ordena solo. */
const EN_PARALELO = 6;
const ORDEN_ESTADOS: EstadoEquipo[] = ['INSTALADO', 'EN_STOCK', 'EN_MANTENIMIENTO', 'DADO_DE_BAJA'];
const COLUMNAS_REPORTE = Object.keys(TITULOS_HISTORICO) as ClaveHistorico[];

/**
 * Importación del archivo de inventario que ya maneja la empresa. Cada equipo
 * entra en su estado de hoy, con su usuario y su zona (centro de costos); lo
 * que falte queda "por completar".
 */
export function ImportarHistorico({ archivo, hojas }: { archivo: string; hojas: HojaArchivo[] }) {
  const esAdmin = useEsAdmin();
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const detener = useRef(false);

  // La hoja con más equipos primero (en el archivo de la empresa, «Histórico»).
  const ordenadas = useMemo(
    () =>
      hojas
        .map((h) => ({ ...h, equipos: leerHistorico(h.datos, { hoja: h.nombre, colores: h.colores }).filas.length }))
        .sort((a, b) => b.equipos - a.equipos),
    [hojas],
  );
  const [nombreHoja, setNombreHoja] = useState(ordenadas[0]?.nombre ?? '');
  const [bodegaId, setBodegaId] = useState('');
  const [estados, setEstados] = useState<Record<number, Estado>>({});
  const [importando, setImportando] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'errores' | 'pendientes' | 'verificar'>('todas');

  const hoja = ordenadas.find((h) => h.nombre === nombreHoja) ?? ordenadas[0];
  const lectura = useMemo(
    () => (hoja ? leerHistorico(hoja.datos, { hoja: hoja.nombre, bodegaId: bodegaId || undefined, colores: hoja.colores }) : null),
    [hoja, bodegaId],
  );

  if (!hoja || !lectura) return null;

  const listos = lectura.filas.filter((f) => f.comando);
  const conErrores = lectura.filas.filter((f) => !f.comando);
  const guardados = listos.filter((f) => ['ok', 'existe'].includes(estados[f.fila]?.estado ?? '')).length;
  const yaExistian = listos.filter((f) => estados[f.fila]?.estado === 'existe').length;
  const fallidos = listos.filter((f) => estados[f.fila]?.estado === 'error');
  const porHacer = listos.filter((f) => !['ok', 'existe'].includes(estados[f.fila]?.estado ?? ''));
  const terminado = !importando && Object.keys(estados).length > 0;

  const cambiarHoja = (nombre: string) => {
    setNombreHoja(nombre);
    setEstados({});
    setFiltro('todas');
  };

  const enviarFila = async (f: FilaHistorico) => {
    setEstados((x) => ({ ...x, [f.fila]: { estado: 'enviando' } }));
    try {
      // El id sale del contenido de la fila: reimportar el mismo archivo no duplica nada.
      const { respuesta: r, duplicado } = await enviarComandoConResultado('IMPORTAR_HISTORICO', f.comando!.payload, f.comando!.id);
      // Ya estaba importado (de una versión que no leía los colores): se le suman las celdas por verificar.
      if (duplicado && f.verificar.length > 0) {
        await enviarComando(
          'EDITAR_EQUIPO',
          { equipoId: f.comando!.payload.equipoId, agregarPendientes: f.verificar, motivo: 'Celdas de color en el archivo' },
          idFijo(`${f.comando!.id}|verificar`),
        ).catch((e: unknown) => {
          // EDIT-02: ya los tenía. Otro error no impide dar la fila por importada.
          if (!(e instanceof FalloApi)) throw e;
        });
      }
      setEstados((x) => ({
        ...x,
        [f.fila]: duplicado ? { estado: 'existe' } : { estado: 'ok', equipoId: String(f.comando!.payload.equipoId), serial: String(r.serial ?? f.vista.codigo) },
      }));
      return true;
    } catch (e) {
      if (e instanceof FalloApi && e.error.codigo === 'RF-07') {
        setEstados((x) => ({ ...x, [f.fila]: { estado: 'existe' } }));
        return true;
      }
      const mensaje =
        e instanceof FalloApi ? [e.error.mensaje, ...e.error.detalles.map((d) => d.problema)].filter((v, i, a) => a.indexOf(v) === i).join(' ') : String(e);
      setEstados((x) => ({ ...x, [f.fila]: { estado: 'error', mensaje } }));
      // Sin conexión o sin sesión no tiene sentido seguir.
      if (e instanceof FalloApi && ['SIN_CONEXION', 'NO_AUTENTICADO', 'PROHIBIDO'].includes(e.error.tipo)) detener.current = true;
      return false;
    }
  };

  const importar = async (filas: FilaHistorico[]) => {
    detener.current = false;
    setImportando(true);
    const cola = filas.filter((f) => f.comando);
    const trabajador = async () => {
      while (!detener.current) {
        const f = cola.shift();
        if (!f) return;
        await enviarFila(f);
      }
    };
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));
    setImportando(false);
  };

  const descargarReporte = async () => {
    const { default: escribir } = await import('write-excel-file/browser');
    const filas = lectura.filas.filter((f) => !f.comando || estados[f.fila]?.estado === 'error' || f.pendientes.length > 0 || f.verificar.length > 0);
    await escribir(
      [
        [
          { value: 'Fila', ...ENCABEZADO },
          ...COLUMNAS_REPORTE.map((c) => ({ value: TITULOS_HISTORICO[c], ...ENCABEZADO })),
          { value: 'Error', ...ENCABEZADO },
          { value: 'Por verificar o completar', ...ENCABEZADO },
        ],
        ...filas.map((f) => {
          const e = estados[f.fila];
          const error = f.errores.length > 0 ? f.errores.join(' · ') : e?.estado === 'error' ? e.mensaje : '';
          return [
            f.fila,
            ...COLUMNAS_REPORTE.map((c) => f.originales[c] ?? ''),
            { value: error, color: '#B3261E' },
            [...f.verificar, ...f.pendientes].join(', '),
          ];
        }),
      ],
      {
        sheet: 'Revisar',
        columns: [{ width: 6 }, ...COLUMNAS_REPORTE.map(() => ({ width: 16 })), { width: 60 }, { width: 50 }],
        stickyRowsCount: 1,
      },
    ).toFile('historico-por-revisar.xlsx');
  };

  const visibles = lectura.filas.filter((f) =>
    filtro === 'errores'
      ? !f.comando || estados[f.fila]?.estado === 'error'
      : filtro === 'pendientes'
        ? f.comando && f.pendientes.length > 0
        : filtro === 'verificar'
          ? f.verificar.length > 0
          : true,
  );

  return (
    <Seccion titulo="Archivo de inventario de la empresa">
      <div className="formulario">
        <Aviso tipo="info">
          Se reconoció el formato del inventario de la empresa en <b>{archivo}</b>. Cada equipo entra en el estado en que está hoy: con su usuario
          (cédula, nombre, NIU y fecha de entrega), y el <b>centro de costos queda como zona</b>. El código interno (EG&amp;T-…) pasa a ser su identificador.
          El proyecto y los datos que no estén en el archivo quedan marcados <b>«por completar»</b>, y las <b>celdas pintadas</b> (amarillo,
          rojo, verde…) quedan <b>«por verificar»</b>.
        </Aviso>
        {!esAdmin ? <Aviso tipo="error">Solo un administrador puede importar el inventario histórico. Pídale a un administrador que lo haga.</Aviso> : null}

        <div className="fila-campos">
          {ordenadas.length > 1 ? (
            <Lista
              etiqueta="Hoja del archivo"
              valor={hoja.nombre}
              alCambiar={cambiarHoja}
              vacia={null}
              opciones={ordenadas.map((h) => ({ valor: h.nombre, etiqueta: `${h.nombre} (${h.equipos} filas)` }))}
              ayuda="Se importa una hoja a la vez."
            />
          ) : null}
          {lectura.resumen.enStock > 0 ? (
            <Lista
              etiqueta="Bodega para los equipos disponibles"
              valor={bodegaId}
              alCambiar={setBodegaId}
              opciones={(bodegas.datos?.datos ?? []).map((b) => ({ valor: b.id, etiqueta: b.nombre }))}
              ayuda={`${lectura.resumen.enStock} equipos figuran como disponibles y deben quedar en una bodega.`}
            />
          ) : null}
        </div>

        {lectura.problemas.map((p) => (
          <Aviso key={p} tipo="error">
            {p}
          </Aviso>
        ))}

        <div className="resumen-historico">
          <div className="cifra">
            <b className="num">{listos.length.toLocaleString('es-CO')}</b>
            <span>equipos listos para importar</span>
          </div>
          {ORDEN_ESTADOS.filter((e) => lectura.resumen.porEstado[e]).map((e) => (
            <div className="cifra" key={e}>
              <b className="num">{lectura.resumen.porEstado[e]!.toLocaleString('es-CO')}</b>
              <InsigniaEstado estado={e} />
            </div>
          ))}
          <div className="cifra">
            <b className="num">{lectura.resumen.conPendientes.toLocaleString('es-CO')}</b>
            <span>con datos por completar</span>
          </div>
          {lectura.resumen.reposiciones > 0 ? (
            <div className="cifra">
              <b className="num">{lectura.resumen.reposiciones.toLocaleString('es-CO')}</b>
              <span>entregados como reposición (reemplazaron a uno con fallas)</span>
            </div>
          ) : null}
          {lectura.resumen.porVerificar > 0 ? (
            <div className="cifra atencion">
              <b className="num">{lectura.resumen.porVerificar.toLocaleString('es-CO')}</b>
              <span>con celdas de color (por verificar)</span>
            </div>
          ) : null}
          {conErrores.length > 0 ? (
            <div className="cifra peligro">
              <b className="num">{conErrores.length}</b>
              <span>filas con errores (no se importan)</span>
            </div>
          ) : null}
        </div>

        {lectura.resumen.porZona.length > 0 ? (
          <p className="zonas-historico">
            <span className="suave">Zonas: </span>
            {lectura.resumen.porZona.map(([zona, n]) => (
              <span key={zona} className="chip">
                {zona} <b className="num">{n}</b>
              </span>
            ))}
          </p>
        ) : null}

        <div className="resumen-importar">
          {importando || terminado ? (
            <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={listos.length} aria-valuenow={guardados}>
              <span style={{ width: `${(100 * guardados) / Math.max(1, listos.length)}%` }} />
            </div>
          ) : null}
          <div className="acciones">
            {importando ? (
              <>
                <span className="suave num">
                  Importando {guardados.toLocaleString('es-CO')} de {listos.length.toLocaleString('es-CO')}…
                </span>
                <Boton variante="secundario" onClick={() => (detener.current = true)}>
                  Detener
                </Boton>
              </>
            ) : porHacer.length > 0 ? (
              <Boton icono="mas" disabled={!esAdmin} onClick={() => void importar(fallidos.length > 0 ? fallidos : porHacer)}>
                {fallidos.length > 0
                  ? `Reintentar ${fallidos.length === 1 ? 'el que falló' : `los ${fallidos.length} que fallaron`}`
                  : `Importar ${porHacer.length.toLocaleString('es-CO')} equipos`}
              </Boton>
            ) : null}
            {!importando ? (
              <Boton variante="secundario" onClick={() => void descargarReporte()}>
                Descargar filas por revisar
              </Boton>
            ) : null}
          </div>
          {terminado && guardados > 0 ? (
            <Aviso tipo="exito">
              {guardados - yaExistian > 0 ? `${(guardados - yaExistian).toLocaleString('es-CO')} equipos importados` : 'No había equipos nuevos'}
              {yaExistian > 0 ? `; ${yaExistian.toLocaleString('es-CO')} ya estaban en el sistema y no se duplicaron` : ''}.{' '}
              <Link to="/inventario?pendientes=si">Ver los que tienen datos por completar</Link>
            </Aviso>
          ) : null}
          {terminado && fallidos.length > 0 ? (
            <Aviso tipo="error">{fallidos.length === 1 ? '1 equipo no se pudo importar' : `${fallidos.length} equipos no se pudieron importar`}: vea el motivo en la tabla.</Aviso>
          ) : null}
        </div>

        <div className="opciones-radio" role="radiogroup" aria-label="Filas a mostrar">
          {(
            [
              ['todas', `Todas (${lectura.filas.length})`],
              ['pendientes', `Por completar (${lectura.resumen.conPendientes})`],
              ...(lectura.resumen.porVerificar > 0 ? ([['verificar', `Celdas de color (${lectura.resumen.porVerificar})`]] as const) : []),
              ['errores', `Con errores (${conErrores.length + fallidos.length})`],
            ] as const
          ).map(([valor, etiqueta]) => (
            <label key={valor}>
              <input type="radio" name="filtro-historico" checked={filtro === valor} onChange={() => setFiltro(valor)} />
              {etiqueta}
            </label>
          ))}
        </div>

        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th className="derecha">Fila</th>
                <th>Código</th>
                <th>Equipo</th>
                <th>Zona y usuario</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 300).map((f) => {
                const e = estados[f.fila];
                return (
                  <tr key={f.fila}>
                    <td className="derecha num suave">{f.fila}</td>
                    <td>
                      {e?.estado === 'ok' ? (
                        <Link className="serial" to={`/equipos/${e.equipoId}`}>
                          {e.serial}
                        </Link>
                      ) : (
                        <span className={f.comando?.payload.codigoInterno || f.comando?.payload.serialFabricante ? 'serial' : 'suave'}>{f.vista.codigo}</span>
                      )}
                    </td>
                    <td>
                      {f.vista.tipo || '—'}
                      <span className="secundaria">{f.vista.detalle}</span>
                    </td>
                    <td>
                      {f.vista.zona || '—'}
                      <span className="secundaria">{f.vista.usuario}</span>
                    </td>
                    <td className="estado-fila">
                      {f.errores.length > 0 ? (
                        <ul>
                          {f.errores.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      ) : e?.estado === 'error' ? (
                        <ul>
                          <li>{e.mensaje}</li>
                        </ul>
                      ) : (
                        <>
                          {e?.estado === 'ok' ? (
                            <Insignia clase="INSTALADO">Importado</Insignia>
                          ) : e?.estado === 'existe' ? (
                            <Insignia clase="INACTIVA">Ya estaba</Insignia>
                          ) : e?.estado === 'enviando' ? (
                            <span className="suave">Guardando…</span>
                          ) : f.vista.estado ? (
                            <Insignia clase={f.vista.estado}>{NOMBRE_ESTADO[f.vista.estado]}</Insignia>
                          ) : null}
                          {f.verificar.length > 0 ? <span className="secundaria texto-verificar">{f.verificar.join(' · ')}</span> : null}
                          {f.pendientes.length > 0 ? <span className="secundaria">Por completar: {f.pendientes.join(', ')}</span> : null}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visibles.length > 300 ? <p className="suave">Se muestran las primeras 300 filas; al importar se envían todas.</p> : null}
      </div>
    </Seccion>
  );
}
