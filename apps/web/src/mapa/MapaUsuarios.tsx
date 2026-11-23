import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as EventoRaton, type PointerEvent as EventoPuntero } from 'react';
import { cantidad } from '../formato.ts';
import type { ZonaDeUsuarios } from '../tipos.ts';
import { Icono } from '../ui/iconos.tsx';
import { ubicarZonas, type Municipio, type ZonaUbicada } from './ubicar.ts';

/**
 * Mapa de Colombia con los municipios donde hay usuarios sombreados (más
 * oscuro = más usuarios). Se acerca con la rueda del mouse, pellizcando o con
 * los botones, y se mueve arrastrando, como un mapa de internet; acercado se
 * ven los límites y los nombres de los municipios. Tocar un municipio
 * sombreado elige esa zona para la lista de usuarios.
 */

export interface MunicipioMapa extends Municipio {
  /** Contorno (trazo SVG en las coordenadas del mapa). */
  d: string;
}

export interface DatosMapa {
  ancho: number;
  alto: number;
  contorno: string;
  bordesDeptos: string;
  departamentos: { codigo: string; nombre: string; x: number; y: number; caja: number[] }[];
  nombreDepto: Record<string, string>;
  municipios: MunicipioMapa[];
}

// El mapa pesa ~190 kB comprimido: se carga solo al abrir esta pantalla.
let cache: Promise<DatosMapa> | null = null;
const cargarMapa = () => (cache ??= import('./colombia.json').then((m) => m.default as unknown as DatosMapa));

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

// ── Escala de color ─────────────────────────────────────────────────────────

/** Un solo tono (el azul de la marca), de claro a oscuro según los usuarios. */
const TONOS = ['#cfe6fa', '#93c9f3', '#4ea6e8', '#1a7fd0', '#0b5aa0'];

/** Redondea a 1, 2, 3 o 5 × 10ⁿ (el más cercano en escala logarítmica). */
function redondear(v: number) {
  const potencia = 10 ** Math.floor(Math.log10(v));
  const m = v / potencia;
  const mejor = [1, 2, 3, 5, 10].reduce((a, b) => (Math.abs(Math.log(m / b)) < Math.abs(Math.log(m / a)) ? b : a));
  return mejor * potencia;
}

export interface Escala {
  tono: (usuarios: number) => string;
  clases: { tono: string; texto: string }[];
}

/** Cortes "redondos" en escala logarítmica: pocos usuarios ya se distinguen de ninguno. */
export function escalaUsuarios(maximo: number): Escala {
  const cortes: number[] = [];
  for (let k = 1; k < TONOS.length; k++) {
    const c = redondear(Math.max(1, maximo) ** (k / TONOS.length));
    if (c >= 1 && c < maximo && (cortes.length === 0 || c > cortes.at(-1)!)) cortes.push(c);
  }
  const n = cortes.length + 1;
  const tonos = n === 1 ? [TONOS[3]!] : Array.from({ length: n }, (_, i) => TONOS[Math.round((i * (TONOS.length - 1)) / (n - 1))]!);
  const clases = tonos.map((tono, i) => {
    const desde = i === 0 ? 1 : cortes[i - 1]! + 1;
    if (i === n - 1) return { tono, texto: i === 0 ? '1 o más' : `Más de ${cantidad(cortes[i - 1]!)}` };
    const hasta = cortes[i]!;
    return { tono, texto: desde === hasta ? cantidad(desde) : `${cantidad(desde)}–${cantidad(hasta)}` };
  });
  return {
    clases,
    tono: (u) => {
      const i = cortes.findIndex((c) => u <= c);
      return tonos[i === -1 ? n - 1 : i]!;
    },
  };
}

// ── Encuadre ────────────────────────────────────────────────────────────────

