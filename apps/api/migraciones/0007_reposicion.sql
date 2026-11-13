-- Reposición: un equipo (casi siempre una batería) que se le entrega a un
-- usuario para reemplazar otro que presentó fallas.

ALTER TABLE instalaciones ADD COLUMN tipo_entrega text NOT NULL DEFAULT 'ENTREGA'
  CHECK (tipo_entrega IN ('ENTREGA','REPOSICION','PARTICULAR'));
-- Equipo al que reemplazó (cuando la reposición se registra en el sistema).
ALTER TABLE instalaciones ADD COLUMN reemplaza_equipo_id uuid REFERENCES equipos(id);
CREATE INDEX instalaciones_reemplaza_idx ON instalaciones (reemplaza_equipo_id) WHERE reemplaza_equipo_id IS NOT NULL;
CREATE INDEX instalaciones_tipo_entrega_idx ON instalaciones (tipo_entrega) WHERE tipo_entrega <> 'ENTREGA';

ALTER TABLE eventos_equipo DROP CONSTRAINT eventos_equipo_tipo_check;
ALTER TABLE eventos_equipo ADD CONSTRAINT eventos_equipo_tipo_check CHECK (tipo IN (
  'INGRESO','INSTALACION','RETORNO_A_STOCK','MANTENIMIENTO','FIN_MANTENIMIENTO','BAJA','CAMBIO_PROYECTO',
  'DESPACHO','TRASLADO','DEVOLUCION','IMPORTACION','EDICION','REPOSICION'
));

-- Equipos que ya se importaron del archivo de la empresa: el estado del
-- archivo quedó escrito en el evento de importación ("Estado en el archivo:
-- REPOSICIÓN"). Con eso se marca la entrega, sin tener que volver a importar.
UPDATE instalaciones i SET tipo_entrega = 'REPOSICION'
WHERE EXISTS (SELECT 1 FROM eventos_equipo ev
              WHERE ev.equipo_id = i.equipo_id AND ev.tipo = 'IMPORTACION'
                AND ev.descripcion ILIKE '%en el archivo: REPOSICI%');
UPDATE instalaciones i SET tipo_entrega = 'PARTICULAR'
WHERE EXISTS (SELECT 1 FROM eventos_equipo ev
              WHERE ev.equipo_id = i.equipo_id AND ev.tipo = 'IMPORTACION'
                AND ev.descripcion ILIKE '%en el archivo: PARTICULAR%');
