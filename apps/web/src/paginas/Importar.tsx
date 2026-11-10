import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { FalloApi, enviarComando, nuevoId } from '../api.ts';
import { useLectura } from '../ganchos.ts';
import { leerColores } from '../colores.ts';
import { esFormatoHistorico } from '../historico.ts';
import { COLUMNAS, MAXIMO_FILAS, leerCsv, leerHoja, type Celda, type FilaImportacion, type ResultadoLectura } from '../importacion.ts';
import { ImportarHistorico, type HojaArchivo } from './ImportarHistorico.tsx';
import type { BodegaEnLista, ProyectoEnLista } from '../tipos.ts';
import { Aviso, Boton, Insignia, Pagina, Seccion } from '../ui/componentes.tsx';
import { Icono } from '../ui/iconos.tsx';

type Estado = { estado: 'enviando' } | { estado: 'ok'; equipoId: string; serial: string } | { estado: 'error'; mensaje: string };

const ENCABEZADO = { fontWeight: 'bold' as const, backgroundColor: '#0A2540', color: '#FFFFFF' };

/** Carga masiva de equipos desde Excel, Google Sheets (descargado como .xlsx) o CSV. */
export function Importar() {
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>('/proyectos');
  const bodegas = useLectura<{ datos: BodegaEnLista[] }>('/bodegas');
  const entrada = useRef<HTMLInputElement>(null);
  const detener = useRef(false);

  const [archivo, setArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [estados, setEstados] = useState<Record<number, Estado>>({});
  const [importando, setImportando] = useState(false);
  const [soloErrores, setSoloErrores] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  /** Archivo en el formato de inventario de la empresa (hojas que lo tienen). */
  const [historico, setHistorico] = useState<HojaArchivo[] | null>(null);

  const listos = lectura?.filas.filter((f) => f.comando) ?? [];
  const conErrores = lectura?.filas.filter((f) => !f.comando) ?? [];
  const importados = Object.values(estados).filter((e) => e.estado === 'ok').length;
  const fallidos = listos.filter((f) => estados[f.fila]?.estado === 'error');
  const pendientes = listos.filter((f) => estados[f.fila]?.estado !== 'ok');
  const enviados = Object.values(estados).filter((e) => e.estado !== 'enviando').length;
  const lugaresListos = Boolean(proyectos.datos && bodegas.datos);

  // ── Plantilla ────────────────────────────────────────────────────────────
  const descargarPlantilla = async () => {
    const { default: escribir } = await import('write-excel-file/browser');
    const nombresProyectos = proyectos.datos?.datos.map((p) => p.nombre) ?? [];
    const nombresBodegas = bodegas.datos?.datos.map((b) => b.nombre) ?? [];
    const filasLugares = Array.from({ length: Math.max(nombresProyectos.length, nombresBodegas.length, 1) }, (_, i) => [
      nombresProyectos[i] ?? (i === 0 ? '(todavía no hay proyectos)' : null),
      nombresBodegas[i] ?? (i === 0 ? '(todavía no hay bodegas)' : null),
    ]);
    await escribir(
      [
        {
          sheet: 'Equipos',
          data: [COLUMNAS.map((c) => ({ value: c.titulo, ...ENCABEZADO }))],
          columns: COLUMNAS.map((c) => ({ width: Math.max(14, c.titulo.length + 4) })),
          stickyRowsCount: 1,
        },
        {
          sheet: 'Instrucciones',
          data: [
            ['Columna', '¿Obligatoria?', 'Qué escribir'].map((t) => ({ value: t, ...ENCABEZADO })),
            ...COLUMNAS.map((c) => [{ value: c.titulo, fontWeight: 'bold' as const }, c.obligatoria ? 'Sí' : 'No', c.ayuda]),
            [],
            ['Una fila por cada equipo. Los nombres de proyecto y bodega deben existir en el sistema (vea la hoja «Proyectos y bodegas»).'],
            [`Máximo ${MAXIMO_FILAS} equipos por archivo.`],
          ],
          columns: [{ width: 22 }, { width: 14 }, { width: 80 }],
        },
        {
          sheet: 'Proyectos y bodegas',
          data: [[{ value: 'Proyectos', ...ENCABEZADO }, { value: 'Bodegas', ...ENCABEZADO }], ...filasLugares],
          columns: [{ width: 40 }, { width: 30 }],
        },
      ],
      {},
    ).toFile('plantilla-equipos-egt.xlsx');
  };

  // ── Lectura del archivo ──────────────────────────────────────────────────
  const leerArchivo = async (f: File) => {
    setArchivo(f.name);
    setErrorArchivo(null);
    setLectura(null);
    setHistorico(null);
    setEstados({});
    setSoloErrores(false);
    if (!proyectos.datos || !bodegas.datos) {
      setErrorArchivo('Todavía se están cargando los proyectos y las bodegas. Intente de nuevo en un momento.');
      return;
    }
    setLeyendo(true);
    try {
      const contexto = {
        proyectos: proyectos.datos.datos.map((p) => ({ id: p.id, nombre: p.nombre })),
        bodegas: bodegas.datos.datos.map((b) => ({ id: b.id, nombre: b.nombre })),
        nuevoId,
      };
      let resultado: ResultadoLectura;
      if (/\.csv$/i.test(f.name)) {
        const filas = leerCsv(await f.text());
        if (esFormatoHistorico(filas)) {
          setHistorico([{ nombre: f.name, datos: filas }]);
          return;
        }
        resultado = leerHoja(filas, contexto);
      } else if (/\.xlsx$/i.test(f.name)) {
        const { default: leerXlsx } = await import('read-excel-file/browser');
        const hojas = await leerXlsx(f);
        // El archivo de inventario de la empresa tiene su propio lector.
        const deEmpresa = hojas.filter((h) => esFormatoHistorico(h.data as unknown as Celda[][]));
        if (deEmpresa.length > 0) {
          // Las celdas pintadas (amarillo, rojo…) son datos que la empresa marcó para rectificar.
          const colores = leerColores(new Uint8Array(await f.arrayBuffer()));
          setHistorico(deEmpresa.map((h) => ({ nombre: h.sheet, datos: h.data as unknown as Celda[][], colores: colores.get(h.sheet) })));
          return;
        }
        // La primera hoja con encabezados reconocibles (la plantilla trae otras).
        const lecturas = hojas.map((h) => leerHoja(h.data as unknown as Celda[][], contexto));
        resultado = lecturas.find((l) => l.filas.length > 0) ?? lecturas.find((l) => Object.keys(l.columnas).length >= 3) ?? lecturas[0]!;
      } else {
        setErrorArchivo('El archivo debe ser de Excel (.xlsx) o CSV. Si tiene un .xls antiguo, ábralo en Excel y guárdelo como .xlsx.');
        return;
      }
      setLectura(resultado);
      setSoloErrores(resultado.filas.some((x) => !x.comando) && resultado.filas.every((x) => !x.comando));
    } catch (e) {
      setErrorArchivo(`No se pudo leer el archivo. Revise que no esté dañado ni protegido con contraseña. (${String(e)})`);
    } finally {
      setLeyendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  const alSoltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const f = e.dataTransfer.files[0];
    if (f) void leerArchivo(f);
  };

  // ── Importación ──────────────────────────────────────────────────────────
  const importar = async (filas: FilaImportacion[]) => {
    detener.current = false;
    setImportando(true);
    // Uno a uno y en orden: así los seriales de la empresa quedan consecutivos.
    for (const f of filas) {
      if (detener.current) break;
      if (!f.comando) continue;
      setEstados((x) => ({ ...x, [f.fila]: { estado: 'enviando' } }));
      try {
        // El id es el mismo en cada intento: si ya se había guardado, no se duplica.
        const r = await enviarComando('REGISTRAR_INGRESO', f.comando.payload, f.comando.id);
        setEstados((x) => ({ ...x, [f.fila]: { estado: 'ok', equipoId: String(f.comando!.payload.equipoId), serial: String(r.serial ?? f.vista.serial) } }));
      } catch (e) {
        const mensaje =
          e instanceof FalloApi
            ? [e.error.mensaje, ...e.error.detalles.map((d) => d.problema)].filter((v, i, a) => a.indexOf(v) === i).join(' ')
            : String(e);
        setEstados((x) => ({ ...x, [f.fila]: { estado: 'error', mensaje } }));
        // Sin conexión no tiene sentido seguir intentando las demás.
        if (e instanceof FalloApi && (e.error.tipo === 'SIN_CONEXION' || e.error.tipo === 'NO_AUTENTICADO')) break;
      }
    }
    setImportando(false);
  };

  const descargarErrores = async () => {
    if (!lectura) return;
    const { default: escribir } = await import('write-excel-file/browser');
    const filas = lectura.filas.filter((f) => !f.comando || estados[f.fila]?.estado === 'error');
    await escribir(
      [
        [{ value: 'Fila', ...ENCABEZADO }, ...COLUMNAS.map((c) => ({ value: c.titulo, ...ENCABEZADO })), { value: 'Error', ...ENCABEZADO }],
        ...filas.map((f) => {
          const estado = estados[f.fila];
          const error = f.errores.length > 0 ? f.errores.join(' · ') : estado?.estado === 'error' ? estado.mensaje : '';
          return [f.fila, ...COLUMNAS.map((c) => f.originales[c.clave] ?? ''), { value: error, color: '#B3261E' }];
        }),
      ],
      { sheet: 'Por corregir', columns: [{ width: 6 }, ...COLUMNAS.map(() => ({ width: 18 })), { width: 70 }], stickyRowsCount: 1 },
    ).toFile('equipos-por-corregir.xlsx');
  };

  const visibles = (lectura?.filas ?? []).filter((f) => !soloErrores || !f.comando || estados[f.fila]?.estado === 'error');
  const terminado = !importando && enviados > 0;

  return (
    <Pagina
      titulo="Importar equipos desde Excel"
      descripcion="Cargue muchos equipos de una vez. Cada fila se revisa con las mismas reglas del ingreso manual antes de guardar."
      volver={{ a: '/inventario', texto: 'Equipos' }}
    >
      <ol className="pasos-importar">
        <li>
          <h2>Prepare el archivo</h2>
          <p>
            Use la plantilla, o su propia hoja con columnas de nombres parecidos. Desde Google Sheets: <b>Archivo → Descargar → Microsoft Excel (.xlsx)</b>.
            Si el serial viene vacío, el sistema asigna uno de la empresa. También puede subir directamente el archivo de inventario de la empresa
            (el de la hoja «Histórico»): el sistema lo reconoce solo.
          </p>
          <Boton variante="secundario" icono="guias" onClick={() => void descargarPlantilla()} disabled={!lugaresListos}>
            Descargar plantilla
          </Boton>
        </li>
        <li>
          <h2>Suba el archivo</h2>
          <label
            className={`zona-archivo ${arrastrando ? 'arrastrando' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={alSoltar}
          >
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void leerArchivo(f);
              }}
              disabled={importando}
            />
            <Icono nombre="guias" tamano={28} />
            <span>
              <b>{archivo ?? 'Elija un archivo .xlsx o .csv'}</b>
              <span className="suave">{archivo ? 'Toque para elegir otro' : 'o arrástrelo aquí'}</span>
            </span>
          </label>
          {leyendo ? <p className="suave">Leyendo el archivo…</p> : null}
          {errorArchivo ? <Aviso tipo="error">{errorArchivo}</Aviso> : null}
        </li>
      </ol>

      {historico && archivo ? <ImportarHistorico key={archivo + historico.length} archivo={archivo} hojas={historico} /> : null}

      {lectura ? (
        <Seccion
          titulo="Revise antes de importar"
          accion={
            conErrores.length > 0 || fallidos.length > 0 ? (
              <label className="interruptor">
                <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} />
                Ver solo filas con errores
              </label>
            ) : null
          }
        >
          <div className="formulario">
            {lectura.problemas.map((p) => (
              <Aviso key={p} tipo={lectura.filas.length === 0 ? 'error' : 'atencion'}>
                {p}
              </Aviso>
            ))}

            {lectura.filas.length > 0 ? (
              <div className="resumen-importar">
                <p>
                  <b className="num">{listos.length}</b> {listos.length === 1 ? 'equipo listo' : 'equipos listos'}
                  {conErrores.length > 0 ? (
                    <>
                      {', '}
                      <b className="num" style={{ color: 'var(--peligro)' }}>
                        {conErrores.length}
                      </b>{' '}
                      con errores que no se importarán
                    </>
                  ) : null}
                  .
                </p>
                {importando ? (
                  <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={pendientes.length} aria-valuenow={enviados}>
                    <span style={{ width: `${(100 * importados) / Math.max(1, listos.length)}%` }} />
                  </div>
                ) : null}
                <div className="acciones">
                  {importando ? (
                    <>
                      <span className="suave num">
                        Importando {importados} de {listos.length}…
                      </span>
                      <Boton variante="secundario" onClick={() => (detener.current = true)}>
                        Detener
                      </Boton>
                    </>
                  ) : pendientes.length > 0 ? (
                    <Boton icono="mas" onClick={() => void importar(fallidos.length > 0 ? fallidos : pendientes)}>
                      {fallidos.length > 0
                        ? `Reintentar ${fallidos.length === 1 ? 'el que falló' : `los ${fallidos.length} que fallaron`}`
                        : `Importar ${pendientes.length} ${pendientes.length === 1 ? 'equipo' : 'equipos'}`}
                    </Boton>
                  ) : null}
                  {!importando && (conErrores.length > 0 || fallidos.length > 0) ? (
                    <Boton variante="secundario" onClick={() => void descargarErrores()}>
                      Descargar filas por corregir
                    </Boton>
                  ) : null}
                </div>
                {terminado && importados > 0 ? (
                  <Aviso tipo="exito">
                    {importados === 1 ? 'Se importó 1 equipo' : `Se importaron ${importados} equipos`}. Quedaron en stock en su bodega.{' '}
                    <Link to="/inventario">Ver equipos</Link>
                  </Aviso>
                ) : null}
                {terminado && fallidos.length > 0 ? (
                  <Aviso tipo="error">
                    {fallidos.length === 1 ? '1 equipo no se pudo importar' : `${fallidos.length} equipos no se pudieron importar`}: vea el motivo en la tabla.
                  </Aviso>
                ) : null}
              </div>
            ) : null}

            {visibles.length > 0 ? (
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th className="derecha">Fila</th>
                      <th>Serial</th>
                      <th>Equipo</th>
                      <th>Proyecto y bodega</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.slice(0, 500).map((f) => {
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
                              <span className={f.originales.serial ? 'serial' : 'suave'}>{f.vista.serial}</span>
                            )}
                          </td>
                          <td>
                            {f.vista.tipo || '—'}
                            <span className="secundaria">{f.vista.marcaModelo}</span>
                          </td>
                          <td>
                            {f.vista.proyecto || '—'}
                            <span className="secundaria">{f.vista.bodega}</span>
                          </td>
                          <td className="estado-fila">
                            {f.errores.length > 0 ? (
                              <ul>
                                {f.errores.map((x) => (
                                  <li key={x}>{x}</li>
                                ))}
                              </ul>
                            ) : e?.estado === 'ok' ? (
                              <Insignia clase="INSTALADO">Importado</Insignia>
                            ) : e?.estado === 'enviando' ? (
                              <span className="suave">Guardando…</span>
                            ) : e?.estado === 'error' ? (
                              <ul>
                                <li>{e.mensaje}</li>
                              </ul>
                            ) : (
                              <Insignia clase="EN_STOCK">Lista</Insignia>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {visibles.length > 500 ? <p className="suave">Se muestran las primeras 500 filas; las demás también se importan.</p> : null}
          </div>
        </Seccion>
      ) : null}
    </Pagina>
  );
}
