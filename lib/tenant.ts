import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function getRestaurantContext() {
  const h = headers();
  const tenant = h.get('x-tenant');

  if (!tenant) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from('restaurants')
    .select('id, slug, plan')
    .eq('slug', tenant)
    .maybeSingle();

  return data;
}