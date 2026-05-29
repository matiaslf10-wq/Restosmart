import { NextRequest, NextResponse } from 'next/server';
import { attachAdminSessionCookie, hashPassword } from '@/lib/adminAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeBusinessMode, type BusinessMode } from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SignupBody = {
  negocio_nombre?: string;
  sucursal_nombre?: string;
  email?: string;
  password?: string;
  business_mode?: BusinessMode | string;
  direccion?: string;
  telefono?: string;
  celular?: string;
};

function normalizeNonEmptyString(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeSlug(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function buildUniqueSlug(base: string) {
  const fallback = base || 'restaurante';
  let candidate = fallback;

  for (let index = 0; index < 20; index += 1) {
    const { data, error } = await supabaseAdmin
      .from('restaurants')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.id) {
      return candidate;
    }

    candidate = `${fallback}-${index + 2}`;
  }

  return `${fallback}-${Date.now()}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as SignupBody | null;

    const negocioNombre = normalizeNonEmptyString(body?.negocio_nombre);
    const sucursalNombre =
      normalizeNonEmptyString(body?.sucursal_nombre) ??
      negocioNombre ??
      'Sucursal principal';

    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? '');
    const businessMode = normalizeBusinessMode(body?.business_mode);
    const direccion = normalizeNonEmptyString(body?.direccion) ?? '';
    const telefono = normalizeNonEmptyString(body?.telefono) ?? '';
    const celular = normalizeNonEmptyString(body?.celular) ?? '';

    if (!negocioNombre) {
      return NextResponse.json(
        { error: 'El nombre del negocio es obligatorio.' },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: 'El email es obligatorio.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres.' },
        { status: 400 }
      );
    }

    const { data: existingAdmin, error: existingAdminError } =
      await supabaseAdmin
        .from('admin_users')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

    if (existingAdminError) {
      throw existingAdminError;
    }

    if (existingAdmin?.id) {
      return NextResponse.json(
        { error: 'Ya existe un usuario con ese email.' },
        { status: 409 }
      );
    }

    const tenantSlug = await buildUniqueSlug(normalizeSlug(negocioNombre));
    const branchSlug = await buildUniqueSlug(`${tenantSlug}-principal`);

    const { data: tenantRestaurant, error: tenantError } = await supabaseAdmin
      .from('restaurants')
      .insert({
        slug: tenantSlug,
        plan: 'esencial',
        owner_tenant_id: null,
        estado: 'activo',
      })
      .select('id, slug')
      .single();

    if (tenantError || !tenantRestaurant?.id) {
      throw tenantError ?? new Error('No se pudo crear el tenant.');
    }

    const { data: branchRestaurant, error: branchError } = await supabaseAdmin
      .from('restaurants')
      .insert({
        slug: branchSlug,
        plan: 'esencial',
        owner_tenant_id: tenantSlug,
        estado: 'activo',
      })
      .select('id, slug')
      .single();

    if (branchError || !branchRestaurant?.id) {
      await supabaseAdmin.from('restaurants').delete().eq('id', tenantRestaurant.id);
      throw branchError ?? new Error('No se pudo crear la sucursal.');
    }

    const { error: configError } = await supabaseAdmin
      .from('configuracion_local')
      .insert({
        restaurant_id: branchRestaurant.id,
        nombre_local: sucursalNombre,
        direccion,
        telefono,
        celular,
        email,
        horario_atencion: '',
        google_analytics_id: '',
        google_analytics_property_id: '',
        business_mode: businessMode,
      });

    if (configError) {
      await supabaseAdmin.from('restaurants').delete().eq('id', branchRestaurant.id);
      await supabaseAdmin.from('restaurants').delete().eq('id', tenantRestaurant.id);
      throw configError;
    }

    const { data: adminUser, error: adminError } = await supabaseAdmin
      .from('admin_users')
      .insert({
        email,
        password_hash: hashPassword(password),
        password: null,
        activo: true,
        tenant_id: tenantSlug,
      })
      .select('id, email, tenant_id')
      .single();

    if (adminError || !adminUser?.id) {
      await supabaseAdmin
        .from('configuracion_local')
        .delete()
        .eq('restaurant_id', branchRestaurant.id);

      await supabaseAdmin.from('restaurants').delete().eq('id', branchRestaurant.id);
      await supabaseAdmin.from('restaurants').delete().eq('id', tenantRestaurant.id);

      throw adminError ?? new Error('No se pudo crear el usuario administrador.');
    }

    const response = NextResponse.json(
      {
        ok: true,
        tenant: {
          id: tenantSlug,
          slug: tenantSlug,
          restaurant_id: String(tenantRestaurant.id),
        },
        restaurant: {
          id: String(branchRestaurant.id),
          slug: branchSlug,
          nombre_local: sucursalNombre,
          business_mode: businessMode,
        },
        redirectTo: '/inicio',
      },
      { status: 201 }
    );

    return attachAdminSessionCookie(response, {
      adminId: adminUser.id,
      email,
      tenantId: tenantSlug,
    });
  } catch (error) {
    console.error('POST /api/signup', error);

    return NextResponse.json(
      { error: 'No se pudo crear la cuenta.' },
      { status: 500 }
    );
  }
}