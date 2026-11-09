import { Text, View } from 'react-native';
import { NOMBRE_MOVIMIENTO, type Accion } from '@egt/domain';
import type { HojaDeVida as Hoja, Instalacion } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, Cargando, FilaDato, InsigniaEstado, Pantalla, Seccion, Tarjeta, TextoSuave, Titulo, type NombreIcono } from '../ui/componentes.tsx';
import { cantidad, fecha, fechaHora, pesos } from '../ui/formato.ts';
import { useLectura, useSesion } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';

const ACCION: Record<Accion, { texto: string; icono: NombreIcono; variante: 'primario' | 'secundario' | 'peligro' }> = {
  INSTALAR: { texto: 'Instalar a usuario final', icono: 'home-outline', variante: 'primario' },
  RETIRAR: { texto: 'Retirar de la vivienda', icono: 'return-down-back-outline', variante: 'secundario' },
  ENVIAR_A_MANTENIMIENTO: { texto: 'Enviar a mantenimiento', icono: 'construct-outline', variante: 'secundario' },
  FINALIZAR_MANTENIMIENTO: { texto: 'Finalizar mantenimiento', icono: 'checkmark-done-outline', variante: 'primario' },
  CAMBIAR_PROYECTO: { texto: 'Cambiar de proyecto', icono: 'git-compare-outline', variante: 'secundario' },
  DAR_DE_BAJA: { texto: 'Dar de baja', icono: 'trash-outline', variante: 'peligro' },
};

/** RF-16 (hoja de vida) y RF-17 (historial), con las acciones que permite su estado. */
const POR_COMPLETAR = 'Por completar';

