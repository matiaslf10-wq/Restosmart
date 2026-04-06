import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

    if (!MP_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'Falta MERCADOPAGO_ACCESS_TOKEN' },
        { status: 500 }
      );
    }

    if (!APP_URL) {
      return NextResponse.json(
        { error: 'Falta NEXT_PUBLIC_APP_URL' },
        { status: 500 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'Faltan items para crear la preferencia.' },
        { status: 400 }
      );
    }

    if (!body.external_reference || typeof body.external_reference !== 'string') {
      return NextResponse.json(
        { error: 'Falta external_reference del pedido.' },
        { status: 400 }
      );
    }

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
  } catch (error) {
    console.error('POST /api/pagos/crear-preferencia', error);
    return NextResponse.json(
      { error: 'No se pudo crear la preferencia de pago.' },
      { status: 500 }
    );
  }
}