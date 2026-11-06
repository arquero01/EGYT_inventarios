-- Logística: bodegas, ubicación física de los equipos, artículos por cantidad
-- y movimientos (ingreso, despacho, traslado, devolución). Ver README, RL-01 a RL-11.

-- Función genérica para tablas que son registro histórico.
CREATE FUNCTION registro_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es un registro inmutable (operación % no permitida)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'EGT17';
END $$;

-- ── Bodegas (RL-01) ─────────────────────────────────────────────────────────
CREATE TABLE bodegas (
  id             uuid PRIMARY KEY,
  nombre         varchar(100) NOT NULL CHECK (btrim(nombre) <> ''),
  municipio      varchar(100) NOT NULL CHECK (btrim(municipio) <> ''),
  departamento   varchar(100) NOT NULL CHECK (btrim(departamento) <> ''),
  direccion      varchar(200),
  activa         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  rev            bigint NOT NULL
);
CREATE UNIQUE INDEX bodegas_nombre_unico ON bodegas (lower(btrim(nombre)));
CREATE TRIGGER bodegas_rev BEFORE INSERT OR UPDATE ON bodegas
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- ── Ubicación de cada equipo (RL-02) ────────────────────────────────────────
ALTER TABLE equipos
  ADD COLUMN ubicacion text,
  ADD COLUMN bodega_id uuid REFERENCES bodegas(id);

-- Si ya hay equipos registrados, quedan en una bodega por defecto. Se
-- desactiva un momento el bloqueo de equipos dados de baja para poder ubicarlos.
INSERT INTO bodegas (id, nombre, municipio, departamento)
  SELECT '00000000-0000-4000-8000-000000000001', 'Bodega principal', 'Por definir', 'Por definir'
  WHERE EXISTS (SELECT 1 FROM equipos);
ALTER TABLE equipos DISABLE TRIGGER equipos_baja_definitiva;
UPDATE equipos SET
  ubicacion = CASE WHEN estado = 'INSTALADO' THEN 'CAMPO' ELSE 'BODEGA' END,
  bodega_id = CASE WHEN estado = 'INSTALADO' THEN NULL ELSE '00000000-0000-4000-8000-000000000001'::uuid END;
ALTER TABLE equipos ENABLE TRIGGER equipos_baja_definitiva;

ALTER TABLE equipos
  ALTER COLUMN ubicacion SET NOT NULL,
  ADD CONSTRAINT equipos_ubicacion_valida CHECK (ubicacion IN ('BODEGA','CAMPO')),
  -- En bodega ⇔ tiene bodega asignada.
  ADD CONSTRAINT equipos_bodega_coherente CHECK ((ubicacion = 'BODEGA') = (bodega_id IS NOT NULL)),
  -- Un equipo instalado está en campo.
  ADD CONSTRAINT equipos_instalado_en_campo CHECK (estado <> 'INSTALADO' OR ubicacion = 'CAMPO');
CREATE INDEX equipos_bodega_idx ON equipos (bodega_id);