export function HojaDeVida({ route, navigation }: PropsPila<'HojaDeVida'>) {
  const { datos, cargando, error, desactualizado, guardadoEn, recargar } = useLectura<Hoja>(`/equipos/${route.params.equipoId}`);
  const sesion = useSesion();

  if (!datos) {
    return <Pantalla>{error ? <Aviso tipo="error">{error.message}</Aviso> : cargando ? <Cargando /> : null}</Pantalla>;
  }
  const { equipo: e, proyecto, compra } = datos;
  // Dar de baja es solo para administradores.
  const acciones = e.accionesPermitidas.filter((a) => a !== 'DAR_DE_BAJA' || sesion?.usuario.rol === 'ADMIN');

  return (
    <Pantalla alRecargar={recargar} recargando={cargando}>
      {desactualizado ? <AvisoDesactualizado guardadoEn={guardadoEn} /> : null}
      <Titulo>{e.serial}</Titulo>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.s, marginBottom: espacio.l }}>
        <InsigniaEstado estado={e.estado} />
        <TextoSuave>
          {e.origenSerial === 'EMPRESA' ? 'Serial asignado por la empresa' : e.origenSerial === 'INTERNO' ? 'Código interno de la empresa' : 'Serial del proveedor'}
        </TextoSuave>
      </View>

      {e.pendientes && e.pendientes.length > 0 ? <Aviso>Por completar: {e.pendientes.join(', ')}.</Aviso> : null}

      <Tarjeta>
        <FilaDato etiqueta="Tipo" valor={e.tipoNombre} />
        <FilaDato etiqueta="Marca y modelo" valor={[e.marca, e.modelo].filter(Boolean).join(' ') || POR_COMPLETAR} />
        {e.descripcion ? <FilaDato etiqueta="Descripción" valor={e.descripcion} /> : null}
        {e.serialFabricante ? <FilaDato etiqueta="Serial del fabricante" valor={e.serialFabricante} /> : null}
        <FilaDato etiqueta="Potencia o capacidad" valor={e.potencia != null ? `${cantidad(e.potencia)} ${e.unidad ?? ''}` : POR_COMPLETAR} />
        <FilaDato etiqueta="Proyecto" valor={proyecto?.nombre ?? POR_COMPLETAR} />
        {e.zona ? <FilaDato etiqueta="Zona" valor={e.zona} /> : null}
        <FilaDato etiqueta="Ubicación" valor={e.ubicacion === 'BODEGA' ? e.bodega?.nombre ?? 'Bodega' : proyecto ? `En campo (${proyecto.vereda})` : 'En campo'} />
        <FilaDato etiqueta="Ingreso" valor={fecha(e.fechaIngreso)} />
        {e.garantiaHasta ? <FilaDato etiqueta="Garantía hasta" valor={fecha(e.garantiaHasta)} /> : null}
      </Tarjeta>

      {datos.instalacionActual ? (
        <Seccion titulo="Instalación actual">
          <TarjetaInstalacion instalacion={datos.instalacionActual} />
        </Seccion>
      ) : null}

      {acciones.length > 0 || e.movimientosPosibles.length > 0 ? (
        <Seccion titulo="Acciones">
          {acciones.map((a) => (
            <Boton
              key={a}
              texto={a === 'CAMBIAR_PROYECTO' && !proyecto ? 'Asignar proyecto' : ACCION[a].texto}
              icono={ACCION[a].icono}
              variante={ACCION[a].variante}
              alTocar={() =>
                navigation.navigate('AccionEquipo', {
                  equipoId: e.id,
                  serial: e.serial,
                  accion: a,
                  proyectoId: proyecto?.id ?? '',
                  ubicacion: { vereda: proyecto?.vereda ?? '', municipio: proyecto?.municipio ?? e.zona ?? '', departamento: proyecto?.departamento ?? '' },
                })
              }
            />
          ))}
          {e.movimientosPosibles.map((m) => (
            <Boton
              key={m}
              texto={NOMBRE_MOVIMIENTO[m]}
              icono="swap-horizontal-outline"
              variante="secundario"
              alTocar={() =>
                navigation.navigate('NuevoMovimiento', {
                  tipo: m,
                  equipoId: e.id,
                  ...(e.bodega ? { bodegaId: e.bodega.id } : {}),
                  ...(m === 'DEVOLUCION' && proyecto ? { proyectoId: proyecto.id } : {}),
                })
              }
            />
          ))}
        </Seccion>
      ) : (
        <Aviso>Un equipo dado de baja no puede modificarse.</Aviso>
      )}

      <Seccion titulo="Compra">
        <Tarjeta>
          <FilaDato etiqueta="Proveedor" valor={compra?.proveedor ?? POR_COMPLETAR} />
          <FilaDato etiqueta="NIT" valor={compra?.nit ?? POR_COMPLETAR} />
          <FilaDato etiqueta="Factura" valor={compra?.numeroFactura ?? POR_COMPLETAR} />
          <FilaDato etiqueta="Fecha de compra" valor={compra?.fechaCompra ? fecha(compra.fechaCompra) : POR_COMPLETAR} />
          <FilaDato etiqueta="Valor pagado" valor={(compra?.valorPagado ?? datos.valorPagado) != null ? pesos((compra?.valorPagado ?? datos.valorPagado)!) : POR_COMPLETAR} />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Historial">
        {[...datos.historial].reverse().map((ev) => (
          <View key={ev.id} style={{ flexDirection: 'row', marginBottom: espacio.m }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.primario, marginTop: 6, marginRight: espacio.m }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: color.texto, lineHeight: 20 }}>{ev.descripcion}</Text>
              <Text style={{ fontSize: 12, color: color.textoSuave, marginTop: 2 }}>
                {fechaHora(ev.ocurridoEn)}
                {ev.autor ? ` · ${ev.autor}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </Seccion>

      {datos.instalacionesAnteriores.length > 0 ? (
        <Seccion titulo="Instalaciones anteriores">
          {datos.instalacionesAnteriores.map((i) => (
            <TarjetaInstalacion key={i.id} instalacion={i} />
          ))}
        </Seccion>
      ) : null}
    </Pantalla>
  );
}

function TarjetaInstalacion({ instalacion: i }: { instalacion: Instalacion }) {
  return (
    <Tarjeta>
      <FilaDato etiqueta="Usuario final" valor={i.usuarioFinal.nombre} />
      <FilaDato etiqueta="Cédula" valor={i.usuarioFinal.cedula} />
      {i.usuarioFinal.niu ? <FilaDato etiqueta="NIU" valor={i.usuarioFinal.niu} /> : null}
      <FilaDato etiqueta="Teléfono" valor={i.usuarioFinal.telefono ?? POR_COMPLETAR} />
      <FilaDato
        etiqueta="Ubicación"
        valor={[i.ubicacion.vereda, i.ubicacion.municipio].filter(Boolean).join(', ') + (i.ubicacion.departamento ? ` (${i.ubicacion.departamento})` : '') || '—'}
      />
      <FilaDato etiqueta="Fecha" valor={fecha(i.fechaInstalacion)} />
      <FilaDato etiqueta="Técnico" valor={i.tecnico ?? '—'} />
      {!i.vigente ? <FilaDato etiqueta="Finalizada" valor={`${fechaHora(i.finalizadaEn)}${i.motivoFin ? ` · ${i.motivoFin}` : ''}`} /> : null}
    </Tarjeta>
  );
}
