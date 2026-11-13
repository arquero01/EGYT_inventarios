-- Cuenta principal: la de logística. No se puede desactivar, ni quitarle el rol
-- de administrador, ni cambiarle la contraseña desde otra cuenta. Así la
-- empresa nunca pierde el control del sistema.
ALTER TABLE usuarios ADD COLUMN principal boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX usuarios_una_principal ON usuarios (principal) WHERE principal;

-- La de logistica@egyt.com.co si existe; si no, el administrador más antiguo.
WITH elegida AS (
  SELECT id FROM usuarios
  ORDER BY (correo = 'logistica@egyt.com.co') DESC, (rol = 'ADMIN') DESC, creado_en ASC
  LIMIT 1
)
UPDATE usuarios SET principal = true, rol = 'ADMIN', activo = true
FROM elegida WHERE usuarios.id = elegida.id;
