-- Install B7.24; no historical order backfill.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
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
NOTIFY pgrst, 'reload schema';

