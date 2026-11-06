import { describe, expect, it } from 'vitest';
import {
  accionesPermitidas,
  cambioUsuario,
  puedeEjecutar,
  registro,
  crearArticulo,
  crearBodega,
  crearProyecto,
  ingresarArticulos,
  instalarEquipo,
  registrarDespacho,
  registrarDevolucion,
  registrarIngreso,
  registrarTraslado,
  retirarEquipo,
  evaluarMovimientoEquipo,
  digitoVerificacionNit,
  esFechaFutura,
  esFechaValida,
  evaluarTransicion,
  fechaColombia,
  normalizarBusqueda,
  normalizarNit,
  normalizarSerial,
  parsearComando,
  transicion,
  validarComando,
} from '../src/index.ts';

describe('máquina de estados', () => {
  it('solo instala desde En stock', () => {
    expect(evaluarTransicion('EN_STOCK', 'INSTALAR')).toEqual({ ok: true, estado: 'INSTALADO' });

    const r = evaluarTransicion('EN_MANTENIMIENTO', 'INSTALAR');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('RF-11');
  });

  it('retirar solo desde Instalado', () => {
    expect(evaluarTransicion('INSTALADO', 'RETIRAR')).toEqual({ ok: true, estado: 'EN_STOCK' });
    expect(evaluarTransicion('EN_STOCK', 'RETIRAR').ok).toBe(false);
  });

  it('no envía a mantenimiento dos veces', () => {
    const r = evaluarTransicion('EN_MANTENIMIENTO', 'ENVIAR_A_MANTENIMIENTO');
    if (!r.ok) expect(r.error.codigo).toBe('MANT-YA');
    else throw new Error('debía fallar');
  });

  it('un equipo dado de baja no admite ninguna acción', () => {
    expect(accionesPermitidas('DADO_DE_BAJA')).toEqual([]);

    const retiro = evaluarTransicion('DADO_DE_BAJA', 'RETIRAR');
    if (!retiro.ok) expect(retiro.error.codigo).toBe('RF-15');

    const mantenimiento = evaluarTransicion('DADO_DE_BAJA', 'ENVIAR_A_MANTENIMIENTO');
    if (!mantenimiento.ok) expect(mantenimiento.error.codigo).toBe('RF-14');
  });

  it('transicion() lanza el error en lugar de devolverlo', () => {
    expect(() => transicion('DADO_DE_BAJA', 'INSTALAR')).toThrow('Un equipo dado de baja no puede modificarse');
  });

  it('muestra solo los botones válidos', () => {
    expect(accionesPermitidas('EN_STOCK')).toEqual(['INSTALAR', 'ENVIAR_A_MANTENIMIENTO', 'DAR_DE_BAJA', 'CAMBIAR_PROYECTO']);
    expect(accionesPermitidas('INSTALADO')).toEqual(['RETIRAR', 'ENVIAR_A_MANTENIMIENTO', 'DAR_DE_BAJA']);
  });
});

describe('utilidades', () => {
  it('calcula el dígito de verificación del NIT (DIAN 800197268-4)', () => {
    expect(digitoVerificacionNit('800197268')).toBe(4);
    expect(normalizarNit('800.197.268-4')).toEqual({ numero: '800197268', dv: 4 });
    expect(normalizarNit('800197268-5')).toBeNull();
    expect(normalizarNit('80019726A')).toBeNull();
  });

  it('usa la fecha de Colombia, no la UTC', () => {
    // 2026-03-01 02:00 UTC = 2026-02-28 9:00 p. m. en Bogotá
    expect(fechaColombia(new Date('2026-03-01T02:00:00Z'))).toBe('2026-02-28');
    expect(esFechaFutura('2026-03-01', new Date('2026-03-01T02:00:00Z'))).toBe(true);
  });

  it('rechaza fechas que no existen', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('28/02/2026')).toBe(false);
  });

  it('normaliza seriales y búsquedas', () => {
    expect(normalizarSerial(' jk 2024 001 ')).toBe('JK2024001');
    expect(normalizarBusqueda('  María LÓPEZ ')).toBe('maria lopez');
  });
});

