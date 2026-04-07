import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { WhatsAppConnection } from '@/types/whatsapp';

const META_API_VERSION =
  process.env.META_API_VERSION?.trim() || 'v23.0';

function getLegacyAccessToken() {
  return (
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() ||
    ''
  );
}

function getLegacyPhoneNumberId() {
  return (
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    ''
  );
}

function getAppSecret() {
  return (
    process.env.META_APP_SECRET?.trim() ||
    process.env.WHATSAPP_APP_SECRET?.trim() ||
    ''
  );
}

export function getWebhookVerifyToken() {
  return (
    process.env.META_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    ''
  );
}

export function getLegacyExpectedPhoneNumberId() {
  return getLegacyPhoneNumberId();
}

export function isMetaSignatureValid(rawBody: string, signatureHeader: string | null) {
  const appSecret = getAppSecret();

  if (!appSecret) {
    console.warn(
      'WhatsApp webhook: falta META_APP_SECRET / WHATSAPP_APP_SECRET. Se omite validación de firma.'
    );
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const received = signatureHeader.replace(/^sha256=/, '');

  if (expected.length !== received.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(received, 'utf8')
    );
  } catch {
    return false;
  }
}

export async function getWhatsAppConnectionByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppConnection | null> {
  if (!phoneNumberId) return null;

  const { data, error } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message || 'No se pudo recuperar la conexión de WhatsApp.'
    );
  }

  return (data as WhatsAppConnection | null) ?? null;
}

export async function markWhatsAppConnectionError(id: number, message: string) {
  const { error } = await supabaseAdmin
    .from('whatsapp_connections')
    .update({
      status: 'error',
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(
      error.message || 'No se pudo actualizar el error de la conexión WhatsApp.'
    );
  }
}

export async function clearWhatsAppConnectionError(id: number) {
  const { error } = await supabaseAdmin
    .from('whatsapp_connections')
    .update({
      status: 'connected',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new Error(
      error.message || 'No se pudo limpiar el error de la conexión WhatsApp.'
    );
  }
}

type SendWhatsAppTextParams = {
  to: string;
  body: string;
  connection?: Pick<WhatsAppConnection, 'access_token' | 'phone_number_id'> | null;
};

export async function sendWhatsAppText(
  toOrParams: string | SendWhatsAppTextParams,
  legacyBody?: string
) {
  const params: SendWhatsAppTextParams =
    typeof toOrParams === 'string'
      ? {
          to: toOrParams,
          body: legacyBody ?? '',
          connection: null,
        }
      : toOrParams;

  const accessToken =
    params.connection?.access_token?.trim() || getLegacyAccessToken();

  const phoneNumberId =
    params.connection?.phone_number_id?.trim() || getLegacyPhoneNumberId();

  if (!accessToken) {
    throw new Error(
      'Falta access token de WhatsApp. Cargá la conexión del tenant o WHATSAPP_ACCESS_TOKEN.'
    );
  }

  if (!phoneNumberId) {
    throw new Error(
      'Falta phone_number_id de WhatsApp. Cargá la conexión del tenant o WHATSAPP_PHONE_NUMBER_ID.'
    );
  }

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: params.to,
        type: 'text',
        text: { body: params.body },
      }),
      cache: 'no-store',
    }
  );

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
        `No se pudo enviar WhatsApp (status ${res.status})`
    );
  }

  return data;
}