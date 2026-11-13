import type {
  Accion,
  EstadoEquipo,
  MovimientoEquipo,
  OrigenSerial,
  TipoEquipo,
  TipoMovimiento,
  Ubicacion,
  UnidadCapacidad,
  UnidadMedida,
} from '@egt/domain';

/** Formas de las respuestas de la API que usa la app. */

export interface Aviso {
  codigo: string;
  mensaje: string;
}

export interface Paginacion {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
}

export interface ResumenInventario {
  total: number;
  enStock: number;
  instalados: number;
  enMantenimiento: number;
  dadosDeBaja: number;
  enBodega: number;
  enCampo: number;
}

export interface StockPorTipo {
  datos: {
    tipo: TipoEquipo;
    tipoNombre: string;
    /** En stock (disponibles en bodega o en campo para instalar). */
    cantidad: number;
    instalados: number;
    enMantenimiento: number;
    dadosDeBaja: number;
    total: number;
    aviso?: Aviso;
  }[];
}

export type EstadoGarantia = 'VIGENTE' | 'POR_VENCER' | 'VENCIDA' | 'SIN_DATO';

export interface EquipoEnLista {
  id: string;
  tipo: TipoEquipo;
  tipoNombre: string;
  marca: string | null;
  modelo: string | null;
  serial: string;
  serialFabricante: string | null;
  descripcion: string | null;
  zona: string | null;
  garantiaHasta: string | null;
  garantia: EstadoGarantia;
  pendientes: string[];
  estado: EstadoEquipo;
  estadoNombre: string;
  ubicacion: Ubicacion;
  bodega: { id: string; nombre: string } | null;
  /** null en equipos del histórico que todavía no tienen proyecto. */
  proyecto: { id: string; nombre: string } | null;
  usuarioFinal: { id: string; nombre: string; cedula: string } | null;
}

export interface ListaEquipos {
  datos: EquipoEnLista[];
  paginacion: Paginacion;
  aviso?: Aviso;
}

export interface Instalacion {
  id: string;
  usuarioFinal: { id: string; nombre: string; cedula: string; telefono: string | null; niu: string | null };
  ubicacion: { vereda: string | null; municipio: string | null; departamento: string | null };
  fechaInstalacion: string;
  tecnico: string | null;
  vigente: boolean;
  finalizadaEn: string | null;
  motivoFin: string | null;
}

export interface HojaDeVida {
  equipo: {
    id: string;
    tipo: TipoEquipo;
    tipoNombre: string;
    marca: string | null;
    modelo: string | null;
    serial: string;
    origenSerial: OrigenSerial;
    serialFabricante: string | null;
    descripcion: string | null;
    zona: string | null;
    garantiaHasta: string | null;
    garantia: EstadoGarantia;
    pendientes: string[];
    potencia: number | null;
    unidad: UnidadCapacidad | null;
    estado: EstadoEquipo;
    estadoNombre: string;
    fechaIngreso: string;
    ubicacion: Ubicacion;
    bodega: { id: string; nombre: string; municipio: string } | null;
    accionesPermitidas: Accion[];
    movimientosPosibles: MovimientoEquipo[];
  };
  proyecto: { id: string; nombre: string; vereda: string; municipio: string; departamento: string } | null;
  compra: { proveedor: string; nit: string | null; numeroFactura: string | null; fechaCompra: string | null; valorPagado: number | null } | null;
  valorPagado: number | null;
  instalacionActual: Instalacion | null;
  instalacionesAnteriores: Instalacion[];
  historial: {
    id: string;
    tipo: string;
    descripcion: string;
    estadoAnterior: EstadoEquipo | null;
    estadoNuevo: EstadoEquipo;
    ocurridoEn: string;
    registradoEn: string;
    autor: string | null;
  }[];
}

export interface ResumenProyecto {
  total: number;
  instalados: number;
  enStock: number;
  enMantenimiento: number;
  dadosDeBaja: number;
}