describe('ubicaciones (RL-02)', () => {
  const bodegaA = crypto.randomUUID();
  const bodegaB = crypto.randomUUID();
  const proyecto = crypto.randomUUID();
  const enBodegaA = { estado: 'EN_STOCK' as const, ubicacion: 'BODEGA' as const, bodegaId: bodegaA, proyectoId: proyecto };

  it('despacha solo desde la bodega donde está el equipo', () => {
    expect(evaluarMovimientoEquipo(enBodegaA, { tipo: 'DESPACHO', bodegaOrigenId: bodegaA })).toEqual({ ok: true, ubicacion: 'CAMPO', bodegaId: null });

    const r = evaluarMovimientoEquipo(enBodegaA, { tipo: 'DESPACHO', bodegaOrigenId: bodegaB });
    if (!r.ok) expect(r.error.codigo).toBe('RL-02');
    else throw new Error('debía fallar');
  });

  it('no despacha equipos en mantenimiento', () => {
    const enMantenimiento = { ...enBodegaA, estado: 'EN_MANTENIMIENTO' as const };
    expect(evaluarMovimientoEquipo(enMantenimiento, { tipo: 'DESPACHO', bodegaOrigenId: bodegaA }).ok).toBe(false);
  });

  it('traslada equipos en mantenimiento, pero no instalados', () => {
    const enMantenimiento = { ...enBodegaA, estado: 'EN_MANTENIMIENTO' as const };
    expect(evaluarMovimientoEquipo(enMantenimiento, { tipo: 'TRASLADO', bodegaOrigenId: bodegaA, bodegaDestinoId: bodegaB }))
      .toEqual({ ok: true, ubicacion: 'BODEGA', bodegaId: bodegaB });

    const instalado = { ...enBodegaA, estado: 'INSTALADO' as const, ubicacion: 'CAMPO' as const, bodegaId: null };
    expect(evaluarMovimientoEquipo(instalado, { tipo: 'TRASLADO', bodegaOrigenId: bodegaA, bodegaDestinoId: bodegaB }).ok).toBe(false);
  });

  it('devuelve desde campo solo si no está instalado y es del proyecto', () => {
    const enCampo = { ...enBodegaA, ubicacion: 'CAMPO' as const, bodegaId: null };
    expect(evaluarMovimientoEquipo(enCampo, { tipo: 'DEVOLUCION', proyectoId: proyecto, bodegaDestinoId: bodegaB }))
      .toEqual({ ok: true, ubicacion: 'BODEGA', bodegaId: bodegaB });

    const otroProyecto = crypto.randomUUID();
    expect(evaluarMovimientoEquipo(enCampo, { tipo: 'DEVOLUCION', proyectoId: otroProyecto, bodegaDestinoId: bodegaB }).ok).toBe(false);

    const instalado = { ...enCampo, estado: 'INSTALADO' as const };
    expect(evaluarMovimientoEquipo(instalado, { tipo: 'DEVOLUCION', proyectoId: proyecto, bodegaDestinoId: bodegaB }).ok).toBe(false);
  });

  it('un equipo dado de baja no se mueve', () => {
    const r = evaluarMovimientoEquipo({ ...enBodegaA, estado: 'DADO_DE_BAJA' }, { tipo: 'TRASLADO', bodegaOrigenId: bodegaA, bodegaDestinoId: bodegaB });
    if (!r.ok) expect(r.error.codigo).toBe('RF-15');
    else throw new Error('debía fallar');
  });
});

// ── Formularios (comandos.ts, parte 1) ──────────────────────────────────────

const ingresoValido = () => ({
  equipoId: crypto.randomUUID(),
  tipo: 'PANEL_SOLAR',
  marca: 'Jinko',
  modelo: 'Tiger Neo 450',
  origenSerial: 'PROVEEDOR',
  serial: 'JK2024001234',
  potencia: 450,
  unidad: 'W',
  proyectoId: crypto.randomUUID(),
  bodegaId: crypto.randomUUID(),
  compra: { proveedor: 'Solartex SAS', nit: '800197268-4', numeroFactura: 'FE-1001', fechaCompra: '2026-01-10' },
  valorPagado: 520000,
});

