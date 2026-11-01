-- Fragmento solo para ensayo.sql dentro de BEGIN / ROLLBACK.
CREATE OR REPLACE FUNCTION public.b762l_authorize(p_admin_id text,p_email text,p_tenant text,p_restaurant bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE trusted_role oid;
BEGIN
  -- Read the installed function metadata, never a caller-controlled session GUC/JWT.
  SELECT o.option_value::oid INTO trusted_role
    FROM pg_catalog.pg_proc f
    CROSS JOIN LATERAL pg_catalog.pg_options_to_table(f.proconfig) o
    WHERE f.oid = 'public.b762l_authorize(text,text,text,bigint)'::regprocedure
      AND o.option_name = 'b764.server_role_oid';
  IF trusted_role IS NULL OR trusted_role IS DISTINCT FROM
      (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'B762L_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_admin_id IS NULL OR p_email IS NULL OR p_tenant IS NULL OR p_restaurant IS NULL
     OR p_restaurant <= 0 OR length(trim(p_tenant)) = 0 THEN
    RAISE EXCEPTION 'B762L_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.admin_users WHERE id::text = p_admin_id
    AND lower(trim(email)) = lower(trim(p_email)) AND tenant_id = p_tenant AND activo IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B762L_DENIED' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.restaurants WHERE id = p_restaurant AND owner_tenant_id = p_tenant
    AND estado IN ('activo','pausado') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B762L_DENIED' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.b762l_authorize(text,text,text,bigint) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.restosmart_kitchen_b762l_v1(
  p_admin_id text, p_email text, p_tenant text,
  p_restaurant bigint, p_pedido_id bigint, p_expected_estado text,
  p_expected_items jsonb, p_action text, p_estado text, p_item_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_order public.pedidos%ROWTYPE;
  v_item public.items_pedido%ROWTYPE;
  v_snapshot jsonb;
  v_match text[];
  v_next text;
  v_comment text;
  v_count integer;
BEGIN
  PERFORM public.b762l_authorize(p_admin_id,p_email,p_tenant,p_restaurant);
  IF p_pedido_id IS NULL OR p_pedido_id <= 0 OR (p_item_id IS NOT NULL AND p_item_id <= 0) THEN
    RAISE EXCEPTION 'B762L_VALIDATION' USING ERRCODE = '22023';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('cocina', 'enviar_cocina')
     OR (p_action = 'cocina' AND (p_estado IS NULL OR p_estado NOT IN ('en_preparacion', 'listo')))
     OR p_expected_items IS NULL OR jsonb_typeof(p_expected_items) <> 'array' THEN
    RAISE EXCEPTION 'B762L_VALIDATION' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.pedidos
    WHERE id = p_pedido_id AND restaurant_id = p_restaurant FOR UPDATE;
  IF NOT FOUND OR v_order.estado IS DISTINCT FROM p_expected_estado
     OR v_order.estado NOT IN ('solicitado', 'pendiente', 'en_preparacion', 'listo') THEN
    RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE = '40001';
  END IF;
  -- Current verified installation has no C. Preserve that legacy policy.
  -- An unexpected/new ledger requires the separately reviewed payment adapter.
  IF pg_catalog.to_regprocedure('public.b762l_assert_payment(bigint,bigint)') IS NOT NULL THEN
    EXECUTE 'SELECT public.b762l_assert_payment($1,$2)' USING p_pedido_id,p_restaurant;
  ELSIF pg_catalog.to_regclass('public.order_collections') IS NOT NULL THEN
    RAISE EXCEPTION 'B762L_DEPENDENCY' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_expected_items) AS e(value)
      WHERE pg_catalog.jsonb_typeof(value) <> 'object'
         OR pg_catalog.jsonb_typeof(value->'id') IS DISTINCT FROM 'number'
         OR (value->>'id') !~ '^[1-9][0-9]*$'
         OR NOT (value ? 'comentarios')
         OR pg_catalog.jsonb_typeof(value->'comentarios') NOT IN ('null','string')) THEN
    RAISE EXCEPTION 'B762L_VALIDATION' USING ERRCODE = '22023';
  END IF;
  PERFORM id FROM public.items_pedido WHERE pedido_id = p_pedido_id ORDER BY id FOR UPDATE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'comentarios', comentarios) ORDER BY id), '[]'::jsonb)
    INTO v_snapshot FROM public.items_pedido WHERE pedido_id = p_pedido_id;
  -- Normalizar orden sin perder duplicados: un duplicado o conjunto incompleto falla.
  IF v_snapshot IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY (value->>'id')::bigint), '[]'::jsonb)
      FROM jsonb_array_elements(p_expected_items)) THEN
    RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF p_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.items_pedido
      WHERE id = p_item_id AND pedido_id = p_pedido_id) THEN
    RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE = '40001';
  END IF;
  FOR v_item IN SELECT * FROM public.items_pedido WHERE pedido_id = p_pedido_id
      AND (p_item_id IS NULL OR id = p_item_id) ORDER BY id LOOP
    v_match := regexp_match(coalesce(v_item.comentarios, ''),
      '^\[\[COCINA:(pendiente|en_preparacion|listo)\]\]\s*([\s\S]*)$', 'i');
    IF p_action = 'enviar_cocina' AND v_match IS NOT NULL THEN CONTINUE; END IF;
    IF p_action = 'cocina' AND (v_match IS NULL OR lower(v_match[1]) = 'listo'
        OR (p_estado = 'en_preparacion' AND lower(v_match[1]) <> 'pendiente')) THEN CONTINUE; END IF;
    v_next := CASE WHEN p_action = 'enviar_cocina' THEN 'pendiente' ELSE p_estado END;
    v_comment := CASE WHEN v_match IS NULL THEN coalesce(v_item.comentarios, '') ELSE v_match[2] END;
    UPDATE public.items_pedido SET comentarios = '[[COCINA:' || v_next || ']]'
      || CASE WHEN v_comment = '' THEN '' ELSE ' ' || v_comment END
      WHERE id = v_item.id AND pedido_id = p_pedido_id
        AND comentarios IS NOT DISTINCT FROM v_item.comentarios;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 1 THEN RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE = '40001'; END IF;
  END LOOP;
  UPDATE public.pedidos SET estado = CASE WHEN p_action = 'enviar_cocina' THEN 'en_preparacion' ELSE p_estado END
    WHERE id = p_pedido_id AND restaurant_id = p_restaurant AND estado = p_expected_estado;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE = '40001'; END IF;
  -- Sin EXCEPTION que absorba errores: fallo de ítem/pedido/trigger aborta todo.
  RETURN jsonb_build_object('ok', true);
