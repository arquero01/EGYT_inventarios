import { Link } from "react-router";
import { NOMBRE_COMANDO_WEB } from "../nombres.ts";
import { pedir } from "../api.ts";
import { cantidad, fechaHora } from "../formato.ts";
import { useEsAdmin, useFormulario, useLectura } from "../ganchos.ts";
import type {
  Conflicto,
  ListaMovimientos,
  ResumenInventario,
  StockPorTipo,
  UsuarioEnLista,
} from "../tipos.ts";
import {
  Aviso,
  BotonEnlace,
  Boton,
  Lectura,
  Seccion,
  Vacio,
} from "../ui/componentes.tsx";
import { Pagina } from "../ui/componentes.tsx";

const TRAMOS = [
  {
    clave: "enStock",
    estado: "EN_STOCK",
    rotulo: "En stock",
    color: "var(--logo-1)",
  },
  {
    clave: "instalados",
    estado: "INSTALADO",
    rotulo: "Instalados",
    color: "#1fa874",
  },
  {
    clave: "enMantenimiento",
    estado: "EN_MANTENIMIENTO",
    rotulo: "En mantenimiento",
    color: "var(--atencion)",
  },
  {
    clave: "dadosDeBaja",
    estado: "DADO_DE_BAJA",
    rotulo: "Dados de baja",
    color: "#9fb0c0",
  },
] as const;

const celda = (n: number, a: string) =>
  n > 0 ? <Link to={a}>{cantidad(n)}</Link> : <span className="suave">0</span>;