export interface ProyectoEnLista {
  id: string;
  nombre: string;
  vereda: string;
  municipio: string;
  departamento: string;
  fechaInicio: string;
  resumen: ResumenProyecto;
}

export interface FichaProyecto {
  proyecto: Omit<ProyectoEnLista, 'resumen'> & { descripcion: string | null };
  resumen: ResumenProyecto;
  usuariosAtendidos: number;
  equipos: { id: string; tipo: TipoEquipo; tipoNombre: string; marca: string; modelo: string; serial: string; estado: EstadoEquipo; estadoNombre: string }[];
}

export interface BodegaEnLista {
  id: string;
  nombre: string;
  municipio: string;
  departamento: string;
  direccion: string | null;
  equipos: number;
  articulos: number;
}

export interface ArticuloConCantidad {
  id: string;
  codigo: string;
  nombre: string;
  unidad: UnidadMedida;
  cantidad: number;
}

export interface DetalleBodega {
  bodega: { id: string; nombre: string; municipio: string; departamento: string; direccion: string | null };
  equipos: { tipo: TipoEquipo; tipoNombre: string; estado: EstadoEquipo; estadoNombre: string; cantidad: number }[];
  articulos: ArticuloConCantidad[];
  aviso?: Aviso;
}

export interface ArticuloEnLista {
  id: string;
  codigo: string;
  nombre: string;
  unidad: UnidadMedida;
  descripcion: string | null;
  enBodegas: number;
  enCampo: number;
}

export interface Kardex {
  articulo: { id: string; codigo: string; nombre: string; unidad: UnidadMedida; descripcion: string | null };
  existencias: { cantidad: number; lugar: { tipo: 'BODEGA' | 'PROYECTO'; id: string; nombre: string } }[];
  movimientos: {
    movimientoId: string;
    numero: string;
    tipo: TipoMovimiento;
    tipoNombre: string;
    cantidad: number;
    origen: string | null;
    destino: string | null;
    proyecto: string | null;
    responsable: string | null;
    ocurridoEn: string;
  }[];
  aviso?: Aviso;
}

export interface MovimientoEnLista {
  id: string;
  numero: string;
  tipo: TipoMovimiento;
  tipoNombre: string;
  origen: string | null;
  destino: string | null;
  proyecto: string | null;
  responsable: string | null;
  ocurridoEn: string;
  equipos: number;
  articulos: number;
}

export interface ListaMovimientos {
  datos: MovimientoEnLista[];
  paginacion: Paginacion;
  aviso?: Aviso;
}

export interface DetalleMovimiento {
  id: string;
  numero: string;
  tipo: TipoMovimiento;
  tipoNombre: string;
  origen: string | null;
  destino: string | null;
  proyecto: string | null;
  responsable: string | null;
  observacion: string | null;
  ocurridoEn: string;
  autor: string | null;
  compra: { proveedor: string; nit: string; numeroFactura: string; fechaCompra: string } | null;
  equipos: { id: string; serial: string; tipo: TipoEquipo; tipoNombre: string; marca: string; modelo: string }[];
  articulos: (ArticuloConCantidad & { valorUnitario: number | null })[];
}

export interface UsuarioEnLista {
  id: string;
  nombre: string;
  correo: string;
  rol: 'ADMIN' | 'USUARIO';
  activo: boolean;
  creadoEn: string;
  ultimoIngreso: string | null;
  /** Se registró y nunca ha entrado porque espera autorización. */
  pendiente: boolean;
  /** La cuenta principal (logística): no se le puede quitar el rol ni desactivar. */
  principal: boolean;
}

export interface Conflicto {
  id: string;
  tipo: string;
  payload: Record<string, unknown>;
  ocurridoEn: string;
  recibidoEn: string;
  dispositivoId: string | null;
  autor: string | null;
  error: Aviso & { detalles?: { campo: string; problema: string }[] };
}
