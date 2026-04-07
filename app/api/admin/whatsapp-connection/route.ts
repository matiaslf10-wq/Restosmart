import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID?.trim() || 'default';

const ALLOWED_STATUS = new Set([
  'pending',
  'connected',
  'expired',
  'error',
  'disconnected',
]);

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function normalizeStatus(value: unknown) {
  const status = normalizeText(value).toLowerCase();
  return ALLOWED_STATUS.has(status) ? status : 'pending';
}

function normalizeIsoDateOrNull(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function getConnectionByTenantId(tenantId: string) {
  const result = await supabaseAdmin
    .from('whatsapp_connections')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message || 'No se pudo recuperar la conexión de WhatsApp.'
    );
  }

  return result.data ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const tenantId =
      request.nextUrl.searchParams.get('tenantId')?.trim() || DEFAULT_TENANT_ID;

    const connection = await getConnectionByTenantId(tenantId);

    return NextResponse.json({
      ok: true,
      tenantId,
      connection,
    });
  } catch (error) {
    console.error('GET /api/admin/whatsapp-connection error:', error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la conexión de WhatsApp.',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Body inválido.' },
        { status: 400 }
      );
    }

    const tenantId = normalizeText(body.tenant_id) || DEFAULT_TENANT_ID;

    const existing = await getConnectionByTenantId(tenantId);

    const phoneNumberId = normalizeNullableText(body.phone_number_id);
    const accessToken = normalizeNullableText(body.access_token);

    const inferredStatus =
      phoneNumberId && accessToken
        ? normalizeStatus(body.status || 'connected')
        : normalizeStatus(body.status || 'pending');

    const payload = {
      tenant_id: tenantId,
      local_id: normalizeNullableText(body.local_id),
      add_on_enabled: normalizeBoolean(body.add_on_enabled, false),
      status: inferredStatus,
      provider: normalizeText(body.provider) || 'meta_cloud',
      waba_id: normalizeNullableText(body.waba_id),
      phone_number_id: phoneNumberId,
      display_phone_number: normalizeNullableText(body.display_phone_number),
      business_account_id: normalizeNullableText(body.business_account_id),
      access_token: accessToken,
      token_expires_at: normalizeIsoDateOrNull(body.token_expires_at),
      webhook_subscribed_at: normalizeIsoDateOrNull(body.webhook_subscribed_at),
      app_scope_granted: normalizeBoolean(body.app_scope_granted, false),
      last_error: normalizeNullableText(body.last_error),
      metadata:
        body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const result = await supabaseAdmin
        .from('whatsapp_connections')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (result.error || !result.data) {
        throw new Error(
          result.error?.message ||
            'No se pudo actualizar la conexión de WhatsApp.'
        );
      }

      return NextResponse.json({
        ok: true,
        connection: result.data,
      });
    }

    const result = await supabaseAdmin
      .from('whatsapp_connections')
      .insert(payload)
      .select('*')
      .single();

    if (result.error || !result.data) {
      throw new Error(
        result.error?.message || 'No se pudo crear la conexión de WhatsApp.'
      );
    }

    return NextResponse.json({
      ok: true,
      connection: result.data,
    });
  } catch (error) {
    console.error('PUT /api/admin/whatsapp-connection error:', error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'No se pudo guardar la conexión de WhatsApp.',
      },
      { status: 500 }
    );
  }
}