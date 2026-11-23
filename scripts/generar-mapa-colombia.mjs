/**
 * Genera apps/web/src/mapa/colombia.json: el contorno de los departamentos de
 * Colombia (ya proyectado como trazos SVG) y la ubicación de cada municipio,
 * para dibujar el mapa de usuarios sin depender de internet.
 *
 * Fuente: Marco Geoestadístico Nacional 2018 del DANE, en el paquete npm
 * @john-guerra/geo-colombia (licencia MIT), archivo data/colombia.topo.json.
 *
 * Solo hace falta para regenerar el mapa (no se usa al compilar):
 *   npm i d3-geo@3 topojson-client@3 topojson-simplify@3 @john-guerra/geo-colombia
 *   node scripts/generar-mapa-colombia.mjs node_modules/@john-guerra/geo-colombia/data/colombia.topo.json apps/web/src/mapa/colombia.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node generar-mapa-colombia.mjs <colombia.topo.json> <salida.json>');
  process.exit(1);
}

const ANCHO = 600;
const ALTO = 720;
// San Andrés y Providencia queda muy lejos del continente: se deja fuera del dibujo.
const SAN_ANDRES = '88';

const topo = JSON.parse(readFileSync(entrada, 'utf8'));
const simple = simplify(presimplify(topo), quantile(presimplify(topo), 0.12));
const deptos = feature(simple, simple.objects.MGN_ANM_DPTOS);
const continente = { type: 'FeatureCollection', features: deptos.features.filter((f) => f.properties.DPTO_CCDGO !== SAN_ANDRES) };

const proyeccion = geoMercator().fitExtent([[8, 8], [ANCHO - 8, ALTO - 8]], continente);
const trazo = geoPath(proyeccion);
// Una cifra decimal basta a este tamaño y deja el archivo liviano.
const redondear = (d) => d.replace(/(\d+\.\d)\d+/g, '$1');

const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);
/** "VALLE DEL GUAMUEZ" → "Valle del Guamuez". */
const nombre = (t) =>
  t
    .toLowerCase()
    .split(/(\s+|-|\(|\.)/)
    .map((p, i) => (i > 0 && MENORES.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');

const departamentos = continente.features
  .map((f) => ({ codigo: f.properties.DPTO_CCDGO, nombre: nombre(f.properties.DPTO_CNMBR), d: redondear(trazo(f) ?? '') }))
  .sort((a, b) => a.codigo.localeCompare(b.codigo));
const nombreDepto = Object.fromEntries(deptos.features.map((f) => [f.properties.DPTO_CCDGO, nombre(f.properties.DPTO_CNMBR)]));

const municipios = topo.objects.MGN_ANM_MPIOS.geometries
  .map((g) => g.properties)
  .filter((p) => p.DPTO_CCDGO !== SAN_ANDRES)
  .map((p) => {
    const [x, y] = proyeccion([p.LONGITUD, p.LATITUD]);
    return { c: p.MPIO_CDPMP, n: nombre(p.MPIO_CNMBR), dc: p.DPTO_CCDGO, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  })
  .sort((a, b) => a.c.localeCompare(b.c));

writeFileSync(
  salida,
  JSON.stringify({ fuente: 'DANE, Marco Geoestadístico Nacional 2018 (vía @john-guerra/geo-colombia, MIT)', ancho: ANCHO, alto: ALTO, departamentos, nombreDepto, municipios }),
);
console.log(`${departamentos.length} departamentos, ${municipios.length} municipios → ${salida}`);
