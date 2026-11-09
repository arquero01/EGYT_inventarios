import {
  NOMBRE_TIPO_EQUIPO,
  TIPOS_EQUIPO,
  UNIDADES_CAPACIDAD,
  normalizarSerial,
  validarComando,
  type TipoEquipo,
  type UnidadCapacidad,
} from '@egt/domain';

/**
 * Importación de equipos desde una hoja de cálculo (Excel, Google Sheets o
 * CSV). Convierte cada fila en un ingreso de equipo (REGISTRAR_INGRESO) y lo
 * valida con las mismas reglas del servidor, antes de enviar nada.
 *
 * No depende del navegador: recibe las filas ya leídas del archivo.
 */

export type Celda = string | number | boolean | Date | null | undefined;

export type ClaveColumna =
  | 'tipo'
  | 'marca'
  | 'modelo'
  | 'serial'
  | 'potencia'
  | 'unidad'
  | 'proyecto'
  | 'bodega'
  | 'proveedor'
  | 'nit'
  | 'factura'
  | 'fechaCompra'
  | 'valorPagado';

export interface Columna {
  clave: ClaveColumna;
  titulo: string;
  obligatoria: boolean;
  ayuda: string;
  /** Otros nombres con que puede venir la columna en el archivo. */
  alias: string[];
}

export const COLUMNAS: Columna[] = [
  { clave: 'tipo', titulo: 'Tipo', obligatoria: true, ayuda: 'Panel solar, Batería de gel, Batería de litio, Inversor, Medidor o Controlador', alias: ['tipo de equipo', 'equipo', 'clase'] },
  { clave: 'marca', titulo: 'Marca', obligatoria: true, ayuda: 'Fabricante del equipo', alias: ['fabricante'] },
  { clave: 'modelo', titulo: 'Modelo', obligatoria: true, ayuda: 'Referencia del fabricante', alias: ['referencia', 'ref'] },
  { clave: 'serial', titulo: 'Serial', obligatoria: false, ayuda: 'El del proveedor. Vacío: el sistema asigna un serial de la empresa', alias: ['numero de serie', 'no de serie', 'n de serie', 'serie', 'sn', 'numero serial'] },
  { clave: 'potencia', titulo: 'Potencia o capacidad', obligatoria: true, ayuda: 'Solo el número, por ejemplo 450', alias: ['potencia', 'capacidad'] },
  { clave: 'unidad', titulo: 'Unidad', obligatoria: false, ayuda: `${UNIDADES_CAPACIDAD.join(', ')}. Vacío: la habitual del tipo`, alias: ['unidad de medida', 'und'] },
  { clave: 'proyecto', titulo: 'Proyecto', obligatoria: true, ayuda: 'Nombre de un proyecto ya creado en el sistema', alias: ['nombre del proyecto'] },
  { clave: 'bodega', titulo: 'Bodega', obligatoria: true, ayuda: 'Nombre de una bodega ya creada en el sistema', alias: ['bodega de llegada', 'almacen'] },
  { clave: 'proveedor', titulo: 'Proveedor', obligatoria: true, ayuda: 'Razón social del proveedor', alias: ['nombre del proveedor', 'razon social'] },
  { clave: 'nit', titulo: 'NIT', obligatoria: true, ayuda: 'NIT del proveedor con dígito de verificación, por ejemplo 900123456-7', alias: ['nit del proveedor', 'nit proveedor'] },
  { clave: 'factura', titulo: 'Factura', obligatoria: true, ayuda: 'Número de la factura de compra', alias: ['numero de factura', 'no factura', 'n factura', 'factura de compra'] },
  { clave: 'fechaCompra', titulo: 'Fecha de compra', obligatoria: true, ayuda: 'Fecha de la factura, por ejemplo 15/03/2026', alias: ['fecha compra', 'fecha factura', 'fecha'] },
  { clave: 'valorPagado', titulo: 'Valor pagado', obligatoria: true, ayuda: 'Lo que costó esta unidad, en pesos', alias: ['valor', 'precio', 'costo', 'valor unitario', 'precio unitario'] },
];

export const MAXIMO_FILAS = 2000;