interface Vista {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Caja = [number, number, number, number];

/** Caja que contiene un trazo SVG "Mx,yLx,y…Z" (todas las cifras van en pares x,y). */
function cajaDeTrazo(d: string): Caja {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x1 = Math.min(x1, n[i]!);
    x2 = Math.max(x2, n[i]!);
    y1 = Math.min(y1, n[i + 1]!);
    y2 = Math.max(y2, n[i + 1]!);
  }
  return [x1, y1, x2, y2];
}

const unir = (cajas: Caja[]): Caja | null =>
  cajas.length === 0
    ? null
    : [Math.min(...cajas.map((c) => c[0])), Math.min(...cajas.map((c) => c[1])), Math.max(...cajas.map((c) => c[2])), Math.max(...cajas.map((c) => c[3]))];

/** Acercamiento máximo: unas 80 veces el país completo. */
const ANCHO_MINIMO = 7;

function encajar(c: Caja, aspecto: number, margen: number): Vista {
  let w = Math.max(c[2] - c[0] + 2 * margen, 30);
  let h = Math.max(c[3] - c[1] + 2 * margen, 30 / aspecto);
  if (w / h > aspecto) h = w / aspecto;
  else w = h * aspecto;
  return { x: (c[0] + c[2]) / 2 - w / 2, y: (c[1] + c[3]) / 2 - h / 2, w, h };
}

/** Mantiene el acercamiento entre los límites y el centro dentro de Colombia. */
function limitar(v: Vista, mapa: DatosMapa, aspecto: number): Vista {
  const maximo = Math.max(mapa.ancho, mapa.alto * aspecto) * 1.1;
  const w = Math.min(maximo, Math.max(ANCHO_MINIMO, v.w));
  const h = w / aspecto;
  const cx = Math.min(mapa.ancho, Math.max(0, v.x + v.w / 2));
  const cy = Math.min(mapa.alto, Math.max(0, v.y + v.h / 2));
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// ── Capas que no cambian al mover el mapa (no se vuelven a dibujar) ─────────

const CapaMunicipios = memo(function CapaMunicipios({ municipios }: { municipios: MunicipioMapa[] }) {
  return (
    <g className="mapa-mpios">
      {municipios.map((m) => (
        <path key={m.c} d={m.d} data-c={m.c} />
      ))}
    </g>
  );
});

const CapaBordes = memo(function CapaBordes({ mapa }: { mapa: DatosMapa }) {
  return (
    <g className="mapa-bordes" pointerEvents="none">
      <path className="mapa-bordes-deptos" d={mapa.bordesDeptos} />
      <path className="mapa-contorno" d={mapa.contorno} />
    </g>
  );
});

interface ZonaEnMapa {
  llave: string;
  codigo: string;
  d: string;
  x: number;
  y: number;
  tono: string;
  elegida: boolean;
  atenuada: boolean;
  ubicada: ZonaUbicada<ZonaDeUsuarios>;
}

const CapaZonas = memo(function CapaZonas({
  zonas,
  alAlternar,
  alEnfocar,
}: {
  zonas: ZonaEnMapa[];
  alAlternar: (llave: string) => void;
  alEnfocar: (codigo: string | null) => void;
}) {
  const teclas = (llave: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      alAlternar(llave);
    }
  };
  return (
    <>
      <g className="mapa-zonas">
        {zonas.map((z) => (
          <path
            key={z.llave}
            d={z.d}
            data-c={z.codigo}
            fill={z.tono}
            className={z.atenuada ? 'atenuada' : undefined}
            tabIndex={0}
            role="checkbox"
            aria-checked={z.elegida}
            aria-label={`${z.ubicada.zona.zona}: ${z.ubicada.zona.usuarios} usuarios`}
            onKeyDown={teclas(z.llave)}
            onFocus={() => alEnfocar(z.codigo)}
            onBlur={() => alEnfocar(null)}
          />
        ))}
      </g>
      <g className="mapa-elegidas" pointerEvents="none">
        {zonas
          .filter((z) => z.elegida)
          .map((z) => (
            <path key={z.llave} d={z.d} />
          ))}
      </g>
    </>
  );
});

