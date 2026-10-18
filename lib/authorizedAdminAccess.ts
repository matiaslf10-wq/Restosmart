import 'server-only';

import type { AdminSession } from '@/lib/adminAuth';
import {
  resolveAdminAccess,
  type AdminAccessResolutionOptions,
  type AdminAccessSnapshot,
} from '@/lib/adminAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function resolveAuthorizedAdminAccess(
  session: AdminSession,
  requested: AdminAccessResolutionOptions = {}
): Promise<AdminAccessSnapshot> {
  const adminId = clean(session.adminId);
  const email = clean(session.email);
  if (!adminId || !email) {
    throw new Error('ADMIN_ACCESS_DENIED');
  }

  const lookup = supabaseAdmin
    .from('admin_users')
    .select('id, email, tenant_id, activo');

  const byId = adminId.toLowerCase() !== email.toLowerCase();
  const { data: admin, error: adminError } = await (
    byId ? lookup.eq('id', adminId) : lookup.ilike('email', email)
  ).maybeSingle();

  if (adminError) throw adminError;

  const tenantId = clean(admin?.tenant_id);
  if (
    !admin ||
    admin.activo === false ||
    !tenantId ||
    clean(admin.email)?.toLowerCase() !== email.toLowerCase() ||
    (byId && String(admin.id) !== adminId) ||
    (clean(session.tenantId) && session.tenantId !== tenantId)
  ) {
    throw new Error('ADMIN_ACCESS_DENIED');
  }

  const restaurantId = clean(requested.restaurantId);
  const tenantSlug = clean(requested.tenantSlug);

  let query = supabaseAdmin
    .from('restaurants')
    .select('id, slug, owner_tenant_id, estado')
    .eq('owner_tenant_id', tenantId);

  if (restaurantId) {
    query = query.eq('id', restaurantId);
  } else if (tenantSlug && tenantSlug !== tenantId) {
    query = query.eq('slug', tenantSlug);
  } else {
    query = query.order('id', { ascending: true }).limit(1);
  }

  const { data: restaurant, error: restaurantError } =
    await query.maybeSingle();

  if (restaurantError) throw restaurantError;
  if (
    !restaurant ||
    restaurant.owner_tenant_id !== tenantId ||
    restaurant.estado === 'cerrado' ||
    (restaurantId && String(restaurant.id) !== restaurantId) ||
    (tenantSlug &&
      tenantSlug !== tenantId &&
      restaurant.slug !== tenantSlug)
  ) {
    throw new Error('RESTAURANT_ACCESS_DENIED');
  }

  const access = await resolveAdminAccess({
    restaurantId: String(restaurant.id),
  });

  if (
    access.tenantId !== tenantId ||
    String(access.restaurant?.id) !== String(restaurant.id)
  ) {
    throw new Error('RESTAURANT_ACCESS_DENIED');
  }

  return access;
}