-- ── Artículos por cantidad (RL-03) ──────────────────────────────────────────
CREATE TABLE articulos (
  id             uuid PRIMARY KEY,
  codigo         varchar(30) NOT NULL CHECK (codigo ~ '^[A-Z0-9._-]{1,30}$'),
  nombre         varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
  unidad         text NOT NULL CHECK (unidad IN ('UND','PAR','JUEGO','CAJA','ROLLO','M','KG','L')),
  descripcion    varchar(500),
  activo         boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  rev            bigint NOT NULL,
  CONSTRAINT articulos_codigo_unico UNIQUE (codigo)
);
CREATE TRIGGER articulos_rev BEFORE INSERT OR UPDATE ON articulos
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- ── Existencias por lugar (RL-08) ───────────────────────────────────────────
-- Cantidad de cada artículo en cada bodega, o despachada a cada proyecto.
-- Nunca puede quedar negativa.
CREATE TABLE existencias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  articulo_id    uuid NOT NULL REFERENCES articulos(id),
  bodega_id      uuid REFERENCES bodegas(id),
  proyecto_id    uuid REFERENCES proyectos(id),
  cantidad       numeric(14,3) NOT NULL CHECK (cantidad >= 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  rev            bigint NOT NULL,
  CONSTRAINT existencias_un_lugar CHECK ((bodega_id IS NULL) <> (proyecto_id IS NULL))
);
CREATE UNIQUE INDEX existencias_en_bodega ON existencias (articulo_id, bodega_id) WHERE bodega_id IS NOT NULL;
CREATE UNIQUE INDEX existencias_en_proyecto ON existencias (articulo_id, proyecto_id) WHERE proyecto_id IS NOT NULL;
CREATE TRIGGER existencias_rev BEFORE INSERT OR UPDATE ON existencias
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- ── Movimientos (RL-04 a RL-07, RL-09, RL-10) ───────────────────────────────
-- Cada movimiento es una "guía" con número consecutivo (DES-000001) y sus
-- ítems. Su id es el del comando que lo creó.
CREATE TABLE movimientos (
  id                uuid PRIMARY KEY REFERENCES comandos(id),
  numero            varchar(20) NOT NULL UNIQUE,
  tipo              text NOT NULL CHECK (tipo IN ('INGRESO','DESPACHO','TRASLADO','DEVOLUCION')),
  bodega_origen_id  uuid REFERENCES bodegas(id),
  bodega_destino_id uuid REFERENCES bodegas(id),
  proyecto_id       uuid REFERENCES proyectos(id),
  compra_id         uuid REFERENCES compras(id),
  responsable       varchar(150),
  observacion       varchar(500),
  ocurrido_en       timestamptz NOT NULL,
  registrado_en     timestamptz NOT NULL DEFAULT now(),
  autor             varchar(150),
  rev               bigint NOT NULL,
  CONSTRAINT movimientos_campos_por_tipo CHECK (
    CASE tipo
      WHEN 'INGRESO'    THEN bodega_origen_id IS NULL AND bodega_destino_id IS NOT NULL AND compra_id IS NOT NULL
      WHEN 'DESPACHO'   THEN bodega_origen_id IS NOT NULL AND bodega_destino_id IS NULL AND proyecto_id IS NOT NULL AND responsable IS NOT NULL
      WHEN 'TRASLADO'   THEN bodega_origen_id IS NOT NULL AND bodega_destino_id IS NOT NULL AND bodega_origen_id <> bodega_destino_id AND responsable IS NOT NULL
      WHEN 'DEVOLUCION' THEN bodega_origen_id IS NULL AND bodega_destino_id IS NOT NULL AND proyecto_id IS NOT NULL AND responsable IS NOT NULL
    END
  )
);
CREATE INDEX movimientos_tipo_idx ON movimientos (tipo, ocurrido_en DESC);
CREATE INDEX movimientos_origen_idx ON movimientos (bodega_origen_id);
CREATE INDEX movimientos_destino_idx ON movimientos (bodega_destino_id);
CREATE INDEX movimientos_proyecto_idx ON movimientos (proyecto_id);

CREATE TABLE movimiento_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id  uuid NOT NULL REFERENCES movimientos(id),
  equipo_id      uuid REFERENCES equipos(id),
  articulo_id    uuid REFERENCES articulos(id),
  cantidad       numeric(14,3) NOT NULL CHECK (cantidad > 0),
  valor_unitario numeric(14,2) CHECK (valor_unitario > 0),
  rev            bigint NOT NULL,
  CONSTRAINT movimiento_items_un_tipo CHECK ((equipo_id IS NULL) <> (articulo_id IS NULL)),
  CONSTRAINT movimiento_items_equipo_unitario CHECK (equipo_id IS NULL OR cantidad = 1)
);
CREATE INDEX movimiento_items_movimiento_idx ON movimiento_items (movimiento_id);
CREATE INDEX movimiento_items_equipo_idx ON movimiento_items (equipo_id);
CREATE INDEX movimiento_items_articulo_idx ON movimiento_items (articulo_id);

CREATE TRIGGER movimientos_rev BEFORE INSERT ON movimientos
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();
CREATE TRIGGER movimiento_items_rev BEFORE INSERT ON movimiento_items
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- Las guías no se editan ni se borran: un error se corrige con otro movimiento.
CREATE TRIGGER movimientos_inmutable BEFORE UPDATE OR DELETE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER movimientos_no_truncate BEFORE TRUNCATE ON movimientos
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER movimiento_items_inmutable BEFORE UPDATE OR DELETE ON movimiento_items
  FOR EACH ROW EXECUTE FUNCTION registro_inmutable();
CREATE TRIGGER movimiento_items_no_truncate BEFORE TRUNCATE ON movimiento_items
  FOR EACH STATEMENT EXECUTE FUNCTION registro_inmutable();

-- Los contadores de guías comparten tabla con los de seriales (prefijo MOV-DES…).
ALTER TABLE contadores_serial ALTER COLUMN prefijo TYPE varchar(20);

-- El historial de cada equipo también registra sus movimientos (RF-17).
ALTER TABLE eventos_equipo DROP CONSTRAINT eventos_equipo_tipo_check;
ALTER TABLE eventos_equipo ADD CONSTRAINT eventos_equipo_tipo_check CHECK (tipo IN (
  'INGRESO','INSTALACION','RETORNO_A_STOCK','MANTENIMIENTO','FIN_MANTENIMIENTO','BAJA','CAMBIO_PROYECTO',
  'DESPACHO','TRASLADO','DEVOLUCION'
));
