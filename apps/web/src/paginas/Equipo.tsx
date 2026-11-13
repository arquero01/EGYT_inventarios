import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { NOMBRE_MOVIMIENTO, NOMBRE_ESTADO, NOMBRE_TIPO_ENTREGA, type Accion, type TipoComando } from '@egt/domain';
import { nuevoId } from '../api.ts';
import { cantidad, fecha, fechaHora, hoy, pesos } from '../formato.ts';
import { useEsAdmin, useFormulario, useLectura, useSesion } from '../ganchos.ts';
import { NOMBRE_ACCION } from '../nombres.ts';
import type { HojaDeVida, Instalacion, ProyectoEnLista } from '../tipos.ts';
import { EditarEquipo } from './EditarEquipo.tsx';
import { ReponerEquipo } from './ReponerEquipo.tsx';
import { Area, Aviso, Boton, BotonEnlace, Cajon, Campo, Datos, ErrorFormulario, InsigniaEstado, Lectura, Lista, Pagina, Seccion } from '../ui/componentes.tsx';

/** RF-16 (hoja de vida) y RF-17 (historial), con las acciones que permite su estado. */
export function Equipo() {
  const { id = '' } = useParams();
  const hoja = useLectura<HojaDeVida>(`/equipos/${encodeURIComponent(id)}`);
  const esAdmin = useEsAdmin();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  // Al pasar a otro equipo (p. ej. desde un enlace) se limpia el aviso del anterior.
  useEffect(() => setHecho(null), [id]);
  const [editando, setEditando] = useState(false);
  const [reponiendo, setReponiendo] = useState(false);

  return (
    <Lectura estado={hoja}>
      {(d) => {
        const e = d.equipo;
        const acciones = e.accionesPermitidas.filter((a) => a !== 'DAR_DE_BAJA' || esAdmin);
        const origen = e.ubicacion === 'BODEGA' ? `bodegaId=${e.bodega?.id ?? ''}` : `proyectoId=${d.proyecto?.id ?? ''}`;
        const nombreAccion = (a: Accion) => (a === 'CAMBIAR_PROYECTO' && !d.proyecto ? 'Asignar proyecto' : NOMBRE_ACCION[a]);
        const instalacion = d.instalacionActual;
        // Corregir datos: administradores; de baja, solo los que vinieron del histórico (RF-15).
        const puedeEditar = esAdmin && (e.estado !== 'DADO_DE_BAJA' || d.historial.some((h) => h.tipo === 'IMPORTACION'));
        return (
          <Pagina
            titulo={<span className="serial">{e.serial}</span>}
            descripcion={`${[e.tipoNombre, e.marca, e.modelo].filter(Boolean).join(' ')}${e.potencia != null ? `, ${cantidad(e.potencia)} ${e.unidad ?? ''}` : ''}. ${ORIGEN_SERIAL[e.origenSerial]}`}
            volver={{ a: '/inventario', texto: 'Equipos' }}
            acciones={<InsigniaEstado estado={e.estado} />}
          >
            {hecho ? <Aviso tipo="exito">{hecho}</Aviso> : null}
            {e.estado === 'DADO_DE_BAJA' ? <Aviso tipo="info">Este equipo está dado de baja: su registro ya no se puede modificar (RF-15).</Aviso> : null}
            {d.reemplazadoPor.length > 0 ? (
              <Aviso tipo="info">
                Este equipo se le cambió al usuario por falla. Lo reemplazó{' '}
                {d.reemplazadoPor.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 ? ', ' : ''}
                    <Link className="serial" to={`/equipos/${r.id}`}>
                      {r.serial}
                    </Link>{' '}
                    el {fecha(r.fecha)}
                  </span>
                ))}
                .
              </Aviso>
            ) : null}
            {e.pendientes.length > 0 ? (
              <Aviso tipo="atencion">
                Equipo importado del inventario histórico. <b>Por completar o verificar:</b> {e.pendientes.join(', ')}.
                {!d.proyecto && e.estado !== 'DADO_DE_BAJA' ? ' Use «Asignar proyecto» para ubicarlo en uno.' : ''}
                {puedeEditar ? (
                  <>
                    {' '}
                    <button type="button" className="enlace" onClick={() => setEditando(true)}>
                      Completar o corregir datos
                    </button>
                  </>
                ) : null}
              </Aviso>
            ) : null}

            <div className="superficie" style={{ marginTop: hecho || e.estado === 'DADO_DE_BAJA' || e.pendientes.length > 0 ? 16 : 0 }}>
              <Datos
                pares={[
                  [
                    'Dónde está',
                    e.ubicacion === 'BODEGA'
                      ? e.bodega
                        ? <Link to={`/bodegas/${e.bodega.id}`}>{e.bodega.nombre}</Link>
                        : 'Bodega'
                      : `En campo${d.proyecto?.vereda ? `, ${d.proyecto.vereda}` : instalacion?.ubicacion.vereda ? `, ${instalacion.ubicacion.vereda}` : ''}`,
                  ],
                  ['Proyecto', d.proyecto ? <Link to={`/proyectos/${d.proyecto.id}`}>{d.proyecto.nombre}</Link> : <PorCompletar />],
                  ...(e.zona ? ([['Zona', e.zona]] as [string, string][]) : []),
                  ...(d.proyecto ? ([['Municipio', `${d.proyecto.municipio}, ${d.proyecto.departamento}`]] as [string, string][]) : []),
                  ...(e.serialFabricante ? ([['Serial del fabricante', <span className="serial">{e.serialFabricante}</span>]] as [string, ReactNode][]) : []),
                  ...(e.descripcion ? ([['Descripción', e.descripcion]] as [string, string][]) : []),
                  ['Fecha de ingreso', fecha(e.fechaIngreso)],
                  ['Proveedor', d.compra?.proveedor ?? <PorCompletar />],
                  [
                    'Factura',
                    d.compra?.numeroFactura ? `${d.compra.numeroFactura}${d.compra.nit ? ` (NIT ${d.compra.nit})` : ''}` : <PorCompletar />,
                  ],
                  ['Fecha de compra', d.compra?.fechaCompra ? fecha(d.compra.fechaCompra) : <PorCompletar />],
                  ['Valor pagado', d.valorPagado != null ? pesos(d.valorPagado) : <PorCompletar />],
                  ['Garantía', <Garantia hasta={e.garantiaHasta} estado={e.garantia} />],
                ]}
              />
            </div>

            {acciones.length > 0 || e.movimientosPosibles.length > 0 || puedeEditar || (e.estado === 'INSTALADO' && d.instalacionActual) ? (
              <Seccion titulo="Qué se puede hacer">
                <div className="acciones">
                  {puedeEditar ? (
                    <Boton variante="secundario" icono="lapiz" onClick={() => setEditando(true)}>
                      Editar datos
                    </Boton>
                  ) : null}
                  {e.estado === 'INSTALADO' && d.instalacionActual ? (
                    <Boton variante="secundario" icono="intercambio" onClick={() => setReponiendo(true)}>
                      Reponer por falla
                    </Boton>
                  ) : null}
                  {acciones.map((a) => (
                    <Boton key={a} variante={a === 'DAR_DE_BAJA' ? 'peligro' : a === 'INSTALAR' ? 'primario' : 'secundario'} onClick={() => setAccion(a)}>
                      {nombreAccion(a)}
                    </Boton>
                  ))}
                  {e.movimientosPosibles.map((m) => (
                    <BotonEnlace key={m} variante="secundario" a={`/guias/nueva/${m}?${origen}&equipoId=${e.id}`}>
                      {NOMBRE_MOVIMIENTO[m]}
                    </BotonEnlace>
                  ))}
                </div>
              </Seccion>
            ) : null}

            <div className="columnas">
              <div>
                {d.instalacionActual ? (
                  <Seccion titulo="Instalación actual">
                    <TarjetaInstalacion i={d.instalacionActual} />
                  </Seccion>
                ) : null}
                <Seccion titulo="Historial">
                  <ol className="historial superficie">
                    {d.historial.map((h) => (
                      <li key={h.id}>
                        <div>{h.descripcion}</div>
                        <div className="cuando">
                          {fechaHora(h.ocurridoEn)}
                          {h.autor ? `, por ${h.autor}` : ''}
                          {h.estadoAnterior && h.estadoAnterior !== h.estadoNuevo ? `. ${NOMBRE_ESTADO[h.estadoAnterior]} a ${NOMBRE_ESTADO[h.estadoNuevo]}` : ''}
                        </div>
                      </li>
                    ))}
                  </ol>
                </Seccion>
              </div>
              <div>
                {d.otrosDelUsuario.length > 0 ? (
                  <Seccion titulo="Otros equipos de este usuario">
                    <ul className="lista superficie lista-otros">
                      {d.otrosDelUsuario.map((o) => (
                        <li key={o.id}>
                          <div>
                            <Link className="serial" to={`/equipos/${o.id}`}>
                              {o.serial}
                            </Link>
                            <span className="secundaria">
                              {o.tipoNombre} · entregado el {fecha(o.fechaInstalacion)}
                              {o.tipoEntrega !== 'ENTREGA' ? ` · ${NOMBRE_TIPO_ENTREGA[o.tipoEntrega].toLowerCase()}` : ''}
                              {o.vigente ? '' : ' · ya no lo tiene'}
                            </span>
                          </div>
                          <InsigniaEstado estado={o.estado} />
                        </li>
                      ))}
                    </ul>
                  </Seccion>
                ) : null}
                {d.instalacionesAnteriores.length > 0 ? (
                  <Seccion titulo="Instalaciones anteriores">
                    <div className="formulario">
                      {d.instalacionesAnteriores.map((i) => (
                        <TarjetaInstalacion key={i.id} i={i} />
                      ))}
                    </div>
                  </Seccion>
                ) : null}
              </div>
            </div>

            {reponiendo ? (
              <ReponerEquipo
                hoja={d}
                alCerrar={() => setReponiendo(false)}
                alTerminar={(m) => {
                  setReponiendo(false);
                  setHecho(m);
                  hoja.recargar();
                }}
              />
            ) : null}

            {editando ? (
              <EditarEquipo
                hoja={d}
                alCerrar={() => setEditando(false)}
                alTerminar={(m) => {
                  setEditando(false);
                  setHecho(m);
                  hoja.recargar();
                }}
              />
            ) : null}

            {accion ? (
              <FormularioAccion
                accion={accion}
                hoja={d}
                alCerrar={() => setAccion(null)}
                alTerminar={(m) => {
                  setAccion(null);
                  setHecho(m);
                  hoja.recargar();
                }}
              />
            ) : null}
          </Pagina>
        );
      }}
    </Lectura>
  );
}