/** Devuelve los campos con error (lista vacía si el formulario es válido). */
const camposConError = (resultado: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  resultado.success ? [] : resultado.error!.issues.map((i) => i.path.join('.'));

describe('formularios: proyectos e ingreso', () => {
  it('acepta un proyecto válido y rechaza fecha futura (RF-01)', () => {
    const proyecto = {
      proyectoId: crypto.randomUUID(),
      nombre: 'Electrificación La Esperanza',
      vereda: 'La Esperanza',
      municipio: 'Buenos Aires',
      departamento: 'Cauca',
      fechaInicio: '2026-02-01',
    };
    expect(crearProyecto.safeParse(proyecto).success).toBe(true);
    expect(camposConError(crearProyecto.safeParse({ ...proyecto, fechaInicio: '2999-01-01' }))).toEqual(['fechaInicio']);
    expect(camposConError(crearProyecto.safeParse({ ...proyecto, vereda: '   ' }))).toEqual(['vereda']);
  });

  it('acepta un ingreso válido (RF-06)', () => {
    expect(registrarIngreso.safeParse(ingresoValido()).success).toBe(true);
  });

  it('rechaza potencia cero y NIT con dígito de verificación incorrecto', () => {
    expect(camposConError(registrarIngreso.safeParse({ ...ingresoValido(), potencia: 0 }))).toEqual(['potencia']);

    const compraMala = { ...ingresoValido().compra, nit: '800197268-9' };
    expect(camposConError(registrarIngreso.safeParse({ ...ingresoValido(), compra: compraMala }))).toEqual(['compra.nit']);
  });

  it('exige serial si viene del proveedor y lo prohíbe si lo asigna la empresa', () => {
    const { serial: _sinSerial, ...sinSerial } = ingresoValido();
    expect(camposConError(registrarIngreso.safeParse(sinSerial))).toEqual(['serial']);

    expect(camposConError(registrarIngreso.safeParse({ ...ingresoValido(), origenSerial: 'EMPRESA' }))).toEqual(['serial']);
    expect(registrarIngreso.safeParse({ ...sinSerial, origenSerial: 'EMPRESA' }).success).toBe(true);
  });

  it('reserva el prefijo EGT- para la empresa', () => {
    expect(camposConError(registrarIngreso.safeParse({ ...ingresoValido(), serial: 'egt-pan-000001' }))).toEqual(['serial']);
  });
});

describe('formularios: instalación y retiro', () => {
  const instalacion = () => ({
    equipoId: crypto.randomUUID(),
    instalacionId: crypto.randomUUID(),
    usuario: { nombre: 'María López', cedula: 1234567890, telefono: '310 555 1234' },
    ubicacion: { vereda: 'La Esperanza', municipio: 'Buenos Aires', departamento: 'Cauca' },
    fechaInstalacion: '2026-01-15',
    tecnico: 'Carlos Pérez',
  });

  it('acepta cédula y teléfono como número o texto, y los limpia (RF-11)', () => {
    const r = instalarEquipo.safeParse(instalacion());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.usuario.cedula).toBe('1234567890');
      expect(r.data.usuario.telefono).toBe('3105551234');
    }
  });

  it('rechaza un teléfono incompleto', () => {
    const datos = instalacion();
    datos.usuario.telefono = '310555';
    expect(camposConError(instalarEquipo.safeParse(datos))).toEqual(['usuario.telefono']);
  });

  it('exige motivo de al menos 10 caracteres al retirar (RF-13)', () => {
    expect(camposConError(retirarEquipo.safeParse({ equipoId: crypto.randomUUID(), motivo: 'corto' }))).toEqual(['motivo']);
    expect(retirarEquipo.safeParse({ equipoId: crypto.randomUUID(), motivo: 'El usuario se mudó de vereda' }).success).toBe(true);
  });
});

// ── Formularios de logística (comandos.ts, parte 2) ─────────────────────────

