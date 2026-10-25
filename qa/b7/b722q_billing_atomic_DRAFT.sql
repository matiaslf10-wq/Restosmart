-- B7.22Q - BORRADOR LOCAL. NO EJECUTAR EN PRODUCCION.
-- RPC interna, invocada exclusivamente por service_role después
-- de verificar la notificacion contra la API de Mercado Pago.
--
-- Pendiente antes de instalar: revisar migraciones, concurrencia
-- entre checkouts y regresiones de facturación.

CREATE OR REPLACE FUNCTION public.restosmart_apply_billing_payment_v1(
    p_external_reference text,
    p_payment_id text,
    p_amount numeric,
    p_currency text,
    p_preference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_session public.billing_checkout_sessions%ROWTYPE;
    v_existing_payment uuid;
    v_now timestamptz := clock_timestamp();
    v_subscription_paid_at timestamptz;
BEGIN
    IF nullif(btrim(p_external_reference), '') IS NULL
       OR nullif(btrim(p_payment_id), '') IS NULL
       OR p_amount IS NULL OR p_amount <= 0
       OR upper(coalesce(p_currency, '')) <> 'ARS'
    THEN
        RAISE EXCEPTION 'BILLING_INVALID_PAYMENT';
    END IF;

    -- Serializar decisiones para un tenant y evitar doble uso de
    -- un ID de pago. La comprobación del pago se hará nuevamente
    -- dentro de los bloqueos.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('restosmart:payment:' || p_payment_id, 0)
    );

    SELECT *
      INTO v_session
      FROM public.billing_checkout_sessions
     WHERE external_reference = p_external_reference;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BILLING_CHECKOUT_NOT_FOUND';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('restosmart:tenant:' || v_session.tenant_id, 0)
    );

    SELECT *
      INTO v_session
      FROM public.billing_checkout_sessions
     WHERE external_reference = p_external_reference
     FOR UPDATE;

    SELECT id
      INTO v_existing_payment
      FROM public.billing_checkout_sessions
     WHERE mp_payment_id = p_payment_id
       AND id <> v_session.id
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'BILLING_PAYMENT_REUSED';
    END IF;

    IF v_session.status = 'approved' THEN
        IF v_session.mp_payment_id = p_payment_id THEN
            RETURN pg_catalog.jsonb_build_object(
                'ok', true, 'already_processed', true
            );
        END IF;

        RAISE EXCEPTION 'BILLING_ALREADY_APPROVED_DIFFERENT_PAYMENT';
    END IF;

    IF v_session.status <> 'pending' THEN
        RAISE EXCEPTION 'BILLING_CHECKOUT_NOT_PENDING';
    END IF;

    IF p_amount <> v_session.amount
       OR upper(coalesce(v_session.currency, '')) <> upper(p_currency)
       OR (
           v_session.mp_preference_id IS NOT NULL
           AND p_preference_id IS NOT NULL
           AND v_session.mp_preference_id <> p_preference_id
       )
    THEN
        RAISE EXCEPTION 'BILLING_PAYMENT_MISMATCH';
    END IF;

    IF v_session.kind = 'plan_change' THEN
        IF v_session.target_plan NOT IN ('esencial', 'pro', 'intelligence') THEN
            RAISE EXCEPTION 'BILLING_INVALID_PLAN';
        END IF;

        SELECT paid_at
          INTO v_subscription_paid_at
          FROM public.tenant_subscriptions
         WHERE tenant_id = v_session.tenant_id
         FOR UPDATE;

        -- No permitir que un checkout anterior a un pago ya
        -- aplicado cambie nuevamente el plan del tenant.
        IF v_subscription_paid_at IS NOT NULL
           AND v_session.created_at < v_subscription_paid_at
        THEN
            RAISE EXCEPTION 'BILLING_STALE_CHECKOUT';
        END IF;

        INSERT INTO public.tenant_subscriptions (
            tenant_id, plan, status, provider,
            external_reference, paid_at, updated_at
        )
        VALUES (
            v_session.tenant_id, v_session.target_plan,
            'active', 'mercadopago',
            v_session.external_reference, v_now, v_now
        )
        ON CONFLICT (tenant_id) DO UPDATE
          SET plan = EXCLUDED.plan,
              status = 'active',
              provider = 'mercadopago',
              external_reference = EXCLUDED.external_reference,
paid_at = EXCLUDED.paid_at,
              updated_at = EXCLUDED.updated_at;

        UPDATE public.restaurants
           SET plan = v_session.target_plan,
               updated_at = v_now
         WHERE owner_tenant_id = v_session.tenant_id
           AND estado <> 'cerrado';

    ELSIF v_session.kind = 'addon_activation' THEN
        IF v_session.addon_key <> 'multi_brand' THEN
            RAISE EXCEPTION 'BILLING_ADDON_NOT_SUPPORTED';
        END IF;

        INSERT INTO public.tenant_addons (
            tenant_id, addon_key, enabled, actualizado_en
        )
        VALUES (
            v_session.tenant_id, v_session.addon_key,
            true, v_now
        )
        ON CONFLICT (tenant_id, addon_key) DO UPDATE
          SET enabled = true,
              actualizado_en = EXCLUDED.actualizado_en;
    ELSE
        RAISE EXCEPTION 'BILLING_INVALID_KIND';
    END IF;

    UPDATE public.billing_checkout_sessions
       SET status = 'approved',
           mp_payment_id = p_payment_id,
           approved_at = v_now,
           updated_at = v_now
     WHERE id = v_session.id;

    RETURN pg_catalog.jsonb_build_object(
        'ok', true,
        'already_processed', false,
        'checkout_id', v_session.id,
        'tenant_id', v_session.tenant_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.restosmart_apply_billing_payment_v1(
    text, text, numeric, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.restosmart_apply_billing_payment_v1(
    text, text, numeric, text, text
) TO service_role;

-- B7.22Z: impedir reutilizacion de identificadores de pago.
CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_sessions_mp_payment_id_unique
ON public.billing_checkout_sessions (mp_payment_id)
WHERE mp_payment_id IS NOT NULL
  AND btrim(mp_payment_id) <> '';
