import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { cantidad } from '../formato.ts';
import type { ZonaDeUsuarios } from '../tipos.ts';
import { ubicarZonas, type Municipio, type ZonaUbicada } from './ubicar.ts';

/**
 * Mapa de Colombia con una burbuja por zona (más grande = más usuarios).
 * Tocar una burbuja la elige o la quita de la selección; la lista de
 * usuarios de abajo muestra solo las zonas elegidas.
 */

interface DatosMapa {
  ancho: number;
  alto: number;
  departamentos: { codigo: string; nombre: string; d: string }[];
  nombreDepto: Record<string, string>;
  municipios: Municipio[];
}

// El mapa pesa ~110 kB: se carga solo al abrir esta pantalla.
let cache: Promise<DatosMapa> | null = null;
const cargarMapa = () => (cache ??= import('./colombia.json').then((m) => m.default as DatosMapa));

export function useDatosMapa() {
  const [datos, setDatos] = useState<DatosMapa | null>(null);
  useEffect(() => {
    let vivo = true;
    void cargarMapa().then((d) => vivo && setDatos(d));
    return () => {
      vivo = false;
    };
  }, []);
  return datos;
}

export function useZonasUbicadas(zonas: ZonaDeUsuarios[], mapa: DatosMapa | null) {
  return useMemo(() => (mapa ? ubicarZonas(zonas, mapa.municipios, mapa.nombreDepto) : []), [zonas, mapa]);
}

interface Etiqueta {
  llave: string;
  x: number;
  y: number;
  ancla: 'start' | 'end' | 'middle';
  texto: string;
}

/** Coloca los nombres sin que se monten: derecha, izquierda, arriba o abajo de la burbuja; si no cabe, no se escribe. */
function colocarEtiquetas(puntos: { llave: string; x: number; y: number; r: number; texto: string }[], fuente: number): Etiqueta[] {
  const ocupado: { x1: number; y1: number; x2: number; y2: number }[] = puntos.map((p) => ({ x1: p.x - p.r, y1: p.y - p.r, x2: p.x + p.r, y2: p.y + p.r }));
  const choca = (c: { x1: number; y1: number; x2: number; y2: number }) => ocupado.some((o) => c.x1 < o.x2 && c.x2 > o.x1 && c.y1 < o.y2 && c.y2 > o.y1);
  const salida: Etiqueta[] = [];
  for (const p of puntos) {
    const w = p.texto.length * fuente * 0.56;
    const h = fuente * 1.1;
    const margen = fuente * 0.35;
    const opciones: [Etiqueta['ancla'], number, number, { x1: number; y1: number; x2: number; y2: number }][] = [
      ['start', p.x + p.r + margen, p.y + h * 0.35, { x1: p.x + p.r + margen, y1: p.y - h / 2, x2: p.x + p.r + margen + w, y2: p.y + h / 2 }],
      ['end', p.x - p.r - margen, p.y + h * 0.35, { x1: p.x - p.r - margen - w, y1: p.y - h / 2, x2: p.x - p.r - margen, y2: p.y + h / 2 }],
      ['middle', p.x, p.y - p.r - margen, { x1: p.x - w / 2, y1: p.y - p.r - margen - h, x2: p.x + w / 2, y2: p.y - p.r - margen }],
      ['middle', p.x, p.y + p.r + margen + h * 0.8, { x1: p.x - w / 2, y1: p.y + p.r + margen, x2: p.x + w / 2, y2: p.y + p.r + margen + h }],
    ];
    const libre = opciones.find(([, , , caja]) => !choca(caja));
    if (!libre) continue;
    ocupado.push(libre[3]);
    salida.push({ llave: p.llave, x: libre[1], y: libre[2], ancla: libre[0], texto: p.texto });
  }
  return salida;
}

