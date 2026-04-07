import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWhatsAppMessage } from '@/lib/deliveryBot';
import {
  clearWhatsAppConnectionError,
  getLegacyExpectedPhoneNumberId,
  getWebhookVerifyToken,
  getWhatsAppConnectionByPhoneNumberId,
  isMetaSignatureValid,
  markWhatsAppConnectionError,
} from '@/lib/whatsapp';
import type { IncomingWhatsAppMessage, MetaWebhookBody } from '@/types/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractMessageText(message: any) {
  return (
    message?.text?.body ||
    message?.button?.text ||
    message?.button?.payload ||
    message?.interactive?.button_reply?.title ||
    message?.interactive?.button_reply?.id ||
    message?.interactive?.list_reply?.title ||
    message?.interactive?.list_reply?.id ||
    ''
  );
}

function extractIncomingMessages(body: MetaWebhookBody): IncomingWhatsAppMessage[] {
  const messages: IncomingWhatsAppMessage[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = value?.metadata?.display_phone_number ?? null;
      const changeMessages = Array.isArray(value?.messages) ? value.messages : [];

      for (const message of changeMessages) {
        const from = message?.from;
        const text = extractMessageText(message)?.trim?.() || '';
        const messageId = message?.id || '';

        if (!from || !text || !messageId) continue;

        messages.push({
          from,
          text,
          messageId,
          phoneNumberId,
          displayPhoneNumber,
        });
      }
    }
  }

  return messages;
}

export async function GET(request: NextRequest) {
  const verifyToken = getWebhookVerifyToken();

  if (!verifyToken) {
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256');
  const rawBody = await request.text();

  if (!isMetaSignatureValid(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let body: MetaWebhookBody;

  try {
    body = JSON.parse(rawBody);
  } catch (error) {
    console.error('WhatsApp webhook JSON inválido:', error);
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const incomingMessages = extractIncomingMessages(body);
    const legacyPhoneNumberId = getLegacyExpectedPhoneNumberId();

    for (const message of incomingMessages) {
      let connection = null;

      if (message.phoneNumberId) {
        try {
          connection = await getWhatsAppConnectionByPhoneNumberId(message.phoneNumberId);
        } catch (error) {
          console.error('Error buscando conexión WhatsApp:', error);
        }
      }

      const isLegacyFallback =
        !!message.phoneNumberId &&
        !!legacyPhoneNumberId &&
        message.phoneNumberId === legacyPhoneNumberId;

      if (!connection && !isLegacyFallback) {
        console.warn(
          'WhatsApp webhook: phone_number_id no asociado. No se procesa automáticamente.',
          message.phoneNumberId
        );
        continue;
      }

      if (connection) {
        if (!connection.add_on_enabled) {
          console.warn(
            'WhatsApp webhook: add-on deshabilitado para tenant',
            connection.tenant_id
          );
          continue;
        }

        if (connection.status !== 'connected') {
          console.warn(
            'WhatsApp webhook: conexión no activa para tenant',
            connection.tenant_id,
            connection.status
          );
          continue;
        }
      }

      try {
        await handleIncomingWhatsAppMessage({
          telefono: message.from,
          incomingText: message.text,
          connection,
        });

        if (connection) {
          await clearWhatsAppConnectionError(connection.id);
        }
      } catch (error) {
        console.error('Error procesando mensaje de WhatsApp:', error);

        if (connection) {
          const errorMessage =
            error instanceof Error ? error.message : 'Error procesando mensaje';
          await markWhatsAppConnectionError(connection.id, errorMessage);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Webhook error' }, { status: 200 });
  }
}