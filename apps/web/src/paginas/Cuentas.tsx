import { useState } from 'react';
import { NOMBRE_ROL, type Rol } from '@egt/domain';
import { pedir } from '../api.ts';
import { fechaHora } from '../formato.ts';
import { useFormulario, useLectura, useSesion } from '../ganchos.ts';
import type { UsuarioEnLista } from '../tipos.ts';
import { Aviso, Boton, Cajon, Insignia, Lectura, Pagina } from '../ui/componentes.tsx';

/** Administración de cuentas: autorizar, cambiar rol, desactivar y restablecer contraseña. */
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
        opciones.datos?.registroRequiereAprobacion
          ? 'Las cuentas nuevas esperan su autorización antes de poder entrar.'
          : 'Quien se registra entra de una vez. Aquí puede cambiar roles o desactivar cuentas.'
      }
    >
      {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
      {aviso ? <Aviso tipo="exito">{aviso}</Aviso> : null}
      <div style={{ height: f.mensaje || aviso ? 16 : 0 }} />
      <Lectura estado={lista}>
        {(usuarios) => (
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
                {usuarios.map((u) => {
                  const soyYo = u.id === yo.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.nombre}</strong>
                        {soyYo ? ' (usted)' : ''}
                        <span className="secundaria">{u.correo}</span>
                      </td>
                      <td>{u.rol === 'ADMIN' ? <Insignia clase="ADMIN">{NOMBRE_ROL.ADMIN}</Insignia> : NOMBRE_ROL.USUARIO}</td>
                      <td>
                        {u.pendiente ? (
                          <Insignia clase="PENDIENTE">Por autorizar</Insignia>
                        ) : u.activo ? (
                          <Insignia clase="EN_STOCK">Activa</Insignia>
                        ) : (
                          <Insignia clase="INACTIVA">Desactivada</Insignia>
                        )}
                      </td>
                      <td className="num">{u.ultimoIngreso ? fechaHora(u.ultimoIngreso) : <span className="suave">Nunca</span>}</td>
                      <td className="derecha">
                        <div className="acciones" style={{ justifyContent: 'flex-end' }}>
                          {u.pendiente ? (
                            <Boton pequeno onClick={() => void cambiar(u, { activo: true }, `${u.nombre} ya puede entrar.`)}>
                              Autorizar
                            </Boton>
                          ) : null}
                          {!u.pendiente && !soyYo ? (
                            u.activo ? (
                              <Boton pequeno variante="secundario" onClick={() => void cambiar(u, { activo: false }, `La cuenta de ${u.nombre} quedó desactivada y se cerraron sus sesiones.`)}>
                                Desactivar
                              </Boton>
                            ) : (
                              <Boton pequeno variante="secundario" onClick={() => void cambiar(u, { activo: true }, `La cuenta de ${u.nombre} está activa otra vez.`)}>
                                Activar
                              </Boton>
                            )
                          ) : null}
                          {!soyYo ? (
                            <Boton
                              pequeno
                              variante="secundario"
                              onClick={() =>
                                void cambiar(
                                  u,
                                  { rol: u.rol === 'ADMIN' ? 'USUARIO' : 'ADMIN' },
                                  u.rol === 'ADMIN' ? `${u.nombre} ahora es usuario.` : `${u.nombre} ahora es administrador.`,
                                )
                              }
                            >
                              {u.rol === 'ADMIN' ? 'Quitar administrador' : 'Hacer administrador'}
                            </Boton>
                          ) : null}
                          {!soyYo && !u.pendiente ? (
                            <Boton pequeno variante="secundario" onClick={() => void restablecer(u)}>
                              Restablecer contraseña
                            </Boton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Lectura>
      <p className="suave" style={{ fontSize: 'var(--t-s)', maxWidth: '70ch' }}>
        Los administradores pueden dar de baja equipos, administrar cuentas y marcar como revisadas las operaciones rechazadas al sincronizar. Siempre debe quedar al menos un administrador activo.
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