const ORIGEN_SERIAL = {
  PROVEEDOR: 'Serial del proveedor.',
  EMPRESA: 'Serial asignado por la empresa.',
  INTERNO: 'Código interno de la empresa.',
} as const;

function PorCompletar() {
  return <span className="pendiente-dato">Por completar</span>;
}

const TEXTO_GARANTIA = { VIGENTE: 'vigente', POR_VENCER: 'por vencer', VENCIDA: 'vencida', SIN_DATO: '' } as const;

function Garantia({ hasta, estado }: { hasta: string | null; estado: HojaDeVida['equipo']['garantia'] }) {
  if (!hasta) return <PorCompletar />;
  return (
    <>
      Hasta {fecha(hasta)}{' '}
      <span className={`insignia ${estado === 'VIGENTE' ? 'INSTALADO' : estado === 'POR_VENCER' ? 'EN_MANTENIMIENTO' : 'DADO_DE_BAJA'}`}>{TEXTO_GARANTIA[estado]}</span>
    </>
  );
}

function TarjetaInstalacion({ i }: { i: Instalacion }) {
  const lugar = [i.ubicacion.vereda, i.ubicacion.municipio].filter(Boolean).join(', ');
  return (
    <div className="superficie">
      <Datos
        pares={[
          ['Usuario final', i.usuarioFinal.nombre],
          [
            'Entrega',
            i.tipoEntrega === 'REPOSICION' ? (
              <>
                <span className="etiqueta-entrega">Reposición</span>{' '}
                {i.reemplazaA ? (
                  <>
                    reemplazó a{' '}
                    <Link className="serial" to={`/equipos/${i.reemplazaA.id}`}>
                      {i.reemplazaA.serial}
                    </Link>
                  </>
                ) : (
                  'reemplazó a un equipo con fallas'
                )}
              </>
            ) : (
              NOMBRE_TIPO_ENTREGA[i.tipoEntrega]
            ),
          ],
          ['Cédula', <span className="num">{i.usuarioFinal.cedula}</span>],
          ...(i.usuarioFinal.niu ? ([['NIU', <span className="num">{i.usuarioFinal.niu}</span>]] as [string, ReactNode][]) : []),
          ['Teléfono', i.usuarioFinal.telefono ? <span className="num">{i.usuarioFinal.telefono}</span> : <PorCompletar />],
          ['Ubicación', lugar || '—'],
          ['Instalado el', fecha(i.fechaInstalacion)],
          ['Técnico', i.tecnico ?? '—'],
          ...(i.finalizadaEn ? ([['Finalizó', `${fecha(i.finalizadaEn)}${i.motivoFin ? `: ${i.motivoFin}` : ''}`]] as [string, string][]) : []),
        ]}
      />
    </div>
  );
}

