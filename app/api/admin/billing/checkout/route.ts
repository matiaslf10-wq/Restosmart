import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  getFallbackAdminAccess,
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizePlan, type PlanCode } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckoutKind = 'plan_change' | 'addon_activation';
type AddonKey = 'multi_brand' | 'whatsapp_delivery';

type CheckoutBody = {
  kind?: CheckoutKind;
  plan?: PlanCode | string;
  target_plan?: PlanCode | string;
  addon_key?: AddonKey | string;
};

type MercadoPagoPreferenceResponse = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
  message?: string;
};

type BillablePlan = Exclude<PlanCode, 'esencial'>;

const BILLABLE_PLANS: BillablePlan[] = ['pro', 'intelligence'];

const PLAN_PRICES: Record<BillablePlan, number> = {
  pro: 35000,
  intelligence: 50000,
};

function isBillablePlan(value: unknown): value is BillablePlan {
  return value === 'pro' || value === 'intelligence';
}

const MULTI_BRAND_PRICES: Record<Exclude<PlanCode, 'esencial'>, number> = {
  pro: 15000,
  intelligence: 25000,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeNonEmptyString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (normalized) return normalized;
  }

  return null;
}

function isAddonKey(value: unknown): value is AddonKey {
  return value === 'multi_brand' || value === 'whatsapp_delivery';
}

function getAppUrl() {
  const vercelUrl = process.env.VERCEL_URL?.trim();

  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (vercelUrl ? `https://${vercelUrl}` : '') ||
    'http://localhost:3000';

  return raw.replace(/\/$/, '');
}

function getMercadoPagoAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

  if (!token) {
    throw new Error('Falta MERCADOPAGO_ACCESS_TOKEN.');
  }

  return token;
}

function formatPlanName(plan: PlanCode) {
  if (plan === 'intelligence') return 'Intelligence';
  if (plan === 'pro') return 'Pro';
  return 'Esencial';
}

