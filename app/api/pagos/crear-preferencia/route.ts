import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: body.items,
      external_reference: body.external_reference,
      notification_url: `${APP_URL}/api/pagos/webhook`,
      back_urls: {
        success: `${APP_URL}/inicio`,
        failure: `${APP_URL}/inicio`,
        pending: `${APP_URL}/inicio`,
      },
      auto_return: 'approved',
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: data }, { status: 500 });
  }

  return NextResponse.json(data);
}