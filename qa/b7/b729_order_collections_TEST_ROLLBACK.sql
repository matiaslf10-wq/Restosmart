BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
-- B7.24: migration prepared locally; NOT EXECUTED.
-- Prerequisite: schema/RPC in qa/b5/restosmart_create_order_atomic_b52_DRAFT.sql.
DO $$ BEGIN
 IF to_regprocedure('public.restosmart_create_order_atomic_v1(jsonb,jsonb,boolean)') IS NULL THEN
  RAISE EXCEPTION 'B724_PREREQUISITE: missing existing atomic order RPC';
 END IF;
END $$;
-- Nullable, no backfill: historical orders are unchanged.
ALTER TABLE public.pedidos ADD COLUMN moneda_cobro text CHECK (moneda_cobro IS NULL OR moneda_cobro = 'ARS');
CREATE TABLE public.order_collection_configs (
 tenant_id text NOT NULL, scope text NOT NULL, config jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), operator text NOT NULL,
 PRIMARY KEY (tenant_id, scope),
 CHECK (scope = 'tenant' OR scope ~ '^restaurant:[0-9]+$'),
 CHECK (jsonb_typeof(config->'methods') = 'array' AND jsonb_typeof(config->'require_payment') = 'boolean')
);
CREATE TABLE public.order_collections (
 order_id bigint PRIMARY KEY REFERENCES public.pedidos(id),
 tenant_id text NOT NULL, restaurant_id bigint NOT NULL REFERENCES public.restaurants(id),
 token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 method jsonb NOT NULL, require_payment boolean NOT NULL,
 amount numeric NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'ARS' CHECK (currency = 'ARS'),
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','declared','confirmed','incident')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_collections_scope ON public.order_collections(tenant_id, restaurant_id, created_at DESC);
CREATE TABLE public.order_collection_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id text NOT NULL, restaurant_id bigint NOT NULL,
 order_id bigint REFERENCES public.order_collections(order_id),
 action text NOT NULL, operator text NOT NULL, note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_collection_events_scope ON public.order_collection_events(tenant_id, restaurant_id, created_at DESC);
-- Custom signed admin cookies are NOT Supabase Auth JWTs. No permissive auth.uid policy.
-- Access is exclusively through server-side service_role after current admin/ownership checks.
ALTER TABLE public.order_collection_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_collection_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_collection_configs, public.order_collections, public.order_collection_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_collection_configs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.order_collections TO service_role;
GRANT SELECT, INSERT ON public.order_collection_events TO service_role;
REVOKE ALL ON SEQUENCE public.order_collection_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.order_collection_events_id_seq TO service_role;

CREATE FUNCTION public.b724_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c jsonb; t text; m jsonb; p public.order_collections%ROWTYPE;
BEGIN
 IF TG_OP = 'INSERT' THEN
  SELECT owner_tenant_id INTO t FROM public.restaurants WHERE id = NEW.restaurant_id;
  SELECT config INTO c FROM public.order_collection_configs WHERE tenant_id = t
    AND scope IN ('tenant', 'restaurant:' || NEW.restaurant_id::text)
    ORDER BY (scope <> 'tenant') DESC LIMIT 1;
  IF c IS NOT NULL THEN
   SELECT value INTO m FROM jsonb_array_elements(c->'methods') WHERE value->>'kind' = current_setting('restosmart.collection_method', true);
   IF m IS NULL THEN RAISE EXCEPTION 'B724_METHOD_REQUIRED'; END IF;
   IF (c->>'require_payment')::boolean THEN NEW.estado := 'solicitado'; END IF;
   NEW.moneda_cobro := 'ARS';
   NEW.estado_pago := 'pendiente'; NEW.efectivo_aprobado := false;
  END IF;
 ELSE
  SELECT * INTO p FROM public.order_collections WHERE order_id = OLD.id;
  IF FOUND THEN
   IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id OR NEW.total IS DISTINCT FROM OLD.total OR NEW.moneda_cobro IS DISTINCT FROM OLD.moneda_cobro THEN RAISE EXCEPTION 'B724_IMMUTABLE_ORDER'; END IF;
   IF (NEW.estado_pago IS DISTINCT FROM OLD.estado_pago OR NEW.efectivo_aprobado IS DISTINCT FROM OLD.efectivo_aprobado)
     AND NOT (p.state = 'confirmed' AND NEW.estado_pago = 'aprobado' AND NEW.efectivo_aprobado = (p.method->>'kind' = 'efectivo')) THEN
     RAISE EXCEPTION 'B724_USE_COLLECTION_REVIEW';
   END IF;
   IF p.require_payment AND p.state <> 'confirmed' AND NEW.estado IS DISTINCT FROM OLD.estado
      AND NEW.estado IN ('pendiente','en_preparacion','listo','entregado','cerrado') THEN RAISE EXCEPTION 'B724_PAYMENT_REQUIRED'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b724_order_guard BEFORE INSERT OR UPDATE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_guard();

CREATE FUNCTION public.b724_order_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c jsonb; t text; m jsonb;
BEGIN
 SELECT owner_tenant_id INTO t FROM public.restaurants WHERE id = NEW.restaurant_id;
 SELECT config INTO c FROM public.order_collection_configs WHERE tenant_id = t
  AND scope IN ('tenant', 'restaurant:' || NEW.restaurant_id::text) ORDER BY (scope <> 'tenant') DESC LIMIT 1;
 IF c IS NOT NULL THEN
  SELECT value INTO m FROM jsonb_array_elements(c->'methods') WHERE value->>'kind' = current_setting('restosmart.collection_method', true);
  INSERT INTO public.order_collections(order_id,tenant_id,restaurant_id,method,require_payment,amount,currency)
   VALUES(NEW.id,t,NEW.restaurant_id,m,(c->>'require_payment')::boolean,NEW.total,NEW.moneda_cobro);
  INSERT INTO public.order_collection_events(tenant_id,restaurant_id,order_id,action,operator)
   VALUES(t,NEW.restaurant_id,NEW.id,'created','customer');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b724_order_snapshot AFTER INSERT ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.b724_order_snapshot();

CREATE FUNCTION public.b724_item_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.order_collections%ROWTYPE;
BEGIN
 IF NEW.pedido_id IS DISTINCT FROM OLD.pedido_id AND EXISTS (SELECT 1 FROM public.order_collections WHERE order_id IN (OLD.pedido_id,NEW.pedido_id)) THEN RAISE EXCEPTION 'B724_IMMUTABLE_ITEM'; END IF;
 PERFORM 1 FROM public.pedidos WHERE id = NEW.pedido_id FOR UPDATE;
 SELECT * INTO p FROM public.order_collections WHERE order_id = NEW.pedido_id;
 IF FOUND AND p.require_payment AND p.state <> 'confirmed' THEN
  -- Initial pending markers are retained; kitchen reads hide blocked items.
  IF TG_OP = 'UPDATE' AND (NEW.comentarios IS DISTINCT FROM OLD.comentarios OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id) THEN
   RAISE EXCEPTION 'B724_PAYMENT_REQUIRED';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b724_item_guard BEFORE UPDATE ON public.items_pedido FOR EACH ROW EXECUTE FUNCTION public.b724_item_guard();

CREATE FUNCTION public.restosmart_create_order_collection_v1(p_pedido jsonb,p_items jsonb,p_control_stock boolean,p_method text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; t text;
BEGIN
 SELECT owner_tenant_id INTO t FROM public.restaurants WHERE id = (p_pedido->>'restaurant_id')::bigint;
 -- Config changes and order snapshots use the same tenant lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('b724:' || t, 0));
 PERFORM set_config('restosmart.collection_method', p_method, true);
 result := public.restosmart_create_order_atomic_v1(p_pedido,p_items,p_control_stock);
 PERFORM set_config('restosmart.collection_method', '', true);
 RETURN result || jsonb_build_object('payment', (
  SELECT jsonb_build_object('token',token,'method',method,'amount',amount,'currency',currency,'state',state,'require_payment',require_payment)
  FROM public.order_collections WHERE order_id = (result->'pedido'->>'id')::bigint
 ));
END $$;

CREATE FUNCTION public.restosmart_collection_action_v1(p_tenant text,p_restaurant bigint,p_order bigint,p_token uuid,p_action text,p_operator text,p_note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE p public.order_collections%ROWTYPE; next_state text; order_state text;
BEGIN
 -- Always lock parent first, also used by preparation changes. Prevent deadlocks.
 SELECT estado INTO order_state FROM public.pedidos WHERE id = p_order AND restaurant_id = p_restaurant FOR UPDATE;
 IF NOT FOUND OR order_state IN ('cancelado','cerrado') THEN RAISE EXCEPTION 'B724_ORDER_UNAVAILABLE'; END IF;
 SELECT * INTO p FROM public.order_collections WHERE order_id = p_order AND tenant_id = p_tenant AND restaurant_id = p_restaurant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B724_NOT_FOUND'; END IF;
 IF p_action = 'declare' THEN
  IF p_token IS DISTINCT FROM p.token OR p.state <> 'pending' OR p.method->>'kind' = 'efectivo' THEN RAISE EXCEPTION 'B724_TRANSITION'; END IF;
  next_state := 'declared'; p_operator := 'customer';
 ELSIF p_action = 'confirm' THEN
  IF p.state <> 'declared' AND NOT (p.state = 'pending' AND p.method->>'kind' = 'efectivo') THEN RAISE EXCEPTION 'B724_TRANSITION'; END IF;
  IF p_operator IS NULL OR p_operator = 'customer' THEN RAISE EXCEPTION 'B724_OPERATOR'; END IF;
  next_state := 'confirmed';
 ELSIF p_action = 'incident' THEN
  IF p.state NOT IN ('pending','declared') OR coalesce(length(trim(p_note)),0) = 0 OR p_operator IS NULL OR p_operator = 'customer' THEN RAISE EXCEPTION 'B724_TRANSITION'; END IF;
  next_state := 'incident';
 ELSE RAISE EXCEPTION 'B724_ACTION'; END IF;
 UPDATE public.order_collections SET state = next_state, updated_at = now() WHERE order_id = p.order_id;
 IF next_state = 'confirmed' THEN
  UPDATE public.pedidos SET estado_pago = 'aprobado', efectivo_aprobado = (p.method->>'kind' = 'efectivo') WHERE id = p.order_id AND restaurant_id = p.restaurant_id;
 END IF;
 INSERT INTO public.order_collection_events(tenant_id,restaurant_id,order_id,action,operator,note)
 VALUES(p.tenant_id,p.restaurant_id,p.order_id,p_action,p_operator,left(p_note,1000));
 RETURN jsonb_build_object('state',next_state);
END $$;

CREATE FUNCTION public.restosmart_collection_config_v1(p_tenant text,p_restaurant bigint,p_scope text,p_config jsonb,p_operator text)
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id = p_restaurant AND owner_tenant_id = p_tenant)
  OR p_scope NOT IN ('tenant','restaurant:' || p_restaurant::text) THEN RAISE EXCEPTION 'B724_SCOPE'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('b724:' || p_tenant,0));
 IF p_config IS NULL THEN
  DELETE FROM public.order_collection_configs WHERE tenant_id = p_tenant AND scope = p_scope;
 ELSE
  INSERT INTO public.order_collection_configs(tenant_id,scope,config,operator) VALUES(p_tenant,p_scope,p_config,p_operator)
  ON CONFLICT(tenant_id,scope) DO UPDATE SET config = excluded.config,operator = excluded.operator,updated_at = now();
 END IF;
 INSERT INTO public.order_collection_events(tenant_id,restaurant_id,action,operator,note)
 VALUES(p_tenant,p_restaurant,'config',p_operator,p_scope);