const UNIDAD_HABITUAL: Record<TipoEquipo, UnidadCapacidad> = {
  PANEL_SOLAR: 'W',
  BATERIA_GEL: 'Ah',
  BATERIA_LITIO: 'kWh',
  INVERSOR: 'W',
  MEDIDOR: 'A',
  CONTROLADOR: 'A',
};

/** "Batería de Gel " → "bateria de gel": sin tildes, minúsculas, un espacio. */
export const normalizar = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const TIPOS_POR_NOMBRE = new Map<string, TipoEquipo>();
for (const tipo of TIPOS_EQUIPO) {
  TIPOS_POR_NOMBRE.set(normalizar(tipo), tipo);
  TIPOS_POR_NOMBRE.set(normalizar(NOMBRE_TIPO_EQUIPO[tipo]), tipo);
}
for (const [alias, tipo] of [
  ['panel', 'PANEL_SOLAR'],
  ['panel fotovoltaico', 'PANEL_SOLAR'],
  ['modulo solar', 'PANEL_SOLAR'],
  ['bateria gel', 'BATERIA_GEL'],
  ['gel', 'BATERIA_GEL'],
  ['bateria litio', 'BATERIA_LITIO'],
  ['litio', 'BATERIA_LITIO'],
  ['inversor cargador', 'INVERSOR'],
  ['contador', 'MEDIDOR'],
  ['controlador de carga', 'CONTROLADOR'],
  ['regulador', 'CONTROLADOR'],
] as const) {
  TIPOS_POR_NOMBRE.set(alias, tipo);
}

const ALIAS_COLUMNA = new Map<string, ClaveColumna>();
for (const c of COLUMNAS) {
  for (const nombre of [c.titulo, ...c.alias]) ALIAS_COLUMNA.set(normalizar(nombre), c.clave);
}

// ── Conversión de celdas ───────────────────────────────────────────────────

