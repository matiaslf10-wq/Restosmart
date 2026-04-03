import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET() {
  const { data, error } = await supabase
    .from('configuracion_delivery')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    data ?? {
      activo: false,
      whatsapp_numero: '',
      whatsapp_nombre_mostrado: '',
      acepta_efectivo: true,
      efectivo_requiere_aprobacion: true,
      acepta_mercadopago: false,
      mensaje_bienvenida: '',
      tiempo_estimado_min: 45,
      costo_envio: 0,
    }
  );
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const payload = {
    activo: !!body.activo,
    whatsapp_numero: body.whatsapp_numero || null,
    whatsapp_nombre_mostrado: body.whatsapp_nombre_mostrado || null,
    acepta_efectivo: !!body.acepta_efectivo,
    efectivo_requiere_aprobacion: !!body.efectivo_requiere_aprobacion,
    acepta_mercadopago: !!body.acepta_mercadopago,
    mensaje_bienvenida: body.mensaje_bienvenida || null,
    tiempo_estimado_min: body.tiempo_estimado_min ?? null,
    costo_envio: Number(body.costo_envio || 0),
    updated_at: new Date().toISOString(),
  };

  const current = await supabase
    .from('configuracion_delivery')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (current.data?.id) {
    const { error } = await supabase
      .from('configuracion_delivery')
      .update(payload)
      .eq('id', current.data.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from('configuracion_delivery')
    .insert(payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}