function getPlanTitle(plan: PlanCode) {
  return `RestoSmart - Plan ${formatPlanName(plan)}`;
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

function getAddonTitle(addonKey: AddonKey) {
  if (addonKey === 'multi_brand') return 'RestoSmart - Add-on Multimarca';
  return 'RestoSmart - Add-on WhatsApp Delivery';
}

function getAddonDescription(addonKey: AddonKey, plan: PlanCode) {
  if (addonKey === 'multi_brand') {
    return plan === 'intelligence'
      ? 'Add-on Multimarca para Intelligence con marcas ilimitadas.'
      : 'Add-on Multimarca para Pro con hasta 3 marcas activas.';
  }

  return 'Add-on WhatsApp Delivery para RestoSmart.';
}

function extractRequestedTenantContext(
  request: NextRequest,
  session: unknown
): AdminAccessResolutionOptions {
  const sessionRecord = asRecord(session);
  const restaurantRecord = asRecord(sessionRecord?.restaurant);

  const tenantSlug = pickFirstString(
    request.nextUrl.searchParams.get('tenant'),
    request.nextUrl.searchParams.get('tenantSlug'),
    request.nextUrl.searchParams.get('slug'),
    request.nextUrl.searchParams.get('restaurant'),
    request.nextUrl.searchParams.get('restaurantSlug'),
    request.headers.get('x-tenant-id'),
    request.headers.get('x-tenant-slug'),
    request.cookies.get('tenant')?.value,
    request.cookies.get('tenant_slug')?.value,
    restaurantRecord?.slug,
    sessionRecord?.tenantId,
    sessionRecord?.tenant_id,
    sessionRecord?.slug
  );

  const restaurantId = pickFirstString(
    request.nextUrl.searchParams.get('restaurantId'),
    request.nextUrl.searchParams.get('restaurant_id'),
    request.headers.get('x-restaurant-id'),
    request.cookies.get('restaurant_id')?.value,
    restaurantRecord?.id,
    sessionRecord?.restaurantId,
    sessionRecord?.restaurant_id
  );

  return {
    tenantSlug,
    restaurantId,
  };
}

async function resolveAccessForRequest(request: NextRequest, session: unknown) {
  const requestedContext = extractRequestedTenantContext(request, session);

  try {
    return await resolveAdminAccess(requestedContext);
  } catch (error) {
    console.error('POST /api/admin/billing/checkout access error:', error);
    return getFallbackAdminAccess();
  }
}

function resolveCheckoutIntent(body: CheckoutBody | null) {
  const explicitKind = body?.kind;

  if (explicitKind === 'addon_activation') {
    return {
      kind: 'addon_activation' as const,
      targetPlan: null,
      addonKey: normalizeNonEmptyString(body?.addon_key),
    };
  }

  const rawPlan = normalizeNonEmptyString(body?.target_plan ?? body?.plan);

  return {
    kind: 'plan_change' as const,
    targetPlan: rawPlan ? normalizePlan(rawPlan) : null,
    addonKey: null,
  };
}

export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  let body: CheckoutBody | null = null;

  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    body = null;
  }

  try {
    const accessToken = getMercadoPagoAccessToken();
    const access = await resolveAccessForRequest(request, auth.session);

    const intent = resolveCheckoutIntent(body);

    let title = '';
    let description = '';
    let amount = 0;
    let targetPlan: PlanCode | null = null;
    let addonKey: AddonKey | null = null;

    if (intent.kind === 'plan_change') {
  if (!isBillablePlan(intent.targetPlan)) {
    return NextResponse.json(
      {
        error:
          'Solo los planes Pro e Intelligence requieren checkout de Mercado Pago.',
      },
      { status: 400 }
    );
  }

  const billablePlan = intent.targetPlan;
  targetPlan = billablePlan;

  if (billablePlan === access.plan) {
    return NextResponse.json(
      { error: 'Ese plan ya está activo para este tenant.' },
      { status: 409 }
    );
  }

  amount = PLAN_PRICES[billablePlan];
  title = getPlanTitle(billablePlan);
  description = getPlanDescription(billablePlan);
}

    if (intent.kind === 'addon_activation') {
      if (!isAddonKey(intent.addonKey)) {
        return NextResponse.json(
          { error: 'Add-on solicitado inválido.' },
          { status: 400 }
        );
      }

      addonKey = intent.addonKey;

      if (addonKey === 'whatsapp_delivery') {
        return NextResponse.json(
          {
            error:
              'WhatsApp Delivery tiene cotización aparte. Por ahora se activa manualmente.',
          },
          { status: 409 }
        );
      }

      if (access.plan === 'esencial') {
        return NextResponse.json(
          { error: 'Multimarca está disponible desde el plan Pro.' },
          { status: 409 }
        );
      }

      if (access.addons.multi_brand) {
        return NextResponse.json(
          { error: 'Multimarca ya está activo para este tenant.' },
          { status: 409 }
        );
      }

      amount =
        access.plan === 'intelligence'
          ? MULTI_BRAND_PRICES.intelligence
          : MULTI_BRAND_PRICES.pro;

      title = getAddonTitle(addonKey);
      description = getAddonDescription(addonKey, access.plan);
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'No se pudo determinar el importe a cobrar.' },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const externalReference = randomUUID();

    const { error: billingError } = await supabaseAdmin
      .from('billing_checkout_sessions')
      .insert({
        tenant_id: access.tenantId,
        restaurant_id: access.restaurant?.id ?? null,
        kind: intent.kind,
        target_plan: targetPlan,
        addon_key: addonKey,
        amount,
        currency: 'ARS',
        status: 'pending',
        external_reference: externalReference,
      });

    if (billingError) {
      console.error('No se pudo crear billing_checkout_sessions:', billingError);
      return NextResponse.json(
        {
          error:
            'No se pudo registrar la sesión de checkout. Verificá que exista la tabla billing_checkout_sessions.',
        },
        { status: 500 }
      );
    }

    const preferencePayload = {
      items: [
        {
          id: externalReference,
          title,
          description,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: amount,
        },
      ],
      external_reference: externalReference,
      metadata: {
        tenant_id: access.tenantId,
        restaurant_id: access.restaurant?.id ?? null,
        kind: intent.kind,
        target_plan: targetPlan,
        addon_key: addonKey,
      },
      back_urls: {
        success: `${appUrl}/admin/configuracion?billing=success`,
        failure: `${appUrl}/admin/configuracion?billing=failure`,
        pending: `${appUrl}/admin/configuracion?billing=pending`,
      },
      notification_url: `${appUrl}/api/webhooks/mercadopago`,
      auto_return: 'approved',
    };

    const mpRes = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
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

      await supabaseAdmin
        .from('billing_checkout_sessions')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('external_reference', externalReference);

      return NextResponse.json(
        {
          error:
            mpBody?.message ||
            'No se pudo crear la preferencia de Mercado Pago.',
        },
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

    await supabaseAdmin
      .from('billing_checkout_sessions')
      .update({
        mp_preference_id: mpBody.id,
        updated_at: new Date().toISOString(),
      })
      .eq('external_reference', externalReference);

    if (intent.kind === 'plan_change' && targetPlan) {
      const { error: subscriptionError } = await supabaseAdmin
        .from('tenant_subscriptions')
        .upsert(
          {
            tenant_id: access.tenantId,
            plan: targetPlan,
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
        console.warn(
          'No se pudo actualizar tenant_subscriptions. El checkout igual quedó registrado en billing_checkout_sessions:',
          subscriptionError
        );
      }
    }

    return NextResponse.json({
      ok: true,
      tenantId: access.tenantId,
      kind: intent.kind,
      targetPlan,
      addonKey,
      status: 'pending_payment',
      preferenceId: mpBody.id,
      externalReference,
      checkoutUrl,
      checkout_url: checkoutUrl,
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