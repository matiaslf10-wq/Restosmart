import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// B6: WhatsApp Bot no forma parte del piloto.
// No verificar conexiones ni procesar mensajes.
export async function GET() {
  return NextResponse.json(
    { error: 'Servicio no disponible.' },
    { status: 404 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'Servicio no disponible.' },
    { status: 404 }
  );
}