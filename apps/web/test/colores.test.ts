import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { leerColores, nombreColor } from '../src/colores.ts';
import { TITULOS_HISTORICO, verificarPorColor } from '../src/historico.ts';

/** Un .xlsx mínimo: estilo 1 = amarillo, 2 = casi blanco (formato de la hoja), 3 = rojo de tema. */
function libro() {
  const estilos = `<?xml version="1.0"?><styleSheet>
    <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FFEBFFFB"/></patternFill></fill>
      <fill><patternFill patternType="solid"><fgColor theme="5" tint="-0.25"/></patternFill></fill></fills>
    <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" applyFill="1"/>
      <xf numFmtId="0" fontId="0" fillId="3" borderId="0"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0"><alignment wrapText="1"/></xf></cellXfs></styleSheet>`;
  const hoja = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c></row>
    <row r="2"><c r="A2" s="1" t="s"><v>1</v></c><c r="B2" s="2"><v>5</v></c><c r="C2" s="3"/></row></sheetData></worksheet>`;
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Hist&amp;órico" sheetId="7" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/styles.xml': strToU8(estilos),
    'xl/worksheets/sheet2.xml': strToU8(hoja),
  });
}

describe('Colores de las celdas', () => {
  it('lee el relleno de cada celda e ignora el blanco y los tintes casi blancos', () => {
    const colores = leerColores(libro());
    const fila = colores.get('Hist&órico')?.get(2);
    expect(fila?.get(0)).toBe('amarillo');
    expect(fila?.has(1)).toBe(false);
    expect(fila?.get(2)).toBe('naranja');
    expect(colores.get('Hist&órico')?.has(1)).toBe(false);
  });

  it('un archivo que no es xlsx no rompe la importación', () => {
    expect(leerColores(new Uint8Array([1, 2, 3])).size).toBe(0);
  });

  it('nombres de colores', () => {
    expect(nombreColor('FFFF0000')).toBe('rojo');
    expect(nombreColor('FF89F589')).toBe('verde');
    expect(nombreColor('FFFF9900')).toBe('naranja');
    expect(nombreColor('FFFFFFFF')).toBeNull();
  });

  it('una celda pintada marca ese dato; muchas, la fila; fuera de la tabla no cuenta', () => {
    const columnas = new Map([
      ['codigo', 0],
      ['nombre', 3],
    ] as const);
    expect(verificarPorColor(new Map([[3, 'amarillo']]), new Map(columnas))).toEqual([`Verificar (amarillo): ${TITULOS_HISTORICO.nombre}`]);
    const fila = new Map([0, 1, 2, 3, 4, 5, 6].map((j) => [j, 'rojo'] as [number, string]));
    expect(verificarPorColor(fila, new Map(columnas))).toEqual(['Verificar (rojo): toda la fila']);
    const afuera = new Map([30, 31, 32, 33, 34, 35].map((j) => [j, 'amarillo'] as [number, string]));
    expect(verificarPorColor(afuera, new Map(columnas), 20)).toEqual([]);
  });
});