describe('formularios: bodegas y artículos', () => {
  it('acepta una bodega válida y exige su nombre (RL-01)', () => {
    const bodega = { bodegaId: crypto.randomUUID(), nombre: 'Bodega Cali', municipio: 'Cali', departamento: 'Valle del Cauca' };
    expect(crearBodega.safeParse(bodega).success).toBe(true);
    expect(camposConError(crearBodega.safeParse({ ...bodega, nombre: '' }))).toEqual(['nombre']);
  });

  it('guarda el código del artículo en mayúsculas y rechaza unidades fuera del catálogo (RL-03)', () => {
    const articulo = { articuloId: crypto.randomUUID(), codigo: 'cab-6mm', nombre: 'Cable solar 6 mm²', unidad: 'M' };
    const r = crearArticulo.safeParse(articulo);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.codigo).toBe('CAB-6MM');

    expect(camposConError(crearArticulo.safeParse({ ...articulo, unidad: 'GALON' }))).toEqual(['unidad']);
    expect(camposConError(crearArticulo.safeParse({ ...articulo, codigo: 'CABLE 6MM' }))).toEqual(['codigo']);
  });

  it('un ingreso de artículos necesita al menos un ítem y no repite artículos (RL-04)', () => {
    const compra = { proveedor: 'Ferretería El Sol', nit: '900123456', numeroFactura: 'FE-77', fechaCompra: '2026-01-05' };
    const articulo = crypto.randomUUID();

    expect(camposConError(ingresarArticulos.safeParse({ bodegaId: crypto.randomUUID(), compra, items: [] }))).toEqual(['items']);

    const repetido = { articuloId: articulo, cantidad: 10, valorUnitario: 5000 };
    expect(camposConError(ingresarArticulos.safeParse({ bodegaId: crypto.randomUUID(), compra, items: [repetido, repetido] })))
      .toEqual(['items.1.articuloId']);

    expect(ingresarArticulos.safeParse({ bodegaId: crypto.randomUUID(), compra, items: [repetido] }).success).toBe(true);
  });
});

describe('formularios: despacho, traslado y devolución', () => {
  it('un despacho necesita al menos un equipo o artículo (RL-05)', () => {
    const base = { bodegaOrigenId: crypto.randomUUID(), proyectoId: crypto.randomUUID(), responsable: 'Luis Gómez' };
    expect(camposConError(registrarDespacho.safeParse(base))).toEqual(['equipos']);
    expect(registrarDespacho.safeParse({ ...base, equipos: [crypto.randomUUID()] }).success).toBe(true);
    expect(registrarDespacho.safeParse({ ...base, articulos: [{ articuloId: crypto.randomUUID(), cantidad: 25.5 }] }).success).toBe(true);
  });

  it('no repite el mismo equipo en un movimiento', () => {
    const equipo = crypto.randomUUID();
    const despacho = { bodegaOrigenId: crypto.randomUUID(), proyectoId: crypto.randomUUID(), responsable: 'Luis Gómez', equipos: [equipo, equipo] };
    expect(camposConError(registrarDespacho.safeParse(despacho))).toEqual(['equipos.1']);
  });

  it('un traslado exige bodegas distintas (RL-06)', () => {
    const bodega = crypto.randomUUID();
    const traslado = { bodegaOrigenId: bodega, bodegaDestinoId: bodega, responsable: 'Ana Ruiz', equipos: [crypto.randomUUID()] };
    expect(camposConError(registrarTraslado.safeParse(traslado))).toEqual(['bodegaDestinoId']);
  });

  it('una devolución exige responsable (RL-07)', () => {
    const devolucion = { proyectoId: crypto.randomUUID(), bodegaDestinoId: crypto.randomUUID(), responsable: '', equipos: [crypto.randomUUID()] };
    expect(camposConError(registrarDevolucion.safeParse(devolucion))).toEqual(['responsable']);
  });
});

// ── Validación completa de comandos (comandos.ts, parte 3, RF-23) ───────────

/** Envuelve un formulario en el "sobre" de un comando, como lo enviaría el celular. */
const sobre = (tipo: string, payload: unknown) => ({
  id: crypto.randomUUID(),
  tipo,
  ocurridoEn: '2026-03-01T10:30:00-05:00',
  dispositivoId: 'celular-prueba',
  autor: 'Prueba',
  payload,
});

