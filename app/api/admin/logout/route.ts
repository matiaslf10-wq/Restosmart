import { NextResponse } from 'next/server';
import { clearAdminSessionCookie } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  return clearAdminSessionCookie(response);
}