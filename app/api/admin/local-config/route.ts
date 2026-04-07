import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminAuth } from '@/lib/adminAuth';

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
};

function normalizeRow(row?: LocalConfigRow | null) {
  return {
    nombre_local: row?.nombre_local ?? '',
    direccion: row?.direccion ?? '',
    telefono: row?.telefono ?? '',
    celular: row?.celular ?? '',
    email: row?.email ?? '',
    horario_atencion: row?.horario_atencion ?? '',
    google_analytics_id: row?.google_analytics_id ?? '',
    google_analytics_property_id: row?.google_analytics_property_id ?? '',
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