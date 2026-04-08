import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { getFallbackAdminAccess, resolveAdminAccess } from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  formatBusinessModeLabel,
  normalizeBusinessMode,
  type BusinessMode,
} from '@/lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublicOrderingMeta = {
  business_mode_label: string;
  customer_entry_kind: 'restaurant' | 'takeaway';
  customer_entry_strategy:
    | 'table_qr_route'
    | 'separate_public_route_required';
  current_customer_entry_path: string | null;
  planned_customer_entry_path: string | null;
  table_qr_enabled: boolean;
  takeaway_enabled: boolean;
};

function getPublicOrderingMeta(businessMode: BusinessMode): PublicOrderingMeta {
  if (businessMode === 'takeaway') {
    return {
      business_mode_label: formatBusinessModeLabel(businessMode),
      customer_entry_kind: 'takeaway',
      customer_entry_strategy: 'separate_public_route_required',
      current_customer_entry_path: null,
      planned_customer_entry_path: '/pedir',
      table_qr_enabled: false,
      takeaway_enabled: true,
    };
  }

  return {
    business_mode_label: formatBusinessModeLabel(businessMode),
    customer_entry_kind: 'restaurant',
    customer_entry_strategy: 'table_qr_route',
    current_customer_entry_path: '/mesa/[numero]',
    planned_customer_entry_path: null,
    table_qr_enabled: true,
    takeaway_enabled: false,
  };
}

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
    console.error(
      'GET /api/admin/session business_mode unexpected error:',
      error
    );
  }

  const publicOrdering = getPublicOrderingMeta(businessMode);

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
        public_ordering: publicOrdering,
      },
    },
    { status: 200 }
  );
}