END;
$$;
-- Included by prepare-sql.cjs inside the rollback-only core review transaction.
-- Keeps the current state/cash/close response contract with all-or-nothing batches.
CREATE OR REPLACE FUNCTION public.restosmart_orders_b762l_v1(
 p_admin_id text,p_email text,p_tenant text,p_restaurant bigint,
 p_action text,p_estado text,p_expected_orders jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE e jsonb; p public.pedidos%ROWTYPE; affected integer; expected_count integer;
BEGIN
 PERFORM public.b762l_authorize(p_admin_id,p_email,p_tenant,p_restaurant);
 IF p_action IS NULL OR p_action NOT IN ('estado','caja','cerrar')
    OR (p_action='estado' AND (p_estado IS NULL OR p_estado NOT IN ('pendiente','en_preparacion','listo','entregado','cancelado')))
    OR p_expected_orders IS NULL OR jsonb_typeof(p_expected_orders)<>'array' THEN
   RAISE EXCEPTION 'B762L_VALIDATION' USING ERRCODE='22023';
 END IF;
 expected_count:=jsonb_array_length(p_expected_orders);
 IF expected_count NOT BETWEEN 1 AND 100 OR EXISTS (
   SELECT 1 FROM jsonb_array_elements(p_expected_orders) s(value)
   WHERE jsonb_typeof(value)<>'object' OR jsonb_typeof(value->'id') IS DISTINCT FROM 'number'
     OR (value->>'id') !~ '^[1-9][0-9]*$'
     OR jsonb_typeof(value->'estado') IS DISTINCT FROM 'string'
 ) THEN RAISE EXCEPTION 'B762L_VALIDATION' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT (value->>'id')::bigint) FROM jsonb_array_elements(p_expected_orders))<>expected_count THEN
   RAISE EXCEPTION 'B762L_VALIDATION' USING ERRCODE='22023';
 END IF;
 -- Lock every parent in deterministic order before writing or taking C locks.
 FOR e IN SELECT value FROM jsonb_array_elements(p_expected_orders) ORDER BY (value->>'id')::bigint LOOP
   SELECT * INTO p FROM public.pedidos WHERE id=(e->>'id')::bigint AND restaurant_id=p_restaurant FOR UPDATE;
   IF NOT FOUND OR p.estado IS DISTINCT FROM e->>'estado'
      OR p.estado NOT IN ('solicitado','pendiente','en_preparacion','listo') THEN
     RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE='40001';
   END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p_expected_orders) ORDER BY (value->>'id')::bigint LOOP
   -- Same payment rule as the original route; caja/cancel do not confirm money.
   IF p_action='cerrar' OR (p_action='estado' AND p_estado<>'cancelado') THEN
     IF pg_catalog.to_regprocedure('public.b762l_assert_payment(bigint,bigint)') IS NOT NULL THEN
       EXECUTE 'SELECT public.b762l_assert_payment($1,$2)' USING (e->>'id')::bigint,p_restaurant;
     ELSIF pg_catalog.to_regclass('public.order_collections') IS NOT NULL THEN
       RAISE EXCEPTION 'B762L_DEPENDENCY' USING ERRCODE='55000';
     END IF;
   END IF;
   IF p_action='caja' THEN
     UPDATE public.pedidos SET pasado_a_caja=true
       WHERE id=(e->>'id')::bigint AND restaurant_id=p_restaurant AND estado=e->>'estado';
   ELSIF p_action='cerrar' THEN
     UPDATE public.pedidos SET estado='cerrado',pasado_a_caja=false
       WHERE id=(e->>'id')::bigint AND restaurant_id=p_restaurant AND estado=e->>'estado';
   ELSE
     UPDATE public.pedidos SET estado=p_estado
       WHERE id=(e->>'id')::bigint AND restaurant_id=p_restaurant AND estado=e->>'estado';
   END IF;
   GET DIAGNOSTICS affected=ROW_COUNT;
   IF affected<>1 THEN RAISE EXCEPTION 'B762L_CONFLICT' USING ERRCODE='40001'; END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.restosmart_orders_b762l_v1(text,text,text,bigint,text,text,jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.restosmart_kitchen_b762l_v1(text,text,text,bigint,bigint,text,jsonb,text,text,bigint) FROM PUBLIC;

-- Remove inherited default EXECUTE grants as well as PUBLIC access on these NEW functions.
-- Granting application execution is deliberately a separate, pending ACL decision.
DO $acl$
DECLARE f regprocedure; r record;
BEGIN
 FOREACH f IN ARRAY ARRAY[
  'public.b762l_authorize(text,text,text,bigint)'::regprocedure,
  'public.restosmart_kitchen_b762l_v1(text,text,text,bigint,bigint,text,jsonb,text,text,bigint)'::regprocedure,
  'public.restosmart_orders_b762l_v1(text,text,text,bigint,text,text,jsonb)'::regprocedure
 ] LOOP
  FOR r IN SELECT DISTINCT x.grantee,roles.rolname FROM pg_catalog.pg_proc p,
   LATERAL pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) x
   LEFT JOIN pg_catalog.pg_roles roles ON roles.oid=x.grantee
   WHERE p.oid=f AND x.grantee<>p.proowner LOOP
   IF r.grantee=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
   ELSE EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,r.rolname); END IF;
  END LOOP;
 END LOOP;
END $acl$;
-- No GRANT: application role and required table SELECT/UPDATE + RLS must be reviewed.
-- Trusted server only: authority parameters are NOT suitable for anon/authenticated clients.
-- Pin the reviewed role in function metadata. Session SET/set_config cannot change this guard.
DO $pin$
DECLARE server_role oid;
BEGIN
 SELECT oid INTO STRICT server_role FROM pg_catalog.pg_roles
 WHERE rolname = current_setting('b764.reviewed_server_role');
 EXECUTE pg_catalog.format('ALTER FUNCTION public.b762l_authorize(text,text,text,bigint) SET b764.server_role_oid = %L',server_role::text);
END $pin$;
