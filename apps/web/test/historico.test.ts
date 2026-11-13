import { describe, expect, it } from 'vitest';
import { cedulaDe, esFormatoHistorico, estadoDe, fechaMesDia, idFijo, leerHistorico, nombrePropio, potenciaDe } from '../src/historico.ts';
import type { Celda } from '../src/importacion.ts';

// Encabezados como vienen en el archivo de la empresa (con el título del NIU sobrescrito por un número).
const ENCABEZADOS: Celda[] = [
  ' CODIGO INTERNO',
  'TIPO DE EQUIPO',
  'MARCA/MODELO',
  'FECHA DE COMPRA(MES,DÍA,AÑO)',
  'ESTADO(REP,PART,DISPONIBLE)',
  'CENTRO DE COSTOS',
  'ID FACTURA',
  'VALOR $',
  'DESCRIPCIÓN DEL EQUIPO',
  'PROVEEDOR',
  'SERIAL',
  'FECHA FIN DE GARANTÍA',
  'DÍAS RESTANTES DE GARANTÍA',
  'ESTADO DE GARANTÍA',
  'OC',
  'USUARIO (Cédula)',
  86320038,
  'NOMBRE',
  'FECHA DE ENTREGA',
  'EQUIPO DEVUELTO',
];

const d = (s: string) => new Date(`${s}T00:00:00Z`);
type Fila = Partial<Record<'codigo' | 'tipo' | 'marca' | 'compra' | 'estado' | 'zona' | 'factura' | 'valor' | 'desc' | 'proveedor' | 'serial' | 'garantia' | 'cedula' | 'niu' | 'nombre' | 'entrega' | 'devuelto', Celda>>;
const fila = (f: Fila): Celda[] => [
  f.codigo ?? null,
  f.tipo ?? null,
  f.marca ?? null,
  f.compra ?? null,
  f.estado ?? null,
  f.zona ?? null,
  f.factura ?? null,
  f.valor ?? null,
  f.desc ?? null,
  f.proveedor ?? null,
  f.serial ?? null,
  f.garantia ?? null,
  null,
  null,
  null,
  f.cedula ?? null,
  f.niu ?? null,
  f.nombre ?? null,
  f.entrega ?? null,
  f.devuelto ?? null,
];

const base: Fila = {
  codigo: 'EG&T-BGEL-0051',
  tipo: 'BATERÍA DE GEL',
  marca: 'PENDIENTE',
  compra: d('2025-05-23'),
  estado: 'REPOSICIÓN',
  zona: 'SAN MIGUEL',
  factura: 'FETB 14094',
  valor: 1303407,
  desc: 'TB12-200',
  proveedor: 'TB PLUS',
  serial: 'EG&T-BGEL-0051',
  garantia: 'En Espera',
  cedula: 12345678,
  niu: 86320513,
  nombre: 'PERSONA DE PRUEBA UNO',
  entrega: d('2025-09-10'),
};

const leer = (filas: Fila[], bodegaId?: string) => leerHistorico([ENCABEZADOS, ...filas.map(fila)], { hoja: 'Histórico', bodegaId });

