import { NOMBRE_ESTADO, NOMBRE_TIPO_EQUIPO, normalizarSerial, validarComando, type EstadoEquipo, type TipoEquipo, type UnidadCapacidad } from '@egt/domain';
import { fecha, normalizar, numero, texto, type Celda } from './importacion.ts';

/**
 * Lector del archivo que maneja la empresa ("COMPRAS_INVENTARIOS_UNIFICADOS",
 * hoja «Histórico»): una fila por equipo ya comprado y casi siempre ya
 * entregado a un usuario. Los datos vienen incompletos y escritos a mano, así
 * que aquí se limpian, y lo que falta queda marcado "por completar".
 *
 * Cada fila se convierte en un IMPORTAR_HISTORICO validado con las mismas
 * reglas del servidor. No depende del navegador.
 */

export type ClaveHistorico =
  | 'codigo'
  | 'tipo'
  | 'marca'
  | 'fechaCompra'
  | 'estado'
  | 'zona'
  | 'factura'
  | 'valor'
  | 'descripcion'
  | 'proveedor'
  | 'serial'
  | 'garantia'
  | 'estadoGarantia'
  | 'cedula'
  | 'niu'
  | 'nombre'
  | 'fechaEntrega'
  | 'devuelto';

/** Encabezados del archivo de la empresa (sin tildes ni mayúsculas, solo el comienzo). */
const ENCABEZADOS: [ClaveHistorico, RegExp][] = [
  ['codigo', /^codigo interno/],
  ['tipo', /^tipo de equipo/],
  ['marca', /^marca/],
  ['fechaCompra', /^fecha de compra/],
  ['estado', /^estado rep|^estado$/],
  ['zona', /^centro de costos?/],
  ['factura', /^id factura|^factura/],
  ['valor', /^valor/],
  ['descripcion', /^descripcion/],
  ['proveedor', /^proveedor/],
  ['serial', /^serial/],
  ['garantia', /^fecha fin de garantia/],
  ['estadoGarantia', /^estado de garantia/],
  ['cedula', /^usuario( cedula)?$/],
  ['niu', /^niu$/],
  ['nombre', /^nombre( usuario)?$/],
  ['fechaEntrega', /^fecha de entrega/],
  ['devuelto', /^equipo devuelto/],
];

export const TITULOS_HISTORICO: Record<ClaveHistorico, string> = {
  codigo: 'Código interno',
  tipo: 'Tipo de equipo',
  marca: 'Marca/Modelo',
  fechaCompra: 'Fecha de compra',
  estado: 'Estado',
  zona: 'Centro de costos',
  factura: 'ID Factura',
  valor: 'Valor',
  descripcion: 'Descripción',
  proveedor: 'Proveedor',
  serial: 'Serial',
  garantia: 'Fin de garantía',
  estadoGarantia: 'Estado de garantía',
  cedula: 'Usuario (cédula)',
  niu: 'NIU',
  nombre: 'Nombre',
  fechaEntrega: 'Fecha de entrega',
  devuelto: 'Equipo devuelto',
};

export const MAXIMO_FILAS_HISTORICO = 10_000;

export interface FilaHistorico {
  fila: number;
  vista: { codigo: string; tipo: string; detalle: string; zona: string; usuario: string; estado: EstadoEquipo | null };
  originales: Partial<Record<ClaveHistorico, string>>;
  comando: { id: string; payload: Record<string, unknown> } | null;
  pendientes: string[];
  errores: string[];
}

export interface ResultadoHistorico {
  filas: FilaHistorico[];
  problemas: string[];
  /** Cuántos equipos quedarán en cada estado, zona y con datos por completar. */
  resumen: {
    porEstado: Partial<Record<EstadoEquipo, number>>;
    porZona: [string, number][];
    conPendientes: number;
    /** Filas "disponibles" que necesitan una bodega. */
    enStock: number;
  };
}

// ── Detección ──────────────────────────────────────────────────────────────

function columnasDe(encabezados: Celda[]): Map<ClaveHistorico, number> {
  const columnas = new Map<ClaveHistorico, number>();
  encabezados.forEach((celda, j) => {
    const t = normalizar(texto(celda));
    const par = ENCABEZADOS.find(([clave, patron]) => !columnas.has(clave) && patron.test(t));
    if (par) columnas.set(par[0], j);
  });
  // El NIU es la columna que sigue a la cédula (a veces le escribieron un número encima del título).
  const cedula = columnas.get('cedula');
  if (!columnas.has('niu') && cedula !== undefined) {
    const siguiente = encabezados[cedula + 1];
    if (typeof siguiente === 'number' || /^\d+$/.test(texto(siguiente))) columnas.set('niu', cedula + 1);
  }
  return columnas;
}

