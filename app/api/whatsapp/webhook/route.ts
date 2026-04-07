import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWhatsAppMessage } from '@/lib/deliveryBot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const EXPECTED_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

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

export async function GET(request: NextRequest) {
  if (!VERIFY_TOKEN) {
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value;
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const incomingPhoneNumberId = value?.metadata?.phone_number_id;

        const isSamplePayload =
          !!incomingPhoneNumberId &&
          !!EXPECTED_PHONE_NUMBER_ID &&
          incomingPhoneNumberId !== EXPECTED_PHONE_NUMBER_ID;

        if (isSamplePayload) {
          console.log(
            'WhatsApp webhook: payload de prueba detectado, no se responde automáticamente.'
          );
          continue;
        }

        for (const message of messages) {
          const from = message?.from;
          const text = extractMessageText(message);

          if (!from || !text) {
            continue;
          }

          try {
            await handleIncomingWhatsAppMessage(from, text);
          } catch (error) {
            console.error('Error procesando mensaje de WhatsApp:', error);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Webhook error' }, { status: 200 });
  }
}