describe('Archivo de inventario de la empresa', () => {
  it('reconoce el formato por sus encabezados', () => {
    expect(esFormatoHistorico([ENCABEZADOS])).toBe(true);
    expect(esFormatoHistorico([['Tipo', 'Marca', 'Modelo', 'Serial']])).toBe(false);
  });

  it('un equipo entregado queda instalado con su usuario, zona y lo que falta por completar', () => {
    const r = leer([base]);
    const f = r.filas[0]!;
    expect(f.errores).toEqual([]);
    expect(f.comando?.payload).toMatchObject({
      codigoInterno: 'EG&T-BGEL-0051',
      tipo: 'BATERIA_GEL',
      potencia: 200,
      unidad: 'Ah',
      zona: 'San Miguel',
      estado: 'INSTALADO',
      compra: { proveedor: 'TB PLUS', numeroFactura: 'FETB 14094', fechaCompra: '2025-05-23' },
      valorPagado: 1303407,
      usuario: { cedula: '12345678', nombre: 'PERSONA DE PRUEBA UNO', niu: '86320513' },
      fechaEntrega: '2025-09-10',
      // ESTADO = REPOSICIÓN: reemplazó a un equipo con fallas.
      tipoEntrega: 'REPOSICION',
    });
    // El serial igual al código no se repite; "PENDIENTE" y "En Espera" no son datos.
    expect(f.comando?.payload.serialFabricante).toBeUndefined();
    expect(f.comando?.payload.marca).toBeUndefined();
    expect(f.pendientes).toEqual(['Marca', 'Fin de garantía']);
    expect(f.comando?.payload.pendientes).toContain('Proyecto');
    expect(r.resumen.porEstado).toEqual({ INSTALADO: 1 });
    expect(r.resumen.reposiciones).toBe(1);
    // PARTICULAR también se reconoce; sin usuario no hay entrega que marcar.
    const otros = leer([{ ...base, codigo: 'P-1', estado: 'PARTICULAR' }, { ...base, codigo: 'P-2', cedula: null }]);
    expect(otros.filas[0]!.comando?.payload.tipoEntrega).toBe('PARTICULAR');
    expect(otros.filas[1]!.comando?.payload.tipoEntrega).toBeUndefined();
  });

  it('lee el estado de las notas: perdidos, disposición final, garantía y disponibles', () => {
    const r = leer(
      [
        { ...base, codigo: 'A-1', estado: 'PERDIDO', cedula: 'PERDIDOS', entrega: 'PERDIDOS' },
        { ...base, codigo: 'A-2', estado: 'DAÑADO', cedula: 'DISP FINAL' },
        { ...base, codigo: 'A-3', estado: 'GARANTÍA', cedula: 'PRESENTAN FALLAS' },
        { ...base, codigo: 'A-4', estado: 'DISPONIBLE', cedula: null, entrega: null },
        { ...base, codigo: 'A-5', estado: 'NO REPORTADO', cedula: 'NO REPORTADO', entrega: null },
      ],
      '6f1c8a52-3a0b-4c39-8f3e-1d2b3c4d5e6f',
    );
    expect(r.filas.map((f) => f.comando?.payload.estado)).toEqual(['DADO_DE_BAJA', 'DADO_DE_BAJA', 'EN_MANTENIMIENTO', 'EN_STOCK', 'INSTALADO']);
    expect(r.filas[0]!.comando?.payload.usuario).toBeUndefined();
    expect(String(r.filas[0]!.comando?.payload.motivo)).toContain('Perdido');
    expect(r.filas[3]!.comando?.payload.bodegaId).toBe('6f1c8a52-3a0b-4c39-8f3e-1d2b3c4d5e6f');
    expect(r.filas[4]!.pendientes).toContain('Usuario');
  });

  it('los disponibles necesitan una bodega', () => {
    const r = leer([{ ...base, estado: 'DISPONIBLE', cedula: null }]);
    expect(r.filas[0]!.comando).toBeNull();
    expect(r.filas[0]!.errores[0]).toMatch(/bodega/i);
    expect(r.resumen.enStock).toBe(1);
  });

  it('marca los códigos repetidos y las filas sin tipo; una nota en la columna del código no es un código', () => {
    const r = leer([base, { ...base, cedula: 87654321 }, { ...base, codigo: 'C-9', tipo: null }, { ...base, codigo: 'REPOSICIONES NUEVAS ENTREGADAS POR LA GESTORA' }]);
    expect(r.filas[1]!.errores[0]).toMatch(/repetido.*fila 2/);
    expect(r.filas[2]!.errores[0]).toMatch(/Tipo de equipo: está vacío/);
    const nota = r.filas[3]!;
    expect(nota.comando?.payload.codigoInterno).toBeUndefined();
    expect(nota.pendientes).toContain('Código interno');
    expect(String(nota.comando?.payload.motivo)).toContain('REPOSICIONES NUEVAS');
  });

  it('limpia proveedor, factura, marca y fechas escritas a mano', () => {
    const r = leer([
      { ...base, codigo: 'B-1', proveedor: 'TBPLUS', factura: 'PDTE JHON REYES', compra: '6/30/2025', marca: 'MTEK' },
      { ...base, codigo: 'B-2', proveedor: 'MAX.PV INPUT POWER:520W(12V)', marca: '1000W PRO SERIES 24VDC-120VAC', tipo: 'INVERSOR', desc: 'INVERSOR- PURE SINE WAVE' },
      { ...base, codigo: 'B-3', compra: d('2999-01-01'), marca: 'PI1024202108160982' },
      { ...base, codigo: 'B-4' },
    ]);
    const [a, b, c] = r.filas.map((f) => f.comando!.payload);
    // TB PLUS y TBPLUS son el mismo proveedor: se usa la forma más frecuente del archivo.
    expect(a!.compra).toEqual({ proveedor: 'TB PLUS', fechaCompra: '2025-06-30' });
    expect(a!.marca).toBe('MTEK');
    expect(r.filas[0]!.pendientes).toContain('Factura');
    expect(b!.compra).toMatchObject({ numeroFactura: 'FETB 14094' });
    expect((b!.compra as { proveedor?: string }).proveedor).toBeUndefined();
    expect(b!.modelo).toBe('1000W PRO SERIES 24VDC-120VAC');
    expect(b).toMatchObject({ potencia: 1000, unidad: 'W' });
    expect((c!.compra as { fechaCompra?: string }).fechaCompra).toBeUndefined();
    expect(c!.marca).toBeUndefined();
  });

  it('los identificadores salen del contenido: el mismo archivo da los mismos ids', () => {
    const a = leer([base]).filas[0]!.comando!;
    const b = leer([base]).filas[0]!.comando!;
    const otro = leer([{ ...base, cedula: 99999999 }]).filas[0]!.comando!;
    expect(a.id).toBe(b.id);
    expect(a.payload.equipoId).toBe(b.payload.equipoId);
    expect(otro.id).not.toBe(a.id);
    expect(idFijo('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('Limpieza de valores', () => {
  it('potencia según el tipo', () => {
    expect(potenciaDe('BATERIA_GEL', 'Batería de 12 VDC 205 AH GEL')).toEqual({ potencia: 205, unidad: 'Ah' });
    expect(potenciaDe('BATERIA_GEL', 'TB 12-150 GEL')).toEqual({ potencia: 150, unidad: 'Ah' });
    expect(potenciaDe('INVERSOR', 'INVERSOR  1.000W  JDH6020S')).toEqual({ potencia: 1000, unidad: 'W' });
    expect(potenciaDe('INVERSOR', 'INVERSOR_HIBRIDO_8KW_48/5')).toEqual({ potencia: 8, unidad: 'kW' });
    expect(potenciaDe('BATERIA_LITIO', 'BATERIA-LUTHUM BATERRY (3072WH')).toEqual({ potencia: 3072, unidad: 'Wh' });
    expect(potenciaDe('BATERIA_LITIO', 'Litio 5.1Kw/h')).toEqual({ potencia: 5.1, unidad: 'kWh' });
    expect(potenciaDe('CONTROLADOR', 'CONTROLADOR MPPT 40A/100V')).toEqual({ potencia: 40, unidad: 'A' });
    expect(potenciaDe('PANEL_SOLAR', 'PANEL SOLAR 585W')).toEqual({ potencia: 585, unidad: 'W' });
    expect(potenciaDe('MEDIDOR', 'MEDIDOR MONOFASICO')).toBeNull();
  });

  it('cédulas, fechas mes/día y nombres de zona', () => {
    expect(cedulaDe(1061700123)).toBe('1061700123');
    expect(cedulaDe('1.061.700-3')).toBe('1061700');
    expect(cedulaDe('NO REPORTADO')).toBeNull();
    expect(cedulaDe(123)).toBeNull();
    expect(fechaMesDia('6/30/2025')).toBe('2025-06-30');
    expect(fechaMesDia('30/6/2025')).toBeNull();
    expect(nombrePropio('VALLE DEL GUAMUEZ')).toBe('Valle del Guamuez');
    expect(estadoDe(['REPOSICIÓN'], true)).toEqual({ estado: 'INSTALADO', motivo: null });
  });
});
