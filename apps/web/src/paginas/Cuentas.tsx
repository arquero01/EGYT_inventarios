import { useState } from 'react';
import { NOMBRE_ROL, ROLES, type Rol } from '@egt/domain';
import { pedir } from '../api.ts';
import { fechaHora } from '../formato.ts';
import { useFormulario, useLectura, useSesion } from '../ganchos.ts';
import type { UsuarioEnLista } from '../tipos.ts';
import { Aviso, Boton, Cajon, Insignia, Lectura, Pagina, Seccion } from '../ui/componentes.tsx';

/**
 * Administración de cuentas. Quien se registra queda "por autorizar" y entra
 * como usuario; el administrador lo autoriza (o lo rechaza) y le da el rol.
 * La cuenta principal (logística) no se puede desactivar ni dejar de ser
 * administradora.
 */
export function Cuentas() {
  const lista = useLectura<UsuarioEnLista[]>('/usuarios');
  const opciones = useLectura<{ registroRequiereAprobacion: boolean }>('/auth/opciones');
  const yo = useSesion()!.usuario;
  const f = useFormulario();
  const [aviso, setAviso] = useState<string | null>(null);
  const [temporal, setTemporal] = useState<{ nombre: string; correo: string; clave: string } | null>(null);

  const cambiar = async (u: UsuarioEnLista, cambios: { rol?: Rol; activo?: boolean }, mensaje: string) => {
    setAviso(null);
    const r = await f.ejecutar(() => pedir('PATCH', `/usuarios/${u.id}`, cambios));
    if (r) {
      setAviso(mensaje);
      lista.recargar();
      window.dispatchEvent(new Event('egt:cuentas'));
    }
  };

  const rechazar = async (u: UsuarioEnLista) => {
    if (!window.confirm(`¿Rechazar la cuenta de ${u.nombre} (${u.correo})? Se borra y la persona tendría que registrarse de nuevo.`)) return;
    setAviso(null);
    const r = await f.ejecutar(() => pedir('DELETE', `/usuarios/${u.id}`));
    if (r) {
      setAviso(`Se rechazó la cuenta de ${u.nombre}.`);
      lista.recargar();
      window.dispatchEvent(new Event('egt:cuentas'));
    }
  };

  const restablecer = async (u: UsuarioEnLista) => {
    if (!window.confirm(`¿Generar una contraseña temporal para ${u.nombre}? Su contraseña actual dejará de funcionar.`)) return;
    setAviso(null);
    const r = await f.ejecutar(() => pedir<{ contrasenaTemporal: string }>('POST', `/usuarios/${u.id}/restablecer`));
    if (r) setTemporal({ nombre: u.nombre, correo: u.correo, clave: r.contrasenaTemporal });
  };

  return (
    <Pagina
      titulo="Cuentas"
      descripcion={
        opciones.datos?.registroRequiereAprobacion === false
          ? 'Quien se registra entra de una vez como usuario. Aquí le da el rol o desactiva su cuenta.'
          : 'Quien se registra queda por autorizar y entra como usuario. Usted lo autoriza y le da el rol.'
      }
    >
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      {aviso ? <Aviso tipo="exito">{aviso}</Aviso> : null}
      <div style={{ height: f.mensaje || aviso ? 16 : 0 }} />
      <Lectura estado={lista}>
        {(usuarios) => {
          const pendientes = usuarios.filter((u) => u.pendiente);
          const demas = usuarios.filter((u) => !u.pendiente);
          return (
            <>
              {pendientes.length > 0 ? (
                <Seccion titulo={`Por autorizar (${pendientes.length})`}>
                  <div className="tabla-envoltura">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Persona</th>
                          <th>Se registró</th>
                          <th className="derecha">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendientes.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.nombre}</strong>
                              <span className="secundaria">{u.correo}</span>
                            </td>
                            <td className="num">{fechaHora(u.creadoEn)}</td>
                            <td className="derecha">
                              <div className="acciones" style={{ justifyContent: 'flex-end' }}>
                                <Boton pequeno onClick={() => void cambiar(u, { activo: true }, `${u.nombre} ya puede entrar como usuario. Si necesita otro rol, cámbielo abajo.`)}>
                                  Autorizar
                                </Boton>
                                <Boton pequeno variante="secundario" onClick={() => void rechazar(u)}>
                                  Rechazar
                                </Boton>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="suave" style={{ fontSize: 'var(--t-s)', margin: '8px 0 0' }}>
                    Autorice solo a personas de la empresa que reconozca por su nombre y correo.
                  </p>
                </Seccion>
              ) : null}

              <Seccion titulo="Cuentas">
                <div className="tabla-envoltura">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Persona</th>
                        <th>Rol</th>
                        <th>Estado</th>
                        <th>Último ingreso</th>
                        <th className="derecha">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demas.map((u) => {
                        const soyYo = u.id === yo.id;
                        const fijo = u.principal || soyYo;
                        return (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.nombre}</strong>
                              {soyYo ? ' (usted)' : ''}
                              <span className="secundaria">{u.correo}</span>
                              {u.principal ? <span className="secundaria">Cuenta principal</span> : null}
                            </td>
                            <td>
                              {fijo ? (
                                u.rol === 'ADMIN' ? (
                                  <Insignia clase="ADMIN">{NOMBRE_ROL.ADMIN}</Insignia>
                                ) : (
                                  NOMBRE_ROL.USUARIO
                                )
                              ) : (
                                <select
                                  className="selector-rol"
                                  aria-label={`Rol de ${u.nombre}`}
                                  value={u.rol}
                                  disabled={f.enviando}
                                  onChange={(ev) => {
                                    const rol = ev.target.value as Rol;
                                    void cambiar(u, { rol }, `${u.nombre} ahora es ${NOMBRE_ROL[rol].toLowerCase()}.`);
                                  }}
                                >
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {NOMBRE_ROL[r]}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>{u.activo ? <Insignia clase="EN_STOCK">Activa</Insignia> : <Insignia clase="INACTIVA">Desactivada</Insignia>}</td>
                            <td className="num">{u.ultimoIngreso ? fechaHora(u.ultimoIngreso) : <span className="suave">Nunca</span>}</td>
                            <td className="derecha">
                              {fijo ? (
                                <span className="suave" style={{ fontSize: 'var(--t-s)' }}>
                                  {soyYo ? 'Su contraseña se cambia en Mi cuenta' : 'No se puede modificar'}
                                </span>
                              ) : (
                                <div className="acciones" style={{ justifyContent: 'flex-end' }}>
                                  {u.activo ? (
                                    <Boton pequeno variante="secundario" onClick={() => void cambiar(u, { activo: false }, `La cuenta de ${u.nombre} quedó desactivada y se cerraron sus sesiones.`)}>
                                      Desactivar
                                    </Boton>
                                  ) : (
                                    <Boton pequeno variante="secundario" onClick={() => void cambiar(u, { activo: true }, `La cuenta de ${u.nombre} está activa otra vez.`)}>
                                      Activar
                                    </Boton>
                                  )}
                                  <Boton pequeno variante="secundario" onClick={() => void restablecer(u)}>
                                    Restablecer contraseña
                                  </Boton>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Seccion>
            </>
          );
        }}
      </Lectura>
      <p className="suave" style={{ fontSize: 'var(--t-s)', maxWidth: '75ch' }}>
        <b>Usuario:</b> registra ingresos, guías, instalaciones y mantenimientos. <b>Administrador:</b> además autoriza cuentas y da roles, importa
        el inventario histórico, corrige datos de equipos, da de baja y revisa las operaciones rechazadas al sincronizar. La cuenta principal
        (logística) siempre es administradora y nadie más puede desactivarla ni cambiarle la contraseña.
      </p>

      {temporal ? (
        <Cajon titulo="Contraseña temporal" descripcion={`${temporal.nombre}, ${temporal.correo}`} alCerrar={() => setTemporal(null)}>
          <div className="formulario">
            <p style={{ margin: 0 }}>Entréguele esta contraseña a la persona. Al entrar, debe cambiarla desde Mi cuenta.</p>
            <div className="superficie" style={{ padding: '18px 20px' }}>
              <span className="guia-numero" style={{ fontSize: '2.25rem', userSelect: 'all' }}>
                {temporal.clave}
              </span>
            </div>
            <Aviso tipo="atencion">No se volverá a mostrar. Si se pierde, genere otra.</Aviso>
            <div className="pie-formulario">
              <Boton onClick={() => void navigator.clipboard?.writeText(temporal.clave)}>Copiar</Boton>
              <Boton variante="secundario" onClick={() => setTemporal(null)}>
                Listo
              </Boton>
            </div>
          </div>
        </Cajon>
      ) : null}
    </Pagina>
  );
}