// ── Nombres sobre el mapa (en píxeles de pantalla, sin montarse) ────────────

interface Rotulo {
  clave: string;
  x: number;
  y: number;
  texto: string;
  clase: 'zona' | 'depto' | 'mpio';
  elegida?: boolean;
}

function colocarRotulos(
  vista: Vista,
  tam: { w: number; h: number },
  mapa: DatosMapa,
  zonas: ZonaEnMapa[],
  codigosZona: Set<string>,
): Rotulo[] {
  const k = tam.w / vista.w; // píxeles por unidad del mapa
  const aPantalla = (x: number, y: number) => [(x - vista.x) * k, (y - vista.y) * k] as const;
  const dentro = (px: number, py: number) => px > -40 && py > -20 && px < tam.w + 40 && py < tam.h + 20;
  const ocupado: [number, number, number, number][] = [];
  const salida: Rotulo[] = [];
  const intentar = (r: Rotulo, fuente: number, ancho = 0.56) => {
    const w = r.texto.length * fuente * ancho + 6;
    const h = fuente + 4;
    const caja: [number, number, number, number] = [r.x - w / 2, r.y - h / 2, r.x + w / 2, r.y + h / 2];
    if (caja[0] < 2 || caja[2] > tam.w - 2 || caja[1] < 2 || caja[3] > tam.h - 2) return;
    if (ocupado.some((o) => caja[0] < o[2] && caja[2] > o[0] && caja[1] < o[3] && caja[3] > o[1])) return;
    ocupado.push(caja);
    salida.push(r);
  };

  // 1. Las zonas con usuarios, de la más grande a la más pequeña.
  for (const z of [...zonas].sort((a, b) => b.ubicada.zona.usuarios - a.ubicada.zona.usuarios)) {
    const [px, py] = aPantalla(z.x, z.y);
    if (!dentro(px, py)) continue;
    intentar({ clave: `z${z.llave}`, x: px, y: py, texto: `${z.ubicada.zona.zona} · ${cantidad(z.ubicada.zona.usuarios)}`, clase: 'zona', elegida: z.elegida }, 12.5, 0.6);
  }
  const acercamiento = mapa.ancho / vista.w;
  // 2. Departamentos, mientras se ve buena parte del país.
  if (acercamiento < 4) {
    for (const d of mapa.departamentos) {
      const [px, py] = aPantalla(d.x, d.y);
      if (!dentro(px, py)) continue;
      intentar({ clave: `d${d.codigo}`, x: px, y: py, texto: d.nombre.toUpperCase(), clase: 'depto' }, 10.5, 0.72);
    }
  }
  // 3. Municipios, al acercarse.
  if (acercamiento >= 3) {
    let puestos = 0;
    for (const m of mapa.municipios) {
      if (codigosZona.has(m.c)) continue;
      const [px, py] = aPantalla(m.x, m.y);
      if (px < 0 || py < 0 || px > tam.w || py > tam.h) continue;
      intentar({ clave: `m${m.c}`, x: px, y: py, texto: m.n, clase: 'mpio' }, 11.5);
      if (++puestos > 400) break;
    }
  }
  return salida;
}

// ── Mapa ────────────────────────────────────────────────────────────────────

