import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: NextRequest) {
  const body = await request.json();

  try {
    // acá luego consultás a Mercado Pago el payment real por id
    // y actualizás delivery_payment_intents + pedidos
    console.log('MP webhook', body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}