END $$;
REVOKE ALL ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.b724_order_guard(), public.b724_order_snapshot(), public.b724_item_guard(), public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text), public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text), public.restosmart_collection_config_v1(text,bigint,text,jsonb,text) TO service_role;

DO $tests$
DECLARE
 t text := 'b729-fiction-a'; u text := 'b729-fiction-b';
 r bigint := 9223372036854729001; s bigint := 9223372036854729002;
 cfg jsonb := '{"methods":[{"kind":"transferencia","alias":"b729.ficticio","account":"0000000000000000000000","holder":"COMERCIO FICTICIO"},{"kind":"externo","url":"https://b729.invalid/pago"}],"require_payment":true}';
 branch jsonb := '{"methods":[],"require_payment":false}';
 actual jsonb; rel text; rol text; priv text; sig text;
 rejected boolean; n integer := 0; events_before bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM public.restaurants WHERE id IN(r,s) OR owner_tenant_id IN(t,u))
 OR EXISTS(SELECT 1 FROM public.pedidos WHERE id IN(r,s)) THEN RAISE EXCEPTION 'B729 fixture collision'; END IF;
 INSERT INTO public.order_collection_configs(tenant_id,scope,config,operator)
 VALUES(t,'tenant',cfg,'b729-fiction-admin'),(u,'tenant',branch,'b729-fiction-admin');
 SELECT config INTO actual FROM public.order_collection_configs WHERE tenant_id=t AND scope='tenant';
 IF actual IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'FAIL A'; END IF;
 n:=n+1; RAISE NOTICE 'PASS A configuracion tenant directa; no RPC';
 -- Exact selection query from B724 triggers, not trigger invocation.
 SELECT config INTO actual FROM public.order_collection_configs WHERE tenant_id=t
 AND scope IN('tenant','restaurant:'||r::text) ORDER BY (scope <> 'tenant') DESC LIMIT 1;
 IF actual IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'FAIL B'; END IF;
 n:=n+1; RAISE NOTICE 'PASS B consulta SQL herencia';
 INSERT INTO public.order_collection_configs(tenant_id,scope,config,operator)
 VALUES(t,'restaurant:'||r::text,branch,'b729-fiction-admin');
 SELECT config INTO actual FROM public.order_collection_configs WHERE tenant_id=t
 AND scope IN('tenant','restaurant:'||r::text) ORDER BY (scope <> 'tenant') DESC LIMIT 1;
 IF actual IS DISTINCT FROM branch THEN RAISE EXCEPTION 'FAIL C'; END IF;
 n:=n+1; RAISE NOTICE 'PASS C consulta SQL override';
 IF actual->'methods' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'FAIL D'; END IF;
 n:=n+1; RAISE NOTICE 'PASS D override methods=[] sin herencia en consulta SQL';
 SELECT config INTO actual FROM public.order_collection_configs WHERE tenant_id=t AND scope='tenant';
 IF actual IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'FAIL E'; END IF;
 n:=n+1; RAISE NOTICE 'PASS E persistencia cuenta/link ficticios por tenant; no titularidad';
 SELECT config INTO actual FROM public.order_collection_configs WHERE tenant_id=u
 AND scope IN('tenant','restaurant:'||r::text) ORDER BY (scope <> 'tenant') DESC LIMIT 1;
 IF actual IS DISTINCT FROM branch THEN RAISE EXCEPTION 'FAIL K'; END IF;
 n:=n+1; RAISE NOTICE 'PASS K filtro tenant explicito; no autorizacion';
 SELECT config INTO actual FROM public.order_collection_configs WHERE tenant_id=t
 AND scope IN('tenant','restaurant:'||s::text) ORDER BY (scope <> 'tenant') DESC LIMIT 1;
 IF actual IS DISTINCT FROM cfg THEN RAISE EXCEPTION 'FAIL L'; END IF;
 n:=n+1; RAISE NOTICE 'PASS L consulta otra sucursal sin contaminar override';
 SELECT count(*) INTO events_before FROM public.order_collection_events;
 rejected:=false;
 BEGIN
  PERFORM public.restosmart_collection_config_v1(t,r,'tenant',cfg,'b729-fiction-admin');
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'B724_SCOPE' THEN RAISE; END IF;
  rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL config nonexistent branch'; END IF;
 n:=n+1; RAISE NOTICE 'PASS RPC config sucursal inexistente rechazada';
 IF (SELECT count(*) FROM public.order_collection_events) <> events_before THEN RAISE EXCEPTION 'FAIL M'; END IF;
 n:=n+1; RAISE NOTICE 'PASS M parcial rechazo sin auditoria; exito pendiente';
 rejected:=false;
 BEGIN
  PERFORM public.restosmart_collection_action_v1(t,r,r,'b7290000-0000-4000-8000-000000000001'::uuid,'declare','customer',NULL::text);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'B724_ORDER_UNAVAILABLE' THEN RAISE; END IF;
  rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL nonexistent order'; END IF;
 n:=n+1; RAISE NOTICE 'PASS RPC accion pedido inexistente rechazado; no transicion';
 FOREACH rel IN ARRAY ARRAY['order_collection_configs','order_collections','order_collection_events'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||rel)::regclass)
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=('public.'||rel)::regclass) THEN RAISE EXCEPTION 'FAIL P RLS %',rel; END IF;
  n:=n+1; RAISE NOTICE 'PASS P RLS habilitada sin politicas %',rel;
  FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(rol,'public.'||rel,priv) THEN RAISE EXCEPTION 'FAIL P % % %',rol,rel,priv; END IF;
    n:=n+1; RAISE NOTICE 'PASS P denegado % % %',rol,rel,priv;
   END LOOP;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF priv IN ('SELECT','INSERT')
       OR (priv='UPDATE' AND rel<>'order_collection_events')
       OR (priv='DELETE' AND rel='order_collection_configs')
    THEN
        IF NOT has_table_privilege('service_role','public.'||rel,priv) THEN
            RAISE EXCEPTION 'FAIL P service_role falta permiso % %',rel,priv;
        END IF;
        n:=n+1;
        RAISE NOTICE 'PASS P service_role permiso requerido % %',rel,priv;
    ELSIF has_table_privilege('service_role','public.'||rel,priv) THEN
        RAISE NOTICE 'INFO P service_role permiso adicional % %',rel,priv;
    END IF;
