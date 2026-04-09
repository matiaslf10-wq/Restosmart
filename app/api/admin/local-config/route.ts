import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminAuth } from '@/lib/adminAuth';
import {
  normalizeBusinessMode,
  type BusinessMode,
} from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LocalConfigRow = {
  id?: number;
  nombre_local?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  celular?: string | null;
  email?: string | null;
  horario_atencion?: string | null;
  google_analytics_id?: string | null;
  google_analytics_property_id?: string | null;
  business_mode?: BusinessMode | string | null;
};

function getBusinessModeMeta(businessMode: BusinessMode) {
  if (businessMode === 'takeaway') {
    return {
      business_mode_label: 'Take Away',
      customer_entry_kind: 'takeaway',
      customer_entry_strategy: 'separate_public_route_required',
      current_customer_entry_path: '/pedir',
      planned_customer_entry_path: null,
      takeaway_ready_screen_path: '/retiro',
      table_qr_enabled: false,
      takeaway_enabled: true,
    };
  }

  return {
    business_mode_label: 'Restaurante',
    customer_entry_kind: 'restaurant',
    customer_entry_strategy: 'table_qr_route',
    current_customer_entry_path: '/mesa/[id]',
    planned_customer_entry_path: null,
    takeaway_ready_screen_path: null,
    table_qr_enabled: true,
    takeaway_enabled: false,
  };
}

function normalizeRow(row?: LocalConfigRow | null) {
  const businessMode = normalizeBusinessMode(row?.business_mode);

  return {
    nombre_local: row?.nombre_local ?? '',
    direccion: row?.direccion ?? '',
    telefono: row?.telefono ?? '',
    celular: row?.celular ?? '',
    email: row?.email ?? '',
    horario_atencion: row?.horario_atencion ?? '',
    google_analytics_id: row?.google_analytics_id ?? '',
    google_analytics_property_id: row?.google_analytics_property_id ?? '',
    business_mode: businessMode,
    public_ordering: getBusinessModeMeta(businessMode),
  };
}

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudo leer la configuración del local: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(normalizeRow(data as LocalConfigRow | null), {
      status: 200,
    });
  } catch (error) {
    console.error('GET /api/admin/local-config', error);

    return NextResponse.json(
      {
        error: 'Ocurrió un error inesperado al leer la configuración del local.',
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

  try {
    const body = await request.json();

    const payload = {
      nombre_local: String(body?.nombre_local ?? '').trim() || null,
      direccion: String(body?.direccion ?? '').trim() || null,
      telefono: String(body?.telefono ?? '').trim() || null,
      celular: String(body?.celular ?? '').trim() || null,
      email: String(body?.email ?? '').trim() || null,
      horario_atencion: String(body?.horario_atencion ?? '').trim() || null,
      google_analytics_id:
        String(body?.google_analytics_id ?? '').trim() || null,
      google_analytics_property_id:
        String(body?.google_analytics_property_id ?? '').trim() || null,
      business_mode: normalizeBusinessMode(body?.business_mode),
      updated_at: new Date().toISOString(),
    };

    const current = await supabaseAdmin
      .from('configuracion_local')
      .select('id')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (current.error) {
      return NextResponse.json(
        {
          error: `No se pudo verificar la configuración actual del local: ${current.error.message}`,
        },
        { status: 500 }
      );
    }

    if (current.data?.id) {
      const { data, error } = await supabaseAdmin
        .from('configuracion_local')
        .update(payload)
        .eq('id', current.data.id)
        .select('*')
        .single();

      if (error) {
        return NextResponse.json(
          {
            error: `No se pudo actualizar la configuración del local: ${error.message}`,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          config: normalizeRow(data as LocalConfigRow),
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: `No se pudo crear la configuración del local: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        config: normalizeRow(data as LocalConfigRow),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('PUT /api/admin/local-config', error);

    return NextResponse.json(
      {
        error:
          'Ocurrió un error inesperado al guardar la configuración del local.',
      },
      { status: 500 }
    );
  }
}