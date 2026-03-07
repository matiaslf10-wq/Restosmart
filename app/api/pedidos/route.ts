import { NextResponse } from 'next/server';
import { getRestaurantContext } from '@/lib/tenant';
import { createClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const ctx = await getRestaurantContext();
  if (!ctx) return NextResponse.json({ error: 'Tenant missing' }, { status: 400 });

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from('orders')
    .select('*')
    .eq('restaurant_id', ctx.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}