const vacia = (v: Celda) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function texto(v: Celda): string {
  if (vacia(v)) return '';
  if (v instanceof Date) return fecha(v) ?? '';
  // Un NIT o una factura escritos como número llegan como número.
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

/** Números como los escribe la gente: 450 · "1.250.000" · "$ 1.250.000" · "12,5". */
export function numero(v: Celda): number {
  if (typeof v === 'number') return v;
  if (vacia(v) || typeof v === 'boolean' || v instanceof Date) return Number.NaN;
  let s = String(v).replace(/[$\s]/g, '').replace(/cop$/i, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return s === '' ? Number.NaN : Number(s);
}

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** Fecha de Excel (Date o número de serie) o texto dd/mm/aaaa, aaaa-mm-dd → AAAA-MM-DD. */
export function fecha(v: Celda): string | null {
  if (vacia(v)) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getUTCFullYear()}-${dosCifras(v.getUTCMonth() + 1)}-${dosCifras(v.getUTCDate())}`;
  }
  if (typeof v === 'number') {
    // Número de serie de Excel (días desde el 30/12/1899).
    if (v < 1 || v > 100_000) return null;
    return fecha(new Date(Math.round((v - 25569) * 86_400_000)));
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${dosCifras(Number(m[2]))}-${dosCifras(Number(m[3]))}`;
  // En Colombia la fecha va día/mes/año.
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const anio = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${anio}-${dosCifras(Number(m[2]))}-${dosCifras(Number(m[1]))}`;
  }
  return s; // Lo deja tal cual para que la validación diga qué está mal.
}

// ── CSV ────────────────────────────────────────────────────────────────────

/** Lee un CSV (separado por ; o por ,) respetando las comillas. */
export function leerCsv(contenido: string): string[][] {
  const limpio = contenido.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const separador = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!;
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

// ── Lectura de la hoja ─────────────────────────────────────────────────────

export interface Lugar {
  id: string;
  nombre: string;
}

export interface FilaImportacion {
  /** Número de fila en el archivo (como lo ve la persona en Excel). */
  fila: number;
  /** Lo que se muestra en la vista previa. */
  vista: { serial: string; tipo: string; marcaModelo: string; proyecto: string; bodega: string };
  /** Valores originales, para el reporte de errores. */
  originales: Partial<Record<ClaveColumna, string>>;
  /** Ingreso listo para enviar (con id fijo: reenviarlo no lo duplica). */
  comando: { id: string; payload: Record<string, unknown> } | null;
  errores: string[];
}

export interface ResultadoLectura {
  filas: FilaImportacion[];
  /** Columnas reconocidas: clave → título como venía en el archivo. */
  columnas: Partial<Record<ClaveColumna, string>>;
  /** Problemas con el archivo completo (no hay encabezados, faltan columnas…). */
  problemas: string[];
}

const TITULO: Record<string, string> = {
  tipo: 'Tipo',
  marca: 'Marca',
  modelo: 'Modelo',
  origenSerial: 'Serial',
  serial: 'Serial',
  potencia: 'Potencia o capacidad',
  unidad: 'Unidad',
  proyectoId: 'Proyecto',
  bodegaId: 'Bodega',
  'compra.proveedor': 'Proveedor',
  'compra.nit': 'NIT',
  'compra.numeroFactura': 'Factura',
  'compra.fechaCompra': 'Fecha de compra',
  valorPagado: 'Valor pagado',
};

function buscarEncabezados(datos: Celda[][]) {
  // Los encabezados pueden no estar en la fila 1 (títulos, logos…): se busca
  // en las primeras 10 la que tenga más columnas reconocidas.
  let mejor = { indice: -1, columnas: new Map<ClaveColumna, number>(), titulos: {} as Partial<Record<ClaveColumna, string>> };
  for (let i = 0; i < Math.min(10, datos.length); i++) {
    const columnas = new Map<ClaveColumna, number>();
    const titulos: Partial<Record<ClaveColumna, string>> = {};
    (datos[i] ?? []).forEach((celda, j) => {
      const clave = ALIAS_COLUMNA.get(normalizar(texto(celda)));
      if (clave && !columnas.has(clave)) {
        columnas.set(clave, j);
        titulos[clave] = texto(celda);
      }
    });
    if (columnas.size > mejor.columnas.size) mejor = { indice: i, columnas, titulos };
  }
  return mejor;
}

function buscarLugar(nombre: string, lugares: Lugar[], que: 'proyecto' | 'bodega'): { id?: string; error?: string } {
  if (!nombre) return {};
  const n = normalizar(nombre);
  const iguales = lugares.filter((l) => l.id === nombre || normalizar(l.nombre) === n);
  if (iguales.length === 1) return { id: iguales[0]!.id };
  const donde = que === 'proyecto' ? 'Proyectos' : 'Bodegas';
  if (iguales.length > 1) return { error: `Hay varios ${que === 'proyecto' ? 'proyectos' : 'bodegas'} llamados «${nombre}»: cambie el nombre de uno en ${donde}` };
  return { error: `No existe ${que === 'proyecto' ? 'el proyecto' : 'la bodega'} «${nombre}»: créel${que === 'proyecto' ? 'o' : 'a'} primero en ${donde}` };
}

export function leerHoja(
  datos: Celda[][],
  contexto: { proyectos: Lugar[]; bodegas: Lugar[]; nuevoId: () => string },
): ResultadoLectura {
  const { indice, columnas, titulos } = buscarEncabezados(datos);
  if (indice < 0 || columnas.size < 3) {
    return {
      filas: [],
      columnas: {},
      problemas: ['No se encontraron los encabezados. La primera fila debe tener los nombres de las columnas, como en la plantilla (Tipo, Marca, Modelo, Serial…).'],
    };
  }
  const faltan = COLUMNAS.filter((c) => c.obligatoria && !columnas.has(c.clave)).map((c) => c.titulo);
  if (faltan.length > 0) {
    return { filas: [], columnas: titulos, problemas: [`Faltan columnas obligatorias: ${faltan.join(', ')}.`] };
  }

  const filas: FilaImportacion[] = [];
  const problemas: string[] = [];
  const seriales = new Map<string, number>();

  for (let i = indice + 1; i < datos.length; i++) {
    const celdas = datos[i] ?? [];
    const valor = (clave: ClaveColumna): Celda => {
      const j = columnas.get(clave);
      return j === undefined ? null : celdas[j];
    };
    if (COLUMNAS.every((c) => vacia(valor(c.clave)))) continue; // fila vacía
    if (filas.length >= MAXIMO_FILAS) {
      problemas.push(`El archivo tiene más de ${MAXIMO_FILAS} equipos: solo se leyeron los primeros ${MAXIMO_FILAS}. Divida el archivo en partes.`);
      break;
    }

    const numeroFila = i + 1;
    const errores: string[] = [];
    const originales = Object.fromEntries(COLUMNAS.map((c) => [c.clave, texto(valor(c.clave))])) as Record<ClaveColumna, string>;

    const tipoTexto = originales.tipo;
    const tipo = tipoTexto ? TIPOS_POR_NOMBRE.get(normalizar(tipoTexto)) : undefined;
    if (tipoTexto && !tipo) errores.push(`Tipo: «${tipoTexto}» no es un tipo de equipo (use Panel solar, Batería de gel, Batería de litio, Inversor, Medidor o Controlador)`);

    const unidadTexto = originales.unidad;
    const unidad = unidadTexto
      ? UNIDADES_CAPACIDAD.find((u) => u.toLowerCase() === unidadTexto.replace(/\s/g, '').toLowerCase())
      : tipo
        ? UNIDAD_HABITUAL[tipo]
        : undefined;
    if (unidadTexto && !unidad) errores.push(`Unidad: «${unidadTexto}» no es válida (${UNIDADES_CAPACIDAD.join(', ')})`);

    const proyecto = buscarLugar(originales.proyecto, contexto.proyectos, 'proyecto');
    const bodega = buscarLugar(originales.bodega, contexto.bodegas, 'bodega');
    if (proyecto.error) errores.push(`Proyecto: ${proyecto.error}`);
    if (bodega.error) errores.push(`Bodega: ${bodega.error}`);

    const serial = originales.serial;
    if (serial) {
      const llave = normalizarSerial(serial);
      const anterior = seriales.get(llave);
      if (anterior) errores.push(`Serial: repetido, ya está en la fila ${anterior}`);
      else seriales.set(llave, numeroFila);
    }

    const payload: Record<string, unknown> = {
      equipoId: contexto.nuevoId(),
      tipo: tipo ?? tipoTexto,
      marca: originales.marca,
      modelo: originales.modelo,
      origenSerial: serial ? 'PROVEEDOR' : 'EMPRESA',
      ...(serial ? { serial } : {}),
      potencia: numero(valor('potencia')),
      unidad: unidad ?? unidadTexto,
      proyectoId: proyecto.id ?? '',
      bodegaId: bodega.id ?? '',
      compra: {
        proveedor: originales.proveedor,
        nit: originales.nit,
        numeroFactura: originales.factura,
        fechaCompra: fecha(valor('fechaCompra')) ?? '',
      },
      valorPagado: numero(valor('valorPagado')),
    };

    const id = contexto.nuevoId();
    const v = validarComando({ id, tipo: 'REGISTRAR_INGRESO', ocurridoEn: new Date().toISOString(), payload });
    if (!v.valido) {
      for (const d of v.error.detalles) {
        const campo = d.campo.replace(/^payload\./, '');
        // Proyecto/bodega/tipo/unidad ya tienen un mensaje más claro arriba.
        if ((campo === 'proyectoId' && proyecto.error) || (campo === 'bodegaId' && bodega.error)) continue;
        if ((campo === 'tipo' && tipoTexto && !tipo) || (campo === 'unidad' && unidadTexto && !unidad)) continue;
        const mensaje = `${TITULO[campo] ?? campo}: ${d.problema}`;
        if (!errores.includes(mensaje)) errores.push(mensaje);
      }
    }

    filas.push({
      fila: numeroFila,
      vista: {
        serial: serial || 'La asigna el sistema',
        tipo: tipo ? NOMBRE_TIPO_EQUIPO[tipo] : tipoTexto,
        marcaModelo: [originales.marca, originales.modelo].filter(Boolean).join(' '),
        proyecto: originales.proyecto,
        bodega: originales.bodega,
      },
      originales,
      comando: errores.length === 0 && v.valido ? { id, payload: v.comando.payload as Record<string, unknown> } : null,
      errores,
    });
  }

  if (filas.length === 0 && problemas.length === 0) problemas.push('El archivo no tiene equipos debajo de los encabezados.');
  return { filas, columnas: titulos, problemas };
}