/** RF-11 a RF-15 y RF-03: un formulario por acción, en el panel lateral. */
function FormularioAccion({ accion, hoja, alCerrar, alTerminar }: { accion: Accion; hoja: HojaDeVida; alCerrar: () => void; alTerminar: (mensaje: string) => void }) {
  const f = useFormulario();
  const sesion = useSesion();
  const e = hoja.equipo;
  const proyectos = useLectura<{ datos: ProyectoEnLista[] }>(accion === 'CAMBIAR_PROYECTO' ? '/proyectos' : null);
  const [v, setV] = useState({
    nombre: '',
    cedula: '',
    telefono: '',
    vereda: hoja.proyecto?.vereda ?? '',
    municipio: hoja.proyecto?.municipio ?? hoja.equipo.zona ?? '',
    departamento: hoja.proyecto?.departamento ?? '',
    fechaInstalacion: hoy(),
    tecnico: sesion?.usuario.nombre ?? '',
    motivo: '',
    observacion: '',
    proyectoId: '',
    confirmacion: '',
  });
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  const armar = (): [TipoComando, Record<string, unknown>] => {
    switch (accion) {
      case 'INSTALAR':
        return [
          'INSTALAR_EQUIPO',
          {
            equipoId: e.id,
            instalacionId: nuevoId(),
            usuario: { nombre: v.nombre, cedula: v.cedula, telefono: v.telefono },
            ubicacion: { vereda: v.vereda, municipio: v.municipio, departamento: v.departamento },
            fechaInstalacion: v.fechaInstalacion,
            tecnico: v.tecnico,
          },
        ];
      case 'RETIRAR':
        return ['RETIRAR_EQUIPO', { equipoId: e.id, motivo: v.motivo }];
      case 'ENVIAR_A_MANTENIMIENTO':
        return ['ENVIAR_A_MANTENIMIENTO', { equipoId: e.id, motivo: v.motivo }];
      case 'FINALIZAR_MANTENIMIENTO':
        return ['FINALIZAR_MANTENIMIENTO', { equipoId: e.id, ...(v.observacion.trim() ? { observacion: v.observacion } : {}) }];
      case 'DAR_DE_BAJA':
        return ['DAR_DE_BAJA', { equipoId: e.id, motivo: v.motivo }];
      case 'CAMBIAR_PROYECTO':
        return ['CAMBIAR_PROYECTO', { equipoId: e.id, proyectoId: v.proyectoId }];
    }
  };

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (accion === 'DAR_DE_BAJA' && v.confirmacion.trim().toUpperCase() !== e.serial.toUpperCase()) {
      f.limpiar();
      f.fijarError('confirmacion', 'Escriba el serial exactamente para confirmar');
      return;
    }
    const [tipo, payload] = armar();
    const r = await f.enviar(tipo, payload);
    if (r) alTerminar(`${NOMBRE_ACCION[accion]}: operación registrada.`);
  };

  const pideMotivo = accion === 'RETIRAR' || accion === 'ENVIAR_A_MANTENIMIENTO' || accion === 'DAR_DE_BAJA';
  const visibles = ['usuario', 'ubicacion', 'fechaInstalacion', 'tecnico', 'motivo', 'observacion', 'proyectoId', 'confirmacion'];
  return (
    <Cajon titulo={accion === 'CAMBIAR_PROYECTO' && !hoja.proyecto ? 'Asignar proyecto' : NOMBRE_ACCION[accion]} descripcion={<>Equipo <span className="serial">{e.serial}</span></>} alCerrar={alCerrar}>
      <form className="formulario" onSubmit={guardar} noValidate>
        <ErrorFormulario mensaje={f.mensaje} errores={f.errores} visibles={visibles} />
        {accion === 'INSTALAR' ? (
          <>
            <Campo etiqueta="Nombre del usuario final" valor={v.nombre} alCambiar={cambiar('nombre')} error={f.errorDe('usuario.nombre')} />
            <div className="rejilla-campos">
              <Campo etiqueta="Cédula" valor={v.cedula} alCambiar={cambiar('cedula')} error={f.errorDe('usuario.cedula')} modoTeclado="numeric" />
              <Campo etiqueta="Teléfono" tipo="tel" valor={v.telefono} alCambiar={cambiar('telefono')} error={f.errorDe('usuario.telefono')} ayuda="10 dígitos" />
            </div>
            <div className="rejilla-campos">
              <Campo etiqueta="Vereda" valor={v.vereda} alCambiar={cambiar('vereda')} error={f.errorDe('ubicacion.vereda')} />
              <Campo etiqueta="Municipio" valor={v.municipio} alCambiar={cambiar('municipio')} error={f.errorDe('ubicacion.municipio')} />
              <Campo etiqueta="Departamento" valor={v.departamento} alCambiar={cambiar('departamento')} error={f.errorDe('ubicacion.departamento')} />
              <Campo etiqueta="Fecha de instalación" tipo="date" valor={v.fechaInstalacion} alCambiar={cambiar('fechaInstalacion')} error={f.errorDe('fechaInstalacion')} />
            </div>
            <Campo etiqueta="Técnico responsable" valor={v.tecnico} alCambiar={cambiar('tecnico')} error={f.errorDe('tecnico')} />
          </>
        ) : null}

        {pideMotivo ? (
          <Area
            etiqueta="Motivo"
            valor={v.motivo}
            alCambiar={cambiar('motivo')}
            error={f.errorDe('motivo')}
            ayuda={accion === 'RETIRAR' ? 'Mínimo 10 caracteres.' : accion === 'DAR_DE_BAJA' ? 'Por ejemplo: sin garantía, se envía a disposición final.' : undefined}
          />
        ) : null}

        {accion === 'FINALIZAR_MANTENIMIENTO' ? (
          <Area etiqueta="Observación (opcional)" valor={v.observacion} alCambiar={cambiar('observacion')} error={f.errorDe('observacion')} marcador="Por ejemplo: se cambió el fusible" />
        ) : null}

        {accion === 'CAMBIAR_PROYECTO' ? (
          <Lista
            etiqueta="Nuevo proyecto"
            valor={v.proyectoId}
            alCambiar={cambiar('proyectoId')}
            error={f.errorDe('proyectoId')}
            opciones={(proyectos.datos?.datos ?? []).filter((p) => p.id !== hoja.proyecto?.id).map((p) => ({ valor: p.id, etiqueta: `${p.nombre} (${p.municipio})` }))}
          />
        ) : null}

        {accion === 'DAR_DE_BAJA' ? (
          <>
            <Aviso tipo="atencion">La baja es definitiva: el equipo no podrá volver a moverse ni modificarse.</Aviso>
            <Campo etiqueta={`Escriba el serial ${e.serial} para confirmar`} valor={v.confirmacion} alCambiar={cambiar('confirmacion')} error={f.errorDe('confirmacion')} autocompletar="off" />
          </>
        ) : null}

        <div className="pie-formulario">
          <Boton tipo="submit" variante={accion === 'DAR_DE_BAJA' ? 'peligro' : 'primario'} cargando={f.enviando}>
            {NOMBRE_ACCION[accion]}
          </Boton>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Cajon>
  );
}