export function MapaUsuarios({
  mapa,
  ubicadas,
  seleccion,
  alAlternar,
}: {
  mapa: DatosMapa;
  ubicadas: ZonaUbicada<ZonaDeUsuarios>[];
  seleccion: string[];
  alAlternar: (llave: string) => void;
}) {
  // 'zonas', 'pais' o el código de un departamento para acercarse a él.
  const [vista, setVista] = useState<string>('zonas');
  const [encima, setEncima] = useState<string | null>(null);
  const enMapa = ubicadas.filter((u) => u.municipio);
  const maximo = Math.max(1, ...enMapa.map((u) => u.zona.usuarios));
  const deptosConUsuarios = new Set(enMapa.map((u) => u.municipio!.dc));
  const deptosParaAcercar = mapa.departamentos.filter((d) => deptosConUsuarios.has(d.codigo));

  // Encuadre: acercado a las zonas con usuarios, o todo el país.
  const caja = useMemo(() => {
    if (vista === 'pais' || enMapa.length === 0) return { x: 0, y: 0, w: mapa.ancho, h: mapa.alto };
    let xs = enMapa.map((u) => u.municipio!.x);
    let ys = enMapa.map((u) => u.municipio!.y);
    let margen = 60;
    const depto = mapa.departamentos.find((d) => d.codigo === vista);
    if (depto) {
      // Los puntos del contorno del departamento (el trazo SVG es "Mx,yLx,y…").
      const numeros = (depto.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      xs = numeros.filter((_, i) => i % 2 === 0);
      ys = numeros.filter((_, i) => i % 2 === 1);
      margen = 12;
    }
    let x1 = Math.min(...xs) - margen;
    let x2 = Math.max(...xs) + margen;
    let y1 = Math.min(...ys) - margen;
    let y2 = Math.max(...ys) + margen;
    // Mínimo de tamaño y la misma proporción del mapa completo.
    const proporcion = mapa.ancho / mapa.alto;
    const minimo = depto ? 90 : 240;
    let w = Math.max(x2 - x1, minimo);
    let h = Math.max(y2 - y1, minimo / proporcion);
    if (w / h > proporcion) h = w / proporcion;
    else w = h * proporcion;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    x1 = Math.max(0, Math.min(mapa.ancho - w, cx - w / 2));
    y1 = Math.max(0, Math.min(mapa.alto - h, cy - h / 2));
    return { x: x1, y: y1, w: Math.min(w, mapa.ancho), h: Math.min(h, mapa.alto) };
  }, [vista, enMapa, mapa]);

  // Tamaños en unidades del mapa que se ven igual con o sin acercar.
  const escala = caja.w / mapa.ancho;
  const fuente = 11 * escala;
  // Al acercarse a un departamento las burbujas se achican un poco para que no se monten.
  const factor = mapa.departamentos.some((d) => d.codigo === vista) ? 0.6 : 1;
  const radio = (n: number) => (5 + 17 * Math.sqrt(n / maximo)) * escala * factor;
  const puntos = [...enMapa]
    .sort((a, b) => b.zona.usuarios - a.zona.usuarios)
    .map((u) => ({ llave: u.zona.llave, x: u.municipio!.x, y: u.municipio!.y, r: radio(u.zona.usuarios), texto: `${u.zona.zona} · ${cantidad(u.zona.usuarios)}` }));
  const etiquetas = colocarEtiquetas(puntos, fuente);
  const info = ubicadas.find((u) => u.zona.llave === encima) ?? null;
  const hayElegidas = seleccion.length > 0;

  const teclas = (llave: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      alAlternar(llave);
    }
  };

  return (
    <div className="mapa">
      <div className="mapa-herramientas">
        <div className="opciones-radio" role="radiogroup" aria-label="Encuadre del mapa">
          <label>
            <input type="radio" name="vista-mapa" checked={vista === 'zonas'} onChange={() => setVista('zonas')} />
            Acercar a las zonas
          </label>
          <label>
            <input type="radio" name="vista-mapa" checked={vista === 'pais'} onChange={() => setVista('pais')} />
            Todo el país
          </label>
          {deptosParaAcercar.map((d) => (
            <label key={d.codigo}>
              <input type="radio" name="vista-mapa" checked={vista === d.codigo} onChange={() => setVista(d.codigo)} />
              {d.nombre}
            </label>
          ))}
        </div>
      </div>
      <svg
        viewBox={`${caja.x} ${caja.y} ${caja.w} ${caja.h}`}
        className="mapa-svg"
        role="group"
        aria-label="Mapa de Colombia con las zonas donde hay usuarios. Toque una zona para ver sus usuarios."
      >
        <g className="mapa-deptos">
          {mapa.departamentos.map((d) => (
            <path key={d.codigo} d={d.d} className={deptosConUsuarios.has(d.codigo) ? 'con-usuarios' : undefined} strokeWidth={0.8 * escala}>
              <title>{d.nombre}</title>
            </path>
          ))}
        </g>
        <g>
          {[...enMapa]
            .sort((a, b) => b.zona.usuarios - a.zona.usuarios)
            .map((u) => {
              const elegida = seleccion.includes(u.zona.llave);
              return (
                <g
                  key={u.zona.llave}
                  className={`burbuja${elegida ? ' elegida' : ''}${hayElegidas && !elegida ? ' atenuada' : ''}`}
                  tabIndex={0}
                  role="checkbox"
                  aria-checked={elegida}
                  aria-label={`${u.zona.zona}: ${u.zona.usuarios} usuarios`}
                  onClick={() => alAlternar(u.zona.llave)}
                  onKeyDown={teclas(u.zona.llave)}
                  onMouseEnter={() => setEncima(u.zona.llave)}
                  onMouseLeave={() => setEncima((x) => (x === u.zona.llave ? null : x))}
                  onFocus={() => setEncima(u.zona.llave)}
                  onBlur={() => setEncima((x) => (x === u.zona.llave ? null : x))}
                >
                  <circle cx={u.municipio!.x} cy={u.municipio!.y} r={radio(u.zona.usuarios)} strokeWidth={(elegida ? 2.5 : 1.5) * escala} />
                </g>
              );
            })}
        </g>
        <g className="mapa-etiquetas" style={{ fontSize: fuente }} aria-hidden="true">
          {etiquetas.map((t) => (
            <text key={t.llave} x={t.x} y={t.y} textAnchor={t.ancla} strokeWidth={3 * escala} className={seleccion.includes(t.llave) ? 'elegida' : undefined}>
              {t.texto}
            </text>
          ))}
        </g>
      </svg>
      <div className="mapa-info" aria-live="polite">
        {info && info.municipio ? (
          <>
            <b>{info.zona.zona}</b>
            <span className="suave">
              {info.municipio.n}, {mapa.nombreDepto[info.municipio.dc]}
              {info.metodo === 'SUPUESTA' ? ' (ubicación supuesta, por confirmar)' : ''}
            </span>
            <span>
              {cantidad(info.zona.usuarios)} usuarios · {cantidad(info.zona.conEquipo)} con equipo · {cantidad(info.zona.instalados)} equipos instalados
              {info.zona.reposiciones > 0 ? ` · ${cantidad(info.zona.reposiciones)} reposiciones` : ''}
            </span>
          </>
        ) : (
          <span className="suave">Pase el mouse por una zona para ver el detalle; tóquela para ver solo sus usuarios.</span>
        )}
      </div>
    </div>
  );
}
