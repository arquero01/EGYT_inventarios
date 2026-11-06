-- Esquema inicial de eg&t: proyectos, equipos, compras, instalaciones e historial.
-- Las reglas críticas se repiten aquí (no solo en el código) para que ni un
-- error de programación ni un acceso directo a la base las pueda saltar.

-- ── Revisión global para sincronización ─────────────────────────────────────
-- Cada fila que cambia recibe un número creciente. El celular pide "todo lo que
-- cambió después de la revisión N" (GET /sync/cambios).
CREATE SEQUENCE rev_seq;

CREATE FUNCTION asignar_rev() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.rev := nextval('rev_seq');
  IF TG_OP = 'UPDATE' THEN
    NEW.actualizado_en := now();
  END IF;
  RETURN NEW;
END $$;

-- ── Proyectos (RF-01) ───────────────────────────────────────────────────────
CREATE TABLE proyectos (
  id             uuid PRIMARY KEY,
  nombre         varchar(100) NOT NULL CHECK (btrim(nombre) <> ''),
  vereda         varchar(100) NOT NULL CHECK (btrim(vereda) <> ''),
  municipio      varchar(100) NOT NULL CHECK (btrim(municipio) <> ''),
  departamento   varchar(100) NOT NULL CHECK (btrim(departamento) <> ''),
  fecha_inicio   date NOT NULL,
  descripcion    varchar(500),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  rev            bigint NOT NULL
);
CREATE TRIGGER proyectos_rev BEFORE INSERT OR UPDATE ON proyectos
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- ── Compras (RF-08) ─────────────────────────────────────────────────────────
-- Una factura suele cubrir varios equipos: se guarda una vez y los equipos la
-- referencian. Es única por proveedor (NIT) + número de factura.
CREATE TABLE compras (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor      varchar(150) NOT NULL CHECK (btrim(proveedor) <> ''),
  nit            varchar(10) NOT NULL CHECK (nit ~ '^[0-9]{5,10}$'),
  nit_dv         smallint CHECK (nit_dv BETWEEN 0 AND 9),
  numero_factura varchar(30) NOT NULL CHECK (numero_factura ~ '^[A-Z0-9-]{1,30}$'),
  fecha_compra   date NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nit, numero_factura)
);

-- ── Equipos (RF-06, RF-07, RF-09) ───────────────────────────────────────────
CREATE TABLE equipos (
  id                 uuid PRIMARY KEY,
  tipo               text NOT NULL CHECK (tipo IN ('PANEL_SOLAR','BATERIA_GEL','BATERIA_LITIO','INVERSOR','MEDIDOR')),
  marca              varchar(80) NOT NULL,
  modelo             varchar(80) NOT NULL,
  serial             varchar(60) NOT NULL,
  serial_normalizado varchar(60) NOT NULL,
  origen_serial      text NOT NULL CHECK (origen_serial IN ('PROVEEDOR','EMPRESA')),
  potencia           numeric(12,3) NOT NULL CHECK (potencia > 0),
  unidad             text NOT NULL CHECK (unidad IN ('W','kW','Wh','kWh','Ah','A','V')),
  proyecto_id        uuid NOT NULL REFERENCES proyectos(id),
  compra_id          uuid NOT NULL REFERENCES compras(id),
  valor_pagado       numeric(14,2) NOT NULL CHECK (valor_pagado > 0),
  estado             text NOT NULL CHECK (estado IN ('EN_STOCK','INSTALADO','EN_MANTENIMIENTO','DADO_DE_BAJA')),
  fecha_ingreso      date NOT NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  rev                bigint NOT NULL,
  -- RF-07: el serial no se repite nunca, sin importar mayúsculas o espacios.
  CONSTRAINT equipos_serial_unico UNIQUE (serial_normalizado),
  -- Los seriales EGT- solo los asigna la empresa.
  CONSTRAINT equipos_prefijo_reservado CHECK ((origen_serial = 'EMPRESA') = (serial_normalizado LIKE 'EGT-%'))
);
CREATE INDEX equipos_proyecto_idx ON equipos (proyecto_id);
CREATE INDEX equipos_estado_idx ON equipos (estado);
CREATE INDEX equipos_tipo_idx ON equipos (tipo);
CREATE INDEX equipos_compra_idx ON equipos (compra_id);

CREATE TRIGGER equipos_rev BEFORE INSERT OR UPDATE ON equipos
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- RF-15: un equipo dado de baja queda congelado.
CREATE FUNCTION bloquear_equipo_dado_de_baja() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'DADO_DE_BAJA' THEN
    RAISE EXCEPTION 'El equipo % está dado de baja y no puede modificarse', OLD.id
      USING ERRCODE = 'EGT15';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipos_baja_definitiva BEFORE UPDATE ON equipos
  FOR EACH ROW EXECUTE FUNCTION bloquear_equipo_dado_de_baja();

