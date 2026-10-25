import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { effectiveConfig, type CollectionConfig } from './model';

export async function readCollectionConfig(tenantId: string, restaurantId: string) {
  const { data, error } = await supabaseAdmin.from('order_collection_configs').select('scope, config')
    .eq('tenant_id', tenantId).in('scope', ['tenant', `restaurant:${restaurantId}`]);
  // Existing installations continue only when the relation is genuinely absent.
  if (error && ['42P01', 'PGRST205'].includes(error.code)) return { tenant: null, branch: null, effective: null };
  if (error) throw error;
  const tenant = (data?.find(row => row.scope === 'tenant')?.config ?? null) as CollectionConfig | null;
  const branch = (data?.find(row => row.scope === `restaurant:${restaurantId}`)?.config ?? null) as CollectionConfig | null;
  return { tenant, branch, effective: effectiveConfig(tenant, branch) };
}
