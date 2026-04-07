import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { attachAdminSessionCookie, verifyPassword } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminUserRow = {
  id?: number | string;
  email?: string | null;
  password?: string | null;
  password_hash?: string | null;
  activo?: boolean | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body?.password ?? '');

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son obligatorios.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .select('*')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('POST /api/admin/login - error lectura admin_users', error);

      return NextResponse.json(
        { error: 'No se pudo validar el usuario.' },
        { status: 500 }
      );
    }

    const adminUser = data as AdminUserRow | null;

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    if (adminUser.activo === false) {
      return NextResponse.json(
        { error: 'Tu usuario está desactivado.' },
        { status: 403 }
      );
    }

    const isValidPassword = verifyPassword({
      plainPassword: password,
      passwordHash: adminUser.password_hash,
      legacyPlainPassword: adminUser.password,
    });

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      {
        ok: true,
        email: adminUser.email ?? email,
      },
      { status: 200 }
    );

    return attachAdminSessionCookie(response, {
      adminId: adminUser.id ?? email,
      email: adminUser.email ?? email,
    });
  } catch (error) {
    console.error('POST /api/admin/login', error);

    return NextResponse.json(
      { error: 'Ocurrió un error inesperado al iniciar sesión.' },
      { status: 500 }
    );
  }
}