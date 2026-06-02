import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckoutSessionRow = {
  id: string;
  tenant_id: string;
  restaurant_id: string | null;
  kind: 'plan_change' | 'addon_activation';
  target_plan: 'esencial' | 'pro' | 'intelligence' | null;
  addon_key: 'multi_brand' | 'whatsapp_delivery' | null;
  status: string;
  external_reference: string;
};

function getSignatureParts(xSignature: string | null) {
  const parts = new Map<string, string>();

  for (const part of String(xSignature ?? '').split(',')) {
    const [key, value] = part.split('=');
    if (key && value) {
      parts.set(key.trim(), value.trim());
    }
  }

  return {
    ts: parts.get('ts') ?? null,
    v1: parts.get('v1') ?? null,
  };
}

function verifyMercadoPagoSignature(request: NextRequest, dataId: string | null) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return true;
  }

  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const { ts, v1 } = getSignatureParts(xSignature);

  if (!dataId || !xRequestId || !ts || !v1) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(manifest);
  const hash = hmac.digest('hex');

  return hash === v1;
}

async function setTenantAddon(
  tenantId: string,
  addonKey: string,
  enabled: boolean
) {
  const { data: existing, error: readError } = await supabaseAdmin
    .from('tenant_addons')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('addon_key', addonKey)
    .maybeSingle();

  if (readError) throw readError;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('tenant_addons')
      .update({
        enabled,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('tenant_addons').insert([
    {
      tenant_id: tenantId,
      addon_key: addonKey,
      enabled,
    },
  ]);

  if (error) throw error;
}

async function applyApprovedCheckout(session: CheckoutSessionRow) {
  if (session.kind === 'plan_change') {
    if (!session.target_plan) {
      throw new Error('La sesión de checkout no tiene target_plan.');
    }

    const { error } = await supabaseAdmin
      .from('restaurants')
      .update({
        plan: session.target_plan,
      })
      .eq('owner_tenant_id', session.tenant_id);

    if (error) throw error;

    return;
  }

  if (session.kind === 'addon_activation') {
    if (!session.addon_key) {
      throw new Error('La sesión de checkout no tiene addon_key.');
    }

    await setTenantAddon(session.tenant_id, session.addon_key, true);
  }
}

export async function POST(request: NextRequest) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Mercado Pago no está configurado.' },
      { status: 503 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const queryDataId =
    searchParams.get('data.id') ??
    searchParams.get('id') ??
    searchParams.get('payment_id');

  const body = await request.json().catch(() => null);

  const bodyDataId =
    body?.data?.id != null
      ? String(body.data.id)
      : body?.id != null
      ? String(body.id)
      : null;

  const paymentId = queryDataId ?? bodyDataId;

  const topic =
    searchParams.get('type') ??
    searchParams.get('topic') ??
    body?.type ??
    body?.topic ??
    '';

  if (topic && topic !== 'payment') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!paymentId) {
    return NextResponse.json(
      { error: 'Webhook sin ID de pago.' },
      { status: 400 }
    );
  }

  if (!verifyMercadoPagoSignature(request, queryDataId ?? paymentId)) {
    return NextResponse.json(
      { error: 'Firma de Mercado Pago inválida.' },
      { status: 401 }
    );
  }

  const paymentRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const payment = await paymentRes.json().catch(() => null);

  if (!paymentRes.ok) {
    console.error('No se pudo consultar pago Mercado Pago:', payment);
    return NextResponse.json(
      { error: 'No se pudo consultar el pago.' },
      { status: 502 }
    );
  }

  const externalReference = String(payment?.external_reference ?? '').trim();

  if (!externalReference) {
    return NextResponse.json(
      { error: 'Pago sin external_reference.' },
      { status: 400 }
    );
  }

  const { data: checkoutSession, error: sessionError } = await supabaseAdmin
    .from('billing_checkout_sessions')
    .select(
      'id, tenant_id, restaurant_id, kind, target_plan, addon_key, status, external_reference'
    )
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (sessionError) {
    throw sessionError;
  }

  if (!checkoutSession) {
    return NextResponse.json(
      { error: 'No existe sesión de checkout para este pago.' },
      { status: 404 }
    );
  }

  const session = checkoutSession as CheckoutSessionRow;

  if (session.status === 'approved') {
    return NextResponse.json({
      ok: true,
      already_processed: true,
    });
  }

  const paymentStatus = String(payment?.status ?? '').trim().toLowerCase();

  if (paymentStatus !== 'approved') {
    await supabaseAdmin
      .from('billing_checkout_sessions')
      .update({
        status:
          paymentStatus === 'rejected' ||
          paymentStatus === 'cancelled' ||
          paymentStatus === 'expired'
            ? paymentStatus
            : 'pending',
        mp_payment_id: String(payment?.id ?? paymentId),
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    return NextResponse.json({
      ok: true,
      payment_status: paymentStatus,
      activated: false,
    });
  }

  await applyApprovedCheckout(session);

  await supabaseAdmin
    .from('billing_checkout_sessions')
    .update({
      status: 'approved',
      mp_payment_id: String(payment?.id ?? paymentId),
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  return NextResponse.json({
    ok: true,
    payment_status: paymentStatus,
    activated: true,
    kind: session.kind,
    tenantId: session.tenant_id,
  });
}