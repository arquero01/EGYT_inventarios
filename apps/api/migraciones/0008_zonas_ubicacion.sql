-- Dónde queda cada zona en el mapa de usuarios. El panel ubica las zonas solo
-- por el nombre del municipio; aquí se guarda la elección del administrador
-- cuando el nombre se repite en varios departamentos (San Miguel, Miraflores…)
-- o no coincide con ninguno.
CREATE TABLE zonas_ubicacion (
  -- Nombre de la zona normalizado (minúsculas, sin tildes ni espacios de más).
  zona varchar(120) PRIMARY KEY,
  -- Código DANE del municipio (5 dígitos).
  municipio_codigo varchar(5) NOT NULL CHECK (municipio_codigo ~ '^[0-9]{5}$'),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