-- Contadores para los seriales que asigna la empresa (EGT-PAN-000001).
CREATE TABLE contadores_serial (
  prefijo varchar(10) PRIMARY KEY,
  ultimo  integer NOT NULL
);

-- ── Usuarios finales e instalaciones (RF-11 a RF-13) ────────────────────────
CREATE TABLE usuarios_finales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula         varchar(10) NOT NULL UNIQUE CHECK (cedula ~ '^[0-9]{6,10}$'),
  nombre         varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
  telefono       varchar(10) NOT NULL CHECK (telefono ~ '^[0-9]{10}$'),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  rev            bigint NOT NULL
);
CREATE TRIGGER usuarios_finales_rev BEFORE INSERT OR UPDATE ON usuarios_finales
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

CREATE TABLE instalaciones (
  id                uuid PRIMARY KEY,
  equipo_id         uuid NOT NULL REFERENCES equipos(id),
  usuario_final_id  uuid NOT NULL REFERENCES usuarios_finales(id),
  -- Proyecto del equipo al momento de instalar (para contar usuarios atendidos, RF-02).
  proyecto_id       uuid NOT NULL REFERENCES proyectos(id),
  vereda            varchar(100) NOT NULL,
  municipio         varchar(100) NOT NULL,
  departamento      varchar(100) NOT NULL,
  fecha_instalacion date NOT NULL,
  tecnico           varchar(150) NOT NULL,
  vigente           boolean NOT NULL DEFAULT true,
  finalizada_en     timestamptz,
  motivo_fin        varchar(500),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  rev               bigint NOT NULL,
  CHECK (vigente = (finalizada_en IS NULL))
);
-- Un equipo tiene como máximo una instalación vigente.
CREATE UNIQUE INDEX instalaciones_una_vigente ON instalaciones (equipo_id) WHERE vigente;
CREATE INDEX instalaciones_proyecto_idx ON instalaciones (proyecto_id);
CREATE INDEX instalaciones_usuario_idx ON instalaciones (usuario_final_id);

CREATE TRIGGER instalaciones_rev BEFORE INSERT OR UPDATE ON instalaciones
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- ── Comandos recibidos (idempotencia y conflictos de sincronización) ───────
CREATE TABLE comandos (
  id             uuid PRIMARY KEY,
  tipo           text NOT NULL,
  payload        jsonb NOT NULL,
  ocurrido_en    timestamptz NOT NULL,
  recibido_en    timestamptz NOT NULL DEFAULT now(),
  dispositivo_id varchar(100),
  autor          varchar(150),
  origen         text NOT NULL CHECK (origen IN ('EN_LINEA','SINCRONIZACION')),
  resultado      text NOT NULL CHECK (resultado IN ('APLICADO','RECHAZADO')),
  respuesta      jsonb,
  error          jsonb,
  -- Comandos sin conexión rechazados quedan PENDIENTE para que un
  -- administrador los revise (RNF-01).
  revision       text CHECK (revision IN ('PENDIENTE','RESUELTO')),
  CHECK ((resultado = 'RECHAZADO') = (error IS NOT NULL))
);
CREATE INDEX comandos_revision_idx ON comandos (revision) WHERE revision = 'PENDIENTE';

-- ── Historial del equipo (RF-17) ────────────────────────────────────────────
CREATE TABLE eventos_equipo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id       uuid NOT NULL REFERENCES equipos(id),
  comando_id      uuid NOT NULL REFERENCES comandos(id),
  tipo            text NOT NULL CHECK (tipo IN ('INGRESO','INSTALACION','RETORNO_A_STOCK','MANTENIMIENTO','FIN_MANTENIMIENTO','BAJA','CAMBIO_PROYECTO')),
  estado_anterior text,
  estado_nuevo    text NOT NULL,
  descripcion     varchar(500) NOT NULL,
  datos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Cuándo pasó en campo (reloj del celular) y cuándo lo recibió el servidor.
  ocurrido_en     timestamptz NOT NULL,
  registrado_en   timestamptz NOT NULL DEFAULT now(),
  autor           varchar(150),
  rev             bigint NOT NULL
);
CREATE INDEX eventos_equipo_equipo_idx ON eventos_equipo (equipo_id, rev);

CREATE TRIGGER eventos_equipo_rev BEFORE INSERT ON eventos_equipo
  FOR EACH ROW EXECUTE FUNCTION asignar_rev();

-- El historial nunca se modifica ni se borra.
CREATE FUNCTION historial_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El historial de equipos es inmutable (operación % no permitida)', TG_OP
    USING ERRCODE = 'EGT17';
END $$;
CREATE TRIGGER eventos_equipo_inmutable BEFORE UPDATE OR DELETE ON eventos_equipo
  FOR EACH ROW EXECUTE FUNCTION historial_inmutable();
CREATE TRIGGER eventos_equipo_no_truncate BEFORE TRUNCATE ON eventos_equipo
  FOR EACH STATEMENT EXECUTE FUNCTION historial_inmutable();
