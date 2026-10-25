import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { resolveAuthorizedAdminAccess } from '@/lib/authorizedAdminAccess';
export const dynamic = 'force-dynamic';
// No verified branch ownership relation for legacy menu_items in local sources.
async function blocked(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) return auth.response;
  try {
    await resolveAuthorizedAdminAccess(auth.session, {
      restaurantId: request.nextUrl.searchParams.get('restaurantId'),
      tenantSlug: request.nextUrl.searchParams.get('tenant'),
    });
  } catch {
    return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
  }
  return NextResponse.json({ error: 'Menú heredado bloqueado: falta una relación verificada de menu_items con la sucursal. Usá el gestor de productos autorizado.' },
    { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = blocked;
export const POST = blocked;
export const PUT = blocked;
export const PATCH = blocked;
export const DELETE = blocked;