describe('validarComando (RF-23)', () => {
  it('acepta un comando completo y devuelve valido: true', () => {
    const r = validarComando(sobre('REGISTRAR_INGRESO', ingresoValido()));
    expect(r.valido).toBe(true);
  });

  it('usa el código del requerimiento y señala el campo exacto', () => {
    const r = validarComando(sobre('REGISTRAR_INGRESO', { ...ingresoValido(), potencia: 0 }));
    if (r.valido) throw new Error('debía fallar');
    expect(r.error.codigo).toBe('RF-06');
    expect(r.error.message).toContain('potencia sea mayor a cero');
    expect(r.error.detalles).toContainEqual({ campo: 'payload.potencia', problema: 'Debe ser mayor a cero' });
  });

  it('si solo fallan los datos de compra, responde con RF-08', () => {
    const r = validarComando(sobre('REGISTRAR_INGRESO', { ...ingresoValido(), valorPagado: -1 }));
    if (r.valido) throw new Error('debía fallar');
    expect(r.error.codigo).toBe('RF-08');
  });

  it('cada comando responde con su propio código', () => {
    const proyecto = validarComando(sobre('CREAR_PROYECTO', { proyectoId: crypto.randomUUID(), nombre: 'X', vereda: 'X', municipio: 'Y', departamento: 'Z', fechaInicio: '2999-01-01' }));
    const retiro = validarComando(sobre('RETIRAR_EQUIPO', { equipoId: crypto.randomUUID(), motivo: 'corto' }));
    const despacho = validarComando(sobre('REGISTRAR_DESPACHO', { bodegaOrigenId: crypto.randomUUID(), proyectoId: crypto.randomUUID(), responsable: 'Luis' }));
    expect([proyecto, retiro, despacho].map((r) => (r.valido ? 'ok' : r.error.codigo))).toEqual(['RF-01', 'RF-13', 'RL-05']);
  });

  it('un sobre mal armado responde RF-23 con todos los campos que faltan', () => {
    const r = validarComando({ tipo: 'NO_EXISTE' });
    if (r.valido) throw new Error('debía fallar');
    expect(r.error.codigo).toBe('RF-23');
    expect(r.error.detalles.map((d) => d.campo)).toEqual(['id', 'tipo', 'ocurridoEn', 'payload']);
  });

  it('entrega los datos ya limpios', () => {
    const r = validarComando(sobre('CREAR_ARTICULO', { articuloId: crypto.randomUUID(), codigo: 'cab-6mm', nombre: 'Cable solar', unidad: 'M' }));
    if (!r.valido) throw new Error('debía pasar');
    if (r.comando.tipo === 'CREAR_ARTICULO') expect(r.comando.payload.codigo).toBe('CAB-6MM');
  });

  it('parsearComando lanza el error en lugar de devolverlo', () => {
    expect(() => parsearComando(sobre('DAR_DE_BAJA', { equipoId: crypto.randomUUID() }))).toThrow('motivo obligatorio');
  });
});

describe('mensajes de identificadores', () => {
  it('un selector sin elegir dice "Es obligatorio"; un id mal formado, que no es válido', () => {
    const r = crearBodega.safeParse({ bodegaId: '', nombre: 'B', municipio: 'M', departamento: 'D' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Es obligatorio');
    const mal = crearBodega.safeParse({ bodegaId: 'abc', nombre: 'B', municipio: 'M', departamento: 'D' });
    if (!mal.success) expect(mal.error.issues[0]?.message).toBe('Debe ser un identificador UUID válido');
  });
});

describe('Cuentas de usuario', () => {
  it('normaliza el correo y exige contraseña con letras y números', () => {
    const r = registro.safeParse({ nombre: ' Ana Gómez ', correo: ' ANA@Egt.CO ', contrasena: 'solar2026' });
    expect(r.success && r.data).toEqual({ nombre: 'Ana Gómez', correo: 'ana@egt.co', contrasena: 'solar2026' });
    expect(registro.safeParse({ nombre: 'Ana Gómez', correo: 'ana@egt.co', contrasena: '12345678' }).success).toBe(false);
    expect(registro.safeParse({ nombre: 'Ana Gómez', correo: 'ana', contrasena: 'solar2026' }).success).toBe(false);
  });

  it('solo el administrador da de baja equipos', () => {
    expect(puedeEjecutar('USUARIO', 'DAR_DE_BAJA')).toBe(false);
    expect(puedeEjecutar('USUARIO', 'REGISTRAR_DESPACHO')).toBe(true);
    expect(puedeEjecutar('ADMIN', 'DAR_DE_BAJA')).toBe(true);
  });

  it('un cambio de cuenta debe decir qué cambia', () => {
    expect(cambioUsuario.safeParse({}).success).toBe(false);
    expect(cambioUsuario.safeParse({ activo: false }).success).toBe(true);
    expect(cambioUsuario.safeParse({ rol: 'JEFE' }).success).toBe(false);
  });
});
