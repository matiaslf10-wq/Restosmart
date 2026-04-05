import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

function normalizePaymentStatus(status: string | null | undefined) {
  const value = String(status ?? '').toLowerCase();

  if (value === 'approved' || value === 'authorized') return 'aprobado';
  if (
    value === 'pending' ||
    value === 'in_process' ||
    value === 'in_mediation'
  ) {
    return 'pendiente';
  }
  if (
    value === 'rejected' ||
    value === 'cancelled' ||
    value === 'refunded' ||
    value === 'charged_back'
  ) {
    return 'rechazado';
  }

  return 'pendiente';
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  try {
    const eventType = String(body?.type ?? body?.topic ?? '').toLowerCase();
    const paymentId = body?.data?.id ?? body?.id ?? null;

    if (eventType !== 'payment' || !paymentId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

    if (!MP_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: 'Falta MERCADOPAGO_ACCESS_TOKEN' },
        { status: 500 }
      );
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const payment = await mpRes.json();

    if (!mpRes.ok) {
      console.error('Mercado Pago payment lookup error', payment);
      return NextResponse.json(
        { error: 'No se pudo consultar el pago en Mercado Pago.' },
        { status: 500 }
      );
    }

    const externalReference = String(payment?.external_reference ?? '').trim();
    if (!externalReference) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'sin external_reference' });
    }

    const estadoPago = normalizePaymentStatus(payment?.status);

    const updateBase = {
      medio_pago: 'mercadopago',
      forma_pago: 'virtual',
      estado_pago: estadoPago,
      efectivo_aprobado: false,
    };

    const updatePayload =
      estadoPago === 'aprobado'
        ? {
            ...updateBase,
            estado: 'pendiente',
          }
        : updateBase;

    const { data, error } = await supabase
      .from('pedidos')
      .update(updatePayload)
      .eq('codigo_publico', externalReference)
      .select('id, codigo_publico, estado, estado_pago')
      .single();

    if (error) {
      console.error('Error actualizando pedido por webhook MP:', error);
      return NextResponse.json(
        { error: `No se pudo actualizar el pedido: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('MP webhook ok', {
      paymentId,
      externalReference,
      status: payment?.status,
      pedido: data,
    });

    return NextResponse.json({ ok: true, pedido: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}