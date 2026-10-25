-- B7.43B DRAFT ONLY. NO EJECUTADO. Revisión/aprobación operativa separada.
-- PREFLIGHT / DIAGNÓSTICO: guardar resultados y definiciones completas antes del cambio.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'productos';
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
-- Revisar TODAS las policies: se combinan con OR; una policy amplia puede reabrir escritura.
-- No ejecutar el bloque si hay policies adicionales aplicables a productos.
-- Confirmar backend seguro desplegado y lectura pública actual antes de autorizar.

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='productos' AND public=true) THEN
    RAISE EXCEPTION 'Preflight: bucket público productos no confirmado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='productos_public_read' AND cmd='SELECT') THEN
    RAISE EXCEPTION 'Preflight: lectura pública no confirmada';
  END IF;
  -- Fail closed: ALL policies también pueden autorizar escrituras.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
      AND policyname NOT IN ('productos_public_insert','productos_public_update','productos_public_delete')) THEN
    RAISE EXCEPTION 'Preflight: hay otras policies de escritura; revisar alcance antes de continuar';
  END IF;
END $$;
DROP POLICY IF EXISTS productos_public_insert ON storage.objects;
DROP POLICY IF EXISTS productos_public_update ON storage.objects;
DROP POLICY IF EXISTS productos_public_delete ON storage.objects;
-- productos_public_read se conserva sin modificar. No modifica bucket ni tablas de negocio.
SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects';
COMMIT;

-- VALIDACIÓN POSTERIOR, en fase autorizada: GET público permitido; INSERT, UPDATE,
-- DELETE anon/authenticated rechazados; servidor autorizado puede subir; tenant ajeno rechazado.
-- Este archivo no demuestra que las policies remotas hayan cambiado.
-- ROLLBACK antes de COMMIT: ROLLBACK;
-- ROLLBACK después de COMMIT: restaurar las definiciones exactas capturadas en preflight.
-- La configuración verificada original equivale a lo siguiente (NO ejecutar por defecto:
-- reabre escrituras públicas inseguras; requiere decisión explícita del operador):
-- BEGIN;
-- CREATE POLICY productos_public_insert ON storage.objects FOR INSERT TO public
--   WITH CHECK (bucket_id = 'productos');
-- CREATE POLICY productos_public_update ON storage.objects FOR UPDATE TO public
--   USING (bucket_id = 'productos') WITH CHECK (bucket_id = 'productos');
-- CREATE POLICY productos_public_delete ON storage.objects FOR DELETE TO public
--   USING (bucket_id = 'productos');
-- COMMIT;
