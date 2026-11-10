/**
 * Mensajes de error y aviso, tomados literalmente del documento de
 * requerimientos. Los que no aparecen en el documento están marcados como
 * "(propio)".
 */
export const MENSAJES = {
  'RF-01': 'Error: Todos los campos obligatorios deben estar completos. La fecha de inicio no puede ser una fecha futura.',
  'RF-02': 'Error: El proyecto solicitado no existe o no se encuentra disponible.',
  'RF-03': 'Error: El equipo ya se encuentra asociado a otro proyecto o el ID del proyecto es inválido.',
  'RF-04': 'Aviso: No se encontraron equipos asociados a este proyecto.',
  'RF-05': 'Error: No se pudo calcular el resumen del proyecto debido a un fallo de consulta.',
  'RF-06': 'Error: Complete todos los campos obligatorios y asegúrese de que la potencia sea mayor a cero.',
  'RF-07': 'Error: Ya existe un equipo registrado con este número de serial.',
  'RF-08': 'Error: Los datos de compra son incompletos o inválidos (NIT incorrecto, valor pagado menor o igual a cero).',
  'RF-09': 'Error: Estado de equipo no válido en el sistema.',
  'RF-10': 'Aviso: No hay inventario disponible en stock para este tipo de equipo.',
  'RF-11': 'Error: El equipo seleccionado no se encuentra en stock o los datos del usuario final están incompletos.',
  'RF-12': 'Error: Falló la actualización automática del estado del equipo a Instalado.',
  'RF-13': 'Error: El equipo no está instalado o debe ingresar un motivo válido para el retiro.',
  'RF-14': 'Error: No se puede enviar a mantenimiento un equipo dado de baja o falta especificar el motivo.',
  'RF-15': 'Error: Debe ingresar un motivo obligatorio para dar de baja el equipo. Un equipo dado de baja no puede modificarse.',
  'RF-16': 'Error: El equipo consultado no existe en el sistema.',
  'RF-17': 'Error: No se pudo registrar el evento en el historial del equipo.',
  'RF-18': 'Error: No se pudo cargar el resumen general del inventario.',
  'RF-19': 'Aviso: No hay equipos registrados en el sistema actualmente.',
  'RF-20': 'Aviso: No existen equipos con el estado seleccionado.',
  'RF-21': 'Aviso: No existen equipos del tipo seleccionado.',
  'RF-22': 'Aviso: No se encontraron coincidencias con el término de búsqueda ingresado.',
  'RF-23': 'Error de validación: Revise los campos obligatorios pendientes antes de guardar el registro.',
  'RNF-01': 'Error de sincronización: Hubo un conflicto al sincronizar los datos offline. Verifique la conexión.',

  // Requerimientos de logística (RL), propuestos: no están en el documento original.
  'RL-01': 'Error: El nombre de la bodega es obligatorio y no puede repetirse.',
  'RL-01-NO-EXISTE': 'Error: La bodega indicada no existe o está inactiva.',
  'RL-02': 'Error: El equipo no se encuentra en la ubicación requerida para este movimiento.',
  'RL-03': 'Error: El código del artículo es obligatorio y no puede repetirse.',
  'RL-03-NO-EXISTE': 'Error: El artículo indicado no existe.',
  'RL-03-ENTERA': 'Error: La cantidad debe ser un número entero para esta unidad de medida.',
  'RL-04': 'Error: El ingreso debe tener bodega, datos de compra y al menos un artículo con cantidad y valor mayores a cero.',
  'RL-05': 'Error: El despacho debe indicar bodega de origen, proyecto, responsable y al menos un equipo o artículo.',
  'RL-06': 'Error: El traslado debe tener bodegas de origen y destino distintas, responsable y al menos un equipo o artículo.',
  'RL-07': 'Error: La devolución debe indicar proyecto, bodega de destino, responsable y al menos un equipo o artículo.',
  'RL-08': 'Error: No hay existencias suficientes para realizar el movimiento.',
  'RL-09': 'Aviso: El artículo no tiene movimientos registrados.',
  'RL-10': 'Aviso: No se encontraron movimientos con los filtros seleccionados.',
  'RL-10-NO-EXISTE': 'Error: El movimiento consultado no existe.',
  'RL-11': 'Aviso: La bodega no tiene existencias.',

  // Importación del histórico (propio).
  'IMP-01': 'Error de validación: revise los datos del equipo en el archivo.',
  'EDIT-01': 'Error de validación: revise los datos del equipo.',
  'EDIT-02': 'No hay cambios para guardar.',
  'EDIT-03': 'Este equipo está dado de baja: solo se pueden corregir los datos de los equipos que vinieron del inventario histórico.',
  'EDIT-04': 'Un equipo en stock no tiene usuario: para entregárselo a alguien use «Instalar».',

  // Cuentas de usuario (propio).
  'AUTH-01': 'Error: Correo o contraseña incorrectos.',
  'AUTH-02': 'Error: Ya existe una cuenta con ese correo.',
  'AUTH-03': 'Su cuenta fue creada y está pendiente de autorización por un administrador.',
  'AUTH-04': 'Error: La cuenta está desactivada. Comuníquese con un administrador.',
  'AUTH-05': 'Error: Debe iniciar sesión para continuar.',
  'AUTH-06': 'Error: Su sesión venció. Inicie sesión de nuevo.',
  'AUTH-07': 'Error: Esta operación solo la puede hacer un administrador.',
  'AUTH-08': 'Error: Demasiados intentos. Espere unos minutos e intente de nuevo.',
  'AUTH-09': 'Error: La contraseña actual no es correcta.',
  'AUTH-10': 'Error: Debe quedar al menos un administrador activo.',
  'AUTH-11': 'Error de validación: revise los datos de la cuenta.',
  'AUTH-12': 'Error: El usuario no existe.',

  // (propio) Casos que el documento no cubre.
  'RF-08-FACTURA': 'Error: Ya existe una factura con ese NIT y número, pero con proveedor o fecha de compra distintos.',
  'RF-22-MINIMO': 'Error: La búsqueda debe tener al menos 2 caracteres.',
  'MANT-YA': 'Error: El equipo ya se encuentra en mantenimiento.',
  'MANT-FIN': 'Error: Solo un equipo en mantenimiento puede volver a stock por esta vía.',
  'PROY-MISMO': 'Error: El equipo ya pertenece a ese proyecto.',
  'ID-DUPLICADO': 'Error: Ya existe un registro con ese identificador.',
  'CONFLICTO-NO-ENCONTRADO': 'Error: El conflicto de sincronización no existe o ya fue resuelto.',
  'INTERNO': 'Error: Ocurrió un error inesperado. Intente de nuevo.',
} as const;

export type CodigoMensaje = keyof typeof MENSAJES;
