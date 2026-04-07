import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getFallbackAdminAccess, resolveAdminAccess } from '@/lib/adminAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  let access = getFallbackAdminAccess();

  try {
    access = await resolveAdminAccess();
  } catch (error) {
    console.error('GET /api/admin/session access resolution error:', error);
  }

  return NextResponse.json(
    {
      ok: true,
      session: {
        ...auth.session,
        tenantId: access.tenantId,
        restaurant: access.restaurant,
        plan: access.plan,
        addons: access.addons,
        features: access.features,
        capabilities: access.capabilities,
      },
    },
    { status: 200 }
  );
}