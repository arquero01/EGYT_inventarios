import { useState } from 'react';
import { Text, View } from 'react-native';
import { NOMBRE_MOVIMIENTO, TIPOS_MOVIMIENTO, type TipoMovimiento } from '@egt/domain';
import type { DetalleMovimiento, ListaMovimientos } from '../api/tipos.ts';
import type { PropsPila } from '../navegacion.tsx';
import { Aviso, AvisoDesactualizado, Boton, Cargando, FilaDato, Insignia, Pantalla, Seccion, Selector, Tarjeta, TextoSuave, Titulo } from '../ui/componentes.tsx';
import { cantidad, fecha, fechaHora, pesos } from '../ui/formato.ts';
import { useLectura } from '../ui/ganchos.ts';
import { color, espacio } from '../ui/tema.ts';
import { rutaMovimiento } from './Articulos.tsx';

/** RL-10: guías de movimiento, filtradas por tipo. */
export function Movimientos({ navigation }: PropsPila<'Movimientos'>) {
  const [tipo, setTipo] = useState<TipoMovimiento | 'TODOS'>('TODOS');
  const [pagina, setPagina] = useState(1);
  const ruta = `/movimientos?pagina=${pagina}&porPagina=20${tipo === 'TODOS' ? '' : `&tipo=${tipo}`}`;
  const lista = useLectura<ListaMovimientos>(ruta);
  const p = lista.datos?.paginacion;

  return (
    <Pantalla alRecargar={lista.recargar} recargando={lista.cargando && !!lista.datos}>
      <Selector
        etiqueta="Tipo"
        opciones={[{ valor: 'TODOS' as const, etiqueta: 'Todos' }, ...TIPOS_MOVIMIENTO.map((t) => ({ valor: t, etiqueta: NOMBRE_MOVIMIENTO[t] }))]}
        valor={tipo}
        alCambiar={(t) => {
          setTipo(t);
          setPagina(1);
        }}
      />
      {lista.desactualizado ? <AvisoDesactualizado guardadoEn={lista.guardadoEn} /> : null}
      {lista.error ? <Aviso tipo="error">{lista.error.message}</Aviso> : null}
      {!lista.datos && lista.cargando ? <Cargando /> : null}
      {lista.datos?.aviso ? <Aviso>{lista.datos.aviso.mensaje}</Aviso> : null}
      {lista.datos?.datos.map((m) => (
        <Tarjeta key={m.id} alTocar={() => navigation.navigate('MovimientoDetalle', { idONumero: m.id })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: color.texto }}>{m.numero}</Text>
            <Insignia texto={m.tipoNombre} />
          </View>
          <TextoSuave>{rutaMovimiento(m)}</TextoSuave>
          <Text style={{ marginTop: espacio.xs, fontSize: 13, color: color.textoSuave }}>
            {m.equipos} equipos · {m.articulos} artículos · {fechaHora(m.ocurridoEn)}
          </Text>
        </Tarjeta>
      ))}
      {p && p.totalPaginas > 1 ? (
        <View style={{ flexDirection: 'row', gap: espacio.s }}>
          <View style={{ flex: 1 }}>
            <Boton texto="Anterior" variante="secundario" deshabilitado={pagina <= 1} alTocar={() => setPagina(pagina - 1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Boton texto="Siguiente" variante="secundario" deshabilitado={pagina >= p.totalPaginas} alTocar={() => setPagina(pagina + 1)} />
          </View>
        </View>
      ) : null}
    </Pantalla>
  );
}

/** Guía completa de un movimiento. */
export function MovimientoDetalle({ route, navigation }: PropsPila<'MovimientoDetalle'>) {
  const g = useLectura<DetalleMovimiento>(`/movimientos/${encodeURIComponent(route.params.idONumero)}`);
  const d = g.datos;
  if (!d) return <Pantalla>{g.error ? <Aviso tipo="error">{g.error.message}</Aviso> : <Cargando />}</Pantalla>;

  return (
    <Pantalla alRecargar={g.recargar} recargando={g.cargando}>
      {g.desactualizado ? <AvisoDesactualizado guardadoEn={g.guardadoEn} /> : null}
      <Titulo>{d.numero}</Titulo>
      <Insignia texto={d.tipoNombre} />
      <Tarjeta estilo={{ marginTop: espacio.l }}>
        <FilaDato etiqueta="Ruta" valor={rutaMovimiento(d)} />
        <FilaDato etiqueta="Fecha" valor={fechaHora(d.ocurridoEn)} />
        {d.responsable ? <FilaDato etiqueta="Responsable" valor={d.responsable} /> : null}
        {d.autor ? <FilaDato etiqueta="Registró" valor={d.autor} /> : null}
        {d.observacion ? <FilaDato etiqueta="Observación" valor={d.observacion} /> : null}
      </Tarjeta>

      {d.compra ? (
        <Seccion titulo="Factura">
          <Tarjeta>
            <FilaDato etiqueta="Proveedor" valor={d.compra.proveedor} />
            <FilaDato etiqueta="NIT" valor={d.compra.nit} />
            <FilaDato etiqueta="Factura" valor={d.compra.numeroFactura} />
            <FilaDato etiqueta="Fecha" valor={fecha(d.compra.fechaCompra)} />
          </Tarjeta>
        </Seccion>
      ) : null}

      {d.equipos.length > 0 ? (
        <Seccion titulo={`Equipos (${d.equipos.length})`}>
          {d.equipos.map((e) => (
            <Tarjeta key={e.id} alTocar={() => navigation.navigate('HojaDeVida', { equipoId: e.id })}>
              <Text style={{ fontWeight: '700', color: color.texto }}>{e.serial}</Text>
              <TextoSuave>
                {e.tipoNombre} · {e.marca} {e.modelo}
              </TextoSuave>
            </Tarjeta>
          ))}
        </Seccion>
      ) : null}

      {d.articulos.length > 0 ? (
        <Seccion titulo={`Artículos (${d.articulos.length})`}>
          <Tarjeta>
            {d.articulos.map((a) => (
              <FilaDato
                key={a.id}
                etiqueta={`${a.codigo} · ${a.nombre}`}
                valor={`${cantidad(a.cantidad)} ${a.unidad}${a.valorUnitario ? ` · ${pesos(a.valorUnitario)} c/u` : ''}`}
              />
            ))}
          </Tarjeta>
        </Seccion>
      ) : null}
    </Pantalla>
  );
}
