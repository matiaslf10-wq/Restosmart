import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizePlan, type PlanCode } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminUserTenantRow = {
  id: string | number;
  email: string | null;
  tenant_id: string | null;
};

type CheckoutBody = {
  plan?: PlanCode | string;
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
};

const BILLABLE_PLANS: PlanCode[] = ['pro', 'intelligence'];

const PLAN_PRICES: Record<Exclude<PlanCode, 'esencial'>, number> = {
  pro: 24900,
  intelligence: 49900,
};

function normalizeNonEmptyString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function getMercadoPagoAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error('Falta MERCADOPAGO_ACCESS_TOKEN.');
  }

  return token;
}

function getPlanTitle(plan: PlanCode) {
  if (plan === 'intelligence') return 'RestoSmart Intelligence';
  if (plan === 'pro') return 'RestoSmart Pro';
  return 'RestoSmart Esencial';
}

function getPlanDescription(plan: PlanCode) {
  if (plan === 'intelligence') {
    return 'Plan Intelligence de RestoSmart con analytics avanzado y operación multi-sucursal ampliada.';
  }

  if (plan === 'pro') {
    return 'Plan Pro de RestoSmart con stock, reportes operativos y hasta 3 sucursales.';
  }

  return 'Plan Esencial de RestoSmart.';
}

async function getTenantIdForAdminSession(session: unknown) {
  const sessionRecord =
    session && typeof session === 'object' && !Array.isArray(session)
      ? (session as Record<string, unknown>)
      : null;

  const tenantFromSession = normalizeNonEmptyString(
    sessionRecord?.tenantId ?? sessionRecord?.tenant_id
  );

  if (tenantFromSession) return tenantFromSession;

  const adminId = normalizeNonEmptyString(sessionRecord?.adminId);
  const email = normalizeNonEmptyString(sessionRecord?.email);

  let query = supabaseAdmin
    .from('admin_users')
    .select('id, email, tenant_id')
    .limit(1);

  if (adminId) {
    query = query.eq('id', adminId);
  } else if (email) {
    query = query.ilike('email', email);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('No se pudo leer tenant_id del admin:', error);
    return null;
  }

  const adminUser = (data ?? null) as AdminUserTenantRow | null;

  return normalizeNonEmptyString(adminUser?.tenant_id);
}

export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as CheckoutBody | null;
    const requestedPlan = normalizePlan(body?.plan);

    if (!BILLABLE_PLANS.includes(requestedPlan)) {
      return NextResponse.json(
        {
          error:
            'Solo los planes Pro e Intelligence requieren checkout de Mercado Pago.',
        },
        { status: 400 }
      );
    }

    const tenantId = await getTenantIdForAdminSession(auth.session);

    if (!tenantId) {
      return NextResponse.json(
        { error: 'No se pudo identificar el tenant para iniciar el pago.' },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const externalReference = `${tenantId}:${requestedPlan}:${Date.now()}`;

    const unitPrice =
      requestedPlan === 'intelligence'
        ? PLAN_PRICES.intelligence
        : PLAN_PRICES.pro;

    const preferencePayload = {
      items: [
        {
          id: requestedPlan,
          title: getPlanTitle(requestedPlan),
          description: getPlanDescription(requestedPlan),
          quantity: 1,
          currency_id: 'ARS',
          unit_price: unitPrice,
        },
      ],
      external_reference: externalReference,
      metadata: {
        tenant_id: tenantId,
        plan: requestedPlan,
      },
      back_urls: {
        success: `${appUrl}/inicio?billing=success`,
        failure: `${appUrl}/inicio?billing=failure`,
        pending: `${appUrl}/inicio?billing=pending`,
      },
      notification_url: `${appUrl}/api/mercadopago/webhook`,
      auto_return: 'approved',
    };

    const mpRes = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getMercadoPagoAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferencePayload),
      }
    );

    const mpBody =
      (await mpRes.json().catch(() => null)) as MercadoPagoPreferenceResponse | null;

    if (!mpRes.ok || !mpBody?.id) {
      console.error('Mercado Pago preference error:', {
        status: mpRes.status,
        body: mpBody,
      });

      return NextResponse.json(
        { error: 'No se pudo crear la preferencia de Mercado Pago.' },
        { status: 502 }
      );
    }

    const checkoutUrl =
      mpBody.init_point || mpBody.sandbox_init_point || null;

    if (!checkoutUrl) {
      return NextResponse.json(
        { error: 'Mercado Pago no devolvió URL de checkout.' },
        { status: 502 }
      );
    }

    const { error: subscriptionError } = await supabaseAdmin
      .from('tenant_subscriptions')
      .upsert(
        {
          tenant_id: tenantId,
          plan: requestedPlan,
          status: 'pending_payment',
          provider: 'mercadopago',
          external_reference: externalReference,
          mp_preference_id: mpBody.id,
          checkout_url: checkoutUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'tenant_id',
        }
      );

    if (subscriptionError) {
      console.error('No se pudo actualizar tenant_subscriptions:', subscriptionError);

      return NextResponse.json(
        { error: 'No se pudo registrar la suscripción pendiente.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      plan: requestedPlan,
      status: 'pending_payment',
      preferenceId: mpBody.id,
      checkoutUrl,
    });
  } catch (error) {
    console.error('POST /api/admin/billing/checkout', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo iniciar el checkout.',
      },
      { status: 500 }
    );
  }
}