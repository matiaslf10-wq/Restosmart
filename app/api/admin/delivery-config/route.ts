import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// B6: la configuracion global heredada queda deshabilitada en el piloto.
export async function GET() {
  return NextResponse.json(
    { error: 'Servicio no disponible.' },
    { status: 404 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Servicio no disponible.' },
    { status: 404 }
  );
}