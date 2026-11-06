import { useState, type FormEvent } from 'react';
import { LARGO_MINIMO_CONTRASENA, NOMBRE_ROL } from '@egt/domain';
import { pedir, salir } from '../api.ts';
import { useFormulario, useSesion } from '../ganchos.ts';
import { Aviso, Boton, Campo, Datos, Pagina, Seccion } from '../ui/componentes.tsx';

export function MiCuenta() {
  const { usuario } = useSesion()!;
  const f = useFormulario();
  const [v, setV] = useState({ actual: '', nueva: '', repetida: '' });
  const [listo, setListo] = useState(false);
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setListo(false);
    if (v.nueva !== v.repetida) {
      f.limpiar();
      f.fijarError('repetida', 'Las contraseñas no coinciden');
      return;
    }
    const r = await f.ejecutar(() => pedir('POST', '/auth/contrasena', { actual: v.actual, nueva: v.nueva }));
    if (r) {
      setListo(true);
      setV({ actual: '', nueva: '', repetida: '' });
    }
  };

  return (
    <Pagina titulo="Mi cuenta" acciones={<Boton variante="secundario" onClick={() => void salir()}>Cerrar sesión</Boton>}>
      <div className="superficie" style={{ maxWidth: 720 }}>
        <Datos
          pares={[
            ['Nombre', usuario.nombre],
            ['Correo', usuario.correo],
            ['Rol', NOMBRE_ROL[usuario.rol]],
          ]}
        />
      </div>
      <Seccion titulo="Cambiar contraseña">
        <form className="formulario" onSubmit={guardar} noValidate style={{ maxWidth: 420 }}>
          {listo ? <Aviso tipo="exito">Contraseña cambiada. Las demás sesiones abiertas con su cuenta se cerraron.</Aviso> : null}
          {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
          <Campo etiqueta="Contraseña actual" tipo="password" valor={v.actual} alCambiar={cambiar('actual')} autocompletar="current-password" error={f.errorDe('actual')} />
          <Campo
            etiqueta="Contraseña nueva"
            tipo="password"
            valor={v.nueva}
            alCambiar={cambiar('nueva')}
            autocompletar="new-password"
            error={f.errorDe('nueva')}
            ayuda={`Mínimo ${LARGO_MINIMO_CONTRASENA} caracteres, con letras y números.`}
          />
          <Campo etiqueta="Repita la contraseña nueva" tipo="password" valor={v.repetida} alCambiar={cambiar('repetida')} autocompletar="new-password" error={f.errorDe('repetida')} />
          <div className="pie-formulario">
            <Boton tipo="submit" cargando={f.enviando}>
              Cambiar contraseña
            </Boton>
          </div>
        </form>
      </Seccion>
    </Pagina>
  );
}
