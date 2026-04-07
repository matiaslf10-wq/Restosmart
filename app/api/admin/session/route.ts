import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getFallbackAdminAccess, resolveAdminAccess } from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeBusinessMode } from '@/lib/plans';

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

  let businessMode = normalizeBusinessMode(undefined);

  try {
    const { data, error } = await supabaseAdmin
      .from('configuracion_local')
      .select('business_mode')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('GET /api/admin/session business_mode read error:', error);
    } else {
      businessMode = normalizeBusinessMode(data?.business_mode);
    }
  } catch (error) {
    console.error('GET /api/admin/session business_mode unexpected error:', error);
  }

  return NextResponse.json(
    {
      ok: true,
      session: {
        ...auth.session,
        tenantId: access.tenantId,
        restaurant: access.restaurant
          ? {
              ...access.restaurant,
              business_mode: businessMode,
            }
          : access.restaurant,
        plan: access.plan,
        addons: access.addons,
        features: access.features,
        capabilities: {
          ...access.capabilities,
          waiter_mode:
            businessMode === 'restaurant' && !!access.capabilities?.waiter_mode,
        },
        business_mode: businessMode,
      },
    },
    { status: 200 }
  );
}