/** Fila de encabezados del formato de la empresa (o -1 si la hoja no es de ese formato). */
export function encabezadosHistorico(datos: Celda[][]): number {
  for (let i = 0; i < Math.min(10, datos.length); i++) {
    const c = columnasDe(datos[i] ?? []);
    if (c.has('codigo') && c.has('tipo') && c.has('zona')) return i;
  }
  return -1;
}

export const esFormatoHistorico = (datos: Celda[][]) => encabezadosHistorico(datos) >= 0;

// ── Limpieza de valores ────────────────────────────────────────────────────

/** Textos que en el archivo significan "no hay dato". */
const RELLENO = /^(pendiente|pdte.*|none|null|n\/?a|n\/?d|#n\/?d|#value!?|#ref!?|sin dato|na|-+|\.+|0|x|en espera)$/i;
const esRelleno = (v: string) => v === '' || RELLENO.test(v.trim());

const limpio = (v: Celda, maximo: number) => {
  const t = texto(v).replace(/\s+/g, ' ').trim();
  return esRelleno(t) ? '' : t.slice(0, maximo);
};

const PEQUENAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y']);
/** "PUERTO ASÍS" → "Puerto Asís" (así se ve igual aunque cada uno lo escriba distinto). */
export function nombrePropio(v: string) {
  return v
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && PEQUENAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const TIPOS: [RegExp, TipoEquipo][] = [
  [/^bateria( de)? gel/, 'BATERIA_GEL'],
  [/^bateria( de)? litio/, 'BATERIA_LITIO'],
  [/^panel/, 'PANEL_SOLAR'],
  [/^modulo/, 'PANEL_SOLAR'],
  [/^inversor/, 'INVERSOR'],
  [/^medidor/, 'MEDIDOR'],
  [/^contador/, 'MEDIDOR'],
  [/^controlador/, 'CONTROLADOR'],
  [/^regulador/, 'CONTROLADOR'],
];

function tipoDe(tipoTexto: string, descripcion: string): TipoEquipo | undefined {
  const t = normalizar(tipoTexto);
  const directo = TIPOS.find(([p]) => p.test(t))?.[1];
  if (directo) return directo;
  // "BATERÍA" sola: se mira la descripción.
  if (/^bateria/.test(t)) {
    const d = normalizar(descripcion);
    if (/litio|lithium|luthium|lfp|lifepo/.test(d)) return 'BATERIA_LITIO';
    if (/gel/.test(d)) return 'BATERIA_GEL';
  }
  return undefined;
}

/**
 * Fecha del archivo. Las que vienen como texto están en orden mes/día/año
 * (así lo dice el encabezado "FECHA DE COMPRA (MES, DÍA, AÑO)").
 */
export function fechaMesDia(v: Celda): string | null {
  if (typeof v === 'string') {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v.trim());
    if (m) {
      const mes = Number(m[1]);
      const dia = Number(m[2]);
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      return `${m[3]}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
    return null;
  }
  const f = fecha(v);
  return f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
}

const hoy = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10); // hora de Colombia

/** Cédula: solo dígitos, sin el dígito de verificación ("1061-7" → "1061"). */
export function cedulaDe(v: Celda): string | null {
  if (typeof v === 'number') {
    const s = String(Math.trunc(v));
    return s.length >= 5 && s.length <= 12 ? s : null;
  }
  const t = texto(v);
  if (!t || /[a-z]{2,}/i.test(t)) return null;
  const d = t.split('-')[0]!.replace(/[^\d]/g, '');
  return d.length >= 5 && d.length <= 12 ? d : null;
}

/** Proveedor "TB PLUS" y "TBPLUS" son el mismo. */
const llaveProveedor = (v: string) => normalizar(v).replace(/\b(s ?a ?s|ltda|s ?a)\b/g, '').replace(/[^a-z0-9]/g, '');

/** En la columna Proveedor a veces quedaron datos técnicos ("MAX.PV INPUT POWER:520W"). */
const pareceTecnico = (v: string) =>
  /[:()]/.test(v) || /\d+(\.\d+)?\s*(v|w|ah|a|kw|kwh|wh)\b/i.test(v) || (/\d/.test(v) && !/[a-záéíóúñ]{4,}/i.test(v));

/** Marca/modelo que en realidad es un serial o un número suelto. */
const pareceSerial = (v: string) => /^\d+$/.test(v) || (!/\s/.test(v) && /\d{6,}/.test(v));

/**
 * La columna MARCA/MODELO trae a veces la marca ("MTEK"), a veces una
 * referencia técnica ("1000W PRO SERIES 24VDC-120VAC", que pasa a modelo) y a
 * veces un serial (que se ignora).
 */
function marcaYModelo(v: string): { marca: string; modelo: string } {
  if (!v || pareceSerial(v)) return { marca: '', modelo: '' };
  if (llaveProveedor(v).startsWith('tbplus')) return { marca: 'TB Plus', modelo: '' };
  if (pareceTecnico(v) && !/\(.*[a-z]{4,}.*\)/i.test(v)) return { marca: '', modelo: v.replace(/^model[o]?:\s*/i, '').slice(0, 80) };
  return { marca: v.slice(0, 80), modelo: '' };
}

/**
 * Identificador fijo (formato UUID) calculado a partir del contenido de la
 * fila: si se vuelve a importar el mismo archivo, el servidor reconoce las
 * filas que ya había guardado y no las duplica.
 */
export function idFijo(semilla: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < semilla.length; i++) {
    const k = semilla.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
  // Versión 8 (UUID propio) y variante RFC.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const numeroDe = (s: string) => Number(s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));

/** Potencia o capacidad a partir de la descripción, según el tipo de equipo. */
export function potenciaDe(tipo: TipoEquipo, ...textos: string[]): { potencia: number; unidad: UnidadCapacidad } | null {
  const t = textos.filter(Boolean).join(' ');
  const buscar = (patron: RegExp) => {
    const m = patron.exec(t);
    if (!m) return null;
    const n = numeroDe(m[1]!);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  let n: number | null;
  switch (tipo) {
    case 'PANEL_SOLAR':
      if ((n = buscar(/(\d+(?:[.,]\d+)?)\s*k\s?w(?![a-z])/i))) return { potencia: n, unidad: 'kW' };
      if ((n = buscar(/(\d{2,4})\s*w(?:p|att|atts)?(?![a-z])/i))) return { potencia: n, unidad: 'W' };
      return null;
    case 'INVERSOR':
      if ((n = buscar(/(\d+(?:[.,]\d+)?)\s*k\s?w(?![a-z])/i))) return { potencia: n, unidad: 'kW' };
      if ((n = buscar(/(\d{1,2}\.\d{3}|\d{3,5})\s*w(?:att|atts)?(?![a-z])/i))) return { potencia: n, unidad: 'W' };
      return null;
    case 'BATERIA_GEL':
      if ((n = buscar(/(\d+(?:[.,]\d+)?)\s*a\s?h(?![a-z])/i))) return { potencia: n, unidad: 'Ah' };
      // Referencias TB12-200, TB 12-150: el último número es la capacidad en Ah.
      if ((n = buscar(/tb\s*12\s*-\s*(\d{2,3})/i))) return { potencia: n, unidad: 'Ah' };
      return null;
    case 'BATERIA_LITIO':
      if ((n = buscar(/(\d+(?:[.,]\d+)?)\s*k\s?w\s*\/?\s*h/i))) return { potencia: n, unidad: 'kWh' };
      if ((n = buscar(/(\d{3,5})\s*w\s*\/?\s*h/i))) return { potencia: n, unidad: 'Wh' };
      if ((n = buscar(/(\d+(?:[.,]\d+)?)\s*a\s?h(?![a-z])/i))) return { potencia: n, unidad: 'Ah' };
      if ((n = buscar(/lfp\s*(\d{2,3})/i))) return { potencia: n, unidad: 'Ah' };
      return null;
    case 'CONTROLADOR':
    case 'MEDIDOR':
      if ((n = buscar(/(\d{1,3})\s*a(?![a-z])/i))) return { potencia: n, unidad: 'A' };
      if (tipo === 'CONTROLADOR' && (n = buscar(/mppt\s*(\d{2,3})/i))) return { potencia: n, unidad: 'A' };
      return null;
  }
}

/** Estado actual del equipo a partir de las columnas de estado y de las notas escritas en otras columnas. */
export function estadoDe(notas: string[], conUsuario: boolean): { estado: EstadoEquipo; motivo: string | null } {
  const t = normalizar(notas.join(' | '));
  if (/perdid/.test(t)) return { estado: 'DADO_DE_BAJA', motivo: 'Perdido' };
  if (/disp(osicion)? final/.test(t)) return { estado: 'DADO_DE_BAJA', motivo: 'Disposición final' };
  if (/danad|mal estado|presentan? falla|tramite poliza|garantia/.test(t)) return { estado: 'EN_MANTENIMIENTO', motivo: 'En revisión o garantía' };
  if (/disponible|en stock|bodega/.test(t) && !/instalado/.test(t)) return { estado: 'EN_STOCK', motivo: null };
  return { estado: 'INSTALADO', motivo: conUsuario ? null : 'Sin usuario en el archivo' };
}

// ── Lectura ────────────────────────────────────────────────────────────────

export function leerHistorico(datos: Celda[][], contexto: { hoja: string; bodegaId?: string | undefined }): ResultadoHistorico {
  const vacio = { porEstado: {}, porZona: [], conPendientes: 0, enStock: 0 };
  const indice = encabezadosHistorico(datos);
  if (indice < 0) return { filas: [], problemas: ['La hoja no tiene los encabezados del formato de la empresa (CÓDIGO INTERNO, TIPO DE EQUIPO, CENTRO DE COSTOS…).'], resumen: vacio };
  const columnas = columnasDe(datos[indice]!);
  const claves = [...columnas.keys()];

  const filas: FilaHistorico[] = [];
  const problemas: string[] = [];
  const codigos = new Map<string, number>();
  const hoyStr = hoy();

  // Proveedores: se unifican las formas de escribir el mismo (se queda la más usada).
  const conteoProveedor = new Map<string, Map<string, number>>();
  for (let i = indice + 1; i < datos.length; i++) {
    const j = columnas.get('proveedor');
    const p = j === undefined ? '' : limpio(datos[i]?.[j], 150);
    if (!p || pareceTecnico(p)) continue;
    const llave = llaveProveedor(p);
    const formas = conteoProveedor.get(llave) ?? new Map<string, number>();
    formas.set(p, (formas.get(p) ?? 0) + 1);
    conteoProveedor.set(llave, formas);
  }
  const llaves = [...conteoProveedor.keys()];
  const nombreProveedor = (p: string) => {
    const llave = llaveProveedor(p);
    // "CARIBBEAN" y "CARIBBEAN GREEN ENERGIES S.A.S" también son el mismo.
    const grupo = llaves.filter((k) => k.length >= 4 && (k.startsWith(llave) || llave.startsWith(k)));
    let mejor = p;
    let veces = 0;
    for (const k of grupo.length > 0 ? grupo : [llave]) {
      for (const [forma, n] of conteoProveedor.get(k) ?? []) {
        if (n > veces) {
          mejor = forma;
          veces = n;
        }
      }
    }
    return mejor;
  };

  for (let i = indice + 1; i < datos.length; i++) {
    const celdas = datos[i] ?? [];
    const valor = (clave: ClaveHistorico): Celda => {
      const j = columnas.get(clave);
      return j === undefined ? null : celdas[j];
    };
    if (claves.every((c) => texto(valor(c)) === '')) continue;
    if (filas.length >= MAXIMO_FILAS_HISTORICO) {
      problemas.push(`El archivo tiene más de ${MAXIMO_FILAS_HISTORICO} equipos: solo se leyeron los primeros.`);
      break;
    }
    const numeroFila = i + 1;
    const originales = Object.fromEntries(claves.map((c) => [c, texto(valor(c))])) as Partial<Record<ClaveHistorico, string>>;
    const errores: string[] = [];
    const pendientes: string[] = ['Proyecto'];
    const notas: string[] = [];

    // Código interno: un identificador sin espacios. Si en la celda hay una nota, se guarda como nota.
    const codigoTexto = texto(valor('codigo')).trim();
    let codigo = '';
    if (codigoTexto && !esRelleno(codigoTexto)) {
      if (/^\S{2,40}$/.test(codigoTexto)) codigo = codigoTexto;
      else notas.push(codigoTexto.slice(0, 120));
    }
    if (!codigo) pendientes.push('Código interno');
    if (codigo) {
      const llave = normalizarSerial(codigo);
      const anterior = codigos.get(llave);
      if (anterior) errores.push(`Código interno: ${codigo} está repetido, ya aparece en la fila ${anterior}`);
      else codigos.set(llave, numeroFila);
    }

    const descripcion = limpio(valor('descripcion'), 300);
    const marcaTexto = limpio(valor('marca'), 120);
    const tipoTexto = texto(valor('tipo'));
    const tipo = tipoDe(tipoTexto, `${descripcion} ${marcaTexto}`);
    if (!tipoTexto) errores.push('Tipo de equipo: está vacío');
    else if (!tipo) errores.push(`Tipo de equipo: «${tipoTexto}» no es un tipo del sistema (batería de gel o de litio, inversor, medidor, controlador o panel)`);

    const { marca, modelo } = marcaYModelo(marcaTexto);
    if (!marca) pendientes.push('Marca');
    const medida = tipo ? potenciaDe(tipo, descripcion, marcaTexto) : null;
    if (tipo && !medida) pendientes.push('Potencia');

    // Serial del fabricante: se ignora si es relleno o si es el mismo código interno.
    let serialFabricante = limpio(valor('serial'), 80);
    if (serialFabricante && codigo && normalizarSerial(serialFabricante) === normalizarSerial(codigo)) serialFabricante = '';
    if (typeof valor('serial') === 'number') serialFabricante = String(Math.trunc(valor('serial') as number));

    const zonaTexto = limpio(valor('zona'), 120);
    const zona = zonaTexto ? nombrePropio(zonaTexto) : '';
    if (!zona) pendientes.push('Zona');

    // Compra
    const proveedorTexto = limpio(valor('proveedor'), 150);
    const proveedor = proveedorTexto && !pareceTecnico(proveedorTexto) ? nombreProveedor(proveedorTexto) : '';
    if (!proveedor) pendientes.push('Proveedor');
    let factura = limpio(valor('factura'), 30).toUpperCase();
    if (factura && (!/\d/.test(factura) || !/^[A-Z0-9][A-Z0-9 ./-]{0,29}$/.test(factura))) factura = '';
    if (!factura) pendientes.push('Factura');
    let fechaCompra = fechaMesDia(valor('fechaCompra'));
    if (fechaCompra && fechaCompra > hoyStr) fechaCompra = null;
    if (!fechaCompra) pendientes.push('Fecha de compra');
    const valorNumero = numero(valor('valor'));
    const valorPagado = Number.isFinite(valorNumero) && valorNumero > 0 ? Math.round(valorNumero * 100) / 100 : undefined;
    if (valorPagado === undefined) pendientes.push('Valor');
    const garantia = fechaMesDia(valor('garantia') instanceof Date || typeof valor('garantia') === 'number' ? valor('garantia') : null);
    if (!garantia) pendientes.push('Fin de garantía');

    // Usuario: la cédula, si es un número; si es texto, es una nota sobre el estado.
    const cedula = cedulaDe(valor('cedula'));
    const cedulaTexto = texto(valor('cedula'));
    if (!cedula && cedulaTexto && !esRelleno(cedulaTexto)) notas.push(cedulaTexto);
    const niuCelda = valor('niu');
    const niu = typeof niuCelda === 'number' ? String(Math.trunc(niuCelda)) : /^\d{3,30}$/.test(texto(niuCelda)) ? texto(niuCelda) : '';
    if (!niu && texto(niuCelda) && !esRelleno(texto(niuCelda))) notas.push(texto(niuCelda));
    const nombre = cedula ? limpio(valor('nombre'), 150) : '';
    const entregaCelda = valor('fechaEntrega');
    let fechaEntrega = entregaCelda instanceof Date || typeof entregaCelda === 'number' ? fechaMesDia(entregaCelda) : null;
    if (typeof entregaCelda === 'string' && !esRelleno(entregaCelda)) notas.push(entregaCelda);
    if (fechaEntrega && fechaEntrega > hoyStr) fechaEntrega = null;

    const estadoTexto = limpio(valor('estado'), 60);
    const devuelto = limpio(valor('devuelto'), 60);
    const estadoGarantia = limpio(valor('estadoGarantia'), 60);
    const { estado, motivo } = estadoDe([estadoTexto, devuelto, estadoGarantia.match(/disp/i) ? estadoGarantia : '', ...notas], Boolean(cedula));
    if (estado === 'INSTALADO' && !cedula) pendientes.push('Usuario');
    if (cedula && !nombre) pendientes.push('Nombre del usuario');
    if (cedula && !fechaEntrega && estado === 'INSTALADO') pendientes.push('Fecha de entrega');
    if (estado === 'EN_STOCK' && !contexto.bodegaId) errores.push('Bodega: el equipo está disponible; elija arriba la bodega donde quedan los disponibles');

    const observaciones = [
      estadoTexto ? `Estado en el archivo: ${estadoTexto}` : null,
      motivo && motivo !== 'Sin usuario en el archivo' ? motivo : null,
      devuelto ? `Equipo devuelto: ${devuelto}` : null,
      ...notas.map((n) => `Nota: ${n}`),
    ].filter((x): x is string => Boolean(x));

    const semilla = `${contexto.hoja}|${numeroFila}|${contexto.bodegaId ?? ''}|${JSON.stringify(celdas)}`;
    const payload: Record<string, unknown> = {
      equipoId: idFijo(`${semilla}|equipo`),
      ...(codigo ? { codigoInterno: codigo } : {}),
      ...(serialFabricante ? { serialFabricante } : {}),
      tipo: tipo ?? tipoTexto,
      ...(marca ? { marca } : {}),
      ...(modelo ? { modelo } : {}),
      ...(descripcion ? { descripcion } : {}),
      ...(medida ? { potencia: medida.potencia, unidad: medida.unidad } : {}),
      ...(zona ? { zona } : {}),
      ...(estado === 'EN_STOCK' && contexto.bodegaId ? { bodegaId: contexto.bodegaId } : {}),
      ...(proveedor || factura || fechaCompra
        ? { compra: { ...(proveedor ? { proveedor } : {}), ...(factura ? { numeroFactura: factura } : {}), ...(fechaCompra ? { fechaCompra } : {}) } }
        : {}),
      ...(valorPagado !== undefined ? { valorPagado } : {}),
      ...(garantia ? { garantiaHasta: garantia } : {}),
      estado,
      ...(cedula ? { usuario: { cedula, ...(nombre ? { nombre } : {}), ...(niu ? { niu } : {}) } } : {}),
      ...(fechaEntrega && cedula ? { fechaEntrega } : {}),
      ...(observaciones.length > 0 ? { motivo: observaciones.join(' · ').slice(0, 500) } : {}),
      pendientes,
    };

    const id = idFijo(`${semilla}|comando`);
    const v = validarComando({ id, tipo: 'IMPORTAR_HISTORICO', ocurridoEn: new Date().toISOString(), payload });
    if (!v.valido && errores.length === 0) {
      for (const d of v.error.detalles) errores.push(`${d.campo.replace(/^payload\./, '')}: ${d.problema}`);
    }

    filas.push({
      fila: numeroFila,
      vista: {
        codigo: codigo || serialFabricante || 'Lo asigna el sistema',
        tipo: tipo ? NOMBRE_TIPO_EQUIPO[tipo] : tipoTexto,
        detalle: [marca, modelo, descripcion].filter(Boolean).join(' · '),
        zona,
        usuario: cedula ? `${nombre || 'Sin nombre'} · C.C. ${cedula}` : '',
        estado: tipo ? estado : null,
      },
      originales,
      comando: errores.length === 0 && v.valido ? { id, payload: v.comando.payload as Record<string, unknown> } : null,
      pendientes: pendientes.filter((p) => p !== 'Proyecto'),
      errores,
    });
  }

  const listas = filas.filter((f) => f.comando);
  const porEstado: Partial<Record<EstadoEquipo, number>> = {};
  const zonas = new Map<string, number>();
  for (const f of listas) {
    const e = f.vista.estado!;
    porEstado[e] = (porEstado[e] ?? 0) + 1;
    const z = f.vista.zona || 'Sin zona';
    zonas.set(z, (zonas.get(z) ?? 0) + 1);
  }
  if (filas.length === 0) problemas.push('La hoja no tiene equipos debajo de los encabezados.');
  return {
    filas,
    problemas,
    resumen: {
      porEstado,
      porZona: [...zonas.entries()].sort((a, b) => b[1] - a[1]),
      conPendientes: listas.filter((f) => f.pendientes.length > 0).length,
      enStock: filas.filter((f) => f.vista.estado === 'EN_STOCK').length,
    },
  };
}

export const nombreEstado = (e: EstadoEquipo) => NOMBRE_ESTADO[e];
