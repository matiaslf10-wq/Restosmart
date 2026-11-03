CREATE OR REPLACE FUNCTION public.restosmart_collection_action_v1(p_tenant text,p_restaurant bigint,p_order bigint,p_token uuid,p_action text,p_operator text,p_note text DEFAULT NULL)
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
  IF p.state NOT IN ('pending','declared') THEN RAISE EXCEPTION 'B724_TRANSITION'; END IF;
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


UPDATE public.order_collection_configs SET config = jsonb_build_object(
 'require_payment',false,
 'methods', jsonb_build_array(jsonb_build_object('kind','efectivo','label','Efectivo')) ||
 COALESCE((SELECT jsonb_agg(m) FROM jsonb_array_elements(config->'methods') m WHERE m->>'kind'='transferencia'),'[]'::jsonb)
);
NOTIFY pgrst,'reload schema';

