import { Link } from 'react-router';
import { cantidad, fechaHora } from '../formato.ts';
import type { ListaMovimientos, ResumenInventario, StockPorTipo } from '../tipos.ts';
import { Vacio } from './componentes.tsx';

/**
 * Piezas del tablero de equipos (Inicio y ficha de cada proyecto): reparto por
 * estado, equipos por tipo, por zona y últimas guías. `filtro` se agrega a
 * los enlaces de Equipos (por ejemplo "proyectoId=…") para que al tocar un
 * número salgan solo esos equipos.
 */

const TRAMOS = [
  { clave: 'enStock', estado: 'EN_STOCK', rotulo: 'En stock', color: 'var(--logo-1)' },
  { clave: 'instalados', estado: 'INSTALADO', rotulo: 'Instalados', color: '#1fa874' },
  { clave: 'enMantenimiento', estado: 'EN_MANTENIMIENTO', rotulo: 'En mantenimiento', color: 'var(--atencion)' },
  { clave: 'dadosDeBaja', estado: 'DADO_DE_BAJA', rotulo: 'Dados de baja', color: '#9fb0c0' },
] as const;

const enlace = (filtro: string, extra: string) => `/inventario?${[filtro, extra].filter(Boolean).join('&')}`;

export function RepartoEquipos({ r, filtro = '', texto = 'equipos con serial' }: { r: ResumenInventario; filtro?: string; texto?: string }) {
  return (
    <div className="superficie reparto">
      <div className="reparto-total">
        <strong className="num">{cantidad(r.total)}</strong>
        <span className="suave">{texto}</span>
      </div>
      <div className="reparto-barra" role="img" aria-label={TRAMOS.map((t) => `${t.rotulo}: ${r[t.clave]}`).join(', ')}>
        {TRAMOS.filter((t) => r[t.clave] > 0).map((t) => (
          <span key={t.clave} style={{ flexGrow: r[t.clave], background: t.color }} />
        ))}
      </div>
      <div className="reparto-leyenda">
        {TRAMOS.map((t) => (
          <Link key={t.clave} to={enlace(filtro, `estado=${t.estado}`)} style={{ borderColor: t.color }}>
            <span className="valor">{cantidad(r[t.clave])}</span>
            <span className="rotulo">{t.rotulo}</span>
          </Link>
        ))}
      </div>
      <div className="lugares">
        <span>
          <b>{cantidad(r.enBodega)}</b> en bodegas
        </span>
        <span>
          <b>{cantidad(r.enCampo)}</b> en campo
        </span>
      </div>
    </div>
  );
}

const celda = (n: number, a: string) => (n > 0 ? <Link to={a}>{cantidad(n)}</Link> : <span className="suave">0</span>);

export function TablaPorTipo({ datos, filtro = '' }: { datos: StockPorTipo['datos']; filtro?: string }) {
  return (
    <div className="tabla-envoltura">
      <table className="tabla tabla-por-tipo">
        <thead>
          <tr>
            <th>Tipo de equipo</th>
            <th className="derecha">En stock</th>
            <th className="derecha">Instalados</th>
            <th className="derecha">Mantenim.</th>
            <th className="derecha">De baja</th>
            <th className="derecha">Total</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((t) => (
            <tr key={t.tipo}>
              <td>
                <Link to={enlace(filtro, `tipo=${t.tipo}`)}>{t.tipoNombre}</Link>
              </td>
              <td className="derecha num">
                {t.cantidad > 0 ? (
                  <Link to={enlace(filtro, `tipo=${t.tipo}&estado=EN_STOCK`)}>{cantidad(t.cantidad)}</Link>
                ) : (
                  // RF-10: el aviso de "sin stock" se ve al pasar el mouse y en la etiqueta.
                  <span className="sin-stock" title={t.aviso?.mensaje ?? 'No hay equipos de este tipo en stock.'}>
                    Sin stock
                  </span>
                )}
              </td>
              <td className="derecha num">{celda(t.instalados, enlace(filtro, `tipo=${t.tipo}&estado=INSTALADO`))}</td>
              <td className="derecha num">{celda(t.enMantenimiento, enlace(filtro, `tipo=${t.tipo}&estado=EN_MANTENIMIENTO`))}</td>
              <td className="derecha num">{celda(t.dadosDeBaja, enlace(filtro, `tipo=${t.tipo}&estado=DADO_DE_BAJA`))}</td>
              <td className="derecha num">
                <b>{cantidad(t.total)}</b>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            {(['cantidad', 'instalados', 'enMantenimiento', 'dadosDeBaja', 'total'] as const).map((k) => (
              <th key={k} className="derecha num">
                {cantidad(datos.reduce((a, t) => a + t[k], 0))}
              </th>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ListaZonas({ datos, filtro = '' }: { datos: { zona: string; equipos: number }[]; filtro?: string }) {
  return (
    <ul className="lista superficie lista-zonas">
      {datos
        .slice()
        .sort((a, b) => b.equipos - a.equipos)
        .map((z) => (
          <li key={z.zona}>
            <Link to={enlace(filtro, `zona=${encodeURIComponent(z.zona)}`)}>{z.zona}</Link>
            <span className="num">{cantidad(z.equipos)}</span>
          </li>
        ))}
    </ul>
  );
}

export function ListaGuias({ guias }: { guias: ListaMovimientos }) {
  if (guias.datos.length === 0) {
    return <Vacio titulo="Sin movimientos todavía.">Cada ingreso, despacho, traslado o devolución genera una guía numerada.</Vacio>;
  }
  return (
    <ul className="lista superficie">
      {guias.datos.map((m) => (
        <li key={m.id}>
          <Link className="serial" to={`/guias/${m.numero}`}>
            {m.numero}
          </Link>
          <span>{m.tipoNombre}</span>
          <span className="detalle">
            {[m.origen ?? 'Proveedor', m.destino ?? m.proyecto].filter(Boolean).join(' a ')}
            {m.equipos ? `, ${m.equipos} equipo${m.equipos === 1 ? '' : 's'}` : ''}
            {m.articulos ? `, ${m.articulos} artículo${m.articulos === 1 ? '' : 's'}` : ''}. {fechaHora(m.ocurridoEn)}
          </span>
        </li>
      ))}
    </ul>
  );
}
