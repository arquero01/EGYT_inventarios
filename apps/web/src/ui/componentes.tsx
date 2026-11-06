import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { NOMBRE_ESTADO, type EstadoEquipo } from '@egt/domain';
import type { Paginacion as DatosPaginacion } from '../tipos.ts';
import { Icono, type NombreIcono } from './iconos.tsx';

// ── Página y secciones ─────────────────────────────────────────────────────

export function Pagina({
  titulo,
  descripcion,
  acciones,
  volver,
  children,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  volver?: { a: string; texto: string };
  children: ReactNode;
}) {
  useEffect(() => {
    if (typeof titulo === 'string') document.title = `${titulo} | eg&t Inventario`;
  }, [titulo]);
  return (
    <div className="pagina">
      {volver ? (
        <Link className="volver no-imprimir" to={volver.a}>
          <Icono nombre="atras" tamano={16} />
          {volver.texto}
        </Link>
      ) : null}
      <header className="pagina-cabecera">
        <div>
          <h1>{titulo}</h1>
          {descripcion ? <p>{descripcion}</p> : null}
        </div>
        {acciones ? <div className="acciones no-imprimir">{acciones}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="seccion">
      <div className="seccion-cabecera">
        <h2>{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

// ── Botones ────────────────────────────────────────────────────────────────

type Variante = 'primario' | 'secundario' | 'peligro';

export function Boton({
  children,
  variante = 'primario',
  icono,
  cargando = false,
  pequeno = false,
  ancho = false,
  tipo = 'button',
  ...resto
}: {
  children: ReactNode;
  variante?: Variante;
  icono?: NombreIcono;
  cargando?: boolean;
  pequeno?: boolean;
  ancho?: boolean;
  tipo?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}) {
  const clase = ['boton', variante !== 'primario' && variante, pequeno && 'pequeno', ancho && 'ancho'].filter(Boolean).join(' ');
  return (
    <button type={tipo} className={clase} disabled={resto.disabled || cargando} onClick={resto.onClick} aria-busy={cargando}>
      {cargando ? <span className="girando" aria-hidden="true" /> : icono ? <Icono nombre={icono} tamano={17} /> : null}
      {children}
    </button>
  );
}

export function BotonEnlace({ a, children, variante = 'primario', icono }: { a: string; children: ReactNode; variante?: Variante; icono?: NombreIcono }) {
  return (
    <Link className={`boton ${variante !== 'primario' ? variante : ''}`} to={a}>
      {icono ? <Icono nombre={icono} tamano={17} /> : null}
      {children}
    </Link>
  );
}

// ── Campos ─────────────────────────────────────────────────────────────────

interface BaseCampo {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: ReactNode;
  clase?: string;
}

function Envoltura({ id, etiqueta, error, ayuda, clase, children }: BaseCampo & { id: string; children: ReactNode }) {
  return (
    <div className={['campo', error && 'con-error', clase].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {error ? (
        <span className="error" id={`${id}-error`}>
          {error}
        </span>
      ) : ayuda ? (
        <span className="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </span>
      ) : null}
    </div>
  );
}

export function Campo({
  valor,
  alCambiar,
  tipo = 'text',
  marcador,
  autocompletar,
  modoTeclado,
  enfocar,
  ...base
}: BaseCampo & {
  valor: string;
  alCambiar: (v: string) => void;
  tipo?: 'text' | 'email' | 'password' | 'date' | 'search' | 'tel';
  marcador?: string;
  autocompletar?: string;
  modoTeclado?: 'numeric' | 'decimal' | 'text' | 'email' | 'tel';
  enfocar?: boolean;
}) {
  const id = useId();
  return (
    <Envoltura id={id} {...base}>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={marcador}
        autoComplete={autocompletar}
        inputMode={modoTeclado}
        autoFocus={enfocar}
        aria-invalid={base.error ? true : undefined}
        aria-describedby={base.error ? `${id}-error` : base.ayuda ? `${id}-ayuda` : undefined}
      />
    </Envoltura>
  );
}

export function Area({ valor, alCambiar, marcador, ...base }: BaseCampo & { valor: string; alCambiar: (v: string) => void; marcador?: string }) {
  const id = useId();
  return (
    <Envoltura id={id} {...base}>
      <textarea id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} placeholder={marcador} aria-invalid={base.error ? true : undefined} />
    </Envoltura>
  );
}

export interface Opcion {
  valor: string;
  etiqueta: string;
}

export function Lista({
  valor,
  alCambiar,
  opciones,
  vacia = 'Elija una opción',
  ...base
}: BaseCampo & { valor: string; alCambiar: (v: string) => void; opciones: Opcion[]; vacia?: string | null }) {
  const id = useId();
  return (
    <Envoltura id={id} {...base}>
      <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} aria-invalid={base.error ? true : undefined}>
        {vacia !== null ? <option value="">{vacia}</option> : null}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}

/** Pocas opciones excluyentes, todas a la vista. */
export function Alternativas<T extends string>({
  etiqueta,
  valor,
  alCambiar,
  opciones,
  error,
}: {
  etiqueta: string;
  valor: T;
  alCambiar: (v: T) => void;
  opciones: { valor: T; etiqueta: string }[];
  error?: string | undefined;
}) {
  const nombre = useId();
  return (
    <div className={`campo ${error ? 'con-error' : ''}`} role="radiogroup" aria-label={etiqueta}>
      <span className="etiqueta">{etiqueta}</span>
      <div className="opciones-radio">
        {opciones.map((o) => (
          <label key={o.valor}>
            <input type="radio" name={nombre} checked={valor === o.valor} onChange={() => alCambiar(o.valor)} />
            {o.etiqueta}
          </label>
        ))}
      </div>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}

// ── Avisos y estados ───────────────────────────────────────────────────────

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error' | 'exito' | 'atencion'; children: ReactNode }) {
  const icono: NombreIcono = tipo === 'exito' ? 'listo' : tipo === 'info' ? 'info' : 'alerta';
  return (
    <div className={`aviso ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono nombre={icono} tamano={18} />
      <div>{children}</div>
    </div>
  );
}

/** Mensaje general de un formulario y la lista de errores que no tienen campo visible. */
export function ErrorFormulario({ mensaje, errores, visibles = [] }: { mensaje: string | null; errores?: Record<string, string>; visibles?: string[] }) {
  if (!mensaje) return null;
  const sueltos = Object.entries(errores ?? {}).filter(([campo]) => !visibles.some((v) => campo === v || campo.startsWith(`${v}.`)));
  return (
    <Aviso tipo="error">
      {mensaje}
      {sueltos.length > 0 ? (
        <ul>
          {sueltos.map(([campo, problema]) => (
            <li key={campo}>{problema}</li>
          ))}
        </ul>
      ) : null}
    </Aviso>
  );
}

export function InsigniaEstado({ estado }: { estado: EstadoEquipo }) {
  return <span className={`insignia ${estado}`}>{NOMBRE_ESTADO[estado]}</span>;
}

export function Insignia({ clase = '', children }: { clase?: string; children: ReactNode }) {
  return <span className={`insignia ${clase}`}>{children}</span>;
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <span className="girando" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {children ? <span>{children}</span> : null}
      {accion}
    </div>
  );
}

/** Estado de una lectura: cargando, error o el contenido. */
export function Lectura<T>({ estado, children }: { estado: { datos: T | null; error: { message: string } | null; cargando: boolean }; children: (d: T) => ReactNode }) {
  if (estado.datos) return <>{children(estado.datos)}</>;
  if (estado.error) return <Aviso tipo="error">{estado.error.message}</Aviso>;
  return <Cargando />;
}

export function Datos({ pares }: { pares: [string, ReactNode][] }) {
  return (
    <dl className="datos">
      {pares.map(([e, v]) => (
        <div key={e}>
          <dt>{e}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Tablas ─────────────────────────────────────────────────────────────────

/** Fila que lleva a otra página al hacer clic (el enlace de la primera celda sirve con teclado). */
export function FilaVinculada({ a, children }: { a: string; children: ReactNode }) {
  const navegar = useNavigate();
  return (
    <tr
      className="vinculada"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button,input,select')) return;
        navegar(a);
      }}
    >
      {children}
    </tr>
  );
}

export function Paginacion({ datos, alCambiar }: { datos: DatosPaginacion; alCambiar: (p: number) => void }) {
  if (datos.total === 0) return null;
  const desde = (datos.pagina - 1) * datos.porPagina + 1;
  const hasta = Math.min(datos.total, datos.pagina * datos.porPagina);
  return (
    <nav className="paginacion" aria-label="Paginación">
      <span className="num">
        {desde}–{hasta} de {datos.total}
      </span>
      <div className="acciones">
        <Boton variante="secundario" pequeno disabled={datos.pagina <= 1} onClick={() => alCambiar(datos.pagina - 1)}>
          Anterior
        </Boton>
        <Boton variante="secundario" pequeno disabled={datos.pagina >= datos.totalPaginas} onClick={() => alCambiar(datos.pagina + 1)}>
          Siguiente
        </Boton>
      </div>
    </nav>
  );
}

// ── Panel lateral ──────────────────────────────────────────────────────────

/** Formulario que se abre al costado sin perder de vista la página. */
export function Cajon({ titulo, descripcion, alCerrar, children }: { titulo: string; descripcion?: ReactNode; alCerrar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  // Se guarda en una ref para no reiniciar el foco en cada render del padre.
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primero = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not(.cajon-cerrar)');
    primero?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current();
    };
    document.addEventListener('keydown', alTeclear);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = '';
      anterior?.focus();
    };
  }, []);
  return (
    <>
      <div className="velo" onClick={alCerrar} />
      <div className="cajon" role="dialog" aria-modal="true" aria-labelledby={idTitulo} ref={ref}>
        <div className="cajon-cabeza">
          <div>
            <h2 id={idTitulo}>{titulo}</h2>
            {descripcion ? <p>{descripcion}</p> : null}
          </div>
          <button type="button" className="cajon-cerrar" onClick={alCerrar} aria-label="Cerrar">
            <Icono nombre="cerrar" />
          </button>
        </div>
        <div className="cajon-cuerpo">{children}</div>
      </div>
    </>
  );
}