export function Inicio() {
  const resumen = useLectura<ResumenInventario>("/inventario/resumen");
  const stock = useLectura<StockPorTipo>("/inventario/stock-por-tipo");
  const guias = useLectura<ListaMovimientos>("/movimientos?porPagina=6");
  const zonas = useLectura<{ datos: { zona: string; equipos: number }[] }>(
    "/zonas",
  );
  const esAdmin = useEsAdmin();

  return (
    <Pagina
      titulo="Dónde están los equipos"
      descripcion="Todos los equipos con serial según su estado, y lo último que salió o entró de las bodegas."
      acciones={
        <>
          <BotonEnlace a="/equipos/nuevo" icono="mas">
            Ingresar equipo
          </BotonEnlace>
          <BotonEnlace a="/guias/nueva/DESPACHO" variante="secundario">
            Despachar a proyecto
          </BotonEnlace>
        </>
      }
    >
      <Lectura estado={resumen}>
        {(r) =>
          r.total === 0 ? (
            <Vacio
              titulo="Todavía no hay equipos registrados."
              accion={
                <BotonEnlace a="/equipos/nuevo">
                  Ingresar el primer equipo
                </BotonEnlace>
              }
            >
              Cree una bodega y un proyecto, y luego registre el ingreso de los
              equipos que llegan del proveedor.
            </Vacio>
          ) : (
            <div className="superficie reparto">
              <div className="reparto-total">
                <strong className="num">{cantidad(r.total)}</strong>
                <span className="suave">equipos con serial</span>
              </div>
              <div
                className="reparto-barra"
                role="img"
                aria-label={TRAMOS.map(
                  (t) => `${t.rotulo}: ${r[t.clave]}`,
                ).join(", ")}
              >
                {TRAMOS.filter((t) => r[t.clave] > 0).map((t) => (
                  <span
                    key={t.clave}
                    style={{ flexGrow: r[t.clave], background: t.color }}
                  />
                ))}
              </div>
              <div className="reparto-leyenda">
                {TRAMOS.map((t) => (
                  <Link
                    key={t.clave}
                    to={`/inventario?estado=${t.estado}`}
                    style={{ borderColor: t.color }}
                  >
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
          )
        }
      </Lectura>

      {esAdmin ? <PendientesAdmin /> : null}

      <div className="columnas">
        <Seccion titulo="Equipos por tipo">
          <Lectura estado={stock}>
            {(s) => (
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
                    {s.datos.map((t) => (
                      <tr key={t.tipo}>
                        <td>
                          <Link to={`/inventario?tipo=${t.tipo}`}>
                            {t.tipoNombre}
                          </Link>
                        </td>
                        <td className="derecha num">
                          {t.cantidad > 0 ? (
                            <Link
                              to={`/inventario?tipo=${t.tipo}&estado=EN_STOCK`}
                            >
                              {cantidad(t.cantidad)}
                            </Link>
                          ) : (
                            // RF-10: el aviso de "sin stock" se ve al pasar el mouse y en la etiqueta.
                            <span
                              className="sin-stock"
                              title={t.aviso?.mensaje}
                            >
                              Sin stock
                            </span>
                          )}
                        </td>
                        <td className="derecha num">
                          {celda(
                            t.instalados,
                            `/inventario?tipo=${t.tipo}&estado=INSTALADO`,
                          )}
                        </td>
                        <td className="derecha num">
                          {celda(
                            t.enMantenimiento,
                            `/inventario?tipo=${t.tipo}&estado=EN_MANTENIMIENTO`,
                          )}
                        </td>
                        <td className="derecha num">
                          {celda(
                            t.dadosDeBaja,
                            `/inventario?tipo=${t.tipo}&estado=DADO_DE_BAJA`,
                          )}
                        </td>
                        <td className="derecha num">
                          <b>{cantidad(t.total)}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      {(
                        [
                          "cantidad",
                          "instalados",
                          "enMantenimiento",
                          "dadosDeBaja",
                          "total",
                        ] as const
                      ).map((k) => (
                        <th key={k} className="derecha num">
                          {cantidad(s.datos.reduce((a, t) => a + t[k], 0))}
                        </th>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Lectura>
          <p className="suave nota-stock">
            <b>En stock</b> son los equipos disponibles para instalar. Los del
            inventario histórico ya están entregados a sus usuarios, por eso
            cuentan como instalados.
          </p>
        </Seccion>

        <div>
          {zonas.datos && zonas.datos.datos.length > 0 ? (
            <Seccion titulo="Equipos por zona">
              <ul className="lista superficie lista-zonas">
                {zonas.datos.datos
                  .slice()
                  .sort((a, b) => b.equipos - a.equipos)
                  .map((z) => (
                    <li key={z.zona}>
                      <Link
                        to={`/inventario?zona=${encodeURIComponent(z.zona)}`}
                      >
                        {z.zona}
                      </Link>
                      <span className="num">{cantidad(z.equipos)}</span>
                    </li>
                  ))}
              </ul>
            </Seccion>
          ) : null}

          <Seccion
            titulo="Últimas guías"
            accion={<Link to="/guias">Ver todas</Link>}
          >
            <Lectura estado={guias}>
              {(g) =>
                g.datos.length === 0 ? (
                  <Vacio titulo="Sin movimientos todavía.">
                    Cada ingreso, despacho, traslado o devolución genera una
                    guía numerada.
                  </Vacio>
                ) : (
                  <ul className="lista superficie">
                    {g.datos.map((m) => (
                      <li key={m.id}>
                        <Link className="serial" to={`/guias/${m.numero}`}>
                          {m.numero}
                        </Link>
                        <span>{m.tipoNombre}</span>
                        <span className="detalle">
                          {[m.origen ?? "Proveedor", m.destino ?? m.proyecto]
                            .filter(Boolean)
                            .join(" a ")}
                          {m.equipos
                            ? `, ${m.equipos} equipo${m.equipos === 1 ? "" : "s"}`
                            : ""}
                          {m.articulos
                            ? `, ${m.articulos} artículo${m.articulos === 1 ? "" : "s"}`
                            : ""}
                          . {fechaHora(m.ocurridoEn)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </Lectura>
          </Seccion>
        </div>
      </div>
    </Pagina>
  );
}

/** Cuentas por autorizar y operaciones sin conexión que el servidor rechazó (RNF-01). */
function PendientesAdmin() {
  const cuentas = useLectura<UsuarioEnLista[]>("/usuarios");
  const conflictos = useLectura<{ datos: Conflicto[] }>("/sync/conflictos");
  const f = useFormulario();
  const porAutorizar = cuentas.datos?.filter((u) => u.pendiente).length ?? 0;
  const lista = conflictos.datos?.datos ?? [];
  if (porAutorizar === 0 && lista.length === 0) return null;

  const resolver = async (id: string) => {
    const r = await f.ejecutar(() =>
      pedir("POST", `/sync/conflictos/${id}/resolver`),
    );
    if (r) conflictos.recargar();
  };

  return (
    <Seccion titulo="Para revisar">
      <div className="formulario">
        {porAutorizar > 0 ? (
          <Aviso tipo="atencion">
            {porAutorizar === 1
              ? "Hay 1 cuenta nueva"
              : `Hay ${porAutorizar} cuentas nuevas`}{" "}
            esperando autorización. <Link to="/cuentas">Revisar cuentas</Link>
          </Aviso>
        ) : null}
        {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
        {lista.length > 0 ? (
          <div className="tabla-envoltura">
            <table className="tabla">
              <caption className="visualmente-oculto">
                Operaciones hechas sin conexión que el servidor rechazó
              </caption>
              <thead>
                <tr>
                  <th>Operación rechazada al sincronizar</th>
                  <th>Motivo</th>
                  <th>Quién</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {NOMBRE_COMANDO_WEB[
                        c.tipo as keyof typeof NOMBRE_COMANDO_WEB
                      ] ?? c.tipo}
                      <span className="secundaria">
                        Hecha el {fechaHora(c.ocurridoEn)}
                      </span>
                    </td>
                    <td>{c.error.mensaje}</td>
                    <td>{c.autor ?? c.dispositivoId ?? "—"}</td>
                    <td className="derecha">
                      <Boton
                        variante="secundario"
                        pequeno
                        onClick={() => void resolver(c.id)}
                      >
                        Marcar revisada
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Seccion>
  );
}
