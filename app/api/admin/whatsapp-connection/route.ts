import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// B6: conexion tecnica WhatsApp fuera del piloto.
// No exponer tokens ni permitir altas o cambios.
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