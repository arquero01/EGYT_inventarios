import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LARGO_MINIMO_CONTRASENA } from '@egt/domain';
import { ingresar, pedir, registrarse } from '../api.ts';
import { useFormulario } from '../ganchos.ts';
import { Aviso, Boton, Campo } from '../ui/componentes.tsx';

/** Celdas del módulo solar del panel izquierdo; unas pocas "encendidas". */
const ENCENDIDAS = new Set([3, 4, 5, 10, 11, 17]);

function Puerta({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${titulo} | EG&T Inventario`;
  }, [titulo]);
  return (
    <div className="puerta">
      <aside className="modulo">
        <div className="modulo-celdas" aria-hidden="true">
          {Array.from({ length: 48 }, (_, i) => (
            <span key={i} className={ENCENDIDAS.has(i) ? 'encendida' : undefined} />
          ))}
        </div>
        <div className="modulo-placa">
          <img src="./logo-egt.png" alt="eg&t" width={260} height={120} />
        </div>
        <p className="modulo-texto">Inventario de paneles, baterías, inversores y medidores, desde la bodega hasta la vivienda.</p>
      </aside>
      <main className="puerta-formulario">
        <div className="puerta-caja">
          <h1>{titulo}</h1>
          <p>{descripcion}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Ingreso() {
  const f = useFormulario();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');

  const entrar = (e: FormEvent) => {
    e.preventDefault();
    void f.ejecutar(() => ingresar(correo, contrasena));
  };

  return (
    <Puerta titulo="Iniciar sesión" descripcion="Entre con el correo y la contraseña de su cuenta.">
      <form className="formulario" onSubmit={entrar} noValidate>
        {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
        <Campo etiqueta="Correo electrónico" tipo="email" valor={correo} alCambiar={setCorreo} autocompletar="email" error={f.errorDe('correo')} enfocar />
        <Campo etiqueta="Contraseña" tipo="password" valor={contrasena} alCambiar={setContrasena} autocompletar="current-password" error={f.errorDe('contrasena')} />
        <Boton tipo="submit" cargando={f.enviando} ancho>
          Entrar
        </Boton>
      </form>
      <div className="puerta-alterna">
        <p>
          ¿No tiene cuenta? <Link to="/registro">Regístrese</Link>
        </p>
        <p>¿Olvidó su contraseña? Pídale a un administrador que la restablezca desde Cuentas.</p>
      </div>
    </Puerta>
  );
}

export function Registro() {
  const f = useFormulario();
  const [v, setV] = useState({ nombre: '', correo: '', contrasena: '', confirmacion: '' });
  const [requiereAprobacion, setRequiereAprobacion] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const cambiar = (campo: keyof typeof v) => (valor: string) => setV((a) => ({ ...a, [campo]: valor }));

  useEffect(() => {
    pedir<{ registroRequiereAprobacion: boolean }>('GET', '/auth/opciones')
      .then((o) => setRequiereAprobacion(o.registroRequiereAprobacion))
      .catch(() => {});
  }, []);

  const crear = async (e: FormEvent) => {
    e.preventDefault();
    if (v.contrasena !== v.confirmacion) {
      f.limpiar();
      f.fijarError('confirmacion', 'Las contraseñas no coinciden');
      return;
    }
    const r = await f.ejecutar(() => registrarse({ nombre: v.nombre, correo: v.correo, contrasena: v.contrasena }));
    if (r?.pendiente) setPendiente(r.mensaje ?? 'Su cuenta está pendiente de autorización.');
  };

  if (pendiente) {
    return (
      <Puerta titulo="Cuenta creada" descripcion="Falta que un administrador la autorice.">
        <Aviso tipo="info">{pendiente}</Aviso>
        <div className="puerta-alterna">
          <Link to="/">Volver a iniciar sesión</Link>
        </div>
      </Puerta>
    );
  }

  return (
    <Puerta
      titulo="Crear cuenta"
      descripcion={requiereAprobacion ? 'Un administrador debe autorizar su cuenta antes de que pueda entrar.' : 'Regístrese con su correo para empezar a trabajar.'}
    >
      <form className="formulario" onSubmit={crear} noValidate>
        {f.mensaje ? <Aviso tipo="error">{f.mensaje}</Aviso> : null}
        <Campo etiqueta="Nombre completo" valor={v.nombre} alCambiar={cambiar('nombre')} autocompletar="name" error={f.errorDe('nombre')} enfocar />
        <Campo etiqueta="Correo electrónico" tipo="email" valor={v.correo} alCambiar={cambiar('correo')} autocompletar="email" error={f.errorDe('correo')} />
        <Campo
          etiqueta="Contraseña"
          tipo="password"
          valor={v.contrasena}
          alCambiar={cambiar('contrasena')}
          autocompletar="new-password"
          error={f.errorDe('contrasena')}
          ayuda={`Mínimo ${LARGO_MINIMO_CONTRASENA} caracteres, con letras y números.`}
        />
        <Campo etiqueta="Repita la contraseña" tipo="password" valor={v.confirmacion} alCambiar={cambiar('confirmacion')} autocompletar="new-password" error={f.errorDe('confirmacion')} />
        <Boton tipo="submit" cargando={f.enviando} ancho>
          Crear cuenta
        </Boton>
      </form>
      <div className="puerta-alterna">
        ¿Ya tiene cuenta? <Link to="/">Inicie sesión</Link>
      </div>
    </Puerta>
  );
}
