import { describe, expect, it } from 'vitest';
import { fecha, leerCsv, leerHoja, numero, type Celda } from '../src/importacion.ts';

const PROYECTO = { id: '6f1c1f5e-3b52-4b0e-9a57-2c1e3f6b0a11', nombre: 'Electrificación La Esperanza' };
const BODEGA = { id: '9b2d4a7c-1e3f-4c5d-8a6b-7c8d9e0f1a22', nombre: 'Bodega Popayán' };
let contador = 0;
const contexto = {
  proyectos: [PROYECTO],
  bodegas: [BODEGA],
  nuevoId: () => `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`,
};

const ENCABEZADOS = ['Tipo', 'Marca', 'Modelo', 'Serial', 'Potencia o capacidad', 'Unidad', 'Proyecto', 'Bodega', 'Proveedor', 'NIT', 'Factura', 'Fecha de compra', 'Valor pagado'];
const fila = (cambios: Partial<Record<string, Celda>> = {}): Celda[] => {
  const base: Record<string, Celda> = {
    Tipo: 'Panel solar',
    Marca: 'Jinko',
    Modelo: 'Tiger Neo 450',
    Serial: 'JK-0001',
    'Potencia o capacidad': 450,
    Unidad: 'W',
    Proyecto: 'Electrificación La Esperanza',
    Bodega: 'Bodega Popayán',
    Proveedor: 'Solartex SAS',
    NIT: '800197268-4',
    Factura: 'FE-2001',
    'Fecha de compra': new Date(Date.UTC(2026, 2, 15)),
    'Valor pagado': 520000,
    ...cambios,
  };
  return ENCABEZADOS.map((e) => base[e]);
};

describe('conversión de celdas', () => {
  it('lee números como los escribe la gente', () => {
    expect(numero(450)).toBe(450);
    expect(numero('1.250.000')).toBe(1250000);
    expect(numero('$ 1.250.000')).toBe(1250000);
    expect(numero('12,5')).toBe(12.5);
    expect(numero('1,250,000')).toBe(1250000);
    expect(numero('')).toBeNaN();
  });

  it('lee fechas de Excel y en formato colombiano', () => {
    expect(fecha(new Date(Date.UTC(2026, 2, 15)))).toBe('2026-03-15');
    expect(fecha('15/03/2026')).toBe('2026-03-15');
    expect(fecha('5-3-26')).toBe('2026-03-05');
    expect(fecha('2026-03-15')).toBe('2026-03-15');
    expect(fecha(46096)).toBe('2026-03-15'); // número de serie de Excel
    expect(fecha('')).toBeNull();
  });

  it('lee CSV con punto y coma, comillas y tildes', () => {
    const csv = '﻿Tipo;Marca;Modelo\r\n"Batería de gel";"Ritar; Power";"DG ""12V"""\r\nInversor;Victron;MultiPlus\n';
    expect(leerCsv(csv)).toEqual([
      ['Tipo', 'Marca', 'Modelo'],
      ['Batería de gel', 'Ritar; Power', 'DG "12V"'],
      ['Inversor', 'Victron', 'MultiPlus'],
    ]);
    expect(leerCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('lectura de la hoja', () => {
  it('convierte cada fila en un ingreso válido', () => {
    const r = leerHoja([ENCABEZADOS, fila(), fila({ Serial: '', Tipo: 'bateria de gel', Unidad: '', 'Potencia o capacidad': '150' })], contexto);
    expect(r.problemas).toEqual([]);
    expect(r.filas).toHaveLength(2);
    const [a, b] = r.filas;
    expect(a!.errores).toEqual([]);
    expect(a!.fila).toBe(2);
    expect(a!.comando!.payload).toMatchObject({
      tipo: 'PANEL_SOLAR',
      origenSerial: 'PROVEEDOR',
      serial: 'JK-0001',
      potencia: 450,
      unidad: 'W',
      proyectoId: PROYECTO.id,
      bodegaId: BODEGA.id,
      compra: { proveedor: 'Solartex SAS', numeroFactura: 'FE-2001', fechaCompra: '2026-03-15' },
      valorPagado: 520000,
    });
    // Sin serial: lo asigna la empresa; sin unidad: la habitual del tipo.
    expect(b!.errores).toEqual([]);
    expect(b!.comando!.payload).toMatchObject({ tipo: 'BATERIA_GEL', origenSerial: 'EMPRESA', unidad: 'Ah', potencia: 150 });
    expect(b!.comando!.payload.serial).toBeUndefined();
    expect(b!.vista.serial).toBe('La asigna el sistema');
  });

  it('encuentra los encabezados aunque haya títulos arriba y nombres distintos', () => {
    const otros = ['Tipo de equipo', 'Fabricante', 'Referencia', 'Número de serie', 'Capacidad', 'Unidad', 'proyecto', 'BODEGA', 'Proveedor', 'NIT del proveedor', 'No. factura', 'Fecha', 'Precio'];
    const r = leerHoja([['Inventario de compras 2026'], [], otros, fila()], contexto);
    expect(r.problemas).toEqual([]);
    expect(r.filas[0]!.fila).toBe(4);
    expect(r.filas[0]!.errores).toEqual([]);
  });

  it('salta filas vacías y avisa si faltan columnas', () => {
    expect(leerHoja([ENCABEZADOS, [], fila(), [null, '', null]], contexto).filas).toHaveLength(1);
    const sinNit = leerHoja([ENCABEZADOS.filter((e) => e !== 'NIT'), fila().filter((_, i) => i !== 9)], contexto);
    expect(sinNit.problemas[0]).toBe('Faltan columnas obligatorias: NIT.');
    expect(leerHoja([['hola', 'mundo']], contexto).problemas[0]).toMatch(/No se encontraron los encabezados/);
  });

  it('explica cada error de la fila con el nombre de la columna', () => {
    const r = leerHoja(
      [
        ENCABEZADOS,
        fila({ Serial: 'OTRO-1', Tipo: 'Nevera', Proyecto: 'Otro proyecto', NIT: '800197268-9', 'Valor pagado': '', Unidad: 'litros' }),
        fila({ Serial: 'jk-0001 ' }),
        fila({ Serial: 'JK-0001' }),
      ],
      contexto,
    );
    const [mala, primera, repetida] = r.filas;
    expect(mala!.comando).toBeNull();
    expect(mala!.errores).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Tipo: «Nevera» no es un tipo de equipo/),
        expect.stringMatching(/^Unidad: «litros» no es válida/),
        'Proyecto: No existe el proyecto «Otro proyecto»: créelo primero en Proyectos',
        expect.stringMatching(/^NIT: /),
        expect.stringMatching(/^Valor pagado: /),
      ]),
    );
    expect(primera!.errores).toEqual([]);
    expect(repetida!.errores).toEqual(['Serial: repetido, ya está en la fila 3']);
  });

  it('acepta los nombres de proyecto y bodega sin importar tildes ni mayúsculas', () => {
    const r = leerHoja([ENCABEZADOS, fila({ Proyecto: 'electrificacion la esperanza', Bodega: 'BODEGA POPAYAN' })], contexto);
    expect(r.filas[0]!.errores).toEqual([]);
  });
});
