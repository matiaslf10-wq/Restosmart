BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

DO $pre$
BEGIN
 IF current_database() <> 'restosmart_qa' THEN
  RAISE EXCEPTION 'Base distinta de restosmart_qa';
 END IF;
 IF to_regclass('public.order_collections') IS NULL THEN
  RAISE EXCEPTION 'B724 no instalada';
 END IF;
END $pre$;

-- Ensayar los seis objetos reproducidos localmente.
GRANT SELECT,INSERT,UPDATE,DELETE ON
 public.restaurants,public.mesas,public.productos,
 public.producto_restaurantes,public.pedidos,public.items_pedido
TO anon,authenticated;

REVOKE ALL ON
 public.restaurants,public.mesas,public.productos,
 public.producto_restaurantes,public.pedidos,public.items_pedido
FROM PUBLIC,anon,authenticated;

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items_pedido ENABLE ROW LEVEL SECURITY;

GRANT SELECT,INSERT,UPDATE,DELETE ON
 public.restaurants,public.mesas,public.productos,
 public.producto_restaurantes,public.pedidos,public.items_pedido
TO service_role;

DO $check$
DECLARE t text; r text; p text; n integer:=0;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'restaurants','mesas','productos',
  'producto_restaurantes','pedidos','items_pedido'
 ] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid=to_regclass('public.'||t)) THEN
   RAISE EXCEPTION 'FAIL RLS %',t;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF has_table_privilege(r,'public.'||t,p) THEN
     RAISE EXCEPTION 'FAIL privilegio %.% %',r,t,p;
    END IF;
    n:=n+1;
   END LOOP;
  END LOOP;
 END LOOP;

 IF NOT has_function_privilege(
   'service_role',
   'public.restosmart_create_order_atomic_v1(jsonb,jsonb,boolean)',
   'EXECUTE'
 ) THEN
  RAISE EXCEPTION 'FAIL B5 servicio';
 END IF;

 IF NOT has_function_privilege(
   'service_role',
   'public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text)',
   'EXECUTE'
 ) THEN
  RAISE EXCEPTION 'FAIL B724 servicio';
 END IF;

 RAISE NOTICE 'PASS B744: % verificaciones de permisos',n;
 RAISE NOTICE 'PASS B744: funciones B5 y B724 disponibles al servicio';
END $check$;

ROLLBACK;
SELECT 'B7.44B - LABORATORIO ROLLBACK EJECUTADO' AS resultado;