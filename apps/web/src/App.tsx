import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { NOMBRE_ROL } from '@egt/domain';
import { refrescarCuenta, salir } from './api.ts';
import { useEsAdmin, useLectura, useSesion } from './ganchos.ts';
import type { UsuarioEnLista } from './tipos.ts';
import { Icono, type NombreIcono } from './ui/iconos.tsx';
import { Ingreso, Registro } from './paginas/Cuenta.tsx';
import { Inicio } from './paginas/Inicio.tsx';
import { Inventario } from './paginas/Inventario.tsx';
import { Equipo } from './paginas/Equipo.tsx';
import { IngresoEquipo } from './paginas/IngresoEquipo.tsx';
import { Importar } from './paginas/Importar.tsx';
import { Proyecto, Proyectos } from './paginas/Proyectos.tsx';
import { Bodega, Bodegas } from './paginas/Bodegas.tsx';
import { Articulo, Articulos, IngresoArticulos } from './paginas/Articulos.tsx';
import { Guia, Guias, NuevaGuia } from './paginas/Guias.tsx';
import { Cuentas } from './paginas/Cuentas.tsx';
import { MiCuenta } from './paginas/MiCuenta.tsx';

export function App() {
  return (
    <HashRouter>
      <Rutas />
    </HashRouter>
  );
}

function Rutas() {
  const sesion = useSesion();
  if (!sesion) {
    return (
      <Routes>
        <Route path="/registro" element={<Registro />} />
        <Route path="*" element={<Ingreso />} />
      </Routes>
    );
  }
  return (
    <Marco>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/equipos/nuevo" element={<IngresoEquipo />} />
        <Route path="/equipos/importar" element={<Importar />} />
        <Route path="/equipos/:id" element={<Equipo />} />
        <Route path="/proyectos" element={<Proyectos />} />
        <Route path="/proyectos/:id" element={<Proyecto />} />
        <Route path="/bodegas" element={<Bodegas />} />
        <Route path="/bodegas/:id" element={<Bodega />} />
        <Route path="/articulos" element={<Articulos />} />
        <Route path="/articulos/ingreso" element={<IngresoArticulos />} />
        <Route path="/articulos/:id" element={<Articulo />} />
        <Route path="/guias" element={<Guias />} />
        <Route path="/guias/nueva/:tipo" element={<NuevaGuia />} />
        <Route path="/guias/:idONumero" element={<Guia />} />
        <Route path="/cuentas" element={<SoloAdmin><Cuentas /></SoloAdmin>} />
        <Route path="/mi-cuenta" element={<MiCuenta />} />
        {/* Después de entrar, /ingresar y /registro llevan al inicio. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Marco>
  );
}

function SoloAdmin({ children }: { children: ReactNode }) {
  return useEsAdmin() ? <>{children}</> : <Navigate to="/" replace />;
}

const ENLACES: { a: string; texto: string; icono: NombreIcono; fin?: boolean }[] = [
  { a: '/', texto: 'Inicio', icono: 'inicio', fin: true },
  { a: '/inventario', texto: 'Equipos', icono: 'equipos' },
  { a: '/proyectos', texto: 'Proyectos', icono: 'proyectos' },
  { a: '/bodegas', texto: 'Bodegas', icono: 'bodegas' },
  { a: '/articulos', texto: 'Artículos', icono: 'articulos' },
  { a: '/guias', texto: 'Guías', icono: 'guias' },
];

function Marco({ children }: { children: ReactNode }) {
  const sesion = useSesion()!;
  const esAdmin = useEsAdmin();
  const [menu, setMenu] = useState(false);
  const ubicacion = useLocation();
  const cuentas = useLectura<UsuarioEnLista[]>(esAdmin ? '/usuarios' : null);
  const pendientes = cuentas.datos?.filter((u) => u.pendiente).length ?? 0;

  useEffect(() => {
    void refrescarCuenta();
  }, []);
  // Cierra el menú del celular al navegar y vuelve arriba.
  const recargarCuentas = cuentas.recargar;
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
    if (esAdmin) recargarCuentas();
  }, [ubicacion.pathname, esAdmin, recargarCuentas]);
  // La pantalla de Cuentas avisa cuando autoriza o rechaza, para actualizar el número del menú.
  useEffect(() => {
    const oyente = () => recargarCuentas();
    window.addEventListener('egt:cuentas', oyente);
    return () => window.removeEventListener('egt:cuentas', oyente);
  }, [recargarCuentas]);

  return (
    <div className={`marco ${menu ? 'menu-abierto' : ''}`}>
      <aside className="barra" aria-label="Menú principal">
        <NavLink to="/" className="marca">
          <img src="./logo-egt.png" alt="eg&t" width={112} height={52} />
          <small>Inventario y logística</small>
        </NavLink>
        <nav className="nav">
          {ENLACES.map((e) => (
            <NavLink key={e.a} to={e.a} end={e.fin} className={({ isActive }) => (isActive ? 'activo' : '')}>
              <Icono nombre={e.icono} />
              {e.texto}
            </NavLink>
          ))}
          {esAdmin ? (
            <>
              <span className="nav-grupo">Administración</span>
              <NavLink to="/cuentas" className={({ isActive }) => (isActive ? 'activo' : '')}>
                <Icono nombre="cuentas" />
                Cuentas
                {pendientes > 0 ? (
                  <span className="cuenta-pendientes" aria-label={`${pendientes} por autorizar`}>
                    {pendientes}
                  </span>
                ) : null}
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="barra-pie">
          <div className="quien">
            {sesion.usuario.nombre}
            <small>
              {NOMBRE_ROL[sesion.usuario.rol]}, {sesion.usuario.correo}
            </small>
          </div>
          <div className="acciones-pie">
            <NavLink to="/mi-cuenta">Mi cuenta</NavLink>
            <button type="button" onClick={() => void salir()}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
      <div>
        <header className="cabecera-movil">
          <button type="button" onClick={() => setMenu(true)} aria-label="Abrir menú" aria-expanded={menu}>
            <Icono nombre="menu" />
          </button>
          <img src="./logo-egt.png" alt="eg&t" width={64} height={30} />
        </header>
        <main className="contenido">{children}</main>
        {menu ? <div className="velo-menu" onClick={() => setMenu(false)} /> : null}
      </div>
    </div>
  );
}
