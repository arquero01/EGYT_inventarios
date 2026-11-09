-- ════════════════════════════════════════════════════════════════════════════
-- 0004 · Histórico de la empresa
-- Para importar los equipos que la empresa llevaba en hojas de cálculo:
--   · código interno como identificador (origen INTERNO) y serial del fabricante aparte
--   · zona (centro de costos), fecha de fin de garantía y descripción
--   · datos que pueden faltar en el histórico (proyecto, compra, potencia…)
--     y la lista de "pendientes" por completar
--   · nuevo tipo de equipo: controlador de carga
-- El ingreso normal sigue exigiendo todo: eso lo controlan las reglas del dominio.
-- ════════════════════════════════════════════════════════════════════════════

-- Equipos ---------------------------------------------------------------------
ALTER TABLE equipos DROP CONSTRAINT equipos_tipo_check;
ALTER TABLE equipos ADD CONSTRAINT equipos_tipo_check
  CHECK (tipo IN ('PANEL_SOLAR','BATERIA_GEL','BATERIA_LITIO','INVERSOR','MEDIDOR','CONTROLADOR'));

ALTER TABLE equipos DROP CONSTRAINT equipos_origen_serial_check;
ALTER TABLE equipos ADD CONSTRAINT equipos_origen_serial_check
  CHECK (origen_serial IN ('PROVEEDOR','EMPRESA','INTERNO'));

ALTER TABLE equipos
  ALTER COLUMN marca DROP NOT NULL,
  ALTER COLUMN modelo DROP NOT NULL,
  ALTER COLUMN potencia DROP NOT NULL,
  ALTER COLUMN unidad DROP NOT NULL,
  ALTER COLUMN proyecto_id DROP NOT NULL,
  ALTER COLUMN compra_id DROP NOT NULL,
  ALTER COLUMN valor_pagado DROP NOT NULL,
  ALTER COLUMN serial TYPE varchar(80),
  ALTER COLUMN serial_normalizado TYPE varchar(80),
  ADD COLUMN serial_fabricante varchar(80),
  ADD COLUMN zona varchar(120),
  ADD COLUMN garantia_hasta date,
  ADD COLUMN descripcion varchar(300),
  ADD COLUMN pendientes text[] NOT NULL DEFAULT '{}';

CREATE INDEX equipos_serial_fabricante_idx ON equipos (upper(serial_fabricante));
CREATE INDEX equipos_zona_idx ON equipos (zona);
CREATE INDEX equipos_con_pendientes_idx ON equipos ((cardinality(pendientes) > 0));

-- Compras: en el histórico no hay NIT y a veces tampoco factura o fecha --------
ALTER TABLE compras
  ALTER COLUMN nit DROP NOT NULL,
  ALTER COLUMN numero_factura DROP NOT NULL,
  ALTER COLUMN fecha_compra DROP NOT NULL;
ALTER TABLE compras DROP CONSTRAINT compras_numero_factura_check;
ALTER TABLE compras ADD CONSTRAINT compras_numero_factura_check
  CHECK (numero_factura ~ '^[A-Z0-9][A-Z0-9 ./-]{0,29}$');

-- Usuarios finales: NIU (número del usuario en la empresa) y teléfono opcional --
ALTER TABLE usuarios_finales DROP CONSTRAINT usuarios_finales_cedula_check;
ALTER TABLE usuarios_finales
  ALTER COLUMN cedula TYPE varchar(12),
  ALTER COLUMN telefono DROP NOT NULL,
  ADD COLUMN niu varchar(30);
ALTER TABLE usuarios_finales ADD CONSTRAINT usuarios_finales_cedula_check CHECK (cedula ~ '^[0-9]{5,12}$');

-- Instalaciones del histórico: no siempre se sabe proyecto, vereda ni técnico --
ALTER TABLE instalaciones
  ALTER COLUMN proyecto_id DROP NOT NULL,
  ALTER COLUMN vereda DROP NOT NULL,
  ALTER COLUMN municipio DROP NOT NULL,
  ALTER COLUMN departamento DROP NOT NULL,
  ALTER COLUMN tecnico DROP NOT NULL;

-- Historial: evento de importación ------------------------------------------------
ALTER TABLE eventos_equipo DROP CONSTRAINT eventos_equipo_tipo_check;
ALTER TABLE eventos_equipo ADD CONSTRAINT eventos_equipo_tipo_check CHECK (tipo IN (
  'INGRESO','INSTALACION','RETORNO_A_STOCK','MANTENIMIENTO','FIN_MANTENIMIENTO','BAJA','CAMBIO_PROYECTO',
  'DESPACHO','TRASLADO','DEVOLUCION','IMPORTACION'
));