export function MapaUsuarios({
  mapa,
  ubicadas,
  seleccion,
  escala,
  alAlternar,
}: {
  mapa: DatosMapa;
  ubicadas: ZonaUbicada<ZonaDeUsuarios>[];
  seleccion: string[];
  escala: Escala;
  alAlternar: (llave: string) => void;
}) {
  const lienzo = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const globo = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const [vista, setVistaEstado] = useState<Vista | null>(null);
  const vistaRef = useRef<Vista | null>(null);
  const animacion = useRef<number | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  const [eleccionIr, setEleccionIr] = useState('zonas');

  const aspecto = tam ? tam.w / tam.h : 1;

  const zonas = useMemo<ZonaEnMapa[]>(() => {
    const porCodigo = new Map(mapa.municipios.map((m) => [m.c, m]));
    const hayElegidas = seleccion.length > 0;
    return ubicadas
      .filter((u) => u.municipio && porCodigo.has(u.municipio.c))
      .map((u) => {
        const m = porCodigo.get(u.municipio!.c)!;
        const elegida = seleccion.includes(u.zona.llave);
        return { llave: u.zona.llave, codigo: m.c, d: m.d, x: m.x, y: m.y, tono: escala.tono(u.zona.usuarios), elegida, atenuada: hayElegidas && !elegida, ubicada: u };
      });
  }, [ubicadas, seleccion, escala, mapa]);
  const zonaPorCodigo = useMemo(() => new Map(zonas.map((z) => [z.codigo, z])), [zonas]);
  const codigosZona = useMemo(() => new Set(zonas.map((z) => z.codigo)), [zonas]);
  const municipioPorCodigo = useMemo(() => new Map(mapa.municipios.map((m) => [m.c, m])), [mapa]);
  const cajaZonas = useMemo(() => unir(zonas.map((z) => cajaDeTrazo(z.d))), [zonas]);

  const fijarVista = useCallback(
    (v: Vista) => {
      const limitada = limitar(v, mapa, aspecto);
      vistaRef.current = limitada;
      setVistaEstado(limitada);
    },
    [mapa, aspecto],
  );

  /** Lleva el mapa a otra vista con un movimiento corto. */
  const irA = useCallback(
    (destino: Vista) => {
      const desde = vistaRef.current;
      if (animacion.current) cancelAnimationFrame(animacion.current);
      const fin = limitar(destino, mapa, aspecto);
      const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!desde || reducido) return fijarVista(fin);
      const inicio = performance.now();
      const paso = (t: number) => {
        const p = Math.min(1, (t - inicio) / 320);
        const s = 1 - (1 - p) ** 3;
        // El ancho se interpola en escala logarítmica para que el acercamiento se sienta parejo.
        const w = Math.exp(Math.log(desde.w) + (Math.log(fin.w) - Math.log(desde.w)) * s);
        const cx = desde.x + desde.w / 2 + (fin.x + fin.w / 2 - desde.x - desde.w / 2) * s;
        const cy = desde.y + desde.h / 2 + (fin.y + fin.h / 2 - desde.y - desde.h / 2) * s;
        fijarVista({ x: cx - w / 2, y: cy - w / aspecto / 2, w, h: w / aspecto });
        animacion.current = p < 1 ? requestAnimationFrame(paso) : null;
      };
      animacion.current = requestAnimationFrame(paso);
    },
    [mapa, aspecto, fijarVista],
  );

  const vistaZonas = useCallback(() => encajar(cajaZonas ?? [0, 0, mapa.ancho, mapa.alto], aspecto, cajaZonas ? 40 : 0), [cajaZonas, mapa, aspecto]);
  const vistaPais = useCallback(() => encajar([0, 0, mapa.ancho, mapa.alto], aspecto, 0), [mapa, aspecto]);

  // Tamaño del lienzo (el mapa siempre llena el recuadro, sin bandas vacías).
  useEffect(() => {
    const el = lienzo.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setTam((t) => (t && Math.abs(t.w - r.width) < 1 && Math.abs(t.h - r.height) < 1 ? t : { w: r.width, h: r.height }));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Primera vista: acercado a las zonas. Si cambia el tamaño, se conserva el centro y el acercamiento.
  useEffect(() => {
    if (!tam) return;
    const actual = vistaRef.current;
    fijarVista(actual ? { ...actual, h: actual.w / aspecto } : vistaZonas());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tam]);

  useEffect(() => () => void (animacion.current && cancelAnimationFrame(animacion.current)), []);

  /** Punto del mapa bajo una posición de la pantalla. */
  const punto = (clientX: number, clientY: number) => {
    const r = lienzo.current!.getBoundingClientRect();
    const v = vistaRef.current!;
    return { x: v.x + ((clientX - r.left) / r.width) * v.w, y: v.y + ((clientY - r.top) / r.height) * v.h };
  };

  /** Acerca (f < 1) o aleja (f > 1) dejando quieto el punto (x, y). */
  const zoomEn = useCallback(
    (p: { x: number; y: number }, f: number, animado = false) => {
      const v = vistaRef.current;
      if (!v) return;
      const maximo = Math.max(mapa.ancho, mapa.alto * aspecto) * 1.1;
      const w = Math.min(maximo, Math.max(ANCHO_MINIMO, v.w * f));
      const real = w / v.w;
      const destino = { x: p.x - (p.x - v.x) * real, y: p.y - (p.y - v.y) * real, w, h: w / aspecto };
      if (animado) irA(destino);
      else fijarVista(destino);
    },
    [mapa, aspecto, irA, fijarVista],
  );

  // Rueda del mouse (y pellizco del panel táctil): se registra a mano para poder evitar que baje la página.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const rueda = (e: WheelEvent) => {
      if (!vistaRef.current) return;
      e.preventDefault();
      if (animacion.current) cancelAnimationFrame(animacion.current);
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomEn(punto(e.clientX, e.clientY), Math.exp(Math.max(-1, Math.min(1, delta * 0.0022))));
    };
    el.addEventListener('wheel', rueda, { passive: false });
    return () => el.removeEventListener('wheel', rueda);
  });

  // Arrastrar para mover; dos dedos para acercar.
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ movido: boolean; objetivo: string | null; ox: number; oy: number; tactil: boolean }>({ movido: false, objetivo: null, ox: 0, oy: 0, tactil: false });

  const moverGlobo = (clientX: number, clientY: number) => {
    const g = globo.current;
    const el = lienzo.current;
    if (!g || !el) return;
    const r = el.getBoundingClientRect();
    let x = clientX - r.left + 14;
    let y = clientY - r.top + 14;
    if (x + g.offsetWidth > r.width - 6) x = clientX - r.left - g.offsetWidth - 14;
    if (y + g.offsetHeight > r.height - 6) y = clientY - r.top - g.offsetHeight - 14;
    g.style.transform = `translate(${Math.max(6, x)}px, ${Math.max(6, y)}px)`;
  };

  const codigoBajo = (e: { target: EventTarget | null }) => (e.target instanceof Element ? (e.target.closest('[data-c]')?.getAttribute('data-c') ?? null) : null);

  const alBajar = (e: EventoPuntero<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (animacion.current) cancelAnimationFrame(animacion.current);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 1) gesto.current = { movido: false, objetivo: codigoBajo(e), ox: e.clientX, oy: e.clientY, tactil: e.pointerType !== 'mouse' };
    else gesto.current.movido = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const alMover = (e: EventoPuntero<SVGSVGElement>) => {
    const p = punteros.current;
    if (!p.has(e.pointerId)) {
      // Solo pasando por encima: mostrar el nombre del municipio.
      const c = codigoBajo(e);
      if (c !== encima) setEncima(c);
      moverGlobo(e.clientX, e.clientY);
      return;
    }
    const antes = p.get(e.pointerId)!;
    const v = vistaRef.current;
    const r = lienzo.current!.getBoundingClientRect();
    if (!v) return;
    if (p.size === 1) {
      if (Math.hypot(e.clientX - gesto.current.ox, e.clientY - gesto.current.oy) > 5) gesto.current.movido = true;
      if (gesto.current.movido) {
        if (encima) setEncima(null);
        const k = v.w / r.width;
        fijarVista({ ...v, x: v.x - (e.clientX - antes.x) * k, y: v.y - (e.clientY - antes.y) * k });
      }
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (p.size === 2) {
      const [a, b] = [...p.entries()];
      const otro = a![0] === e.pointerId ? b![1] : a![1];
      const distAntes = Math.hypot(antes.x - otro.x, antes.y - otro.y);
      const distAhora = Math.hypot(e.clientX - otro.x, e.clientY - otro.y);
      const medio = punto((e.clientX + otro.x) / 2, (e.clientY + otro.y) / 2);
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (distAntes > 0 && distAhora > 0) zoomEn(medio, distAntes / distAhora);
      // Mover también lo que se desplazó el punto medio.
      const v2 = vistaRef.current!;
      const k = v2.w / r.width;
      fijarVista({ ...v2, x: v2.x - ((e.clientX - antes.x) / 2) * k, y: v2.y - ((e.clientY - antes.y) / 2) * k });
    }
  };

  const alSoltar = (e: EventoPuntero<SVGSVGElement>) => {
    const p = punteros.current;
    if (!p.has(e.pointerId)) return;
    p.delete(e.pointerId);
    if (p.size > 0) return;
    const g = gesto.current;
    if (!g.movido && g.objetivo) {
      const z = zonaPorCodigo.get(g.objetivo);
      if (z) alAlternar(z.llave);
      // En pantallas táctiles no hay "pasar por encima": el toque muestra el detalle.
      if (g.tactil) {
        setEncima(g.objetivo);
        moverGlobo(e.clientX, e.clientY);
      }
    }
  };

  const alDobleClic = (e: EventoRaton<SVGSVGElement>) => {
    // Sobre una zona el doble clic la elegiría y la quitaría; ahí no se acerca.
    if (zonaPorCodigo.has(codigoBajo(e) ?? '')) return;
    zoomEn(punto(e.clientX, e.clientY), 0.5, true);
  };

  /** Con el teclado, el detalle aparece junto a la zona enfocada. */
  const alEnfocar = useCallback(
    (codigo: string | null) => {
      setEncima(codigo);
      if (!codigo) return;
      const m = municipioPorCodigo.get(codigo);
      const v = vistaRef.current;
      const el = lienzo.current;
      if (!m || !v || !el) return;
      const r = el.getBoundingClientRect();
      requestAnimationFrame(() => moverGlobo(r.left + ((m.x - v.x) / v.w) * r.width, r.top + ((m.y - v.y) / v.h) * r.height));
    },
    [municipioPorCodigo],
  );

  const ir = (valor: string) => {
    setEleccionIr(valor);
    if (valor === 'zonas') return irA(vistaZonas());
    if (valor === 'pais') return irA(vistaPais());
    const d = mapa.departamentos.find((x) => x.codigo === valor);
    if (d) irA(encajar(d.caja as Caja, aspecto, 6));
  };

  const acercamiento = vista ? mapa.ancho / vista.w : 1;
  // Los límites municipales aparecen poco a poco al acercarse.
  const opacidadMpios = Math.max(0.25, Math.min(1, (acercamiento - 1) / 3));
  const rotulos = vista && tam ? colocarRotulos(vista, tam, mapa, zonas, codigosZona) : [];
  const deptosConUsuarios = new Set(zonas.map((z) => z.codigo.slice(0, 2)));

  const enc = encima ? municipioPorCodigo.get(encima) : undefined;
  const encZona = encima ? zonaPorCodigo.get(encima) : undefined;

  return (
    <div className="mapa">
      <div className="mapa-barra">
        <label className="mapa-ir">
          <span>Ver</span>
          <select value={eleccionIr} onChange={(e) => ir(e.target.value)}>
            <option value="zonas">Las zonas con usuarios</option>
            <option value="pais">Todo el país</option>
            <optgroup label="Departamentos con usuarios">
              {mapa.departamentos
                .filter((d) => deptosConUsuarios.has(d.codigo))
                .map((d) => (
                  <option key={d.codigo} value={d.codigo}>
                    {d.nombre}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Otros departamentos">
              {mapa.departamentos
                .filter((d) => !deptosConUsuarios.has(d.codigo))
                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                .map((d) => (
                  <option key={d.codigo} value={d.codigo}>
                    {d.nombre}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <div className="mapa-leyenda" aria-label="Usuarios por municipio">
          <span className="mapa-leyenda-titulo">Usuarios</span>
          <ol>
            {escala.clases.map((c) => (
              <li key={c.tono}>
                <span className="muestra" style={{ background: c.tono }} />
                {c.texto}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mapa-lienzo" ref={lienzo}>
        <svg
          ref={svg}
          className="mapa-svg"
          viewBox={vista ? `${vista.x} ${vista.y} ${vista.w} ${vista.h}` : `0 0 ${mapa.ancho} ${mapa.alto}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ ['--opacidad-mpios' as string]: opacidadMpios }}
          role="group"
          aria-label="Mapa de Colombia. Los municipios sombreados tienen usuarios; tóquelos para ver sus usuarios. Use la rueda del mouse o los botones para acercar."
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onPointerLeave={() => punteros.current.size === 0 && setEncima(null)}
          onDoubleClick={alDobleClic}
        >
          <CapaMunicipios municipios={mapa.municipios} />
          <CapaZonas zonas={zonas} alAlternar={alAlternar} alEnfocar={alEnfocar} />
          <CapaBordes mapa={mapa} />
          {enc ? <path className="mapa-encima" d={enc.d} pointerEvents="none" /> : null}
        </svg>

        <div className="mapa-rotulos" aria-hidden="true">
          {rotulos.map((r) => (
            <span key={r.clave} className={`rotulo rotulo-${r.clase}${r.elegida ? ' elegida' : ''}`} style={{ transform: `translate(${r.x}px, ${r.y}px) translate(-50%, -50%)` }}>
              {r.texto}
            </span>
          ))}
        </div>

        <div className="mapa-controles">
          <button type="button" aria-label="Acercar" title="Acercar" onClick={() => vista && zoomEn({ x: vista.x + vista.w / 2, y: vista.y + vista.h / 2 }, 0.5, true)}>
            <Icono nombre="mas" />
          </button>
          <button type="button" aria-label="Alejar" title="Alejar" onClick={() => vista && zoomEn({ x: vista.x + vista.w / 2, y: vista.y + vista.h / 2 }, 2, true)}>
            <Icono nombre="menos" />
          </button>
          <button
            type="button"
            aria-label="Volver a las zonas con usuarios"
            title="Volver a las zonas con usuarios"
            onClick={() => {
              setEleccionIr('zonas');
              irA(vistaZonas());
            }}
          >
            <Icono nombre="encuadrar" />
          </button>
        </div>

        <p className="mapa-ayuda" aria-hidden="true">
          <span className="con-mouse">Rueda del mouse o doble clic para acercar · arrastre para moverse</span>
          <span className="tactil">Dos dedos para acercar · arrastre para moverse</span>
        </p>

        <div ref={globo} className="mapa-globo" role="status" hidden={!enc}>
          {enc ? (
            <>
              <b>{encZona ? encZona.ubicada.zona.zona : enc.n}</b>
              <span className="suave">
                {encZona && encZona.ubicada.zona.zona.toLowerCase() !== enc.n.toLowerCase() ? `${enc.n}, ` : ''}
                {mapa.nombreDepto[enc.dc]}
              </span>
              {encZona ? (
                <>
                  <span>
                    <b className="num">{cantidad(encZona.ubicada.zona.usuarios)}</b> usuarios · <b className="num">{cantidad(encZona.ubicada.zona.instalados)}</b> equipos instalados
                  </span>
                  {encZona.ubicada.zona.reposiciones > 0 ? <span>{cantidad(encZona.ubicada.zona.reposiciones)} reposiciones por falla</span> : null}
                  {encZona.ubicada.metodo === 'SUPUESTA' ? <span className="texto-verificar">Ubicación supuesta, por confirmar</span> : null}
                  <span className="suave">{encZona.elegida ? 'Toque para quitarla de la lista' : 'Toque para ver sus usuarios'}</span>
                </>
              ) : (
                <span className="suave">Sin usuarios</span>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
