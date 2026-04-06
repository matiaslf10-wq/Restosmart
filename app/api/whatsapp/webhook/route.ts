import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWhatsAppMessage } from '@/lib/deliveryBot';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

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

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const from = message.from;
    const text =
      message?.text?.body ||
      message?.button?.text ||
      message?.interactive?.button_reply?.title ||
      message?.interactive?.list_reply?.title ||
      '';

    if (from && text) {
      await handleIncomingWhatsAppMessage(from, text);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}