END LOOP;
 END LOOP;
 FOREACH sig IN ARRAY ARRAY['public.b724_order_guard()','public.b724_order_snapshot()','public.b724_item_guard()',
 'public.restosmart_create_order_collection_v1(jsonb,jsonb,boolean,text)',
 'public.restosmart_collection_action_v1(text,bigint,bigint,uuid,text,text,text)',
 'public.restosmart_collection_config_v1(text,bigint,text,jsonb,text)'] LOOP
  IF has_function_privilege('anon',sig,'EXECUTE') OR has_function_privilege('authenticated',sig,'EXECUTE')
  OR NOT has_function_privilege('service_role',sig,'EXECUTE')
  OR NOT (SELECT NOT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=sig::regprocedure) THEN
   RAISE EXCEPTION 'FAIL P function %',sig;
  END IF;
  n:=n+1; RAISE NOTICE 'PASS P funcion privilegios invoker search_path %',sig;
 END LOOP;
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH priv IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
   IF (
      rol IN ('anon','authenticated')
      AND has_sequence_privilege(rol,'public.order_collection_events_id_seq',priv)
    )
    OR (
      rol = 'service_role'
      AND priv IN ('USAGE','SELECT')
      AND NOT has_sequence_privilege(rol,'public.order_collection_events_id_seq',priv)
    ) THEN
    RAISE EXCEPTION 'FAIL P sequence % %',rol,priv;
   END IF;
   n:=n+1; RAISE NOTICE 'PASS P secuencia privilegio esperado % %',rol,priv;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'B7.29 - % pruebas realmente ejecutadas; F/G/H/I/J/N/O y auditoria exitosa NO ejecutadas',n;
END $tests$;
ROLLBACK;
SELECT 'B7.29 - ROLLBACK EJECUTADO' AS resultado;
