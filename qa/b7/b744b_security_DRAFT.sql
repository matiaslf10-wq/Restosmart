-- B7.44B - PROPUESTA DE SEGURIDAD
-- NO EJECUTAR EN PRODUCCION.
-- Requiere despliegue coordinado y pruebas HTTP.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $pre$
DECLARE x text;
BEGIN
 IF current_database() = 'restosmart_qa' THEN
  RAISE EXCEPTION 'Este DRAFT no corresponde al laboratorio';
 END IF;

 FOREACH x IN ARRAY ARRAY[
  'restaurants','mesas','productos',
  'producto_restaurantes','pedidos','items_pedido',
  'pedido_estados_historial','producto_imagenes'
 ] LOOP
  IF to_regclass('public.'||x) IS NULL THEN
   RAISE EXCEPTION 'Tabla ausente: %',x;
  END IF;
 END LOOP;

 IF NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
  AND policyname='productos_public_insert'
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
  AND policyname='productos_public_update'
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
  AND policyname='productos_public_delete'
 ) THEN
  RAISE EXCEPTION 'Policies Storage distintas del inventario';
 END IF;
END $pre$;

-- Los endpoints administrativos usan service_role en servidor.
-- Los componentes publicos deben utilizar APIs de lectura controlada.

REVOKE ALL ON TABLE
 public.restaurants,
 public.mesas,
 public.productos,
 public.producto_restaurantes,
 public.pedidos,
 public.items_pedido,
 public.pedido_estados_historial,
 public.producto_imagenes
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_estados_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_imagenes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SEQUENCE
 public.pedidos_id_seq,
 public.items_pedido_id_seq,
 public.pedido_estados_historial_id_seq,
 public.producto_imagenes_id_seq
FROM PUBLIC, anon, authenticated;

-- Reafirmar los derechos necesarios del backend.
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
 public.restaurants,
 public.mesas,
 public.productos,
 public.producto_restaurantes,
 public.pedidos,
 public.items_pedido,
 public.pedido_estados_historial,
 public.producto_imagenes
TO service_role;

GRANT USAGE,SELECT ON SEQUENCE
 public.pedidos_id_seq,
 public.items_pedido_id_seq,
 public.pedido_estados_historial_id_seq,
 public.producto_imagenes_id_seq
TO service_role;

-- Conservar productos_public_read y el bucket publico.
-- Retirar exclusivamente escrituras publicas comprobadas.
DROP POLICY productos_public_insert ON storage.objects;
DROP POLICY productos_public_update ON storage.objects;
DROP POLICY productos_public_delete ON storage.objects;

DO $post$
DECLARE t text; r text; p text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'restaurants','mesas','productos',
  'producto_restaurantes','pedidos','items_pedido',
  'pedido_estados_historial','producto_imagenes'
 ] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid=to_regclass('public.'||t)) THEN
   RAISE EXCEPTION 'RLS deshabilitada: %',t;
  END IF;

  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF has_table_privilege(r,'public.'||t,p) THEN
     RAISE EXCEPTION 'Permiso publico persistente %.% %',r,t,p;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
END $post$;

-- PREPARACION SOLAMENTE:
-- COMMIT esta deliberadamente deshabilitado.
-- Sustituir por despliegue coordinado una vez aprobadas
-- las regresiones HTTP, triggers, grants y Storage reales.
ROLLBACK;
SELECT 'B7.44B DRAFT - ROLLBACK EJECUTADO' AS resultado;