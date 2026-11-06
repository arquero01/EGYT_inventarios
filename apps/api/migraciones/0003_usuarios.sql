-- ════════════════════════════════════════════════════════════════════════════
-- 0003 · Cuentas de usuario y sesiones
-- Cada persona entra con su correo y contraseña. La contraseña nunca se
-- guarda: solo su huella scrypt. Las sesiones se guardan como el SHA-256 del
-- token, así una copia de la base no sirve para suplantar a nadie.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          varchar(150) NOT NULL CHECK (length(btrim(nombre)) >= 3),
  correo          varchar(150) NOT NULL CHECK (correo = lower(btrim(correo)) AND correo LIKE '%_@_%'),
  contrasena_hash text NOT NULL,
  rol             text NOT NULL DEFAULT 'USUARIO' CHECK (rol IN ('ADMIN','USUARIO')),
  -- false = pendiente de autorización o dada de baja por un administrador.
  activo          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  ultimo_ingreso  timestamptz
);
CREATE UNIQUE INDEX usuarios_correo_unico ON usuarios (correo);

CREATE TABLE sesiones (
  token_hash  char(64) PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  expira_en   timestamptz NOT NULL,
  dispositivo varchar(200)
);
CREATE INDEX sesiones_usuario_idx ON sesiones (usuario_id);

-- Quién hizo cada operación (además del nombre que ya se guardaba en "autor").
ALTER TABLE comandos ADD COLUMN usuario_id uuid REFERENCES usuarios(id);
CREATE INDEX comandos_usuario_idx ON comandos (usuario_id);
