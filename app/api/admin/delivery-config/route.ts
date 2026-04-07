import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getFallbackAdminAccess, resolveAdminAccess } from '@/lib/adminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeliveryConfigRow = {
  id?: number;
  activo?: boolean | null;
  whatsapp_numero?: string | null;
  whatsapp_nombre_mostrado?: string | null;
  acepta_efectivo?: boolean | null;
  efectivo_requiere_aprobacion?: boolean | null;
  acepta_mercadopago?: boolean | null;
  mensaje_bienvenida?: string | null;
  tiempo_estimado_min?: number | null;
  costo_envio?: number | string | null;
  created_at?: string;
  updated_at?: string;
};

const DEFAULT_CONFIG = {
  activo: false,
  whatsapp_numero: '',
  whatsapp_nombre_mostrado: '',
  acepta_efectivo: true,
  efectivo_requiere_aprobacion: true,
  acepta_mercadopago: false,
  mensaje_bienvenida:
    'Hola 👋 Gracias por comunicarte con nosotros. Decime qué querés pedir y te ayudamos con tu compra.',
  tiempo_estimado_min: 45,
  costo_envio: 0,
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRow(row?: DeliveryConfigRow | null) {
  return {
    activo: !!row?.activo,
    whatsapp_numero: row?.whatsapp_numero ?? '',
    whatsapp_nombre_mostrado: row?.whatsapp_nombre_mostrado ?? '',
    acepta_efectivo:
      row?.acepta_efectivo === undefined || row?.acepta_efectivo === null
        ? true
        : !!row.acepta_efectivo,
    efectivo_requiere_aprobacion:
      row?.efectivo_requiere_aprobacion === undefined ||
      row?.efectivo_requiere_aprobacion === null
        ? true
        : !!row.efectivo_requiere_aprobacion,
    acepta_mercadopago: !!row?.acepta_mercadopago,
    mensaje_bienvenida:
      row?.mensaje_bienvenida ?? DEFAULT_CONFIG.mensaje_bienvenida,
    tiempo_estimado_min: toNumber(
      row?.tiempo_estimado_min,
      DEFAULT_CONFIG.tiempo_estimado_min
    ),
    costo_envio: toNumber(row?.costo_envio, 0),
  };
}

async function ensureDeliveryAddonEnabled() {
  const access = await resolveAdminAccess().catch(() => getFallbackAdminAccess());

  if (!access.addons.whatsapp_delivery) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            'WhatsApp Delivery no está activo para este restaurante. Se contrata como add-on separado.',
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
  };
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const addon = await ensureDeliveryAddonEnabled();
  if (!addon.ok) {
    return addon.response;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_delivery')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudo leer la configuración de delivery: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(normalizeRow(data as DeliveryConfigRow | null), {
      status: 200,
    });
  } catch (error) {
    console.error('GET /api/admin/delivery-config', error);

    return NextResponse.json(
      {
        error: 'Ocurrió un error inesperado al leer la configuración.',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  const addon = await ensureDeliveryAddonEnabled();
  if (!addon.ok) {
    return addon.response;
  }

  try {
    const body = await request.json();

    const payload = {
      activo: !!body?.activo,
      whatsapp_numero: String(body?.whatsapp_numero ?? '').trim() || null,
      whatsapp_nombre_mostrado:
        String(body?.whatsapp_nombre_mostrado ?? '').trim() || null,
      acepta_efectivo: !!body?.acepta_efectivo,
      efectivo_requiere_aprobacion: !!body?.efectivo_requiere_aprobacion,
      acepta_mercadopago: !!body?.acepta_mercadopago,
      mensaje_bienvenida:
        String(body?.mensaje_bienvenida ?? '').trim() ||
        DEFAULT_CONFIG.mensaje_bienvenida,
      tiempo_estimado_min: Math.max(
        0,
        toNumber(body?.tiempo_estimado_min, DEFAULT_CONFIG.tiempo_estimado_min)
      ),
      costo_envio: Math.max(0, toNumber(body?.costo_envio, 0)),
      updated_at: new Date().toISOString(),
    };

    const current = await supabaseAdmin
      .from('configuracion_delivery')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (current.error) {
      return NextResponse.json(
        {
          error: `No se pudo verificar la configuración actual: ${current.error.message}`,
        },
        { status: 500 }
      );
    }

    if (current.data?.id) {
      const { data, error } = await supabaseAdmin
        .from('configuracion_delivery')
        .update(payload)
        .eq('id', current.data.id)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json(
          {
            error: `No se pudo actualizar la configuración: ${error.message}`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          config: normalizeRow(data as DeliveryConfigRow),
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('configuracion_delivery')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudo crear la configuración: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        config: normalizeRow(data as DeliveryConfigRow),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('PUT /api/admin/delivery-config', error);

    return NextResponse.json(
      {
        error: 'Ocurrió un error inesperado al guardar la configuración.',
      },
      { status: 500 }
    );
  }
}