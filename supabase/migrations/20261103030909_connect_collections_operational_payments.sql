SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.b762l_assert_payment(p_order bigint,p_restaurant bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.order_collections%ROWTYPE;
BEGIN
 IF current_user::text <> 'service_role' THEN RAISE EXCEPTION 'B762L_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.order_collections WHERE order_id=p_order AND restaurant_id=p_restaurant FOR UPDATE;
 IF FOUND AND p.require_payment AND p.state <> 'confirmed' THEN RAISE EXCEPTION 'B724_PAYMENT_REQUIRED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.b762l_assert_payment(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.b762l_assert_payment(bigint,bigint) TO service_role;
CREATE FUNCTION public.restosmart_check_payment_before_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.estado IS DISTINCT FROM OLD.estado AND NEW.estado IN ('entregado','cerrado') AND EXISTS(
 SELECT 1 FROM public.order_collections WHERE order_id=NEW.id AND state <> 'confirmed'
 ) THEN RAISE EXCEPTION 'Verificá el cobro antes de entregar el pedido.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.restosmart_check_payment_before_delivery() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restosmart_check_payment_before_delivery() TO service_role;
CREATE TRIGGER restosmart_check_payment_before_delivery BEFORE UPDATE ON public.pedidos
FOR EACH ROW EXECUTE FUNCTION public.restosmart_check_payment_before_delivery();
NOTIFY pgrst,'reload schema';

