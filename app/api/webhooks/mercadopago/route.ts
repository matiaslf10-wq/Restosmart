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
  amount: number;
  currency: string;
  mp_preference_id: string | null;
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

  // B7: nunca aceptar un webhook si falta la clave de verificacion.
  if (!secret) {
    return false;
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
      'id, tenant_id, restaurant_id, kind, target_plan, addon_key, status, external_reference, amount, currency, mp_preference_id'
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

  // B7.22O: validar los valores reales del pago antes de activar beneficios.
  const expectedAmount = Number(session.amount);
  const paidAmount = Number(payment?.transaction_amount);
  const expectedCurrency = String(session.currency ?? '').trim().toUpperCase();
  const paidCurrency = String(payment?.currency_id ?? '').trim().toUpperCase();
  const paidPreferenceId = String(payment?.preference_id ?? '').trim();
  const expectedPreferenceId = String(session.mp_preference_id ?? '').trim();

  if (
    !Number.isFinite(expectedAmount) ||
    !Number.isFinite(paidAmount) ||
    expectedAmount <= 0 ||
    paidAmount <= 0 ||
    Math.abs(expectedAmount - paidAmount) > 0.005 ||
    expectedCurrency !== 'ARS' ||
    paidCurrency !== expectedCurrency ||
    (expectedPreferenceId && paidPreferenceId && paidPreferenceId !== expectedPreferenceId)
  ) {
    console.error('Mercado Pago: discrepancia de importe, moneda o preferencia', {
      checkoutSessionId: session.id,
      paymentId: String(payment?.id ?? paymentId),
    });

    return NextResponse.json(
      { error: 'El pago no coincide con la sesion de checkout.' },
      { status: 409 }
    );
  }

  const paymentStatus = String(payment?.status ?? '').trim().toLowerCase();

  if (paymentStatus !== 'approved') {
    // Los estados no aprobados no activan beneficios ni cierran
    // la sesion. Una notificacion posterior approved puede ser valida.
    // Tampoco se reserva mp_payment_id antes de la aprobacion atomica.
    return NextResponse.json({
      ok: true,
      payment_status: paymentStatus,
      activated: false,
      checkout_status_unchanged: true,
    });
  }
  // B7.22S: aprobacion atomica controlada en PostgreSQL.
  const { data: result, error: rpcError } = await supabaseAdmin.rpc(
    'restosmart_apply_billing_payment_v1',
    {
      p_external_reference: session.external_reference,
      p_payment_id: String(payment?.id ?? paymentId),
      p_amount: paidAmount,
      p_currency: paidCurrency,
      p_preference_id: paidPreferenceId || null,
    }
  );

  if (rpcError) {
    console.error('Error de aplicacion atomica Mercado Pago:', {
      code: rpcError.code,
      checkoutSessionId: session.id,
    });
    return NextResponse.json(
      { error: 'No se pudo aplicar el pago de forma segura.' },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    activated: true,
    already_processed: Boolean(result?.already_processed),
  });
}
