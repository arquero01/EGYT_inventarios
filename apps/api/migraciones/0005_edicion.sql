-- Corrección de datos de equipos (EDITAR_EQUIPO).

-- Historial: evento de corrección.
ALTER TABLE eventos_equipo DROP CONSTRAINT eventos_equipo_tipo_check;
ALTER TABLE eventos_equipo ADD CONSTRAINT eventos_equipo_tipo_check CHECK (tipo IN (
  'INGRESO','INSTALACION','RETORNO_A_STOCK','MANTENIMIENTO','FIN_MANTENIMIENTO','BAJA','CAMBIO_PROYECTO',
  'DESPACHO','TRASLADO','DEVOLUCION','IMPORTACION','EDICION'
));

-- RF-15: un equipo dado de baja sigue congelado. Única excepción: corregir
-- datos (no el estado) de un equipo importado del histórico; el servidor lo
-- habilita solo dentro de esa transacción con SET LOCAL egt.correccion = 'si'.
CREATE OR REPLACE FUNCTION bloquear_equipo_dado_de_baja() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'DADO_DE_BAJA' THEN
    IF NEW.estado = 'DADO_DE_BAJA'
       AND NEW.ubicacion IS NOT DISTINCT FROM OLD.ubicacion
       AND NEW.bodega_id IS NOT DISTINCT FROM OLD.bodega_id
       AND coalesce(current_setting('egt.correccion', true), '') = 'si' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'El equipo % está dado de baja y no puede modificarse', OLD.id
      USING ERRCODE = 'EGT15';
  END IF;
  RETURN NEW;
END $$;
